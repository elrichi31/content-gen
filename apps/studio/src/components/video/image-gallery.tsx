"use client";

import { useState } from "react";
import { AudioLines, Plus, RotateCcw } from "lucide-react";
import { SCENE_LABELS, type VideoDocument, type VideoSceneKey } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";

type Persisted = { revision: number; document: { data: unknown } };

const promptFor = (scene: VideoDocument["scenes"][number]) => {
  const prompt = typeof scene.content.imagePrompt === "string" ? scene.content.imagePrompt.trim() : "";
  if (prompt) return prompt;
  const title = typeof scene.content.title === "string" ? scene.content.title : typeof scene.content.headline === "string" ? scene.content.headline : scene.id;
  return `Hyper-realistic cinematic photograph. ${title.replace(/\n/g, " ")}. Dramatic contrast, deep blacks. No text, no watermarks, no logos. Vertical 9:16 portrait composition. Photorealistic, not CGI.`;
};

export function ImageGallery({
  contentItemId,
  revision,
  document,
  onPersisted,
  onContinue,
}: {
  contentItemId: string;
  revision: number;
  document: VideoDocument;
  onPersisted: (content: Persisted) => void;
  onContinue: () => void;
}) {
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const ready = document.scenes.filter((scene) => scene.imageAssetId).length;

  // Cada llamada sube la revisión del contenido, así que la cadena arrastra la última.
  async function generateOne(sceneId: string, currentRevision: number) {
    const scene = document.scenes.find((item) => item.id === sceneId)!;
    const response = await fetch(`/api/videos/${contentItemId}/scenes/${sceneId}/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "openai", prompt: promptFor(scene), revision: currentRevision }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${SCENE_LABELS[sceneId as VideoSceneKey] ?? sceneId}: ${typeof payload.error === "string" ? payload.error : "no se pudo generar la imagen."}`);
    const content = payload.content as Persisted;
    onPersisted(content);
    return content.revision;
  }

  async function generate(sceneId?: string) {
    setErrors([]);
    if (sceneId) setLoadingKey(sceneId); else setLoadingAll(true);
    let current = revision;
    const failed: string[] = [];
    for (const scene of sceneId ? document.scenes.filter((item) => item.id === sceneId) : document.scenes) {
      if (!sceneId && scene.imageAssetId) continue;
      try { current = await generateOne(scene.id, current); }
      catch (reason) { failed.push(reason instanceof Error ? reason.message : "No se pudo generar la imagen."); }
    }
    setErrors(failed);
    setLoadingAll(false);
    setLoadingKey(null);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Imágenes por escena</h2>
          <p className="mt-1 text-sm text-muted-foreground">{ready}/{document.scenes.length} generadas · vertical 9:16</p>
        </div>
        <Button type="button" disabled={loadingAll || loadingKey !== null} onClick={() => void generate()}>
          {loadingAll ? "Generando todas…" : "Generar todas"}
        </Button>
      </div>

      {errors.length ? (
        <div className="space-y-1">
          {errors.map((message) => <p key={message} className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{message}</p>)}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {document.scenes.map((scene) => {
          const busy = loadingKey === scene.id || (loadingAll && !scene.imageAssetId);
          return (
            <div key={scene.id} className="relative overflow-hidden rounded-xl border border-border bg-muted" style={{ aspectRatio: "9/16" }}>
              {scene.imageAssetId ? (
                <img src={`/api/assets/${scene.imageAssetId}`} alt={SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id} className="h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {busy
                    ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    : <Button type="button" variant="ghost" size="sm" className="h-full w-full flex-col gap-1 text-muted-foreground" disabled={loadingAll} onClick={() => void generate(scene.id)}><Plus className="h-5 w-5" /><span className="text-xs font-semibold">Generar</span></Button>}
                </div>
              )}
              <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-xs font-semibold text-white">
                {SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}
              </p>
              {scene.imageAssetId ? (
                <Button type="button" variant="secondary" size="icon-sm" className="absolute right-2 top-2" aria-label={`Regenerar imagen de ${SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}`} disabled={busy || loadingAll} onClick={() => void generate(scene.id)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button type="button" className="w-full" disabled={loadingAll || loadingKey !== null} onClick={onContinue}>
        <AudioLines className="h-4 w-4" />
        {ready === 0 ? "Saltar imágenes por ahora →" : ready < document.scenes.length ? `Continuar con ${ready}/${document.scenes.length} imágenes →` : "Continuar a voz en off →"}
      </Button>
      {ready < document.scenes.length ? <p className="text-center text-xs text-muted-foreground">Las imágenes que falten se pueden generar después desde el editor, sin perder el guion ni la voz.</p> : null}
    </div>
  );
}
