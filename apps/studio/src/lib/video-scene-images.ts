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

// El guion pide al modelo solo la escena (sujeto, acción, lugar, toma y luz) y el estilo
// fotográfico se añade aquí: escribirlo siete veces por guion eran tokens de salida repetidos.
export const CINEMATIC_STYLE = "Hyper-realistic cinematic photograph. Shot on RED Monstro 8K, anamorphic 50mm lens. Dramatic contrast, deep blacks. No text, no watermarks, no logos. Vertical 9:16 portrait composition. Photorealistic, not CGI.";

const STOPWORDS = new Set("a an the of in on at to with and or for from by into over under near its his her their this that is are while as de la el los las un una y en con por para del al".split(" "));
const STYLE_WORDS = /\b(hyper-realistic|cinematic|photograph|photorealistic|shot|close-up|closeup|wide|angle|pov|overhead|macro|ambient|lens|light|lighting|dramatic|vertical|portrait|composition|contrast|8k|red|monstro|anamorphic|50mm|deep|blacks|cgi|watermarks|logos|text|no|not)\b/gi;

/**
 * Prompt que se manda al proveedor: OpenAI recibe la escena con el estilo cinematográfico (sin
 * duplicarlo si ya viene, como en guiones antiguos); Unsplash, unas pocas palabras clave, porque
 * con el prompt largo no encontraba nada y caía en las dos primeras palabras («Hyper-realistic cinematic»).
 */
export function videoImagePrompt(prompt: string, source: "openai" | "unsplash") {
  const scene = prompt.replace(CINEMATIC_STYLE, "").replace(/Hyper-realistic cinematic photograph\.?/i, "").trim();
  if (source === "openai") return /vertical 9:16/i.test(prompt) ? prompt : `${scene} ${CINEMATIC_STYLE}`.trim();
  const keywords = scene.split(/[.;:]/)[0].replace(STYLE_WORDS, " ").split(/[^\p{L}\p{N}-]+/u).filter((word) => word.length > 2 && !STOPWORDS.has(word.toLowerCase()));
  return keywords.slice(0, 4).join(" ") || scene.slice(0, 80) || prompt.slice(0, 80);
}
