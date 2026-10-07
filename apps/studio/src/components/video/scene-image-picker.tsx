"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, History, Search, Sparkles, Trash2, Upload } from "lucide-react";
import type { VideoDocument } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiProgress } from "@/components/ai-progress";

type Persisted = { revision: number; document: { data: unknown } };
type Scene = VideoDocument["scenes"][number];
export type ImageSource = "unsplash" | "openai";
type Mode = ImageSource | "upload" | "library";

const MODES: { id: Mode; label: string; icon: typeof Search; hint: string }[] = [
  { id: "unsplash", label: "Buscar foto", icon: Search, hint: "Busca una foto real en Unsplash con las palabras clave de la descripción. Es gratis." },
  { id: "openai", label: "Generar con IA", icon: Sparkles, hint: "OpenAI crea una foto vertical y cinematográfica a partir de la descripción. Tiene costo." },
  { id: "upload", label: "Subir", icon: Upload, hint: "Sube una imagen tuya (PNG, JPG o WebP). Se recorta a vertical 9:16." },
  { id: "library", label: "De la campaña", icon: FolderOpen, hint: "Reutiliza una imagen que ya está en la campaña." },
];

/** Lo que se le pide al proveedor si la escena no trae `imagePrompt`: su texto en pantalla. */
export const scenePrompt = (scene: Scene) => {
  const prompt = typeof scene.content.imagePrompt === "string" ? scene.content.imagePrompt.trim() : "";
  if (prompt) return prompt;
  const text = [scene.content.title, scene.content.headline, scene.content.subtitle].find((value) => typeof value === "string" && value.trim());
  return typeof text === "string" ? text.replace(/\n/g, " ") : scene.id;
};

/** Pide la imagen al servidor: genera/busca (`source` + `prompt`) o fija una existente (`assetId`, `null` quita). Guarda al momento. */
export async function requestSceneImage(contentItemId: string, sceneId: string, body: { source: ImageSource; prompt: string } | { assetId: string | null }, revision: number) {
  const response = await fetch(`/api/videos/${contentItemId}/scenes/${sceneId}/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo cambiar la imagen.");
  return payload.content as Persisted;
}

type Asset = { id: string; filename: string };

/**
 * Todo lo que se puede hacer con la imagen de una escena, en un solo sitio. Cada acción se
 * guarda en el momento (no hace falta «Guardar cambios») y la imagen anterior queda en el historial.
 */
export function SceneImagePicker({ contentItemId, revision, scene, campaignId, onPersisted, disabled = false }: {
  contentItemId: string;
  revision: number;
  scene: Scene;
  campaignId?: string;
  onPersisted: (content: Persisted, sceneId: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("unsplash");
  const [prompt, setPrompt] = useState(() => scenePrompt(scene));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [library, setLibrary] = useState<Asset[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const history = (Array.isArray(scene.content.imageAssetHistory) ? scene.content.imageAssetHistory : []).filter((id): id is string => typeof id === "string" && id !== scene.imageAssetId).slice(-8).reverse();

  useEffect(() => {
    if (mode !== "library" || library || !campaignId) return;
    void fetch(`/api/assets?campaignId=${encodeURIComponent(campaignId)}&kind=image`).then((response) => response.ok ? response.json() : []).then(setLibrary).catch(() => setLibrary([]));
  }, [mode, library, campaignId]);

  async function run(job: string, task: () => Promise<Persisted>) {
    setError(""); setBusy(job);
    try { onPersisted(await task(), scene.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cambiar la imagen."); }
    finally { setBusy(""); }
  }

  const use = (assetId: string | null, job = assetId ?? "remove") => run(job, () => requestSceneImage(contentItemId, scene.id, { assetId }, revision));
  const generate = () => run("generate", () => requestSceneImage(contentItemId, scene.id, { source: mode as ImageSource, prompt }, revision));
  const upload = (file: File) => run("upload", async () => {
    const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": file.type, "X-Asset-Filename": encodeURIComponent(file.name), ...(campaignId ? { "X-Campaign-Id": campaignId } : {}), "X-Content-Item-Id": contentItemId }, body: file });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo subir la imagen.");
    setLibrary(null);
    return requestSceneImage(contentItemId, scene.id, { assetId: payload.id }, revision);
  });

  const locked = disabled || busy !== "";
  const active = MODES.find((item) => item.id === mode)!;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted/50 p-1 sm:grid-cols-4" role="tablist" aria-label="Origen de la imagen">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setError(""); }}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${mode === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{active.hint}</p>

      {mode === "unsplash" || mode === "openai" ? (
        <div className="space-y-2">
          <Textarea aria-label="Descripción de la imagen" rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Qué se ve: sujeto, lugar, momento…" />
          <Button type="button" className="w-full" disabled={locked || prompt.trim().length < 3} onClick={() => void generate()}>
            {busy === "generate"
              ? mode === "openai" ? <AiProgress label="Generando imagen" estimateMs={20_000} state="shaping" /> : "Buscando foto…"
              : mode === "openai" ? <><Sparkles className="h-4 w-4" /> {scene.imageAssetId ? "Generar otra" : "Generar imagen"}</> : <><Search className="h-4 w-4" /> {scene.imageAssetId ? "Buscar otra" : "Buscar foto"}</>}
          </Button>
        </div>
      ) : null}

      {mode === "upload" ? (
        <>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
          <Button type="button" variant="outline" className="h-20 w-full border-dashed" disabled={locked} onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> {busy === "upload" ? "Subiendo…" : "Elegir imagen de tu equipo"}
          </Button>
        </>
      ) : null}

      {mode === "library" ? (
        !campaignId ? <p className="text-xs text-muted-foreground">Este video no tiene campaña.</p>
          : library === null ? <p className="text-xs text-muted-foreground">Cargando imágenes…</p>
            : library.length === 0 ? <p className="text-xs text-muted-foreground">La campaña todavía no tiene imágenes.</p>
              : <Thumbs ids={library.map((asset) => asset.id)} current={scene.imageAssetId} busy={busy} disabled={locked} onPick={(id) => void use(id)} />
      ) : null}

      {history.length ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><History className="h-3.5 w-3.5" /> Imágenes anteriores de esta escena</p>
          <Thumbs ids={history} current={scene.imageAssetId} busy={busy} disabled={locked} onPick={(id) => void use(id)} />
        </div>
      ) : null}

      {scene.imageAssetId ? (
        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" disabled={locked} onClick={() => void use(null)}>
          <Trash2 className="h-3.5 w-3.5" /> {busy === "remove" ? "Quitando…" : "Quitar imagen (fondo de color)"}
        </Button>
      ) : null}

      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Thumbs({ ids, current, busy, disabled, onPick }: { ids: string[]; current?: string | null; busy: string; disabled: boolean; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {ids.map((id) => (
        <button key={id} type="button" disabled={disabled || id === current} onClick={() => onPick(id)} aria-label="Usar esta imagen"
          className={`relative overflow-hidden rounded-md border transition hover:opacity-90 disabled:cursor-default ${id === current ? "border-primary ring-2 ring-primary/40" : "border-border/60"}`} style={{ aspectRatio: "9/16" }}>
          <img src={`/api/assets/${id}`} alt="" className="h-full w-full object-cover" loading="lazy" />
          {busy === id ? <span className="absolute inset-0 grid place-items-center bg-black/50"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /></span> : null}
        </button>
      ))}
    </div>
  );
}
