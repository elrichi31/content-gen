import assert from "node:assert/strict";
import type { CanvasScenePlan } from "@content-gen/domain/canvas";
import { videoDocumentSchema } from "@content-gen/domain/video";
import { buildCanvasPlanPrompt, CANVAS_PLAN_SYSTEM_PROMPT, entryBeats, generateCanvasPlan, normalizeCanvasPlans, planVarietyIssues, replaceCanvasPlans } from "./canvas-plan.ts";

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
assert.match(prompt, /NARRACIÓN \(\d+\.\d s\): Miles de bots envían tráfico y el servidor se cae\./, "con su duración, para decidir cuántas animaciones caben");
assert.ok(!prompt.includes("CAMBIOS PEDIDOS"), "sin feedback no pide cambios");
assert.ok(!prompt.includes("IMAGEN:"), "sin fotos no se mencionan");
const withImage = videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene, i) => (i === 1 ? { ...scene, imageAssetId: "11111111-1111-4111-8111-111111111111", content: { ...scene.content, imagePrompt: "servidores en llamas" } } : scene)) });
assert.match(buildCanvasPlanPrompt(withImage), /NARRACIÓN \([^)]*\): Miles de bots[^\n]*\nIDEA VISUAL: bots contra servidor\nIMAGEN: sí \(servidores en llamas\)/, "la IA sabe qué escenas llevan foto");
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
// Con una animación por escena se guarda el plan suelto.
const single = (plan: unknown) => plan as CanvasScenePlan;
assert.deepEqual(Object.keys(plans).sort(), ["scene-1", "scene-2"]);
assert.deepEqual(skipped, ["scene-3"]);
assert.equal(single(plans["scene-1"]).template, "hook");
const flow = single(plans["scene-2"]);
assert.deepEqual(flow.template === "flow" && flow.cues, { surge: "tráfico", shield: undefined, outcome: undefined }, "«colapsa» no se dice: se quita");
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
assert.equal(single(focused.plans["scene-2"]).template, "steps");
await assert.rejects(generateCanvasPlan(document, undefined, async () => new Response(JSON.stringify({ output_text: JSON.stringify(answer) })), { sceneId: "scene-2", template: "steps" }), /esa animación/);
await assert.rejects(generateCanvasPlan(document, undefined, async () => new Response("{}"), { sceneId: "nope", template: "steps" }), /no existe/);

// Varias animaciones por escena: se quedan las válidas (hasta 3), con sus frases de entrada si se dicen.
const beatsAnswer = { scenes: [{ sceneId: "scene-2", beats: [
  { template: "network", nodes: [{ label: "Bots", cue: "bots" }, { label: "Más bots" }] },
  { template: "nope" },
  { template: "stat", value: 1, label: "Servidor caído", from: "el servidor", cue: "cae" },
  { template: "title", from: "inventado" },
  { template: "title" },
] }] };
// Escena de 25 s: caben 3 animaciones (ver el tope por duración más abajo).
const longDocument = videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene) => (scene.id === "scene-2" ? { ...scene, durationFrames: 750 } : scene)) });
const beatPlans = normalizeCanvasPlans(beatsAnswer, longDocument).plans["scene-2"] as { template: string; from?: string }[];
assert.deepEqual(beatPlans.map((beat) => beat.template), ["network", "stat", "title"], "la inválida se salta y no pasan de 3");
assert.equal(beatPlans[1].from, "el servidor");
assert.equal(beatPlans[2].from, undefined, "una frase de entrada que no se dice se quita");
assert.deepEqual(normalizeCanvasPlans({ scenes: [{ sceneId: "scene-1", beats: [{ template: "title" }] }] }, document).plans["scene-1"], { template: "title" }, "una sola animación se guarda como plan suelto");
assert.match(CANVAS_PLAN_SYSTEM_PROMPT, /"from"/);
const focusBeats = await generateCanvasPlan(longDocument, undefined, async () => new Response(JSON.stringify({ output_text: JSON.stringify({ scenes: [{ sceneId: "scene-2", beats: [{ template: "steps", items: [{ label: "A" }, { label: "B" }] }, { template: "title", from: "servidor" }] }] }) })), { sceneId: "scene-2", template: "steps" });
assert.ok(Array.isArray(focusBeats.plans["scene-2"]), "al cambiar la animación principal puede seguir con otras");

