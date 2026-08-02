"use client";

import { useState } from "react";
import { ArrowLeft, Clapperboard, Save } from "lucide-react";
import { Player } from "@remotion/player";
import {
  HOOK_STYLES, SCENE_LABELS, sceneAccent, sceneDurationsFor, SIL_FRAMES, TAIL_FRAMES, VIDEO_NICHES,
  type HookStyle, type VideoDocument, type VideoNiche, type VideoSceneKey,
} from "@content-gen/domain/video";
import { getVideoTemplate } from "@content-gen/video-engine/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoAssetPanel } from "@/components/video-asset-panel";
import { VideoCaptionPanel } from "@/components/video-caption-panel";
import { VideoRenderPanel } from "@/components/video-render-panel";
import { VoiceoverStep } from "@/components/video/voiceover-step";

type Persisted = { revision: number; document: { data: unknown } };
type Field = [field: string, label: string, kind: "input" | "textarea" | "list"];

// Cada layout del motor dibuja unos campos concretos: el editor muestra solo esos.
const FIELDS: Record<string, Field[]> = {
  intro: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["subtitle", "Subtítulo", "textarea"]],
  layers: [["tag", "Etiqueta", "input"], ["terminal", "Terminal (una línea por fila)", "list"], ["definition", "Definición", "textarea"], ["detail", "Detalle", "textarea"]],
  phase: [["phase", "Nombre de fase", "input"], ["timestamp", "Marca de tiempo", "input"], ["title", "Título", "textarea"], ["narrative", "Narrativa", "textarea"], ["detail", "Detalle", "textarea"], ["indicator", "Indicadores (uno por fila)", "list"]],
  reality: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["actions", "Acciones (una por fila)", "list"]],
  today: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["actions", "Acciones (una por fila)", "list"]],
  close: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["subtitle", "Subtítulo", "textarea"]],
  event: [["event", "Etiqueta del evento", "input"], ["year", "Año", "input"], ["headline", "Titular", "textarea"], ["impact", "Impacto", "textarea"]],
};

const listValue = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
const textValue = (value: unknown) => typeof value === "string" ? value : "";
export const totalFrames = (document: VideoDocument) => document.scenes.reduce((total, scene) => total + scene.durationFrames + SIL_FRAMES, 0);

