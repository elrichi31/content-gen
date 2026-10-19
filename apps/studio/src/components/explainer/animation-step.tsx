"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Pause, Play, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { buildCanvasHtml } from "@content-gen/canvas-engine";
import Link from "next/link";
import { buildCanvasSpec, CANVAS_TEMPLATE_CATALOG, type CanvasTemplate } from "@content-gen/domain/canvas";
import type { VideoDocument } from "@content-gen/domain/video";
import { AiProgress } from "@/components/ai-progress";
import { explainerPalette } from "@/lib/explainer-palette";
import { useCanvasVoices } from "@/components/explainer/use-canvas-voices";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SceneImagePicker } from "@/components/video/scene-image-picker";

type Persisted = { revision: number; document: { data: unknown } };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const COLORS = [["Cian", "#22d3ee"], ["Verde", "#34d399"], ["Amarillo", "#facc15"], ["Naranja", "#fb923c"], ["Rosa", "#f472b6"], ["Violeta", "#a78bfa"]] as const;

/**
 * Paso de animaciones del video educativo, sobre el motor Canvas: la IA elige una plantilla animada
 * por escena y ancla sus momentos clave a palabras de la narración. La preview es la misma runtime
 * que el render, en un iframe aislado al que se le manda el tiempo por postMessage; corre en vivo a
 * media resolución y sin motion blur, y las voces suenan en la página desde el `voiceAt` de su escena.
 */
