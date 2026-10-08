import { mp3DurationSeconds } from "@content-gen/domain/audio";
import type { WordTiming } from "@content-gen/domain/canvas";
import { TAIL_FRAMES, videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";

/** Duración del MP3 leyendo sus frames; si no se reconoce, la estimación CBR 128 kbps de antes. */
export const audioDurationSeconds = (bytes: Uint8Array) => mp3DurationSeconds(bytes) ?? bytes.length * 8 / 128_000;

/** `words`: tiempos por palabra de ElevenLabs. Si el audio nuevo no los trae se borran los del anterior, que ya no coinciden. */
export function replaceSceneAudio(document: VideoDocument, sceneId: string, audioAssetId: string, voiceId: string, modelId: string, durationSeconds?: number, words: WordTiming[] = []) {
  let found = false;
  const scenes = document.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene; found = true;
    const history = Array.isArray(scene.content.audioAssetHistory) ? scene.content.audioAssetHistory.filter((id): id is string => typeof id === "string") : [];
    // La escena pasa a durar la narración más `TAIL_FRAMES`, igual que en `video-autom`;
    // el silencio de respiro lo añade después el motor de video.
    const durationFrames = durationSeconds ? Math.ceil(durationSeconds * document.fps) + TAIL_FRAMES : scene.durationFrames;
    // Los tiempos por palabra son del audio anterior: se quitan y, si llegan nuevos, se ponen los nuevos.
    const content = { ...scene.content };
    delete content.wordTimings;
    return { ...scene, audioAssetId, durationFrames, content: { ...content, ...(words.length ? { wordTimings: words } : {}), voiceId, voiceModelId: modelId, audioDurationSeconds: durationSeconds, audioAssetHistory: scene.audioAssetId && scene.audioAssetId !== audioAssetId ? [...new Set([...history, scene.audioAssetId])] : history } };
  });
  if (!found) throw new Error("La escena seleccionada no existe."); return videoDocumentSchema.parse({ ...document, scenes });
}
