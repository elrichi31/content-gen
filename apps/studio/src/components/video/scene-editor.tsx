"use client";

import { useState } from "react";
import { ArrowLeft, AudioLines, Captions, CheckCircle2, ImageIcon, Palette, Save, Sparkles, Timer, WandSparkles } from "lucide-react";
import {
  HOOK_STYLES, SCENE_LABELS, sceneAccent, sceneDurationsFor, SIL_FRAMES, TAIL_FRAMES, VIDEO_NICHES,
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

type Persisted = { revision: number; document: { data: unknown } };
type Field = [field: string, label: string, kind: "input" | "textarea" | "list"];

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5">
        <div className="flex items-start gap-3">
          <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={onBack} aria-label="Volver a mis videos"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Editor de video</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Construye la historia, escena por escena</h2>
            <p className="mt-1 text-sm text-muted-foreground">{document.scenes.length} escenas · {totalSeconds}s · edita el contenido y prepara la publicación.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${unsavedChanges ? "text-amber-300" : "text-muted-foreground"}`}>{unsavedChanges ? "Cambios sin guardar" : "Todo guardado"}</span>
          <Button type="button" onClick={onSave}><Save className="h-4 w-4" /> Guardar cambios</Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/70 bg-card/60 xl:sticky xl:top-5">
          <CardContent className="p-3">
            <div className="px-2 pb-3 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mapa de tu video</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Elige una escena para editar su mensaje, imagen y voz.</p>
            </div>
            <div className="space-y-1.5">
              {document.scenes.map((item, index) => {
                const selected = item.id === scene.id;
                const itemAccent = sceneAccent(item)[0];
                const summary = textValue(item.content.title ?? item.content.headline ?? item.content.event);
                return (
                  <button key={item.id} type="button" onClick={() => setSceneIndex(index)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition duration-200 hover:-translate-y-px ${selected ? "shadow-sm" : "border-transparent hover:border-border hover:bg-muted/40"}`} style={selected ? { borderColor: `${itemAccent}88`, background: `${itemAccent}12` } : undefined}>
                    <span className="flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold" style={{ background: `${itemAccent}24`, color: itemAccent }}>{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{SCENE_LABELS[item.id as VideoSceneKey] ?? item.id}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{(item.durationFrames / document.fps).toFixed(0)}s</span>
                    </span>
                    {summary ? <span className="mt-1.5 block truncate pl-7 text-[11px] text-muted-foreground">{summary}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground"><Timer className="h-3.5 w-3.5 text-primary" /> Duración objetivo: {document.targetDurationSeconds}s</div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
              <div className="flex items-center gap-3">
                <span className="h-10 w-1 rounded-full" style={{ background: accent[0] }} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Escena {sceneIndex + 1} de {document.scenes.length}</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}</h3>
                </div>
              </div>
              <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">{(scene.durationFrames / document.fps).toFixed(1)} segundos</span>
            </div>

            <div className="grid gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="video-title">Título del video</Label><Input id="video-title" value={document.title} onChange={(event) => onChange({ ...document, title: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="video-niche">Nicho</Label><Select value={document.niche} onValueChange={(value) => onChange({ ...document, niche: value as VideoNiche })}><SelectTrigger id="video-niche"><SelectValue /></SelectTrigger><SelectContent>{VIDEO_NICHES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="video-hook">Hook</Label><Select value={document.hookStyle} onValueChange={(value) => onChange({ ...document, hookStyle: value as HookStyle })}><SelectTrigger id="video-hook"><SelectValue /></SelectTrigger><SelectContent>{HOOK_STYLES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="video-target-duration">Duración objetivo</Label><Input id="video-target-duration" type="number" min="15" max="180" step="1" value={document.targetDurationSeconds} onChange={(event) => updateTargetDuration(Math.min(180, Math.max(15, Math.round(Number(event.target.value) || 45))))} /></div>
              <div className="space-y-1.5"><Label htmlFor="video-slug">Slug</Label><Input id="video-slug" value={document.slug} onChange={(event) => onChange({ ...document, slug: event.target.value })} /></div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid h-auto w-full grid-cols-4 bg-muted/60 p-1">
                <TabsTrigger value="scene" className="gap-1.5 py-2 text-xs"><WandSparkles className="h-3.5 w-3.5" /> Contenido</TabsTrigger>
                <TabsTrigger value="voice" className="gap-1.5 py-2 text-xs"><AudioLines className="h-3.5 w-3.5" /> Voz</TabsTrigger>
                <TabsTrigger value="caption" className="gap-1.5 py-2 text-xs"><Captions className="h-3.5 w-3.5" /> Texto</TabsTrigger>
                <TabsTrigger value="render" className="gap-1.5 py-2 text-xs"><Sparkles className="h-3.5 w-3.5" /> Publicar</TabsTrigger>
              </TabsList>

              <TabsContent value="scene" className="mt-6 space-y-5">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Qué editas aquí:</span> el mensaje, la duración, el color y la imagen de esta escena.</div>
                <div className="space-y-4">
                  {(FIELDS[scene.kind] ?? FIELDS.intro).map(([field, label, kind]) => (
                    <div key={field} className="space-y-1.5">
                      <Label htmlFor={`video-scene-${field}`}>{label}</Label>
                      {kind === "input"
                        ? <Input id={`video-scene-${field}`} value={textValue(scene.content[field])} onChange={(event) => updateContent(field, event.target.value, kind)} />
                        : <Textarea id={`video-scene-${field}`} rows={kind === "list" ? 4 : 3} value={kind === "list" ? listValue(scene.content[field]) : textValue(scene.content[field])} onChange={(event) => updateContent(field, event.target.value, kind)} />}
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 border-y border-border/60 py-5 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="video-scene-duration">Duración de la escena</Label><Input id="video-scene-duration" type="number" min="0.1" step="0.1" value={(scene.durationFrames / document.fps).toFixed(1)} onChange={(event) => updateScene({ durationFrames: Math.max(1, Math.round((Number(event.target.value) || 1) * document.fps)) })} /><p className="text-[10px] text-muted-foreground">Se agregan {SIL_FRAMES} frames de silencio al final.</p></div>
                  <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5 text-primary" /> Paleta de la escena</Label><div className="flex gap-2"><Input aria-label="Color principal de la escena" type="color" className="h-10 w-full p-1" value={accent[0]} onChange={(event) => updateAccent(0, event.target.value.toUpperCase())} /><Input aria-label="Color secundario de la escena" type="color" className="h-10 w-full p-1" value={accent[1]} onChange={(event) => updateAccent(1, event.target.value.toUpperCase())} /></div></div>
                </div>
                <div><div className="mb-3 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /><p className="text-sm font-semibold text-foreground">Recursos de la escena</p></div><VideoAssetPanel key={scene.id} imageAssetId={scene.imageAssetId} audioAssetId={scene.audioAssetId} campaignId={campaignId} contentItemId={contentItemId} sceneId={scene.id} revision={revision} initialPrompt={textValue(scene.content.imagePrompt)} onChange={(patch) => updateScene(patch)} onAudioSeconds={(seconds) => updateScene({ durationFrames: Math.max(1, Math.ceil(seconds * document.fps) + TAIL_FRAMES) })} onPersisted={onPersisted} /></div>
              </TabsContent>

              <TabsContent value="voice" className="mt-6">{contentItemId ? <VoiceoverStep contentItemId={contentItemId} revision={revision} document={document} onPersisted={onPersisted} /> : <p className="text-sm text-muted-foreground">Guarda el video primero para generar guion de voz y narración.</p>}</TabsContent>
              <TabsContent value="caption" className="mt-6"><VideoCaptionPanel contentItemId={contentItemId} revision={revision} document={document} onPersisted={onPersisted} /></TabsContent>
              <TabsContent value="render" className="mt-6 space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4 text-sm text-muted-foreground"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><p className="font-semibold text-foreground">Último paso: crea el MP4</p></div><p className="mt-2">Guarda los cambios y presiona renderizar. El proceso ocurre solo y luego podrás descargar el archivo aquí.</p></div>
                <VideoRenderPanel contentItemId={contentItemId} unsavedChanges={unsavedChanges} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
