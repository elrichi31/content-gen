"use client";

import { useRef, useState } from "react";
import { AudioLines, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Narración propia de una escena (MP3 o WAV) en vez de la de ElevenLabs. Cambia el documento
 * local: se guarda con «Guardar cambios». La imagen de la escena va en `SceneImagePicker`.
 */
export function VideoAssetPanel({
  audioAssetId,
  campaignId,
  contentItemId,
  onChange,
  onAudioSeconds,
}: {
  audioAssetId?: string | null;
  campaignId?: string;
  contentItemId: string;
  onChange: (patch: { audioAssetId?: string | null }) => void;
  onAudioSeconds: (seconds: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": file.type, "X-Asset-Filename": encodeURIComponent(file.name), ...(campaignId ? { "X-Campaign-Id": campaignId } : {}), ...(contentItemId ? { "X-Content-Item-Id": contentItemId } : {}) }, body: file });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo subir el archivo.");
      onChange({ audioAssetId: payload.id });
      const probe = new Audio(`/api/assets/${payload.id}`);
      probe.addEventListener("loadedmetadata", () => { if (Number.isFinite(probe.duration) && probe.duration > 0) onAudioSeconds(probe.duration); });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <AudioLines className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Narración de esta escena</p>
      </div>
      {audioAssetId ? (
        <div className="flex items-center gap-2">
          <audio controls preload="metadata" src={`/api/assets/${audioAssetId}`} className="h-8 w-full" />
          <Button type="button" variant="secondary" size="icon-sm" aria-label="Quitar audio" onClick={() => onChange({ audioAssetId: null })}><X className="h-3.5 w-3.5" /></Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Sin narración todavía.</p>}
      <input ref={audioInput} type="file" accept="audio/mpeg,audio/wav" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
      <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy} onClick={() => audioInput.current?.click()}>
        <Upload className="h-4 w-4" /> {busy ? "Subiendo…" : "Subir tu propio MP3 o WAV"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[10px] leading-relaxed text-muted-foreground">La escena pasa a durar lo que dura el audio. Guarda los cambios para conservarlo.</p>
    </div>
  );
}
