"use client";

import { useEffect, useState } from "react";
import { AudioLines, Mic, Save, Wand2 } from "lucide-react";
import { SCENE_LABELS, WORDS_PER_SECOND, type VideoDocument, type VideoSceneKey } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Voice = { voice_id: string; name: string; labels: Record<string, string> };
type Persisted = { revision: number; document: { data: unknown } };

// Mismos modelos que ofrecía el panel de voz de `video-autom`.
const MODELS = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — recomendado: natural en español" },
  { id: "eleven_v3", label: "v3 — expresivo (tags y textos más largos)" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 — borradores rápidos" },
];

const voiceoverOf = (scene: VideoDocument["scenes"][number]) => typeof scene.content.voiceover === "string" ? scene.content.voiceover : "";
const countWords = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;

export function VoiceoverStep({
  contentItemId,
  revision,
  document,
  onPersisted,
}: {
  contentItemId: string;
  revision: number;
  document: VideoDocument;
  onPersisted: (content: Persisted) => void;
}) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [voicesError, setVoicesError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(document.scenes.map((scene) => [scene.id, voiceoverOf(scene)])));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setDrafts(Object.fromEntries(document.scenes.map((scene) => [scene.id, voiceoverOf(scene)]))); }, [document]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/voices");
      const payload = await response.json();
      setVoices(payload.voices ?? []);
      setVoicesError(response.ok ? "" : typeof payload.error === "string" ? payload.error : "No se pudieron cargar las voces.");
      if (response.ok && payload.voices?.length) setVoiceId(payload.voices[0].voice_id);
    })();
  }, []);

  async function call(job: string, path: string, body: Record<string, unknown>, currentRevision = revision) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision: currentRevision }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo completar la operación.");
    const content = payload.content as Persisted;
    onPersisted(content);
    void job;
    return content.revision;
  }

  async function run(job: string, task: () => Promise<unknown>) {
    setError("");
    setBusy(job);
    try { await task(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la operación."); }
    finally { setBusy(""); }
  }

  const generateScript = () => run("script", () => call("script", `/api/videos/${contentItemId}/voiceover-script`, { action: "generate" }));
  const saveScript = () => run("edit", () => call("edit", `/api/videos/${contentItemId}/voiceover-script`, {
    action: "edit",
    lines: document.scenes.map((scene) => ({ sceneId: scene.id, text: (drafts[scene.id] ?? voiceoverOf(scene)).trim() || "…" })),
  }));

  const generateAudio = (sceneId?: string) => run(sceneId ?? "audio-all", async () => {
    let current = revision;
    for (const scene of sceneId ? document.scenes.filter((item) => item.id === sceneId) : document.scenes) {
      if (!voiceoverOf(scene).trim()) continue;
      if (!sceneId && scene.audioAssetId) continue;
      current = await call("audio", `/api/videos/${contentItemId}/scenes/${scene.id}/audio`, { voiceId, modelId }, current);
    }
  });

  const hasScript = document.scenes.some((scene) => voiceoverOf(scene).trim());
  const unsaved = document.scenes.some((scene) => (drafts[scene.id] ?? "") !== voiceoverOf(scene));
  const withAudio = document.scenes.filter((scene) => scene.audioAssetId).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Voz en off del video</h2>
        <p className="mt-1 text-sm text-muted-foreground">Genera la narración dentro del mismo flujo. Es opcional, pero si la creas aquí el preview y el render la usarán, y cada escena durará lo que dura su audio.</p>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Guion de voz en off</p>
              <p className="text-xs text-muted-foreground">{document.targetDurationSeconds}s objetivo · ~{Math.round(WORDS_PER_SECOND * 0.98 * 60)} palabras por minuto</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={busy !== ""} onClick={() => void generateScript()}>
              <Wand2 className="h-4 w-4" /> {busy === "script" ? "Generando…" : hasScript ? "Regenerar guion" : "Generar guion de voz"}
            </Button>
          </div>

          <div className="space-y-3">
            {document.scenes.map((scene) => {
              const draft = drafts[scene.id] ?? "";
              return (
                <div key={scene.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`voz-${scene.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">{SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}</Label>
                    <span className="font-mono text-[10px] text-muted-foreground">{countWords(draft)} palabras{scene.audioAssetId ? " · audio ✓" : ""}</span>
                  </div>
                  <Textarea id={`voz-${scene.id}`} rows={2} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [scene.id]: event.target.value }))} placeholder="Lo que narra la voz en esta escena." />
                </div>
              );
            })}
          </div>

          <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy !== "" || !unsaved} onClick={() => void saveScript()}>
            <Save className="h-4 w-4" /> {busy === "edit" ? "Guardando…" : "Guardar guion de voz"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Configuración de voz</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="voz-voice" className="text-[10px] uppercase tracking-wider text-muted-foreground">Voz</Label>
              <Select value={voiceId} onValueChange={setVoiceId} disabled={!voices.length}>
                <SelectTrigger id="voz-voice" className="h-8"><SelectValue placeholder={voices.length ? "Selecciona" : "Sin voces disponibles"} /></SelectTrigger>
                <SelectContent>
                  {voices.map((voice) => <SelectItem key={voice.voice_id} value={voice.voice_id}>{voice.name}{voice.labels?.accent ? ` · ${voice.labels.accent}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="voz-model" className="text-[10px] uppercase tracking-wider text-muted-foreground">Modelo</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger id="voz-model" className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{MODELS.map((model) => <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy !== "" || !voiceId || !hasScript || unsaved} onClick={() => void generateAudio()}>
              <AudioLines className="h-4 w-4" /> {busy === "audio-all" ? "Generando voz…" : "Generar voz de las escenas que faltan"}
            </Button>
          </div>
          {unsaved ? <p className="text-xs text-muted-foreground">Guarda el guion de voz antes de generar el audio.</p> : null}

          {withAudio ? (
            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="text-sm font-semibold text-primary">Audio por escena ✓ {withAudio}/{document.scenes.length}</p>
              {document.scenes.filter((scene) => scene.audioAssetId).map((scene) => (
                <div key={scene.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}</span>
                  <audio controls preload="metadata" src={`/api/assets/${scene.audioAssetId}`} className="h-8 w-full" />
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Regenerar voz de ${SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}`} disabled={busy !== "" || !voiceId} onClick={() => void generateAudio(scene.id)}>
                    <AudioLines className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {voicesError ? <p className="text-xs text-muted-foreground">{voicesError}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
