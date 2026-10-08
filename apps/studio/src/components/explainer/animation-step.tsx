"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { buildCanvasHtml } from "@content-gen/canvas-engine";
import Link from "next/link";
import { buildCanvasSpec, CANVAS_TEMPLATE_CATALOG, type CanvasTemplate } from "@content-gen/domain/canvas";
import type { VideoDocument } from "@content-gen/domain/video";
import { AiProgress } from "@/components/ai-progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Persisted = { revision: number; document: { data: unknown } };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Paso de animaciones del video educativo, sobre el motor Canvas: la IA elige una plantilla animada
 * por escena y ancla sus momentos clave a palabras de la narración. La preview es la misma runtime
 * que el render, en un iframe aislado al que se le manda el tiempo por postMessage; corre en vivo a
 * media resolución y sin motion blur, y las voces suenan en la página desde el `voiceAt` de su escena.
 */
export function ExplainerAnimationStep({ contentItemId, document, onPersisted }: { contentItemId: string; document: VideoDocument; onPersisted: (content: Persisted) => void }) {
  const spec = useMemo(() => buildCanvasSpec(document), [document]);
  const html = useMemo(() => buildCanvasHtml(spec, { live: true, scale: 0.5 }), [spec]);
  const frame = useRef<HTMLIFrameElement>(null);
  const voices = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const position = useRef(0);
  const plannedCount = document.scenes.filter((scene) => scene.content.canvas).length;
  const planned = plannedCount > 0;

  const send = useCallback((t: number) => frame.current?.contentWindow?.postMessage({ type: "canvas-engine:time", t }, "*"), []);

  // Una voz por escena con audio; solo se rehacen si cambian los audios, no con cada edición.
  const audioKey = JSON.stringify(document.scenes.flatMap((scene) => (scene.audioAssetId ? [[scene.id, scene.audioAssetId]] : [])));
  useEffect(() => {
    const map = new Map((JSON.parse(audioKey) as [string, string][]).map(([sceneId, assetId]) => [sceneId, new Audio(`/api/assets/${assetId}`)]));
    voices.current = map;
    return () => map.forEach((audio) => audio.pause());
  }, [audioKey]);

  // Fotos de las escenas: el iframe aislado no puede pedirlas con la sesión, así que se descargan aquí
  // (una vez por asset) y se le pasan ya decodificadas como ImageBitmap.
  const photos = useRef<Map<string, Promise<Blob | null>>>(new Map());
  const sendImages = useCallback(async (target: Window) => {
    const ids = [...new Set(spec.scenes.map((scene) => scene.image).filter((id): id is string => Boolean(id)))];
    await Promise.all(ids.map(async (id) => {
      if (!photos.current.has(id)) photos.current.set(id, fetch(`/api/assets/${id}`).then((response) => (response.ok ? response.blob() : null)).catch(() => null));
      const blob = await photos.current.get(id);
      if (!blob) return;
      const image = await createImageBitmap(blob).catch(() => null);
      if (image) target.postMessage({ type: "canvas-engine:image", id, image }, "*", [image]);
    }));
  }, [spec]);

  // El iframe avisa cuando cargó sus fuentes; cada documento nuevo es un iframe nuevo.
  useEffect(() => {
    setReady(false);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "canvas-engine:ready") return;
      setReady(true);
      send(position.current);
      void sendImages(event.source as Window);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html, send, sendImages]);

  /** Pone cada voz donde toca en `t`: suena si su escena está hablando, si no, en pausa. */
  const syncVoices = useCallback((t: number, play: boolean) => {
    spec.scenes.forEach((scene) => {
      const audio = voices.current.get(scene.id);
      if (!audio) return;
      const local = t - scene.voiceAt;
      const inside = local >= 0 && (Number.isNaN(audio.duration) || local < audio.duration);
      if (!play || !inside) { if (!audio.paused) audio.pause(); return; }
      if (audio.paused) { audio.currentTime = local; void audio.play().catch(() => undefined); }
      else if (Math.abs(audio.currentTime - local) > 0.25) audio.currentTime = local;
    });
  }, [spec]);

  useEffect(() => {
    if (!playing) { syncVoices(position.current, false); return; }
    const startedAt = performance.now() - position.current * 1000;
    let handle = 0;
    const tick = () => {
      const t = Math.min(spec.duration, (performance.now() - startedAt) / 1000);
      position.current = t;
      setTime(t);
      send(t);
      syncVoices(t, true);
      if (t >= spec.duration) { setPlaying(false); return; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, spec, send, syncVoices]);

  function seek(t: number) {
    position.current = t;
    setTime(t);
    send(t);
    if (!playing) syncVoices(t, false);
  }

  function toggle() {
    if (!playing && position.current >= spec.duration - 0.05) seek(0);
    setPlaying((current) => !current);
  }

  function playScene(start: number) {
    seek(start);
    setPlaying(true);
  }

  const [changing, setChanging] = useState<string | null>(null);

  /** Sin `focus` anima todo el video; con `focus`, cambia la animación de esa escena y deja las demás. */
  async function generate(withFeedback: boolean, focus?: { sceneId: string; template: CanvasTemplate }) {
    setError(""); setNotice(""); setBusy(true); setPlaying(false); setChanging(focus?.sceneId ?? null);
    try {
      const body = { ...(withFeedback && feedback.trim() ? { feedback } : {}), ...(focus ?? {}) };
      const response = await fetch(`/api/videos/${contentItemId}/canvas-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudieron generar las animaciones.");
      onPersisted(payload.content as Persisted);
      if (withFeedback) setFeedback("");
      const skipped = (payload.skipped as string[] | undefined) ?? [];
      if (skipped.length) setNotice(`${skipped.length} escena(s) no recibieron una animación válida: saldrán solo con su título. Puedes regenerar o pedir un cambio.`);
      const scene = focus ? spec.scenes.find((item) => item.id === focus.sceneId) : undefined;
      seek(scene?.start ?? 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron generar las animaciones.");
    } finally {
      setBusy(false);
      setChanging(null);
    }
  }

  const current = spec.scenes.reduce((found, scene, index) => (time >= scene.start ? index : found), 0);
  const withVoice = document.scenes.filter((scene) => scene.audioAssetId).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Animaciones</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">La IA elige una animación para cada escena y hace que sus momentos clave caigan justo cuando la voz dice la palabra. Lo que ves aquí es exactamente lo que saldrá en el render.</p>
        </div>
        {planned ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void generate(false)}>
            <RotateCcw className="h-4 w-4" /> Regenerar todo
          </Button>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="relative h-[576px] w-[324px] overflow-hidden rounded-xl border border-border bg-black">
            <iframe ref={frame} title="Preview de las animaciones" sandbox="allow-scripts" srcDoc={html} className="h-full w-full" />
            {busy || !planned ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center backdrop-blur-sm">
                {busy ? <AiProgress label="Animando las escenas" estimateMs={45_000} state="composing" size={64} /> : (
                  <>
                    <Sparkles className="h-8 w-8 text-primary" />
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-white">Aún no hay animaciones</p>
                      <p className="text-xs text-white/70">Sin ellas, cada escena sale solo con su título. Genera todas de una vez; tarda menos de un minuto.</p>
                    </div>
                    <Button type="button" onClick={() => void generate(false)}><Sparkles className="h-4 w-4" /> Generar animaciones</Button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="w-[324px] space-y-2">
            {/* Barra por escenas: cada tramo mide lo que dura su escena; el range invisible encima da arrastre y teclado. */}
            <div className="relative h-2">
              <div className="flex h-full gap-0.5 overflow-hidden rounded-full">
                {spec.scenes.map((scene) => {
                  const fill = Math.min(1, Math.max(0, (time - scene.start) / scene.duration));
                  return (
                    <div key={scene.id} className="relative h-full bg-border/70" style={{ flexGrow: scene.duration, flexBasis: 0 }}>
                      <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${fill * 100}%` }} />
                    </div>
                  );
                })}
              </div>
              <input type="range" min={0} max={spec.duration} step={1 / 30} value={time} disabled={busy} onChange={(event) => seek(Number(event.target.value))} aria-label="Posición de la preview" className="absolute inset-x-0 -inset-y-2 h-6 w-full cursor-pointer opacity-0" />
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" disabled={!ready || busy} onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "Pausar" : "Reproducir"}
              </Button>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{clock(time)} / {clock(spec.duration)}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{withVoice ? "Con voz" : "Sin voz"}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Escenas <Link href="/video/animaciones" target="_blank" className="ml-2 text-xs font-normal text-primary hover:underline">Ver la biblioteca de animaciones</Link></p>
            <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{plannedCount}</span> de {document.scenes.length} animadas</p>
          </div>

          <ol className="space-y-2">
            {spec.scenes.map((scene, index) => {
              const source = document.scenes[index];
              const animated = Boolean(source.content.canvas);
              const active = index === current;
              return (
                <li key={scene.id} className={`rounded-lg border transition-colors ${active ? "border-primary/60 bg-primary/10" : "border-border hover:bg-muted/40"}`}>
                  <button type="button" onClick={() => playScene(scene.start)} disabled={!ready || busy} className="group flex w-full gap-3 p-3 pb-2 text-left disabled:cursor-default">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {active && playing ? <Play className="h-3 w-3" /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{scene.title || document.title}</span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{scene.duration.toFixed(1)}s</span>
                      </span>
                      <span className="line-clamp-2 block text-xs text-muted-foreground">{text(source.content.voiceover)}</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2 px-3 pb-3 pl-[3.25rem]">
                    <span className="text-[11px] text-muted-foreground">Animación</span>
                    {changing === scene.id ? <AiProgress label="Cambiando" estimateMs={30_000} state="composing" /> : (
                      // Elegir otra plantilla pide a la IA solo los datos de esta escena, con cues de su narración.
                      <select aria-label={`Animación de la escena ${index + 1}`} value={animated ? scene.plan.template : ""} disabled={busy}
                        onChange={(event) => void generate(false, { sceneId: scene.id, template: event.target.value as CanvasTemplate })}
                        className={`h-7 rounded-md border border-border bg-background px-2 text-xs ${animated ? "text-primary" : "text-muted-foreground"}`}>
                        {animated ? null : <option value="" disabled>Sin animar</option>}
                        {CANVAS_TEMPLATE_CATALOG.map((item) => <option key={item.template} value={item.template}>{item.name}</option>)}
                      </select>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {planned ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label htmlFor="animation-feedback" className="flex items-center gap-2 text-sm font-semibold text-foreground"><Wand2 className="h-4 w-4 text-primary" /> Pedir cambios</label>
              <Textarea id="animation-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Ej.: la escena 3 como comparación, más mensajes acumulándose en la 2…" className="min-h-[64px] text-sm" />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={busy || !feedback.trim()} onClick={() => void generate(true)}><Wand2 className="h-4 w-4" /> Aplicar cambios</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
