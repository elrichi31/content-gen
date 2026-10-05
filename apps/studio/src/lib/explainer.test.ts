import assert from "node:assert/strict";
import { explainerPalette, explainerSceneCount, normalizeExplainerScript, replaceSceneAnimation, scopeAnimation } from "./explainer.ts";
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
// Una sola paleta para todo el video: la de la marca si es válida, cian si no.
assert.ok(document.scenes.every((scene) => JSON.stringify(scene.accent) === JSON.stringify(explainerPalette())));
assert.deepEqual(explainerPalette("#FF0000"), ["#ff0000", "#ff8c8c"]);
assert.equal(explainerPalette("rojo")[0], "#22d3ee");
const branded = normalizeExplainerScript({ displayTitle: "x", scenes: document.scenes.map((scene) => scene.content) }, { ...input, primaryColor: "#2563eb" });
assert.ok(branded.scenes.every((scene) => scene.accent?.[0] === "#2563eb"));
assert.equal(explainerSceneCount(45), 6);
assert.equal(explainerSceneCount(15), 4);

const animated = replaceSceneAnimation(document, "scene-2", { animationHtml: "<div></div>", animationSource: { css: "", html: "<div></div>" } });
assert.equal(animated.scenes[1].content.animationHtml, "<div></div>");
assert.equal(animated.scenes[0].content.animationHtml, undefined);
console.log("explainer ok");