export function ExplainerAnimationStep({ contentItemId, revision, document, campaignId, onPersisted, onBusyChange }: { contentItemId: string; revision: number; document: VideoDocument; campaignId?: string; onPersisted: (content: Persisted) => void; onBusyChange?: (busy: boolean) => void }) {
  // El color elegido se ve al instante en la preview y se guarda en todas las escenas poco después.
  const [color, setColor] = useState<string | null>(null);
  const shown = useMemo(() => (color ? { ...document, scenes: document.scenes.map((scene) => ({ ...scene, accent: explainerPalette(color) })) } : document), [document, color]);
  const spec = useMemo(() => buildCanvasSpec(shown), [shown]);
  const html = useMemo(() => buildCanvasHtml(spec, { live: true, scale: 0.5 }), [spec]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [colorBusy, setColorBusy] = useState(false);
  const [imageSceneId, setImageSceneId] = useState<string | null>(document.scenes[0]?.id ?? null);
  const locked = busy || imageBusy || colorBusy;
  useEffect(() => { onBusyChange?.(locked); }, [locked, onBusyChange]);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const position = useRef(0);
  const plannedCount = document.scenes.filter((scene) => scene.content.canvas).length;
  const planned = plannedCount > 0;

  const send = useCallback((t: number) => frame.current?.contentWindow?.postMessage({ type: "canvas-engine:time", t }, "*"), []);

  const { step, stop } = useCanvasVoices(spec, document);

  // El guardado lee lo último por ref: la preview re-renderiza en cada frame y no debe reiniciar la espera.
  const latest = useRef({ revision, shown, onPersisted });
  latest.current = { revision, shown, onPersisted };
  useEffect(() => {
    if (!color) return;
    const timer = setTimeout(async () => {
      setColorBusy(true); setError("");
      try {
        const { revision: current, shown: data } = latest.current;
        const response = await fetch(`/api/content-items/${contentItemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: current, document: { schemaVersion: 1, data } }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo guardar el color.");
        latest.current.onPersisted(payload as Persisted);
        setColor(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudo guardar el color.");
        setColor(null);
      } finally {
        setColorBusy(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [color, contentItemId]);

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

  useEffect(() => {
    if (!playing) { stop(); return; }
    let last = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      const t = Math.min(spec.duration, step(position.current, Math.max(0, now - last) / 1000));
      last = now;
      position.current = t;
      setTime(t);
      send(t);
      if (t >= spec.duration) { setPlaying(false); return; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, spec, send, step, stop]);

  // Mientras reproduce, el siguiente frame recoloca la voz en el nuevo punto.
  function seek(t: number) {
    position.current = t;
    setTime(t);
    send(t);
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

  const [photoProgress, setPhotoProgress] = useState<string | null>(null);
  const withPhoto = document.scenes.filter((scene) => scene.imageAssetId).length;

  /**
   * Una foto de Unsplash por escena (o las quita con `remove`). La ruta exige la revisión vigente,
   * así que van una tras otra con la que devuelve cada guardado; si una escena falla, siguen las demás.
   */
  async function scenePhotos(remove = false) {
    setError(""); setNotice(""); setBusy(true); setPlaying(false);
    const targets = document.scenes.filter((scene) => (remove ? scene.imageAssetId : !scene.imageAssetId));
    let latest = revision; let failed = 0;
    for (const [index, scene] of targets.entries()) {
      setPhotoProgress(remove ? "Quitando fotos" : `Buscando foto ${index + 1} de ${targets.length}`);
      const query = text(scene.content.imagePrompt) || text(scene.content.title) || document.title;
      const body = remove ? { assetId: null, revision: latest } : { source: "unsplash", prompt: query.padEnd(3, "."), revision: latest };
      try {
        const response = await fetch(`/api/videos/${contentItemId}/scenes/${scene.id}/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo poner la foto.");
        latest = (payload.content as Persisted).revision;
        onPersisted(payload.content as Persisted);
      } catch (reason) {
        failed++;
        setError(reason instanceof Error ? reason.message : "No se pudo poner la foto.");
      }
    }
    if (failed && !remove) setNotice(`${failed} escena(s) se quedaron sin foto. Puedes volver a intentarlo.`);
    setPhotoProgress(null); setBusy(false);
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
          <Button type="button" variant="outline" disabled={locked} onClick={() => void generate(false)}>
            <RotateCcw className="h-4 w-4" /> Regenerar todo
          </Button>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="w-full min-w-0 max-w-[324px] space-y-3 lg:sticky lg:top-4 lg:w-[324px] lg:self-start">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border bg-black">
            <iframe ref={frame} title="Preview de las animaciones" sandbox="allow-scripts" srcDoc={html} className="h-full w-full" />
            {busy || !planned ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center backdrop-blur-sm">
                {busy ? <AiProgress label={photoProgress ?? "Animando las escenas"} estimateMs={photoProgress ? 15_000 : 45_000} state="composing" size={64} /> : (
                  <>
                    <Sparkles className="h-8 w-8 text-primary" />
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-white">Aún no hay animaciones</p>
                      <p className="text-xs text-white/70">Sin ellas, cada escena sale solo con su título. Genera todas de una vez; tarda menos de un minuto.</p>
                    </div>
                    <Button type="button" disabled={locked} onClick={() => void generate(false)}><Sparkles className="h-4 w-4" /> Generar animaciones</Button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="w-full space-y-2">
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
              <input type="range" min={0} max={spec.duration} step={1 / 30} value={time} disabled={locked} onChange={(event) => seek(Number(event.target.value))} aria-label="Posición de la preview" className="absolute inset-x-0 -inset-y-2 h-6 w-full cursor-pointer opacity-0" />
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" disabled={!ready || locked} onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "Pausar" : "Reproducir"}
              </Button>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{clock(time)} / {clock(spec.duration)}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{withVoice ? "Con voz" : "Sin voz"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Color de las animaciones">
              <span className="text-[11px] text-muted-foreground">Color</span>
              {COLORS.map(([name, value]) => (
                <button key={value} type="button" disabled={locked} onClick={() => setColor(value)} aria-label={name} aria-pressed={spec.palette[0] === value} title={name}
                  className={`h-6 w-6 rounded-full border-2 disabled:opacity-50 ${spec.palette[0] === value ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: value }} />
              ))}
              <input type="color" value={spec.palette[0]} disabled={locked} onChange={(event) => setColor(event.target.value)} aria-label="Otro color" title="Otro color" className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0 disabled:opacity-50" />
              {colorBusy ? <span className="text-[11px] text-muted-foreground">Guardando…</span> : null}
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
                  <button type="button" onClick={() => playScene(scene.start)} disabled={!ready || locked} className="group flex w-full gap-3 p-3 pb-2 text-left disabled:cursor-default">
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
                  <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pl-[3.25rem]">
                    <span className="text-[11px] text-muted-foreground">Animación</span>
                    {changing === scene.id ? <AiProgress label="Cambiando" estimateMs={30_000} state="composing" /> : (
                      // Elegir otra plantilla pide a la IA solo los datos de esta escena, con cues de su narración.
                      <select aria-label={`Animación de la escena ${index + 1}`} value={animated ? scene.plan.template : ""} disabled={locked}
                        onChange={(event) => void generate(false, { sceneId: scene.id, template: event.target.value as CanvasTemplate })}
                        className={`h-7 rounded-md border border-border bg-background px-2 text-xs ${animated ? "text-primary" : "text-muted-foreground"}`}>
                        {animated ? null : <option value="" disabled>Sin animar</option>}
                        {CANVAS_TEMPLATE_CATALOG.map((item) => <option key={item.template} value={item.template}>{item.name}</option>)}
                      </select>
                    )}
                    {/* La IA puede encadenar 2 o 3 animaciones en una escena larga; el selector cambia la primera. */}
                    {scene.beats.length > 1 ? <span className="text-[11px] text-muted-foreground">→ {scene.beats.slice(1).map((beat) => CANVAS_TEMPLATE_CATALOG.find((item) => item.template === beat.plan.template)?.name ?? beat.plan.template).join(" → ")}</span> : null}
                    <Button type="button" variant="outline" size="sm" disabled={locked} aria-label={`Cambiar imagen de la escena ${index + 1}`} aria-expanded={imageSceneId === scene.id} aria-controls={`scene-image-${scene.id}`}
                      onClick={() => { setPlaying(false); seek(scene.start); setImageSceneId((selected) => selected === scene.id ? null : scene.id); }}>
                      <ImageIcon className="h-3.5 w-3.5" /> {source.imageAssetId ? "Cambiar imagen" : "Añadir imagen"}
                    </Button>
                  </div>
                  {imageSceneId === scene.id ? (
                    <div id={`scene-image-${scene.id}`} className="space-y-3 border-t border-border/60 p-3">
                      <div className="flex items-center gap-3">
                        {source.imageAssetId ? <img src={`/api/assets/${source.imageAssetId}`} alt={`Imagen de la escena ${index + 1}`} className="h-16 w-9 shrink-0 rounded-md object-cover" /> : <ImageIcon className="h-6 w-6 shrink-0 text-muted-foreground" />}
                        <div>
                          <p className="text-sm font-semibold text-foreground">Imagen de la escena {index + 1}</p>
                          <p className="text-xs text-muted-foreground">Se guarda al cambiarla, sin regenerar la voz ni la animación.</p>
                        </div>
                      </div>
                      <SceneImagePicker key={scene.id} contentItemId={contentItemId} revision={revision} scene={source} campaignId={campaignId} disabled={busy} onBusyChange={setImageBusy}
                        onPersisted={(content) => { onPersisted(content); setPlaying(false); seek(scene.start); }} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Fotos de fondo <span className="font-normal text-muted-foreground">· {withPhoto} de {document.scenes.length}</span></p>
              <p className="text-xs text-muted-foreground">{photoProgress ?? "Completa las escenas sin imagen con Unsplash. Para cambiar una concreta, usa Cambiar imagen en su escena."}</p>
            </div>
            {withPhoto < document.scenes.length ? <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => void scenePhotos()}><ImageIcon className="h-4 w-4" /> {withPhoto ? "Completar fotos" : "Buscar fotos"}</Button> : null}
            {withPhoto ? <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => void scenePhotos(true)}>Quitar fotos</Button> : null}
          </div>

          {planned ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label htmlFor="animation-feedback" className="flex items-center gap-2 text-sm font-semibold text-foreground"><Wand2 className="h-4 w-4 text-primary" /> Pedir cambios</label>
              <Textarea id="animation-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Ej.: la escena 3 como comparación, más mensajes acumulándose en la 2…" className="min-h-[64px] text-sm" />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={locked || !feedback.trim()} onClick={() => void generate(true)}><Wand2 className="h-4 w-4" /> Aplicar cambios</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
