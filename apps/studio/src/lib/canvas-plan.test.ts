import assert from "node:assert/strict";
import { videoDocumentSchema } from "@content-gen/domain/video";
import { buildCanvasPlanPrompt, CANVAS_PLAN_SYSTEM_PROMPT, generateCanvasPlan, normalizeCanvasPlans, replaceCanvasPlans } from "./canvas-plan.ts";

process.env.CONTENT_GEN_AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "test";

const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "ddos", templateId: "explainer", title: "Cómo funciona un DDoS", width: 1080, height: 1920, fps: 30,
  scenes: [
    { id: "scene-1", kind: "explainer", durationFrames: 90, content: { title: "El gancho", voiceover: "Un millón de peticiones por segundo.", visual: "cifras grandes" } },
    { id: "scene-2", kind: "explainer", durationFrames: 120, content: { title: "El ataque", voiceover: "Miles de bots envían tráfico y el servidor se cae.", visual: "bots contra servidor" } },
    { id: "scene-3", kind: "explainer", durationFrames: 60, content: { title: "Cierre", voiceover: "Sígueme para más." } },
  ],
});

// El prompt lleva cada escena con su id, su narración y la posición (primera y última).
const prompt = buildCanvasPlanPrompt(document);
assert.match(prompt, /ESCENA 1 \(sceneId: scene-1\) — primera/);
assert.match(prompt, /ESCENA 3 \(sceneId: scene-3\) — última/);
assert.match(prompt, /NARRACIÓN: Miles de bots envían tráfico y el servidor se cae\./);
assert.ok(!prompt.includes("CAMBIOS PEDIDOS"), "sin feedback no pide cambios");
assert.ok(!prompt.includes("IMAGEN:"), "sin fotos no se mencionan");
const withImage = videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene, i) => (i === 1 ? { ...scene, imageAssetId: "11111111-1111-4111-8111-111111111111", content: { ...scene.content, imagePrompt: "servidores en llamas" } } : scene)) });
assert.match(buildCanvasPlanPrompt(withImage), /NARRACIÓN: Miles de bots[^\n]*\nIDEA VISUAL: bots contra servidor\nIMAGEN: sí \(servidores en llamas\)/, "la IA sabe qué escenas llevan foto");
assert.match(buildCanvasPlanPrompt(document, "más paquetes"), /CAMBIOS PEDIDOS: más paquetes/);
assert.match(CANVAS_PLAN_SYSTEM_PROMPT, /LITERALMENTE/, "pide cues copiados de la narración");

// Normalización: por sceneId o por posición; los planes inválidos se saltan y los cues inventados se quitan.
const answer = {
  scenes: [
    { sceneId: "scene-2", template: "flow", sources: [{ label: "Bots", count: 40 }], target: "Servidor", rate: "flood", outcome: "overload", cues: { surge: "tráfico", outcome: "colapsa" } },
    { sceneId: "scene-1", template: "hook", words: [{ text: "1 millón", cue: "millón" }, { text: "por segundo", cue: "segundo" }] },
    { template: "nope" },
  ],
};
const { plans, skipped } = normalizeCanvasPlans(answer, document);
assert.deepEqual(Object.keys(plans).sort(), ["scene-1", "scene-2"]);
assert.deepEqual(skipped, ["scene-3"]);
assert.equal(plans["scene-1"].template, "hook");
assert.deepEqual(plans["scene-2"].template === "flow" && plans["scene-2"].cues, { surge: "tráfico", shield: undefined, outcome: undefined }, "«colapsa» no se dice: se quita");
assert.deepEqual(normalizeCanvasPlans({ scenes: [{ template: "title" }, { template: "title" }, { template: "outro", line: "Fin" }] }, document).plans["scene-3"], { template: "outro", line: "Fin" }, "sin sceneId se usa la posición");
assert.deepEqual(normalizeCanvasPlans("basura", document).plans, {});

// Guardado: solo cambia `content.canvas` de las escenas con plan nuevo.
const withPlan = replaceCanvasPlans({ ...document, scenes: document.scenes.map((scene) => scene.id === "scene-3" ? { ...scene, content: { ...scene.content, canvas: { template: "title" } } } : scene) }, plans);
assert.equal((withPlan.scenes[0].content.canvas as { template: string }).template, "hook");
assert.deepEqual(withPlan.scenes[2].content.canvas, { template: "title" }, "la escena sin plan nuevo conserva el suyo");
assert.equal(withPlan.scenes[1].content.voiceover, document.scenes[1].content.voiceover);

// Generación completa con la respuesta de OpenAI simulada.
const generated = await generateCanvasPlan(document, undefined, async () => new Response(JSON.stringify({ output_text: JSON.stringify(answer), usage: { output_tokens: 10 } })));
assert.deepEqual(Object.keys(generated.plans).sort(), ["scene-1", "scene-2"]);
await assert.rejects(generateCanvasPlan(document, undefined, async () => new Response(JSON.stringify({ output_text: "{\"scenes\":[]}" }))), /ningún plan válido/);
// Una sola escena con la animación elegida: solo cambia esa, y si la IA no respeta la plantilla, falla.
assert.match(buildCanvasPlanPrompt(document, undefined, { sceneId: "scene-2", template: "steps" }), /SOLO ESCENA scene-2: devuelve únicamente esa escena con la plantilla "steps" \(Pasos\)/);
const stepsAnswer = { scenes: [{ sceneId: "scene-2", template: "steps", items: [{ label: "Bots", cue: "bots" }, { label: "Caída", cue: "cae" }] }, { sceneId: "scene-1", template: "title" }] };
const focused = await generateCanvasPlan(document, undefined, async () => new Response(JSON.stringify({ output_text: JSON.stringify(stepsAnswer) })), { sceneId: "scene-2", template: "steps" });
assert.deepEqual(Object.keys(focused.plans), ["scene-2"], "las demás escenas no se tocan aunque la IA las devuelva");
assert.equal(focused.plans["scene-2"].template, "steps");
await assert.rejects(generateCanvasPlan(document, undefined, async () => new Response(JSON.stringify({ output_text: JSON.stringify(answer) })), { sceneId: "scene-2", template: "steps" }), /esa animación/);
await assert.rejects(generateCanvasPlan(document, undefined, async () => new Response("{}"), { sceneId: "nope", template: "steps" }), /no existe/);
console.log("canvas plan ok");
