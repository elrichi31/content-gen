"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CanvasSpec } from "@content-gen/domain/canvas";
import type { VideoDocument } from "@content-gen/domain/video";
import { nextPreviewTime, voiceAtTime, type VoiceSlot } from "@/lib/canvas-voice-clock";

/**
 * Voces de la preview de Canvas: una por escena con audio, precargadas. `step` avanza el reloj y deja
 * sonando la voz que toca (ver canvas-voice-clock); `stop` las calla todas.
 */
export function useCanvasVoices(spec: CanvasSpec, document: VideoDocument) {
  const voices = useRef<Map<string, HTMLAudioElement>>(new Map());
  const failed = useRef<Set<HTMLAudioElement>>(new Set());
  const waited = useRef(0);

  // Solo se rehacen si cambian los audios, no con cada edición.
  const audioKey = JSON.stringify(document.scenes.flatMap((scene) => (scene.audioAssetId ? [[scene.id, scene.audioAssetId]] : [])));
  useEffect(() => {
    const map = new Map((JSON.parse(audioKey) as [string, string][]).map(([sceneId, assetId]) => {
      const audio = new Audio(`/api/assets/${assetId}`);
      audio.preload = "auto";
      return [sceneId, audio] as const;
    }));
    voices.current = map;
    failed.current = new Set();
    return () => map.forEach((audio) => audio.pause());
  }, [audioKey]);

  const stop = useCallback(() => {
    voices.current.forEach((audio) => { if (!audio.paused) audio.pause(); });
    failed.current = new Set();
    waited.current = 0;
  }, []);

  const step = useCallback((t: number, dt: number) => {
    const slots = spec.scenes.flatMap((scene) => { const audio = voices.current.get(scene.id); return audio ? [{ voiceAt: scene.voiceAt, audio }] : []; });
    const slot = voiceAtTime(slots, t, failed.current) as (VoiceSlot & { audio: HTMLAudioElement }) | null;
    voices.current.forEach((audio) => { if (audio !== slot?.audio && !audio.paused) audio.pause(); });
    const next = nextPreviewTime(t, dt, slot, waited.current);
    if (slot && next.giveUp) failed.current.add(slot.audio);
    if (slot && next.seek !== null) {
      slot.audio.currentTime = next.seek;
      // AbortError es un pause() que interrumpió el arranque (pausar o mover la barra), no un audio roto.
      if (slot.audio.paused) void slot.audio.play().catch((error: unknown) => { if ((error as Error).name !== "AbortError") failed.current.add(slot.audio); });
    }
    waited.current = next.wait ? waited.current + dt : 0;
    return next.t;
  }, [spec]);

  return { step, stop };
}
