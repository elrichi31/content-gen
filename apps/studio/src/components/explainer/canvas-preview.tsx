"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Sparkles, Wand2 } from "lucide-react";
import { buildCanvasHtml } from "@content-gen/canvas-engine";
import { buildCanvasSpec } from "@content-gen/domain/canvas";
import type { VideoDocument } from "@content-gen/domain/video";
import { AiProgress } from "@/components/ai-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Persisted = { revision: number; document: { data: unknown } };

const TEMPLATE_LABELS: Record<string, string> = { hook: "Gancho", flow: "Flujo", steps: "Pasos", compare: "Comparación", stat: "Cifra", list: "Lista", outro: "Cierre", title: "Título" };
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
  const voices = useRef<Map<string, HTMLAudioElement>>(new Map());
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

  // Una voz por escena con audio; solo se rehacen si cambian los audios, no con cada edición.
  const audioKey = JSON.stringify(document.scenes.flatMap((scene) => (scene.audioAssetId ? [[scene.id, scene.audioAssetId]] : [])));
  useEffect(() => {
    const map = new Map((JSON.parse(audioKey) as [string, string][]).map(([sceneId, assetId]) => [sceneId, new Audio(`/api/assets/${assetId}`)]));
    voices.current = map;
    return () => map.forEach((audio) => audio.pause());
  }, [audioKey]);

  // El iframe avisa cuando cargó sus fuentes; cada documento nuevo es un iframe nuevo.
  useEffect(() => {
    setReady(false);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "canvas-engine:ready") return;
      setReady(true);
      send(position.current);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html, send]);

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

  async function generate(withFeedback: boolean) {
    setError(""); setNotice(""); setBusy(true); setPlaying(false);
    try {
      const response = await fetch(`/api/videos/${contentItemId}/canvas-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withFeedback && feedback.trim() ? { feedback } : {}) });
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
            <p className="mt-1 text-sm text-muted-foreground">Cada escena usa una plantilla animada cuyos momentos clave caen justo cuando la voz dice la palabra. La IA elige la plantilla y los datos; aquí lo ves en vivo, igual que saldrá en el render con «Renderizar con Canvas».</p>
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
          <ol className="space-y-1.5">
            {spec.scenes.map((scene, index) => (
              <li key={scene.id}>
                <button type="button" onClick={() => seek(scene.start)} className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${index === current ? "border-primary/60 bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                  <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{scene.title || document.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${document.scenes[index].content.canvas ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{TEMPLATE_LABELS[scene.plan.template] ?? scene.plan.template}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{scene.duration.toFixed(1)}s</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
