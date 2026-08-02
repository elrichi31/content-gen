"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Download, Film, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "queued" | "processing" | "completed" | "failed" | "cancelled";
type RenderJob = { id: string; status: Status; progress: number; outputAssetId: string | null; error: string | null; createdAt: string };

const label: Record<Status, string> = { queued: "En cola", processing: "Renderizando", completed: "Listo", failed: "Falló", cancelled: "Cancelado" };
const tone: Record<Status, string> = { queued: "text-muted-foreground", processing: "text-primary", completed: "text-primary", failed: "text-destructive", cancelled: "text-muted-foreground" };
const active = (job: RenderJob | null) => job !== null && (job.status === "queued" || job.status === "processing");

export function VideoRenderPanel({ contentItemId, unsavedChanges }: { contentItemId: string; unsavedChanges: boolean }) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Render MP4</p>
      </div>

      {contentItemId ? null : <p className="text-xs text-muted-foreground">Guarda el video en una campaña antes de renderizarlo.</p>}
      {contentItemId && unsavedChanges ? <p className="text-xs text-muted-foreground">Hay cambios sin guardar: el render usa la última versión guardada.</p> : null}

      {job ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold uppercase tracking-wider ${tone[job.status]}`}>{label[job.status]}</span>
            <span className="font-mono text-muted-foreground">{job.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
            <div className={`h-full transition-all ${job.status === "failed" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${job.progress}%` }} />
          </div>
          {job.status === "queued" ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">En cola. El render arranca solo y esta barra se actualiza sola.</p>
          ) : null}
          {job.error ? <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs text-destructive">{job.error}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!contentItemId || busy || active(job)} onClick={() => void render()}>
          <Film className="h-4 w-4" /> {active(job) ? "Render en curso" : "Renderizar MP4"}
        </Button>
        {active(job) ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act("cancel")}>
            <Ban className="h-4 w-4" /> Cancelar
          </Button>
        ) : null}
        {job && (job.status === "failed" || job.status === "cancelled") ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act("retry")}>
            <RotateCcw className="h-4 w-4" /> Reintentar
          </Button>
        ) : null}
        {job?.status === "completed" && job.outputAssetId ? (
          <Button type="button" variant="default" size="sm" asChild>
            <a href={`/api/assets/${job.outputAssetId}`} download={`${contentItemId.slice(0, 8)}.mp4`}>
              <Download className="h-4 w-4" /> Descargar MP4
            </a>
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
