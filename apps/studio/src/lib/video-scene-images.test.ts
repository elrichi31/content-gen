import assert from "node:assert/strict";
import { STANDARD_SCENE_KEYS, videoDocumentSchema } from "@content-gen/domain/video";
import { CINEMATIC_STYLE, replaceSceneImage, videoImagePrompt } from "./video-scene-images.ts";

const imageA = "11111111-1111-4111-8111-111111111111"; const imageB = "22222222-2222-4222-8222-222222222222";
const kinds = { intro: "intro", layers: "layers", phase1: "phase", phase2: "phase", phase3: "phase", reality: "reality", close: "close" } as Record<string, "intro" | "layers" | "phase" | "reality" | "close">;
const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "prueba", templateId: "standard", title: "Prueba", width: 1080, height: 1920, fps: 30,
  scenes: STANDARD_SCENE_KEYS.map((key) => ({ id: key, kind: kinds[key], durationFrames: 90, ...(key === "intro" ? { imageAssetId: imageA } : {}), content: { title: key } })),
});
const replaced = replaceSceneImage(document, "intro", imageB);
assert.equal(replaced.scenes[0].imageAssetId, imageB, "reemplaza solo la escena elegida");
assert.deepEqual(replaced.scenes[0].content.imageAssetHistory, [imageA], "conserva el asset anterior recuperable");
assert.equal(replaced.scenes[1].imageAssetId, undefined, "no altera otras escenas");
const legacy = "Hyper-realistic cinematic photograph. A hacker typing on a laptop in a dark server room, close-up, cold blue light. Shot on RED Monstro 8K, anamorphic 50mm lens. Dramatic contrast, deep blacks. No text, no watermarks, no logos. Vertical 9:16 portrait composition. Photorealistic, not CGI.";
assert.equal(videoImagePrompt(legacy, "openai"), legacy, "no duplica el estilo de un prompt antiguo");
assert.equal(videoImagePrompt("A hacker typing on a laptop in a dark server room", "openai"), `A hacker typing on a laptop in a dark server room ${CINEMATIC_STYLE}`, "añade el estilo a un prompt corto");
assert.equal(videoImagePrompt(legacy, "unsplash"), "hacker typing laptop dark", "Unsplash busca por palabras de la escena, no por el estilo");
assert.equal(videoImagePrompt("estafa telefónica", "unsplash"), "estafa telefónica");
console.log("Imagen por escena: reemplazo aislado, historial recuperable y prompts por proveedor validados.");
