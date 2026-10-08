"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Check, Download, Film, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "queued" | "processing" | "completed" | "failed" | "cancelled";
type RenderJob = { id: string; status: Status; progress: number; outputAssetId: string | null; error: string | null; createdAt: string; compositionId?: string; log?: string[] };
type Engine = "remotion" | "hyperframes" | "canvas";

const ENGINES: { id: Engine; name: string; detail: string }[] = [
  { id: "remotion", name: "Remotion", detail: "Plantilla del video con imágenes, 30 fps" },
  { id: "hyperframes", name: "HyperFrames", detail: "Diseño HTML; en el educativo, animaciones HTML hechas por MCP" },
  { id: "canvas", name: "Canvas", detail: "Plantillas animadas sincronizadas con la voz, 60 fps" },
];
const engineOf = (job: RenderJob | null): Engine | null => job?.compositionId === "CanvasVideo" ? "canvas" : job?.compositionId === "HyperframesVideo" ? "hyperframes" : job?.compositionId ? "remotion" : null;

const label: Record<Status, string> = { queued: "En cola", processing: "Renderizando", completed: "Listo", failed: "Falló", cancelled: "Cancelado" };
const tone: Record<Status, string> = { queued: "text-muted-foreground", processing: "text-primary", completed: "text-primary", failed: "text-destructive", cancelled: "text-muted-foreground" };
const active = (job: RenderJob | null) => job !== null && (job.status === "queued" || job.status === "processing");

/** `hyperframesOnly`: el video educativo no tiene versión en Remotion; se elige entre HyperFrames y Canvas. `defaultEngine` va primero y preseleccionado. */
export function VideoRenderPanel({ contentItemId, unsavedChanges, hyperframesOnly = false, defaultEngine }: { contentItemId: string; unsavedChanges: boolean; hyperframesOnly?: boolean; defaultEngine?: Engine }) {
  const engines = ENGINES.filter((item) => !hyperframesOnly || item.id !== "remotion").sort((a, b) => Number(b.id === defaultEngine) - Number(a.id === defaultEngine));
  const [engine, setEngine] = useState<Engine>(engines[0].id);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  // Remotion es el motor por defecto del servidor: no se manda `engine`.
  const render = () => call(() => fetch("/api/render-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentItemId, ...(engine === "remotion" ? {} : { engine }) }) }));
  const jobEngine = ENGINES.find((item) => item.id === engineOf(job))?.name;
  const act = (action: "cancel" | "retry") => call(() => fetch(`/api/render-jobs/${job!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }));

  const chosen = ENGINES.find((item) => item.id === engine)!;
  const done = job?.status === "completed" && job.outputAssetId;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Render MP4</p>
        {job ? <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${job.status === "failed" ? "bg-destructive/15 text-destructive" : active(job) || done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{label[job.status]}{jobEngine ? ` · ${jobEngine}` : ""}</span> : null}
      </div>

      {contentItemId ? null : <p className="text-xs text-muted-foreground">Guarda el video en una campaña antes de renderizarlo.</p>}
      {contentItemId && unsavedChanges ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Hay cambios sin guardar: el render usa la última versión guardada.</p> : null}

      {done ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
          <video key={job.outputAssetId} src={`/api/assets/${job.outputAssetId}`} controls playsInline preload="metadata" className="aspect-[9/16] w-full max-w-[220px] rounded-lg border border-border bg-black" />
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <p className="text-sm font-semibold text-foreground">Tu video está listo</p>
            <Button type="button" asChild>
              <a href={`/api/assets/${job.outputAssetId}`} download={`${contentItemId.slice(0, 8)}.mp4`}><Download className="h-4 w-4" /> Descargar MP4</a>
            </Button>
          </div>
        </div>
      ) : null}

      {job && !done ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className={tone[job.status]}>{job.status === "queued" ? "En cola: arranca solo." : job.status === "processing" ? "Renderizando…" : job.status === "failed" ? "El render falló." : "Render cancelado."}</span>
            <span className="font-mono tabular-nums text-muted-foreground">{job.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border/60">
            <div className={`h-full transition-all ${job.status === "failed" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${job.progress}%` }} />
          </div>
          {job.error ? <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{job.error}</p> : null}
        </div>
      ) : null}

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

      {active(job) ? (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act("cancel")}><Ban className="h-4 w-4" /> Cancelar render</Button>
      ) : (
        <div className="space-y-3">
          {engines.length > 1 ? (
            <div role="radiogroup" aria-label="Motor de render" className={`grid gap-2 ${engines.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {engines.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={engine === item.id} onClick={() => setEngine(item.id)} className={`relative rounded-lg border px-3 py-2.5 text-left transition-colors ${engine === item.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {item.name}
                    {item.id === defaultEngine ? <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">Recomendado</span> : null}
                    {engine === item.id ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{item.detail}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={done ? "outline" : "default"} disabled={!contentItemId || busy} onClick={() => void render()}>
              <Film className="h-4 w-4" /> {done ? `Volver a renderizar con ${chosen.name}` : `Renderizar con ${chosen.name}`}
            </Button>
            {job && (job.status === "failed" || job.status === "cancelled") ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void act("retry")}><RotateCcw className="h-4 w-4" /> Reintentar el anterior</Button>
            ) : null}
          </div>
        </div>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
