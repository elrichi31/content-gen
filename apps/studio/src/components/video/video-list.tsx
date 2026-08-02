"use client";

import { Film, Pencil, RotateCcw } from "lucide-react";
import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type StoredVideo = { id: string; revision: number; campaignId: string; document: { data: unknown } };

export function VideoList({
  videos,
  campaignNames,
  onEdit,
  onRegenerate,
  onNew,
}: {
  videos: StoredVideo[];
  campaignNames: Record<string, string>;
  onEdit: (item: StoredVideo, document: VideoDocument) => void;
  onRegenerate: (topic: string) => void;
  onNew: () => void;
}) {
  const parsed = videos.map((item) => ({ item, result: videoDocumentSchema.safeParse(item.document.data) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Mis videos</h2>
        <Button type="button" onClick={onNew}>+ Nuevo video</Button>
      </div>

      {parsed.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Todavía no hay videos guardados. Empieza uno nuevo desde el asistente.</CardContent></Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {parsed.map(({ item, result }) => {
          if (!result.success) {
            return (
              <Card key={item.id}>
                <CardContent className="space-y-1">
                  <p className="font-mono text-xs text-muted-foreground">{item.id.slice(0, 8)}</p>
                  <p className="text-sm text-destructive">Este contenido no es un VideoDocument válido; regenéralo desde el asistente.</p>
                </CardContent>
              </Card>
            );
          }
          const document = result.data;
          const cover = document.scenes.find((scene) => scene.imageAssetId)?.imageAssetId;
          const withImage = document.scenes.filter((scene) => scene.imageAssetId).length;
          const withAudio = document.scenes.filter((scene) => scene.audioAssetId).length;
          return (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="flex gap-4">
                <div className="h-28 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                  {cover
                    ? <img src={`/api/assets/${cover}`} alt="" className="h-full w-full object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-muted-foreground"><Film className="h-5 w-5" /></span>}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-semibold text-foreground">{document.title}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{document.slug}</p>
                  <p className="text-xs text-muted-foreground">
                    {document.templateId === "timeline" ? "Timeline" : "Estándar"} · {document.targetDurationSeconds}s · {campaignNames[item.campaignId] ?? "sin campaña"}
                  </p>
                  <p className="text-xs text-muted-foreground">{withImage}/{document.scenes.length} imágenes · {withAudio}/{document.scenes.length} voces</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => onEdit(item, document)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => onRegenerate(document.title)}><RotateCcw className="h-3.5 w-3.5" /> Regenerar</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
