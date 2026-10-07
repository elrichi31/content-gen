"use client";

import { useState } from "react";
import { AudioLines, ImageOff, Search, Sparkles } from "lucide-react";
import { SCENE_LABELS, type VideoDocument, type VideoSceneKey } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { AiProgress } from "@/components/ai-progress";
import { requestSceneImage, SceneImagePicker, scenePrompt, type ImageSource } from "@/components/video/scene-image-picker";
import { SceneThumbnail } from "@/components/video/scene-preview";

type Persisted = { revision: number; document: { data: unknown } };
const label = (sceneId: string) => SCENE_LABELS[sceneId as VideoSceneKey] ?? sceneId;

/**
 * Paso «Imágenes»: a la izquierda las escenas tal como saldrán (imagen + texto), a la derecha
 * la imagen de la escena elegida. Arriba, rellenar de una vez las que faltan.
 */
export function ImageGallery({
  contentItemId,
  revision,
  document,
  campaignId,
  onPersisted,
  onContinue,
}: {
  contentItemId: string;
  revision: number;
  document: VideoDocument;
  campaignId?: string;
  onPersisted: (content: Persisted) => void;
  onContinue: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [bulkSource, setBulkSource] = useState<ImageSource>("unsplash");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const ready = document.scenes.filter((scene) => scene.imageAssetId).length;
  const missing = document.scenes.filter((scene) => !scene.imageAssetId);
  const scene = document.scenes[Math.min(selected, document.scenes.length - 1)];

  // Cada imagen sube la revisión del video, así que la cadena arrastra la última.
  async function fillMissing() {
    setErrors([]);
    const failed: string[] = [];
    let current = revision;
    setProgress({ done: 0, total: missing.length });
    for (const [index, item] of missing.entries()) {
      try {
        const content = await requestSceneImage(contentItemId, item.id, { source: bulkSource, prompt: scenePrompt(item) }, current);
        onPersisted(content); current = content.revision;
      } catch (reason) {
        failed.push(`${label(item.id)}: ${reason instanceof Error ? reason.message : "no se pudo poner la imagen."}`);
      }
      setProgress({ done: index + 1, total: missing.length });
    }
    setErrors(failed); setProgress(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Imágenes de fondo</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada escena lleva una imagen detrás del texto. Abajo ves cómo quedará cada una en el video. Rellena las que faltan de una vez o toca una escena para elegir su imagen.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground"><span className="font-semibold">{ready} de {document.scenes.length}</span> escenas con imagen</p>
        {missing.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-muted/60 p-0.5" role="radiogroup" aria-label="Cómo rellenar">
              {([["unsplash", "Fotos gratis", Search], ["openai", "Generar con IA", Sparkles]] as const).map(([id, text, Icon]) => (
                <button key={id} type="button" role="radio" aria-checked={bulkSource === id} disabled={progress !== null} onClick={() => setBulkSource(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${bulkSource === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <Icon className="h-3.5 w-3.5" /> {text}
                </button>
              ))}
            </div>
            <Button type="button" disabled={progress !== null} onClick={() => void fillMissing()}>
              {progress ? <AiProgress label={`Escena ${Math.min(progress.done + 1, progress.total)} de ${progress.total}`} estimateMs={(bulkSource === "openai" ? 20_000 : 3_000) * progress.total} state="shaping" /> : `Rellenar las ${missing.length} que faltan`}
            </Button>
          </div>
        ) : null}
      </div>

      {errors.length ? (
        <div className="space-y-1">{errors.map((message) => <p key={message} className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{message}</p>)}</div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {document.scenes.map((item, index) => (
            <button key={item.id} type="button" onClick={() => setSelected(index)} aria-pressed={index === selected}
              className={`group text-left transition ${index === selected ? "" : "opacity-85 hover:opacity-100"}`}>
              <div className={`relative overflow-hidden rounded-xl border-2 bg-black ${index === selected ? "border-primary" : "border-transparent"}`} style={{ aspectRatio: "9/16" }}>
                <SceneThumbnail document={document} index={index} />
                {!item.imageAssetId ? <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-amber-300"><ImageOff className="h-3 w-3" /> Sin imagen</span> : null}
              </div>
              <p className="mt-1.5 text-xs font-semibold text-foreground">{String(index + 1).padStart(2, "0")} · {label(item.id)}</p>
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4 lg:sticky lg:top-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Escena {selected + 1} · {label(scene.id)}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Elige de dónde sale su imagen.</p>
          </div>
          <SceneImagePicker key={scene.id} contentItemId={contentItemId} revision={revision} scene={scene} campaignId={campaignId} disabled={progress !== null} onPersisted={(content) => onPersisted(content)} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{ready < document.scenes.length ? "Las escenas sin imagen salen con fondo de color. Puedes ponerlas después desde el editor." : null}</p>
        <Button type="button" className="shrink-0" disabled={progress !== null} onClick={onContinue}>
          <AudioLines className="h-4 w-4" /> {ready < document.scenes.length ? `Continuar con ${ready}/${document.scenes.length} imágenes →` : "Continuar a la voz →"}
        </Button>
      </div>
    </div>
  );
}
