import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";

export function replaceSceneImage(document: VideoDocument, sceneId: string, imageAssetId: string) {
  let found = false;
  const scenes = document.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    found = true;
    const history = Array.isArray(scene.content.imageAssetHistory) ? scene.content.imageAssetHistory.filter((id): id is string => typeof id === "string") : [];
    return { ...scene, imageAssetId, content: { ...scene.content, imageAssetHistory: scene.imageAssetId && scene.imageAssetId !== imageAssetId ? [...new Set([...history, scene.imageAssetId])] : history } };
  });
  if (!found) throw new Error("La escena seleccionada no existe.");
  return videoDocumentSchema.parse({ ...document, scenes });
}