// Videos con imágenes: los datos de la escena (año, titular, listas) llegan a la IA, sin repetir lo que ya va aparte.
const timelineLike = videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene, i) => (i === 1 ? { ...scene, content: { ...scene.content, year: "1989", headline: "Cae el muro", indicator: ["Protestas", "Fronteras abiertas"], wordTimings: [{ w: "x", s: 0, e: 0.2 }] } } : scene)) });
const dataPrompt = buildCanvasPlanPrompt(timelineLike);
assert.match(dataPrompt, /DATOS DE LA ESCENA:\n- year: 1989\n- headline: Cae el muro\n- indicator: Protestas \| Fronteras abiertas/);
assert.ok(!/- (voiceover|wordTimings|visual):/.test(dataPrompt), "lo que ya va aparte o no es contenido no se repite");
assert.ok(!/prefiere las de pocos elementos/.test(CANVAS_PLAN_SYSTEM_PROMPT), "la foto ya no empuja a plantillas pobres");
assert.match(CANVAS_PLAN_SYSTEM_PROMPT, /- timeline: SÍ 2 a 5 fechas o años reales que la voz dice/, "cada plantilla con su SÍ");
assert.match(CANVAS_PLAN_SYSTEM_PROMPT, /- flow: SÍ .* NO Procesos, ideas, relaciones/, "y su NO");

// Revisión: solo escenas que (salvo la última) muestran el título. Ya no se exige un mínimo de plantillas
// distintas: forzar variedad metía animaciones que no venían a cuento.
const five = videoDocumentSchema.parse({ ...document, scenes: Array.from({ length: 6 }, (_, i) => ({ id: `scene-${i + 1}`, kind: "explainer", durationFrames: 90, content: { title: `T${i}`, voiceover: "Uno dos tres." } })) });
const poor = { "scene-1": { template: "hook", words: [{ text: "Uno" }] }, "scene-2": { template: "title" }, "scene-3": { template: "title" }, "scene-4": { template: "list", icon: "dot", items: [{ text: "a", cue: "uno" }, { text: "b", cue: "dos" }] }, "scene-5": { template: "list", icon: "dot", items: [{ text: "a", cue: "uno" }, { text: "b", cue: "dos" }] }, "scene-6": { template: "title" } } as never;
const poorIssues = planVarietyIssues(five, poor);
assert.match(poorIssues[0], /Las escenas 2, 3 solo muestran el título/, "la última escena puede ser solo título");
assert.equal(poorIssues.length, 1, "repetir plantillas que encajan no es un problema");
assert.match(CANVAS_PLAN_SYSTEM_PROMPT, /Calidad antes que variedad/);
assert.match(CANVAS_PLAN_SYSTEM_PROMPT, /LA PRUEBA[\s\S]*tiene que DECIRSE en la narración/, "cada elemento animado se dice en la voz");
assert.ok(!/al menos 5/.test(CANVAS_PLAN_SYSTEM_PROMPT));
assert.ok(!/cualquier cosa que fluya/.test(CANVAS_PLAN_SYSTEM_PROMPT), "el flujo ya no se ofrece para todo lo que «fluye»");
const rich = Object.fromEntries(["hook", "list", "stat", "steps", "quote", "outro"].map((template, i) => [`scene-${i + 1}`, template === "hook" ? { template, words: [{ text: "Uno" }] } : template === "list" ? { template, icon: "dot", items: [{ text: "a", cue: "uno" }, { text: "b", cue: "dos" }] } : template === "stat" ? { template, value: 3, decimals: 0, label: "x", cue: "tres" } : template === "steps" ? { template, items: [{ label: "a", cue: "uno" }, { label: "b", cue: "dos" }] } : template === "quote" ? { template, text: "Uno dos", cue: "uno" } : { template, line: "Fin" }]));
assert.deepEqual(planVarietyIssues(five, rich as never), [], "un plan sin escenas vacías no tiene problemas");

