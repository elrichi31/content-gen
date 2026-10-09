import assert from "node:assert/strict";
import { CANVAS_TEMPLATE_GUIDE } from "./canvas-plan.ts";
import { buildExplainerAnimationPrompt, EXPLAINER_ANIMATION_SYSTEM_PROMPT, EXPLAINER_SCRIPT_SYSTEM_PROMPT, explainerPalette, explainerSceneCount, normalizeExplainerScript, replaceSceneAnimation, sceneSeconds, scopeAnimation } from "./explainer.ts";
import { sceneLeadFrames, sceneTimelineFrames } from "@content-gen/domain/video";
import { videoGenerationInputSchema } from "./video-generation.ts";

// Aislamiento: reglas anidadas bajo la clase de la escena y keyframes renombrados solo en `animation`.
const scoped = scopeAnimation("scene-2", ".pulse { animation: pulse 1s infinite, fade-in .5s both; }\n@keyframes pulse { 0% { opacity: 0 } 100% { opacity: 1 } }\n@keyframes fade-in { from { transform: scale(.9) } to { transform: none } }", '<div class="pulse" style="animation-name: fade-in">x</div>');
assert.ok(scoped.includes("@keyframes xa-scene-2-pulse {"));
assert.ok(scoped.includes("@keyframes xa-scene-2-fade-in {"));
assert.ok(scoped.includes(".xa-scene-2 {\n.pulse { animation: xa-scene-2-pulse 1s infinite, xa-scene-2-fade-in .5s both; }"));
assert.ok(scoped.includes('class="pulse" style="animation-name: xa-scene-2-fade-in"'), "la clase .pulse no se renombra");
assert.equal((scoped.match(/@keyframes/g) ?? []).length, 2, "los keyframes salen del bloque anidado");

// Limpieza: nada ejecutable ni externo.
const dirty = scopeAnimation("scene-1", "@import url(https://x.y/a.css); .a { background: url(https://x.y/i.png) }", '<script>alert(1)</script><img src="https://x.y/a.png" onerror="alert(1)"><a href="javascript:alert(1)">a</a><svg onload="x()"></svg>');
assert.ok(!/script|onerror|onload|https:|javascript:|@import/i.test(dirty), dirty);

// Guion: escenas numeradas, plantilla explainer y duración estimada por palabras.
const input = videoGenerationInputSchema.parse({ topic: "Cómo funciona un DDoS", targetDurationSeconds: 45 });
const document = normalizeExplainerScript({ displayTitle: "DDoS", scenes: Array.from({ length: 4 }, (_, index) => ({ title: `T${index}`, voiceover: "uno dos tres cuatro cinco seis siete ocho nueve diez once doce", visual: "bots" })) }, input);
assert.equal(document.templateId, "explainer");
assert.deepEqual(document.scenes.map((scene) => scene.id), ["scene-1", "scene-2", "scene-3", "scene-4"]);
assert.ok(document.scenes.every((scene) => scene.kind === "explainer" && scene.durationFrames >= 90));
assert.throws(() => normalizeExplainerScript({ displayTitle: "x", scenes: [] }, input));
// La foto sugerida por la IA queda como búsqueda de la escena; sin ella no se inventa.
const withPhoto = normalizeExplainerScript({ displayTitle: "x", scenes: Array.from({ length: 3 }, (_, index) => ({ title: "t", voiceover: "uno dos tres", visual: "v", ...(index ? {} : { photo: "busy call center" }) })) }, input);
assert.equal(withPhoto.scenes[0].content.imagePrompt, "busy call center");
assert.equal(withPhoto.scenes[1].content.imagePrompt, undefined);
// Una sola paleta para todo el video: la de la marca si es válida, cian si no.
assert.ok(document.scenes.every((scene) => JSON.stringify(scene.accent) === JSON.stringify(explainerPalette())));
assert.deepEqual(explainerPalette("#FF0000"), ["#ff0000", "#ff8c8c"]);
assert.equal(explainerPalette("rojo")[0], "#22d3ee");
const branded = normalizeExplainerScript({ displayTitle: "x", scenes: document.scenes.map((scene) => scene.content) }, { ...input, primaryColor: "#2563eb" });
assert.ok(branded.scenes.every((scene) => scene.accent?.[0] === "#2563eb"));
assert.equal(explainerSceneCount(45), 4);
assert.equal(explainerSceneCount(60), 5, "un minuto ya no son 9 escenas de 5 s");
assert.equal(explainerSceneCount(15), 3);
assert.equal(explainerSceneCount(180), 6);

