"use client";

import { useRef, useState } from "react";
import { AudioLines, ImagePlus, Search, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignAssetSelect } from "@/components/campaign-asset-select";

type Source = "unsplash" | "openai" | "upload";

export function VideoAssetPanel({
  imageAssetId,
  audioAssetId,
  campaignId,
  contentItemId,
  sceneId,
  revision,
  initialPrompt = "",
  onChange,
  onAudioSeconds,
  onPersisted,
}: {
  imageAssetId?: string | null;
  audioAssetId?: string | null;
  campaignId?: string;
  contentItemId: string;
  sceneId: string;
  revision: number;
  /** `imagePrompt` del guion: el panel se remonta por escena, así que sirve de valor inicial. */
  initialPrompt?: string;
  onChange: (patch: { imageAssetId?: string | null; audioAssetId?: string | null }) => void;
  onAudioSeconds: (seconds: number) => void;
  onPersisted: (content: { revision: number; document: { data: unknown } }) => void;
}) {
  const [source, setSource] = useState<Source>(initialPrompt ? "openai" : "unsplash");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  async function run(job: string, task: () => Promise<void>) {
    setError("");
    setBusy(job);
    try {
      await task();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la operación.");
    } finally {
      setBusy("");
    }
  }

  const generateImage = () =>
    run("image", async () => {
      // Con el video ya guardado se usa la ruta por escena: persiste el documento y registra el GenerationRun.
      const path = contentItemId ? `/api/videos/${contentItemId}/scenes/${sceneId}/image` : "/api/carousels/image";
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contentItemId ? { source, prompt, revision } : { source, prompt, ...(campaignId ? { campaignId } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo obtener la imagen.");
      if (contentItemId) onPersisted(payload.content); else onChange({ imageAssetId: payload.asset.id });
    });

  const uploadAsset = (file: File, kind: "image" | "audio") =>
    run(kind, async () => {
      const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": file.type, "X-Asset-Filename": encodeURIComponent(file.name), ...(campaignId ? { "X-Campaign-Id": campaignId } : {}), ...(contentItemId ? { "X-Content-Item-Id": contentItemId } : {}) }, body: file });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo subir el archivo.");
      onChange(kind === "image" ? { imageAssetId: payload.id } : { audioAssetId: payload.id });
      if (kind === "audio") measure(payload.id);
    });

  function measure(id: string) {
    const probe = new Audio(`/api/assets/${id}`);
    probe.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) onAudioSeconds(probe.duration);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <ImagePlus className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Imagen de la escena</p>
      </div>

      {imageAssetId ? (
        <div className="relative overflow-hidden rounded-md border border-border/60">
          <img src={`/api/assets/${imageAssetId}`} alt="Imagen de la escena" className="h-24 w-full object-cover" />
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute right-1.5 top-1.5"
            aria-label="Quitar imagen"
            onClick={() => onChange({ imageAssetId: null })}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuente</Label>
        <Select value={source} onValueChange={(value) => { setSource(value as Source); setError(""); }}>
          <SelectTrigger aria-label="Fuente de imagen" className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unsplash">Buscar (Unsplash)</SelectItem>
            <SelectItem value="openai">Generar (OpenAI)</SelectItem>
            <SelectItem value="upload">Subir archivo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CampaignAssetSelect campaignId={campaignId} value={imageAssetId} onChange={(id) => onChange({ imageAssetId: id })} />

      {source === "upload" ? (
        <>
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, "image"); event.target.value = ""; }}
          />
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy !== ""} onClick={() => imageInput.current?.click()}>
            <Upload className="h-4 w-4" /> {busy === "image" ? "Subiendo…" : "Elegir imagen"}
          </Button>
        </>
      ) : (
        <>
          <Input
            aria-label={source === "openai" ? "Descripción de imagen" : "Búsqueda de imagen"}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={source === "openai" ? "Describe la imagen a generar" : "Busca una foto…"}
            className="h-8"
          />
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy !== "" || prompt.trim().length < 3} onClick={() => void generateImage()}>
            {source === "openai" ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {busy === "image" ? (source === "openai" ? "Generando…" : "Buscando…") : source === "openai" ? "Generar" : "Buscar"}
          </Button>
        </>
      )}

      <div className="flex items-center gap-2 border-t border-border/60 pt-3">
        <AudioLines className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Narración de la escena</p>
      </div>

      {audioAssetId ? (
        <div className="flex items-center gap-2">
          <audio controls preload="metadata" src={`/api/assets/${audioAssetId}`} className="h-8 w-full" />
          <Button type="button" variant="secondary" size="icon-sm" aria-label="Quitar audio" onClick={() => onChange({ audioAssetId: null })}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      <input
        ref={audioInput}
        type="file"
        accept="audio/mpeg,audio/wav"
        className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, "audio"); event.target.value = ""; }}
      />
      <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy !== ""} onClick={() => audioInput.current?.click()}>
        <Upload className="h-4 w-4" /> {busy === "audio" ? "Subiendo…" : "Subir MP3 o WAV"}
      </Button>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        La imagen se usa como fondo con velo; el audio ajusta la duración de la escena al subirlo.
        {campaignId ? null : " Selecciona una campaña para reutilizar estos assets al guardar."}
      </p>
    </div>
  );
}
