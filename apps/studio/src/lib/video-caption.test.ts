import assert from "node:assert/strict";
import { STANDARD_SCENE_KEYS, videoDocumentSchema } from "@content-gen/domain/video";
import { applyVideoCaption, captionText, generateVideoCaption } from "./video-caption.ts";

const kinds = { intro: "intro", layers: "layers", phase1: "phase", phase2: "phase", phase3: "phase", reality: "reality", close: "close" } as Record<string, "intro" | "layers" | "phase" | "reality" | "close">;
const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "caption", templateId: "standard", title: "Caption", width: 1080, height: 1920, fps: 30,
  scenes: STANDARD_SCENE_KEYS.map((key) => ({ id: key, kind: kinds[key], durationFrames: 90, content: { title: "Gancho" } })),
});
const edited = applyVideoCaption(document, { text: "Mira esto", hashtags: ["IA", "#IA", "contenido digital"] }); assert.match(captionText(edited), /Mira esto\n\n#IA #contenidodigital/, "normaliza y exporta texto");
process.env.CONTENT_GEN_AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "test"; const generated = await generateVideoCaption(document, async () => new Response(JSON.stringify({ output_text: JSON.stringify({ text: "Guárdalo", hashtags: ["video"] }) }))); assert.equal(captionText(generated.document), "Guárdalo\n\n#video"); console.log("Caption de video: edición, generación y exportación validadas.");
