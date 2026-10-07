"use client";

import { useState } from "react";
import { ArrowLeft, AudioLines, Captions, CheckCircle2, ChevronDown, ImageIcon, ImageOff, Palette, Save, Sparkles, Type } from "lucide-react";
import {
  HOOK_STYLES, SCENE_LABELS, sceneAccent, sceneDurationsFor, SIL_FRAMES, TAIL_FRAMES, timelineTotalFrames, VIDEO_NICHES,
  type HookStyle, type VideoDocument, type VideoNiche, type VideoSceneKey,
} from "@content-gen/domain/video";
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
import { SceneImagePicker } from "@/components/video/scene-image-picker";
import { ScenePlayer } from "@/components/video/scene-preview";

type Persisted = { revision: number; document: { data: unknown } };
type Field = [field: string, label: string, kind: "input" | "textarea" | "list"];

const FIELDS: Record<string, Field[]> = {
  intro: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["subtitle", "Subtítulo", "textarea"]],
  layers: [["tag", "Etiqueta", "input"], ["terminal", "Terminal (una línea por fila)", "list"], ["definition", "Definición", "textarea"]],
  phase: [["phase", "Nombre de fase", "input"], ["timestamp", "Marca de tiempo", "input"], ["title", "Título", "textarea"], ["narrative", "Narrativa", "textarea"], ["indicator", "Indicadores (uno por fila)", "list"]],
  reality: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["actions", "Acciones (una por fila)", "list"]],
  today: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["actions", "Acciones (una por fila)", "list"]],
  close: [["tag", "Etiqueta", "input"], ["title", "Título", "textarea"], ["subtitle", "Subtítulo", "textarea"]],
  event: [["event", "Etiqueta del evento", "input"], ["year", "Año", "input"], ["headline", "Titular", "textarea"], ["impact", "Impacto", "textarea"]],
};

const listValue = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
const textValue = (value: unknown) => typeof value === "string" ? value : "";
export const totalFrames = (document: VideoDocument) => timelineTotalFrames(document.scenes);

