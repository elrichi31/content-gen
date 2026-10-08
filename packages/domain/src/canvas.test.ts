import assert from "node:assert/strict";
import { buildCanvasSpec, captionChunks, canvasScenePlanSchema, estimateWordTimings, findCue, pruneCues, wordsFromAlignment } from "./canvas.ts";
import { videoDocumentSchema } from "./video.ts";

// Alineación por carácter de ElevenLabs → palabras con su inicio y fin.
const text = "Un ataque DDoS satura el servidor.";
const chars = [...text];
const words = wordsFromAlignment({
  characters: chars,
  character_start_times_seconds: chars.map((_, i) => i * 0.05),
  character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.04),
});
assert.deepEqual(words.map((word) => word.w), ["Un", "ataque", "DDoS", "satura", "el", "servidor."]);
assert.deepEqual([words[1].s, words[1].e], [0.15, 0.44], "la palabra va del primer al último carácter");

// Cues: ignoran mayúsculas, tildes y puntuación; aceptan plural o sufijos en la primera palabra.
assert.equal(findCue(words, "ddos"), words[2].s);
assert.equal(findCue(words, "Servidores"), words[5].s, "«servidores» encuentra «servidor.»");
assert.equal(findCue(words, "satura el"), words[3].s, "frases de varias palabras");
assert.equal(findCue(words, "firewall"), null, "lo que no se dice no tiene tiempo");
assert.equal(findCue(words, "el"), words[4].s, "palabras cortas solo coinciden exactas (no «el» dentro de otra)");

// Sin tiempos reales se estiman en orden, dentro de la duración y con pausa tras el punto.
const estimated = estimateWordTimings("Hola mundo. Esto sigue", 4);
assert.equal(estimated.length, 4);
assert.ok(estimated.every((word, i) => word.e <= 4 && (i === 0 || word.s > estimated[i - 1].s)));
assert.ok(estimated[2].s - estimated[1].e > estimated[1].s - estimated[0].e, "el punto deja más aire que un espacio");

// Subtítulos: bloques de hasta 3 palabras que cortan en la puntuación.
const chunks = captionChunks(words);
assert.deepEqual(chunks.map((chunk) => chunk.words.map((word) => word.w).join(" ")), ["Un ataque DDoS", "satura el servidor."]);
assert.ok(chunks[0].e <= chunks[1].s + 1e-9, "un bloque no pisa al siguiente");

// Validación de planes: la plantilla decide los campos.
assert.ok(canvasScenePlanSchema.safeParse({ template: "flow", sources: [{ label: "Bots", count: 40 }], target: "Servidor", outcome: "overload" }).success);
assert.ok(!canvasScenePlanSchema.safeParse({ template: "flow", sources: [], target: "Servidor" }).success, "flow necesita emisores");
assert.ok(!canvasScenePlanSchema.safeParse({ template: "hook", words: [{ text: "PALABRA-DEMASIADO-LARGA" }] }).success);

// Los cues que no se dicen se quitan; los que sí, se quedan.
const pruned = pruneCues(canvasScenePlanSchema.parse({ template: "steps", items: [{ label: "Satura", cue: "satura" }, { label: "Bloquea", cue: "bloquea" }] }), words);
assert.deepEqual(pruned.template === "steps" && pruned.items.map((item) => item.cue), ["satura", undefined]);
const prunedFlow = pruneCues(canvasScenePlanSchema.parse({ template: "flow", sources: [{ label: "Bots", count: 3 }], target: "Servidor", cues: { surge: "DDoS", outcome: "se cae" } }), words);
assert.deepEqual(prunedFlow.template === "flow" && prunedFlow.cues, { surge: "DDoS", shield: undefined, outcome: undefined });

// Spec: tiempos absolutos con la entrada de la primera escena, cues resueltos y respaldo sin plan.
const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "ddos", templateId: "explainer", title: "DDoS", width: 1080, height: 1920, fps: 30,
  scenes: [
    { id: "scene-1", kind: "explainer", durationFrames: 60, content: { title: "El ataque", voiceover: text, wordTimings: words, canvas: { template: "flow", sources: [{ label: "Bots", count: 30 }], target: "Servidor", rate: "flood", outcome: "overload", cues: { surge: "satura", outcome: "servidor" } } } },
    { id: "scene-2", kind: "explainer", durationFrames: 60, content: { title: "Cómo se frena", voiceover: "Un filtro bloquea el tráfico falso.", canvas: { template: "nope" } } },
    { id: "scene-3", kind: "explainer", durationFrames: 30, content: { title: "Protégete", voiceover: "Usa un CDN." } },
  ],
});
const spec = buildCanvasSpec(document);
const [first, second, third] = spec.scenes;
assert.equal(first.voiceAt, 0.3, "la primera voz entra tras los 9 frames de respiro");
assert.equal(first.plan.template, "flow");
if (first.plan.template === "flow") {
  assert.equal(first.plan.surgeAt, 0.3 + words[3].s, "el pico de tráfico cae cuando se dice «satura»");
  assert.equal(first.plan.outcomeAt, 0.3 + words[5].s);
}
assert.equal(second.start, first.duration, "las escenas van una detrás de otra");
assert.equal(second.plan.template, "title", "un plan inválido cae al respaldo, no rompe el render");
assert.equal(third.plan.template, "outro", "la última escena sin plan cierra el video");
assert.ok(second.captions.length > 0, "sin tiempos guardados los subtítulos se estiman");
assert.equal(spec.duration, Math.round((first.duration + second.duration + third.duration) * 1000) / 1000);
console.log("canvas ok");