export function SceneEditor({
  document,
  onChange,
  contentItemId,
  revision,
  campaignId,
  unsavedChanges,
  onPersisted,
  onSave,
  onBack,
}: {
  document: VideoDocument;
  onChange: (next: VideoDocument) => void;
  contentItemId: string;
  revision: number;
  campaignId?: string;
  unsavedChanges: boolean;
  onPersisted: (content: Persisted) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [tab, setTab] = useState("scene");

  const template = getVideoTemplate(document.templateId) ?? getVideoTemplate("standard")!;
  const scene = document.scenes[Math.min(sceneIndex, document.scenes.length - 1)];
  const durationInFrames = totalFrames(document);
  const accent = sceneAccent(scene);

  const updateScene = (patch: Partial<VideoDocument["scenes"][number]>) =>
    onChange({ ...document, scenes: document.scenes.map((item) => item.id === scene.id ? { ...item, ...patch } : item) });

  const updateContent = (field: string, value: string, kind: Field[2]) =>
    updateScene({ content: { ...scene.content, [field]: kind === "list" ? value.split("\n").map((line) => line.trim()).filter(Boolean) : value } });

  const updateAccent = (index: 0 | 1, value: string) =>
    updateScene({ accent: index === 0 ? [value, accent[1]] : [accent[0], value] });

  // Reparte la nueva duración objetivo con las proporciones del legacy, salvo donde ya manda la narración.
  function updateTargetDuration(seconds: number) {
    const durations = sceneDurationsFor(document.templateId, seconds);
    onChange({ ...document, targetDurationSeconds: seconds, scenes: document.scenes.map((item) => item.audioAssetId || !durations[item.id] ? item : { ...item, durationFrames: durations[item.id] * document.fps }) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Volver</Button>
        <Button type="button" onClick={onSave}><Save className="h-4 w-4" /> Guardar cambios</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(24rem,1fr)_24rem]">
        <div className="relative flex min-h-[42rem] items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-[radial-gradient(circle_at_50%_15%,oklch(0.55_0.12_145/0.16),transparent_24rem),linear-gradient(145deg,#111,#070707)] p-6">
          <div className="absolute left-5 top-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">
            <Clapperboard className="h-3.5 w-3.5" /> Preview · {durationInFrames} frames · {Math.round(durationInFrames / document.fps)}s
          </div>
          <Player
            key={document.templateId}
            component={template.component}
            inputProps={{ document, assetBaseUrl: "" }}
            durationInFrames={durationInFrames}
            fps={document.fps}
            compositionWidth={document.width}
            compositionHeight={document.height}
            controls
            acknowledgeRemotionLicense
            style={{ width: `min(100%, ${(620 * document.width) / document.height}px)` }}
          />
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-5">
            <div className="space-y-1.5"><Label htmlFor="video-title">Título</Label><Input id="video-title" value={document.title} onChange={(event) => onChange({ ...document, title: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="video-slug">Slug</Label><Input id="video-slug" value={document.slug} onChange={(event) => onChange({ ...document, slug: event.target.value })} /></div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="video-niche">Niche</Label>
                <Select value={document.niche} onValueChange={(value) => onChange({ ...document, niche: value as VideoNiche })}>
                  <SelectTrigger id="video-niche"><SelectValue /></SelectTrigger>
                  <SelectContent>{VIDEO_NICHES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="video-hook">Hook</Label>
                <Select value={document.hookStyle} onValueChange={(value) => onChange({ ...document, hookStyle: value as HookStyle })}>
                  <SelectTrigger id="video-hook"><SelectValue /></SelectTrigger>
                  <SelectContent>{HOOK_STYLES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="video-target-duration">Duración objetivo (segundos)</Label>
              <Input id="video-target-duration" type="number" min="15" max="180" step="1" value={document.targetDurationSeconds} onChange={(event) => updateTargetDuration(Math.min(180, Math.max(15, Math.round(Number(event.target.value) || 45))))} />
            </div>

            <div className="flex flex-wrap gap-2">
              {document.scenes.map((item, index) => (
                <Button key={item.id} size="sm" variant={item.id === scene.id ? "default" : "outline"} onClick={() => setSceneIndex(index)}>
                  {SCENE_LABELS[item.id as VideoSceneKey] ?? item.id}
                </Button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="video-scene-duration">Duración de la escena (segundos)</Label>
              <Input id="video-scene-duration" type="number" min="0.1" step="0.1" value={(scene.durationFrames / document.fps).toFixed(1)} onChange={(event) => updateScene({ durationFrames: Math.max(1, Math.round((Number(event.target.value) || 1) * document.fps)) })} />
              <p className="text-[10px] text-muted-foreground">El motor añade {SIL_FRAMES} frames de silencio al final de cada escena, igual que el proyecto original.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Colores de la escena</Label>
              <div className="flex gap-2">
                <Input aria-label="Color principal de la escena" type="color" className="h-9 w-full p-1" value={accent[0]} onChange={(event) => updateAccent(0, event.target.value.toUpperCase())} />
                <Input aria-label="Color secundario de la escena" type="color" className="h-9 w-full p-1" value={accent[1]} onChange={(event) => updateAccent(1, event.target.value.toUpperCase())} />
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="scene" className="flex-1">Escena</TabsTrigger>
                <TabsTrigger value="voice" className="flex-1">Voz</TabsTrigger>
                <TabsTrigger value="caption" className="flex-1">Caption</TabsTrigger>
                <TabsTrigger value="render" className="flex-1">Render</TabsTrigger>
              </TabsList>

              <TabsContent value="scene" className="mt-4 space-y-5">
                {(FIELDS[scene.kind] ?? FIELDS.intro).map(([field, label, kind]) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`video-scene-${field}`}>{label}</Label>
                    {kind === "input"
                      ? <Input id={`video-scene-${field}`} value={textValue(scene.content[field])} onChange={(event) => updateContent(field, event.target.value, kind)} />
                      : <Textarea id={`video-scene-${field}`} rows={kind === "list" ? 4 : 2} value={kind === "list" ? listValue(scene.content[field]) : textValue(scene.content[field])} onChange={(event) => updateContent(field, event.target.value, kind)} />}
                  </div>
                ))}
                <VideoAssetPanel
                  key={scene.id}
                  imageAssetId={scene.imageAssetId}
                  audioAssetId={scene.audioAssetId}
                  campaignId={campaignId}
                  contentItemId={contentItemId}
                  sceneId={scene.id}
                  revision={revision}
                  initialPrompt={textValue(scene.content.imagePrompt)}
                  onChange={(patch) => updateScene(patch)}
                  onAudioSeconds={(seconds) => updateScene({ durationFrames: Math.max(1, Math.ceil(seconds * document.fps) + TAIL_FRAMES) })}
                  onPersisted={onPersisted}
                />
              </TabsContent>

              <TabsContent value="voice" className="mt-4">
                {contentItemId
                  ? <VoiceoverStep contentItemId={contentItemId} revision={revision} document={document} onPersisted={onPersisted} />
                  : <p className="text-xs text-muted-foreground">Guarda el video en una campaña para generar guion de voz y narración.</p>}
              </TabsContent>

              <TabsContent value="caption" className="mt-4">
                <VideoCaptionPanel contentItemId={contentItemId} revision={revision} document={document} onPersisted={onPersisted} />
              </TabsContent>

              <TabsContent value="render" className="mt-4">
                <VideoRenderPanel contentItemId={contentItemId} unsavedChanges={unsavedChanges} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
