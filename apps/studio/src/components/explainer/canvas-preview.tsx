"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Sparkles, Wand2 } from "lucide-react";
import { buildCanvasHtml } from "@content-gen/canvas-engine";
import Link from "next/link";
import { buildCanvasSpec, CANVAS_TEMPLATE_CATALOG, type CanvasTemplate } from "@content-gen/domain/canvas";
import type { VideoDocument } from "@content-gen/domain/video";
import { AiProgress } from "@/components/ai-progress";
import { useCanvasVoices } from "@/components/explainer/use-canvas-voices";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Persisted = { revision: number; document: { data: unknown } };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * Preview del motor Canvas: la misma runtime que el render, en un iframe aislado al que se le manda
 * el tiempo por postMessage. Aquí corre en vivo a media resolución y sin motion blur; las voces se
 * reproducen en la página, cada una desde el `voiceAt` de su escena.
 */
export function CanvasPreview({ contentItemId, document, onPersisted }: { contentItemId: string; document: VideoDocument; onPersisted: (content: Persisted) => void }) {
  const spec = useMemo(() => buildCanvasSpec(document), [document]);
  const html = useMemo(() => buildCanvasHtml(spec, { live: true, scale: 0.5 }), [spec]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const position = useRef(0);
  const planned = document.scenes.some((scene) => scene.content.canvas);

  const send = useCallback((t: number) => frame.current?.contentWindow?.postMessage({ type: "canvas-engine:time", t }, "*"), []);

  const { step, stop } = useCanvasVoices(spec, document);

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

  const [changing, setChanging] = useState<string | null>(null);

  /** Sin `focus` planifica todo el video; con `focus`, cambia la animación de esa escena. */
  async function generate(withFeedback: boolean, focus?: { sceneId: string; template: CanvasTemplate }) {
    setError(""); setNotice(""); setBusy(true); setPlaying(false); setChanging(focus?.sceneId ?? null);
    try {
      const body = { ...(withFeedback && feedback.trim() ? { feedback } : {}), ...(focus ?? {}) };
      const response = await fetch(`/api/videos/${contentItemId}/canvas-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo generar el plan.");
      onPersisted(payload.content as Persisted);
      if (withFeedback) setFeedback("");
      const skipped = (payload.skipped as string[] | undefined) ?? [];
      if (skipped.length) setNotice(`${skipped.length} escena(s) sin plan válido: saldrán con su título.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo generar el plan.");
    } finally {
      setBusy(false);
      setChanging(null);
    }
  }

  const current = spec.scenes.reduce((found, scene, index) => (time >= scene.start ? index : found), 0);

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 lg:flex-row">
        <div className="shrink-0 space-y-2">
          <iframe ref={frame} title="Preview del motor Canvas" sandbox="allow-scripts" srcDoc={html} className="h-[576px] w-[324px] rounded-lg border border-border bg-black" />
          <div className="flex w-[324px] items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!ready} onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <input type="range" min={0} max={spec.duration} step={1 / 30} value={time} onChange={(event) => seek(Number(event.target.value))} aria-label="Posición de la preview" className="min-w-0 flex-1 accent-primary" />
            <span className="font-mono text-[11px] text-muted-foreground">{clock(time)} / {clock(spec.duration)}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Motor Canvas (60 fps)</h3>
            <p className="mt-1 text-sm text-muted-foreground">Cada escena usa una plantilla animada cuyos momentos clave caen justo cuando la voz dice la palabra; si la escena tiene imagen, va de fondo con un zoom lento. La IA elige la plantilla y los datos; aquí lo ves en vivo, igual que saldrá en el render con Canvas.</p>
          </div>
          {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{notice}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void generate(false)}>
              {busy ? <AiProgress label="Planificando" estimateMs={45_000} state="composing" /> : <><Sparkles className="h-4 w-4" /> {planned ? "Regenerar el plan" : "Generar el plan de animación"}</>}
            </Button>
          </div>
          {planned ? (
            <div className="flex gap-2">
              <Input aria-label="Cambios para el plan de Canvas" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Qué cambiar: escena 3 como comparación, más bots en el ataque…" className="h-8 text-xs" />
              <Button type="button" size="sm" disabled={busy || !feedback.trim()} onClick={() => void generate(true)}><Wand2 className="h-4 w-4" /> Aplicar</Button>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Animación por escena</p>
            <Link href="/video/animaciones" target="_blank" className="text-xs text-primary hover:underline">Ver la biblioteca de animaciones</Link>
          </div>
          <ol className="space-y-1.5">
            {spec.scenes.map((scene, index) => (
              <li key={scene.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${index === current ? "border-primary/60 bg-primary/10" : "border-border"}`}>
                <button type="button" onClick={() => seek(scene.start)} className="flex min-w-0 flex-1 items-center gap-3 rounded px-1 py-0.5 text-left hover:bg-muted/50">
                  <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{scene.title || document.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{scene.duration.toFixed(1)}s</span>
                </button>
                {changing === scene.id ? <AiProgress label="Cambiando" estimateMs={30_000} state="composing" /> : (
                  // Elegir otra plantilla pide a la IA solo los datos de esa escena, con cues de su narración.
                  <select aria-label={`Animación de la escena ${index + 1}`} value={scene.plan.template} disabled={busy}
                    onChange={(event) => void generate(false, { sceneId: scene.id, template: event.target.value as CanvasTemplate })}
                    className={`h-7 rounded-md border border-border bg-background px-2 text-xs ${document.scenes[index].content.canvas ? "text-primary" : "text-muted-foreground"}`}>
                    {CANVAS_TEMPLATE_CATALOG.map((item) => <option key={item.template} value={item.template}>{item.name}</option>)}
                  </select>
                )}
                {/* La IA puede encadenar 2 o 3 animaciones en una escena larga; el selector cambia la primera. */}
                {scene.beats.length > 1 ? <span className="text-[11px] text-muted-foreground">→ {scene.beats.slice(1).map((beat) => CANVAS_TEMPLATE_CATALOG.find((item) => item.template === beat.plan.template)?.name ?? beat.plan.template).join(" → ")}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