// Revisión automática: un plan pobre se devuelve una vez con sus problemas y se queda el mejor; el costo suma las dos llamadas.
const calls: string[] = [];
const reply = (plans: Record<string, unknown>) => new Response(JSON.stringify({ output_text: JSON.stringify({ scenes: Object.entries(plans).map(([sceneId, plan]) => ({ sceneId, ...(plan as object) })) }), usage: { input_tokens: 100, output_tokens: 10 } }));
const reviewed = await generateCanvasPlan(five, undefined, async (_url, init) => { calls.push(String(init?.body)); return reply(calls.length === 1 ? poor : rich); });
assert.equal(calls.length, 2);
assert.match(calls[1], /REVISIÓN DE TU PLAN ANTERIOR: Las escenas 2, 3 solo muestran el título/);
assert.equal(reviewed.reviewed, true);
assert.equal(single(reviewed.plans["scene-3"]).template, "stat");
assert.equal(reviewed.usage.inputTokens, 200, "se cobran las dos llamadas");
// Si la revisión no mejora, se queda el primero; si el primero ya es bueno, no hay segunda llamada.
let count = 0;
const kept = await generateCanvasPlan(five, undefined, async () => { count++; return reply(poor); });
assert.equal(single(kept.plans["scene-2"]).template, "title");
assert.equal(count, 2);
count = 0;
await generateCanvasPlan(five, undefined, async () => { count++; return reply(rich); });
assert.equal(count, 1, "un plan completo no gasta otra llamada");
// Animaciones que no siguen la voz (sus momentos no se dicen) se descartan y el motivo vuelve a la IA.
const offTopic = normalizeCanvasPlans({ scenes: [
  { sceneId: "scene-1", template: "hook", words: [{ text: "1 millón", cue: "millón" }] },
  { sceneId: "scene-2", template: "map", points: [{ label: "Tokio", lat: 35.7, lon: 139.7, cue: "Tokio" }, { label: "Lima", lat: -12, lon: -77, cue: "Lima" }] },
  { sceneId: "scene-3", template: "flow", sources: [{ label: "Ideas", count: 5 }], target: "Éxito" },
] }, document);
assert.deepEqual(Object.keys(offTopic.plans), ["scene-1"], "el mapa sin lugares dichos y el flujo sin momentos dichos no pasan");
assert.match(offTopic.rejected.join(" "), /scene-2: descartada map: solo 0 de 2/);
let reviewPrompt = "";
const rescued = await generateCanvasPlan(document, undefined, async (_url, init) => {
  const body = String(init?.body);
  if (body.includes("REVISIÓN")) { reviewPrompt = body; return new Response(JSON.stringify({ output_text: JSON.stringify({ scenes: [{ sceneId: "scene-1", template: "hook", words: [{ text: "1 millón", cue: "millón" }] }, { sceneId: "scene-2", template: "list", icon: "dot", items: [{ text: "Bots", cue: "bots" }, { text: "Tráfico", cue: "tráfico" }] }, { sceneId: "scene-3", template: "outro", line: "Fin" }] }) })); }
  return new Response(JSON.stringify({ output_text: JSON.stringify({ scenes: [{ sceneId: "scene-1", template: "hook", words: [{ text: "1 millón", cue: "millón" }] }, { sceneId: "scene-2", template: "map", points: [{ label: "Tokio", lat: 35.7, lon: 139.7, cue: "Tokio" }] }, { sceneId: "scene-3", template: "outro", line: "Fin" }] }) }));
});
assert.match(reviewPrompt, /descartada map/, "la revisión le dice a la IA qué descartamos y por qué");
assert.equal(single(rescued.plans["scene-2"]).template, "list");
// La persona eligió la plantilla: no se descarta aunque sus momentos no se digan.
const forced = await generateCanvasPlan(document, undefined, async () => new Response(JSON.stringify({ output_text: JSON.stringify({ scenes: [{ sceneId: "scene-2", template: "map", points: [{ label: "Tokio", lat: 35.7, lon: 139.7 }] }] }) })), { sceneId: "scene-2", template: "map" });
assert.equal(single(forced.plans["scene-2"]).template, "map");
// Solo lo que falta: la escena con plan se conserva aunque la IA la devuelva.
const partial = videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene, i) => (i === 0 ? { ...scene, content: { ...scene.content, canvas: { template: "hook", words: [{ text: "Uno" }] } } } : scene)) });
let missingPrompt = "";
const filled = await generateCanvasPlan(partial, undefined, async (_url, init) => { missingPrompt = String(init?.body); return new Response(JSON.stringify({ output_text: JSON.stringify(answer) })); }, undefined, true);
assert.match(missingPrompt, /SOLO FALTAN LAS ESCENAS scene-2, scene-3/);
assert.ok(!("scene-1" in filled.plans), "no pisa el plan que ya traía el guion");
// Tiempo para leerlas: una animación por cada ~7 s de voz; las que sobran se recortan.
const crammed = { beats: [{ template: "hook", words: [{ text: "Uno", cue: "uno" }] }, { template: "stat", value: 2, label: "Dos", cue: "dos", from: "dos" }, { template: "stat", value: 3, label: "Tres", cue: "tres", from: "tres" }] };
const shortScene = videoDocumentSchema.parse({ ...document, scenes: [{ id: "s", kind: "explainer", durationFrames: 240, content: { title: "T", voiceover: "Uno dos tres." } }] });
assert.equal(entryBeats(crammed, shortScene.scenes[0], 30)?.length, 1, "8 s de voz: una animación");
const longScene = videoDocumentSchema.parse({ ...document, scenes: [{ id: "s", kind: "explainer", durationFrames: 450, content: { title: "T", voiceover: "Uno dos tres." } }] });
assert.equal(entryBeats(crammed, longScene.scenes[0], 30)?.length, 2, "15 s de voz: dos");
assert.match(CANVAS_PLAN_SYSTEM_PROMPT, /cuéntalo \(stat, compare o chart\) en vez de enumerarlo/);
console.log("canvas plan ok");
