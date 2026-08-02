import { SIL_FRAMES, TAIL_FRAMES, videoDocumentSchema, type VideoDocument, type VideoScene } from "@content-gen/domain/video";
import type { CalculateMetadataFunction } from "remotion";

export type VideoProps = { document: VideoDocument; assetBaseUrl?: string };

/** Duración real en pantalla: la base del guion más el silencio de respiro del legacy. */
export const sceneFrames = (scene: VideoScene) => scene.durationFrames + SIL_FRAMES;

export const videoDurationInFrames = (document: VideoDocument) => document.scenes.reduce((total, scene) => total + sceneFrames(scene), 0);

/**
 * Ajusta la base de cada escena a su narración medida: la duración del MP3 más
 * `TAIL_FRAMES` de margen. El silencio `SIL_FRAMES` lo añade el layout de escenas.
 */
export function applyAudioDurations(document: VideoDocument, secondsByScene: Record<string, number>) {
  return videoDocumentSchema.parse({
    ...document,
    scenes: document.scenes.map((scene) => {
      const seconds = secondsByScene[scene.id];
      return seconds ? { ...scene, durationFrames: Math.ceil(seconds * document.fps) + TAIL_FRAMES } : scene;
    }),
  });
}

export const calculateVideoMetadata: CalculateMetadataFunction<VideoProps> = async ({ props, abortSignal }) => {
  const document = videoDocumentSchema.parse(props.document);
  const audioScenes = document.scenes.filter((scene) => scene.audioAssetId);
  if (audioScenes.length && !props.assetBaseUrl) throw new Error("assetBaseUrl es obligatorio cuando el video usa audio.");
  const getAudioDurationInSeconds = audioScenes.length ? (await import("@remotion/media-utils")).getAudioDurationInSeconds : null;
  const durations = Object.fromEntries(await Promise.all(audioScenes.map(async (scene) => {
    if (abortSignal.aborted) throw new Error("Cálculo de metadata cancelado.");
    const seconds = await getAudioDurationInSeconds!(`${props.assetBaseUrl!.replace(/\/$/, "")}/api/assets/${scene.audioAssetId}`);
    return [scene.id, seconds];
  })));
  const normalized = applyAudioDurations(document, durations);
  return { durationInFrames: videoDurationInFrames(normalized), fps: normalized.fps, width: normalized.width, height: normalized.height, props: { ...props, document: normalized } };
};