export function SceneEditor({
  document,
  onChange,
  contentItemId,
  revision,
  campaignId,
  unsavedChanges,
  onPersisted,
  onImagePersisted,
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
  /** Imagen guardada en el servidor: solo cambia esa escena y conserva el resto de cambios sin guardar. */
  onImagePersisted: (content: Persisted, sceneId: string) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [tab, setTab] = useState("text");
  const scene = document.scenes[Math.min(sceneIndex, document.scenes.length - 1)];
  const accent = sceneAccent(scene);
  const totalSeconds = Math.round(totalFrames(document) / document.fps);

  const updateScene = (patch: Partial<VideoDocument["scenes"][number]>) =>
    onChange({ ...document, scenes: document.scenes.map((item) => item.id === scene.id ? { ...item, ...patch } : item) });

  const updateContent = (field: string, value: string, kind: Field[2]) =>
    updateScene({ content: { ...scene.content, [field]: kind === "list" ? value.split("\n").map((line) => line.trim()).filter(Boolean) : value } });

  const updateAccent = (index: 0 | 1, value: string) =>
    updateScene({ accent: index === 0 ? [value, accent[1]] : [accent[0], value] });

  function updateTargetDuration(seconds: number) {
    const durations = sceneDurationsFor(document.templateId, seconds);
    onChange({ ...document, targetDurationSeconds: seconds, scenes: document.scenes.map((item) => item.audioAssetId || !durations[item.id] ? item : { ...item, durationFrames: durations[item.id] * document.fps }) });
  }

  const label = (item: VideoDocument["scenes"][number]) => SCENE_LABELS[item.id as VideoSceneKey] ?? item.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={onBack} aria-label="Volver a mis videos"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Editor de video</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{document.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{document.scenes.length} escenas · {totalSeconds}s · elige una escena a la izquierda y edítala; a la derecha ves cómo queda.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${unsavedChanges ? "text-amber-300" : "text-muted-foreground"}`}>{unsavedChanges ? "Hay texto sin guardar" : "Todo guardado"}</span>
          <Button type="button" onClick={onSave} disabled={!unsavedChanges}><Save className="h-4 w-4" /> Guardar cambios</Button>
        </div>
      </div>

      <details className="group rounded-xl border border-border/60 bg-card/40">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-foreground">
          Ajustes del video (título, nicho, hook, duración)
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-border/60 p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="video-title">Título del video (no sale en pantalla)</Label><Input id="video-title" value={document.title} onChange={(event) => onChange({ ...document, title: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="video-niche">Nicho</Label><Select value={document.niche} onValueChange={(value) => onChange({ ...document, niche: value as VideoNiche })}><SelectTrigger id="video-niche"><SelectValue /></SelectTrigger><SelectContent>{VIDEO_NICHES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="video-hook">Hook</Label><Select value={document.hookStyle} onValueChange={(value) => onChange({ ...document, hookStyle: value as HookStyle })}><SelectTrigger id="video-hook"><SelectValue /></SelectTrigger><SelectContent>{HOOK_STYLES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="video-target-duration">Duración objetivo (s)</Label><Input id="video-target-duration" type="number" min="15" max="180" step="1" value={document.targetDurationSeconds} onChange={(event) => updateTargetDuration(Math.min(180, Math.max(15, Math.round(Number(event.target.value) || 45))))} /></div>
          <div className="space-y-1.5"><Label htmlFor="video-slug">Slug</Label><Input id="video-slug" value={document.slug} onChange={(event) => onChange({ ...document, slug: event.target.value })} /></div>
        </div>
      </details>

      <div className="grid items-start gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
        <nav aria-label="Escenas" className="space-y-1.5 lg:sticky lg:top-5">
          {document.scenes.map((item, index) => {
            const selected = item.id === scene.id;
            return (
              <button key={item.id} type="button" onClick={() => setSceneIndex(index)} aria-current={selected ? "true" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl border p-1.5 text-left transition ${selected ? "border-primary/70 bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/40"}`}>
                <span className="relative h-14 w-8 shrink-0 overflow-hidden rounded-md bg-muted" style={{ background: item.imageAssetId ? undefined : `linear-gradient(160deg, ${sceneAccent(item)[0]}55, #050101)` }}>
                  {item.imageAssetId ? <img src={`/api/assets/${item.imageAssetId}`} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff className="absolute inset-0 m-auto h-3.5 w-3.5 text-white/70" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{String(index + 1).padStart(2, "0")} · {label(item)}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{(item.durationFrames / document.fps).toFixed(0)}s</span>
                    <span className={item.imageAssetId ? "text-primary" : "text-amber-600 dark:text-amber-300"}>{item.imageAssetId ? "imagen" : "sin imagen"}</span>
                    {item.audioAssetId ? <span className="text-primary">voz</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-center gap-3">
              <span className="h-9 w-1 rounded-full" style={{ background: accent[0] }} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Escena {sceneIndex + 1} de {document.scenes.length}</p>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">{label(scene)}</h3>
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid h-auto w-full grid-cols-5 bg-muted/60 p-1">
                <TabsTrigger value="text" className="gap-1.5 py-2 text-xs"><Type className="h-3.5 w-3.5" /> Texto</TabsTrigger>
                <TabsTrigger value="image" className="gap-1.5 py-2 text-xs"><ImageIcon className="h-3.5 w-3.5" /> Imagen</TabsTrigger>
                <TabsTrigger value="voice" className="gap-1.5 py-2 text-xs"><AudioLines className="h-3.5 w-3.5" /> Voz</TabsTrigger>
                <TabsTrigger value="caption" className="gap-1.5 py-2 text-xs"><Captions className="h-3.5 w-3.5" /> Caption</TabsTrigger>
                <TabsTrigger value="render" className="gap-1.5 py-2 text-xs"><Sparkles className="h-3.5 w-3.5" /> Publicar</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-5 space-y-4">
                <p className="text-xs text-muted-foreground">El texto que aparece en pantalla en esta escena. Los cambios se ven al momento en la vista previa; recuerda guardarlos.</p>
                {(FIELDS[scene.kind] ?? FIELDS.intro).map(([field, fieldLabel, kind]) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`video-scene-${field}`}>{fieldLabel}</Label>
                    {kind === "input"
                      ? <Input id={`video-scene-${field}`} value={textValue(scene.content[field])} onChange={(event) => updateContent(field, event.target.value, kind)} />
                      : <Textarea id={`video-scene-${field}`} rows={kind === "list" ? 4 : 3} value={kind === "list" ? listValue(scene.content[field]) : textValue(scene.content[field])} onChange={(event) => updateContent(field, event.target.value, kind)} />}
                  </div>
                ))}
                <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="video-scene-duration">Duración de la escena (s)</Label><Input id="video-scene-duration" type="number" min="0.1" step="0.1" disabled={Boolean(scene.audioAssetId)} value={(scene.durationFrames / document.fps).toFixed(1)} onChange={(event) => updateScene({ durationFrames: Math.max(1, Math.round((Number(event.target.value) || 1) * document.fps)) })} /><p className="text-[10px] text-muted-foreground">{scene.audioAssetId ? "La fija la voz de la escena." : `Se agregan ${SIL_FRAMES} frames de respiro al final.`}</p></div>
                  <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5 text-primary" /> Colores de la escena</Label><div className="flex gap-2"><Input aria-label="Color principal de la escena" type="color" className="h-10 w-full p-1" value={accent[0]} onChange={(event) => updateAccent(0, event.target.value.toUpperCase())} /><Input aria-label="Color secundario de la escena" type="color" className="h-10 w-full p-1" value={accent[1]} onChange={(event) => updateAccent(1, event.target.value.toUpperCase())} /></div></div>
                </div>
              </TabsContent>

              <TabsContent value="image" className="mt-5 space-y-3">
                <p className="text-xs text-muted-foreground">La imagen de fondo de esta escena. Se guarda sola al elegirla; la anterior queda en «Imágenes anteriores» por si quieres volver.</p>
                {contentItemId
                  ? <SceneImagePicker key={scene.id} contentItemId={contentItemId} revision={revision} scene={scene} campaignId={campaignId} onPersisted={onImagePersisted} />
                  : <p className="text-sm text-muted-foreground">Guarda el video primero para ponerle imágenes.</p>}
              </TabsContent>

              <TabsContent value="voice" className="mt-5 space-y-5">
                {contentItemId ? <VoiceoverStep contentItemId={contentItemId} revision={revision} document={document} onPersisted={onPersisted} /> : <p className="text-sm text-muted-foreground">Guarda el video primero para generar guion de voz y narración.</p>}
                <VideoAssetPanel key={scene.id} audioAssetId={scene.audioAssetId} campaignId={campaignId} contentItemId={contentItemId} onChange={(patch) => updateScene(patch)} onAudioSeconds={(seconds) => updateScene({ durationFrames: Math.max(1, Math.ceil(seconds * document.fps) + TAIL_FRAMES) })} />
              </TabsContent>
              <TabsContent value="caption" className="mt-5"><VideoCaptionPanel contentItemId={contentItemId} revision={revision} document={document} onPersisted={onPersisted} /></TabsContent>
              <TabsContent value="render" className="mt-5 space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4 text-sm text-muted-foreground"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><p className="font-semibold text-foreground">Último paso: crea el MP4</p></div><p className="mt-2">Guarda los cambios y presiona renderizar. El proceso ocurre solo y luego podrás descargar el archivo aquí.</p></div>
                <VideoRenderPanel contentItemId={contentItemId} unsavedChanges={unsavedChanges} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-2 lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vista previa · escena {sceneIndex + 1}</p>
          <div className="mx-auto max-w-[20rem]"><ScenePlayer document={document} index={sceneIndex} /></div>
          <p className="text-[11px] text-muted-foreground">Así sale en el render: imagen, texto, colores y voz de esta escena.</p>
        </div>
      </div>
    </div>
  );
}
