"use client";

import { Check, Film, Pencil, Plus } from "lucide-react";
import { SCENE_LABELS, type VideoDocument, type VideoSceneKey } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VideoCaptionPanel } from "@/components/video-caption-panel";
import { VideoRenderPanel } from "@/components/video-render-panel";

type Persisted = { revision: number; document: { data: unknown } };

export function SavePanel({
  contentItemId,
  revision,
  document,
  campaignName,
  onPersisted,
  onEdit,
  onReset,
  onGoToVideos,
}: {
  contentItemId: string;
  revision: number;
  document: VideoDocument;
  campaignName: string;
  onPersisted: (content: Persisted) => void;
  onEdit: () => void;
  onReset: () => void;
  onGoToVideos: () => void;
}) {
  const withImage = document.scenes.filter((scene) => scene.imageAssetId).length;
  const withAudio = document.scenes.filter((scene) => scene.audioAssetId).length;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Guardado en la biblioteca</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          El video vive en la campaña <span className="font-semibold text-foreground">{campaignName}</span> como un solo documento: el mismo que alimenta el preview, el editor y el render.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Check className="h-4 w-4" /> Contenido guardado</p>
          <ul className="space-y-1 font-mono text-sm text-muted-foreground">
            <li>{document.slug} · {document.templateId} · {document.targetDurationSeconds}s</li>
            <li>{document.scenes.length} escenas · {withImage} con imagen · {withAudio} con voz</li>
            <li>1080 × 1920 · 30 FPS</li>
          </ul>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {document.scenes.map((scene) => (
              <span key={scene.id} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}
                {scene.imageAssetId ? " 🖼" : ""}
                {scene.audioAssetId ? " 🔊" : ""}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <VideoCaptionPanel contentItemId={contentItemId} revision={revision} document={document} onPersisted={onPersisted} />

      <VideoRenderPanel contentItemId={contentItemId} unsavedChanges={false} />

      <div className="flex flex-wrap gap-3">
        <Button type="button" className="flex-1" onClick={onGoToVideos}><Film className="h-4 w-4" /> Ver en Mis videos →</Button>
        <Button type="button" variant="outline" className="flex-1" onClick={onEdit}><Pencil className="h-4 w-4" /> Editar escena por escena</Button>
        <Button type="button" variant="outline" className="flex-1" onClick={onReset}><Plus className="h-4 w-4" /> Generar otro video</Button>
      </div>
    </div>
  );
}
