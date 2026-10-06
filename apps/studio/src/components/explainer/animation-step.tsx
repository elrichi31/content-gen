"use client";

import { useRef, useState } from "react";
import { Play, RefreshCw, Sparkles } from "lucide-react";
import { SIL_FRAMES, type VideoDocument } from "@content-gen/domain/video";
import { AiProgress } from "@/components/ai-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Scene = VideoDocument["scenes"][number];
type Persisted = { revision: number; document: { data: unknown } };

const text = (scene: Scene, key: string) => (typeof scene.content[key] === "string" ? scene.content[key] as string : "");
const PREVIEW_SCALE = 0.25;

/**
 * La animación en vivo: el mismo HTML que renderiza HyperFrames, dentro de un iframe sin scripts.
 * Las animaciones son CSS, así que corren igual que en el render; `key` las reinicia.
 */
function AnimationPreview({ html, playKey }: { html: string; playKey: number }) {
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#07080d;overflow:hidden}#stage{position:relative;width:1080px;height:1920px;transform:scale(${PREVIEW_SCALE});transform-origin:0 0}</style></head><body><div id="stage">${html}</div></body></html>`;
  return <iframe key={playKey} title="Preview de la animación" sandbox="" srcDoc={srcDoc} className="h-[480px] w-[270px] shrink-0 rounded-lg border border-border bg-black" />;
}

export function ExplainerAnimationStep({ contentItemId, document, onPersisted }: { contentItemId: string; document: VideoDocument; onPersisted: (content: Persisted) => void }) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [plays, setPlays] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  // Las respuestas llegan en cualquier orden: solo se adopta una revisión más nueva que la vista.
  const newest = useRef(0);

  async function generate(sceneIds: string[], withFeedback = false) {
    setError("");
    setPending((current) => new Set([...current, ...sceneIds]));
    await Promise.all(sceneIds.map(async (sceneId) => {
      try {
        const response = await fetch(`/api/videos/${contentItemId}/scenes/${sceneId}/animation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withFeedback && feedback[sceneId]?.trim() ? { feedback: feedback[sceneId] } : {}),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo generar la animación.");
        const content = payload.content as Persisted;
        if (content.revision > newest.current) { newest.current = content.revision; onPersisted(content); }
        if (withFeedback) setFeedback((current) => ({ ...current, [sceneId]: "" }));
        setPlays((current) => ({ ...current, [sceneId]: (current[sceneId] ?? 0) + 1 }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudo generar la animación.");
      } finally {
        setPending((current) => { const next = new Set(current); next.delete(sceneId); return next; });
      }
    }));
  }

  function play(scene: Scene) {
    setPlays((current) => ({ ...current, [scene.id]: (current[scene.id] ?? 0) + 1 }));
    if (audio.current && scene.audioAssetId) { audio.current.src = `/api/assets/${scene.audioAssetId}`; void audio.current.play(); }
  }

  const missing = document.scenes.filter((scene) => !text(scene, "animationHtml")).map((scene) => scene.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Animaciones</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">La IA escribe la animación de cada escena en HTML y CSS a partir de la narración y de lo que pediste. Si una no queda bien, dile qué cambiar y regenérala.</p>
        </div>
        <Button type="button" disabled={!missing.length || pending.size > 0} onClick={() => void generate(missing)}>
          <Sparkles className="h-4 w-4" /> {missing.length ? `Generar las ${missing.length} que faltan` : "Todas generadas"}
        </Button>
      </div>
      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <audio ref={audio} className="hidden" />

      <div className="grid gap-4 2xl:grid-cols-2">
        {document.scenes.map((scene, index) => {
          const html = text(scene, "animationHtml");
          const busy = pending.has(scene.id);
          return (
            <Card key={scene.id}>
              <CardContent className="flex flex-col gap-4 sm:flex-row">
                {html ? <AnimationPreview html={html} playKey={plays[scene.id] ?? 0} /> : (
                  <div className="flex h-[480px] w-[270px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                    {busy ? <AiProgress label="Animando" estimateMs={60_000} state="composing" /> : "Sin animación"}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Escena {index + 1} · {((scene.durationFrames + SIL_FRAMES) / document.fps).toFixed(1)}s{scene.audioAssetId ? " · con voz" : ""}</p>
                    <p className="text-lg font-semibold text-foreground">{text(scene, "title")}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{text(scene, "voiceover")}</p>
                  <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Animación: </span>{text(scene, "visual")}</p>
                  <div className="flex flex-wrap gap-2">
                    {html ? <Button type="button" variant="outline" size="sm" onClick={() => play(scene)}><Play className="h-4 w-4" /> Reproducir{scene.audioAssetId ? " con voz" : ""}</Button> : null}
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void generate([scene.id])}>
                      {busy ? <AiProgress label="Animando" estimateMs={60_000} state="composing" /> : <><RefreshCw className="h-4 w-4" /> {html ? "Regenerar desde cero" : "Generar"}</>}
                    </Button>
                  </div>
                  {html ? (
                    <div className="flex gap-2">
                      <Input aria-label={`Cambios para la animación de la escena ${index + 1}`} value={feedback[scene.id] ?? ""} onChange={(event) => setFeedback((current) => ({ ...current, [scene.id]: event.target.value }))} placeholder="Qué cambiar: más grande el servidor, paquetes más rápidos…" className="h-8 text-xs" />
                      <Button type="button" size="sm" disabled={busy || !feedback[scene.id]?.trim()} onClick={() => void generate([scene.id], true)}>Aplicar</Button>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
