import { TAIL_FRAMES, videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";

export const mp3DurationSeconds = (sizeBytes: number) => sizeBytes * 8 / 128_000;

export function replaceSceneAudio(document: VideoDocument, sceneId: string, audioAssetId: string, voiceId: string, modelId: string, durationSeconds?: number) {
  let found = false;
  const scenes = document.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene; found = true;
    const history = Array.isArray(scene.content.audioAssetHistory) ? scene.content.audioAssetHistory.filter((id): id is string => typeof id === "string") : [];
    // El MP3 sale en CBR 128 kbps; usar ffprobe solo si aparece bitrate variable.
    // La escena pasa a durar la narración más `TAIL_FRAMES`, igual que en `video-autom`;
    // el silencio de respiro lo añade después el motor de video.
    const durationFrames = durationSeconds ? Math.ceil(durationSeconds * document.fps) + TAIL_FRAMES : scene.durationFrames;
    return { ...scene, audioAssetId, durationFrames, content: { ...scene.content, voiceId, voiceModelId: modelId, audioDurationSeconds: durationSeconds, audioAssetHistory: scene.audioAssetId && scene.audioAssetId !== audioAssetId ? [...new Set([...history, scene.audioAssetId])] : history } };
  });
  if (!found) throw new Error("La escena seleccionada no existe."); return videoDocumentSchema.parse({ ...document, scenes });
}
