"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Ban, Download, Film, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "queued" | "processing" | "completed" | "failed" | "cancelled";
type RenderJob = { id: string; status: Status; progress: number; outputAssetId: string | null; error: string | null; createdAt: string; log?: string[] };

const label: Record<Status, string> = { queued: "En cola", processing: "Renderizando", completed: "Listo", failed: "Falló", cancelled: "Cancelado" };
const tone: Record<Status, string> = { queued: "text-muted-foreground", processing: "text-primary", completed: "text-primary", failed: "text-destructive", cancelled: "text-muted-foreground" };
const active = (job: RenderJob | null) => job !== null && (job.status === "queued" || job.status === "processing");

/** Render a MP4 con el motor Canvas (animaciones sincronizadas con la voz, 60 fps). */
export function VideoRenderPanel({ contentItemId, unsavedChanges, children }: { contentItemId: string; unsavedChanges: boolean; children?: ReactNode }) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [squaring, setSquaring] = useState(false);
  const [tiktokNote, setTiktokNote] = useState("");
  const consoleRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!contentItemId) return setJob(null);
    const response = await fetch(`/api/render-jobs?contentItemId=${contentItemId}`);
    if (!response.ok) return;
    const jobs = (await response.json()) as RenderJob[];
    setJob(jobs[0] ?? null);
  }, [contentItemId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!active(job)) return;
    const timer = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(timer);
  }, [job, load]);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [job?.log]);

  async function call(request: () => Promise<Response>) {
    setError("");
    setBusy(true);
    try {
      const response = await request();
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo actualizar el render.");
      setJob(payload as RenderJob);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar el render.");
    } finally {
      setBusy(false);
    }
  }

  const render = () => call(() => fetch("/api/render-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentItemId }) }));
  const act = (action: "cancel" | "retry") => call(() => fetch(`/api/render-jobs/${job!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }));

  // La subida puede tardar: va con su propio estado para no bloquear el resto del panel.
  async function sendToTikTok(assetId: string) {
    setError("");
    setTiktokNote("");
    setSending(true);
    try {
      // La API de borradores de TikTok no recibe descripción: se copia antes de subir (con el clic aún vigente) para pegarla al publicar.
      let copied = false;
      try {
        const captionResponse = await fetch(`/api/videos/${contentItemId}/caption`);
        const caption = captionResponse.ok ? (await captionResponse.text()).trim() : "";
        if (caption) { await navigator.clipboard.writeText(caption); copied = true; }
      } catch {
        // Sin caption o sin permiso de portapapeles: el envío del video sigue igual.
      }
      const response = await fetch("/api/tiktok/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) });
      let payload = await response.json() as { status?: string; error?: string; publishId?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar el video a TikTok.");
      // TikTok puede tardar minutos en procesar y rechazarlo después: se sigue el envío hasta saber cómo acabó.
      for (let attempt = 0; payload.status === "processing" && payload.publishId && attempt < 36; attempt += 1) {
        setTiktokNote("Subido. TikTok lo está procesando…");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const check = await fetch(`/api/tiktok/upload?publishId=${encodeURIComponent(payload.publishId)}`);
        const next = await check.json() as { status?: string; error?: string };
        if (!check.ok || next.status === "failed") throw new Error(next.error ?? "No se pudo consultar el envío a TikTok.");
        payload = { ...payload, status: next.status };
      }
      const paste = copied ? " El caption ya está copiado: pégalo en la descripción." : " Este video no tiene caption guardado.";
      setTiktokNote((payload.status === "inbox"
        ? "Enviado. No aparece en Borradores: abre TikTok, entra a la Bandeja de entrada, busca el aviso de la app entre las notificaciones y tócalo para editarlo y publicarlo (o guardarlo como borrador)."
        : "TikTok sigue procesando el video tras 3 minutos. Si en un rato no ves el aviso en la bandeja de entrada de TikTok, vuelve a enviarlo.") + paste);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el video a TikTok.");
    } finally {
      setSending(false);
    }
  }

  // Se baja por fetch y no con un enlace: la conversión tarda unos segundos y, si falla, un enlace no avisa.
  async function downloadSquare(assetId: string) {
    setError("");
    setSquaring(true);
    try {
      const response = await fetch(`/api/assets/${assetId}/square`);
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo convertir el video a formato cuadrado.");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = `${contentItemId.slice(0, 8)}-cuadrado.mp4`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo convertir el video a formato cuadrado.");
    } finally {
      setSquaring(false);
    }
  }

  const done = job?.status === "completed" && job.outputAssetId;

  return (
    <section aria-label="Render MP4" className="min-w-0 space-y-4 rounded-xl border border-border bg-card/60 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Render MP4</h3>
        {job ? <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${job.status === "failed" ? "bg-destructive/15 text-destructive" : active(job) || done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{label[job.status]}</span> : null}
      </div>

      <div className={done ? "grid items-start gap-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]" : "space-y-4"}>
        {done ? <video key={job.outputAssetId} src={`/api/assets/${job.outputAssetId}`} controls playsInline preload="metadata" aria-label="Video renderizado" className="mx-auto aspect-[9/16] w-full max-w-[17rem] rounded-lg border border-border bg-black" /> : null}
        <div className="min-w-0 space-y-4">
          {contentItemId ? null : <p className="text-xs text-muted-foreground">Guarda el video en una campaña antes de renderizarlo.</p>}
          {contentItemId && unsavedChanges ? <p role="status" className="text-xs text-muted-foreground">Hay cambios sin guardar: el render usa la última versión guardada.</p> : null}
          {done ? <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" asChild>
              <a href={`/api/assets/${job.outputAssetId}`} download={`${contentItemId.slice(0, 8)}.mp4`}><Download className="h-4 w-4" /> Descargar MP4</a>
            </Button>
            <Button type="button" variant="outline" disabled={squaring} onClick={() => void downloadSquare(job.outputAssetId!)}>
              <Download className="h-4 w-4" /> {squaring ? "Convirtiendo…" : "Descargar cuadrado 1:1 (Meta)"}
            </Button>
            <Button type="button" variant="outline" className="h-auto min-h-9 whitespace-normal" disabled={sending} onClick={() => void sendToTikTok(job.outputAssetId!)}>
              <Send className="h-4 w-4" /> {sending ? "Enviando a TikTok…" : "Enviar a borradores de TikTok"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void render()}>
              <Film className="h-4 w-4" /> {busy ? "Encolando…" : "Volver a renderizar"}
            </Button>
            </div>
            {tiktokNote ? <p role="status" className="max-w-prose text-xs text-muted-foreground">{tiktokNote}</p> : null}
          </div> : null}

          {job && !done ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className={tone[job.status]}>{job.status === "queued" ? "En cola: arranca solo." : job.status === "processing" ? "Renderizando…" : job.status === "failed" ? "El render falló." : "Render cancelado."}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{job.progress}%</span>
              </div>
              <div role="progressbar" aria-label="Progreso del render" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress} className="h-2 overflow-hidden rounded-full bg-border/60">
                <div className={`h-full transition-all ${job.status === "failed" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${job.progress}%` }} />
              </div>
              {job.error ? <p role="alert" className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs text-destructive">{job.error}</p> : null}
            </div>
          ) : null}

          {active(job) ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act("cancel")}><Ban className="h-4 w-4" /> Cancelar render</Button>
          ) : !done ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!contentItemId || busy} onClick={() => void render()}>
                <Film className="h-4 w-4" /> {busy ? "Encolando…" : "Renderizar"}
              </Button>
              {job && (job.status === "failed" || job.status === "cancelled") ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void act("retry")}><RotateCcw className="h-4 w-4" /> Reintentar el anterior</Button>
              ) : null}
            </div>
          ) : null}

          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          {children ? <div className="border-t border-border/60 pt-4">{children}</div> : null}
          {job?.log && job.log.length > 0 ? (
            <details open={active(job)} className="group">
              <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">Registro del render</summary>
              <div ref={consoleRef} className="mt-2 max-h-32 overflow-y-auto rounded-md border border-border bg-surface-secondary p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {job.log.map((line, index) => (
                  <p key={index} className="whitespace-pre-wrap break-words"><span className="select-none text-muted-foreground/50">$ </span>{line}</p>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