const animated = replaceSceneAnimation(document, "scene-2", { animationHtml: "<div></div>", animationSource: { css: "", html: "<div></div>" } });
assert.equal(animated.scenes[1].content.animationHtml, "<div></div>");
assert.equal(animated.scenes[0].content.animationHtml, undefined);
// El prompt debe usar el mismo reloj que el render, incluida entrada y cierre.
for (const index of [0, 1, document.scenes.length - 1]) {
  const scene = document.scenes[index];
  assert.equal(sceneSeconds(document, scene), sceneTimelineFrames(document.scenes, index) / document.fps, "duración del prompt = duración real del clip");
  const prompt = buildExplainerAnimationPrompt(document, scene);
  assert.ok(prompt.includes(`INICIO DE VOZ: ${(sceneLeadFrames(index) / document.fps).toFixed(2)} s`));
}
// Contrato editorial: explicar cambios observables, no solo presentar iconos; instrucciones compactas.
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /estado inicial.*cambio.*resultado/i);
assert.match(EXPLAINER_ANIMATION_SYSTEM_PROMPT, /estado inicial.*cambio.*resultado/i);
assert.ok(EXPLAINER_ANIMATION_SYSTEM_PROMPT.length <= 3800, "presupuesto de caracteres del prompt de animación");
// El catálogo de animaciones se cuenta aparte: va en el guion en lugar de en una segunda llamada de plan.
assert.ok(EXPLAINER_SCRIPT_SYSTEM_PROMPT.replace(CANVAS_TEMPLATE_GUIDE, "").length <= 2400, "presupuesto de caracteres del prompt de guion");
// El HTML anterior se envía únicamente para una corrección explícita, nunca para regenerar.
assert.ok(!buildExplainerAnimationPrompt(animated, animated.scenes[1]).includes("VERSIÓN ANTERIOR"));
const correction = buildExplainerAnimationPrompt(animated, animated.scenes[1], "Mostrar la cola creciendo");
assert.ok(correction.includes("Mostrar la cola creciendo") && correction.includes("VERSIÓN ANTERIOR"));
assert.ok(correction.includes(JSON.stringify(animated.scenes[1].content.animationSource)));
// Guion a partir de las animaciones: lo elegido con la narración queda como plan Canvas; lo inválido no.
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /primero eliges las animaciones/);
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /PLANTILLAS \(campos exactos\)/, "el guionista ve el catálogo");
const animated2 = normalizeExplainerScript({ displayTitle: "DDoS", scenes: [
  { title: "Gancho", voiceover: "Un millón de peticiones por segundo.", visual: "v", beats: [{ template: "hook", words: [{ text: "1 millón", cue: "millón" }] }] },
  { title: "Pasos", voiceover: "Primero detectas, luego filtras.", visual: "v", beats: [{ template: "steps", items: [{ label: "Detectar", cue: "detectas" }, { label: "Filtrar", cue: "filtras" }] }, { template: "stat", value: 3, label: "x", from: "inventado" }] },
  { title: "Fin", voiceover: "Sígueme.", visual: "v", beats: [{ template: "nope" }] },
] }, input);
assert.equal((animated2.scenes[0].content.canvas as { template: string }).template, "hook");
assert.deepEqual((animated2.scenes[1].content.canvas as { template: string }[]).map((beat) => beat.template), ["steps", "stat"]);
assert.equal((animated2.scenes[1].content.canvas as { from?: string }[])[1].from, undefined, "una frase de entrada que no se dice se quita");
assert.equal(animated2.scenes[2].content.canvas, undefined, "sin animación válida, la escena queda para planificar después");
console.log("explainer ok");
