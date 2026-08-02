import assert from "node:assert/strict";
import { STANDARD_SCENE_KEYS, videoDocumentSchema } from "@content-gen/domain/video";
import { applyVoiceoverLines, applyVoiceoverScript, buildVoiceoverPrompt, generateVoiceoverScript } from "./voiceover-script.ts";

const kinds = { intro: "intro", layers: "layers", phase1: "phase", phase2: "phase", phase3: "phase", reality: "reality", close: "close" } as Record<string, string>;
const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "prueba", templateId: "standard", title: "Prueba", niche: "fraud", hookStyle: "shock", targetDurationSeconds: 45,
  width: 1080, height: 1920, fps: 30,
  scenes: STANDARD_SCENE_KEYS.map((key) => ({ id: key, kind: kinds[key], durationFrames: 90, content: { tag: `TAG ${key}`, title: `Título\n${key}` } })),
});

const prompt = buildVoiceoverPrompt(document);
assert.match(prompt, /- INTRO \(3s, \d+-\d+ palabras\)/, "reparte segundos y palabras por escena como el legacy");
assert.match(prompt, /Niche visual y editorial: fraud[\s\S]*Hook principal elegido: shock/, "traslada niche y hook al prompt de narración");
assert.match(prompt, /intro, layers, phase1, phase2, phase3, reality, close/, "fija las claves de escena del legacy");

const lines = STANDARD_SCENE_KEYS.map((key) => ({ sceneId: key, text: `Voz de ${key}` }));
assert.equal(applyVoiceoverLines(document, lines).scenes[1].content.voiceover, "Voz de layers", "persiste una línea por escena");
assert.throws(() => applyVoiceoverLines(document, lines.slice(0, 3)), /una línea válida por cada escena/);

const applied = applyVoiceoverScript(document, { scenes: Object.fromEntries(STANDARD_SCENE_KEYS.map((key) => [key, { text: `Voz de ${key}`, durationSeconds: 5, wordCount: 3 }])), fullScript: "todo junto" });
assert.equal(applied.scenes[0].content.voiceover, "Voz de intro");
assert.equal((applied as { voiceoverFullScript?: string }).voiceoverFullScript, "todo junto", "guarda el guion completo del legacy");
assert.throws(() => applyVoiceoverScript(document, { scenes: { intro: { text: "Sola" } } }), /todas las escenas/, "exige narración para cada escena");

process.env.CONTENT_GEN_AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "test";
const generated = await generateVoiceoverScript(document, async () => new Response(JSON.stringify({ output_text: JSON.stringify({ scenes: Object.fromEntries(STANDARD_SCENE_KEYS.map((key) => [key, { text: `Narración de ${key}` }])) }) })));
assert.equal(generated.document.scenes[6].content.voiceover, "Narración de close", "normaliza el guion generado");
console.log("Guion de voz: prompt legacy, escenas completas y generación validados.");
