import assert from "node:assert/strict";
import { CANVAS_TEMPLATE_GUIDE } from "./canvas-plan.ts";
import { speakable, EXPLAINER_SCRIPT_SYSTEM_PROMPT, explainerPalette, explainerSceneCount, normalizeExplainerScript } from "./explainer.ts";
import { videoGenerationInputSchema } from "./video-generation.ts";

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

// Contrato editorial: explicar cambios observables, no solo presentar iconos; instrucciones compactas.
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /estado inicial.*cambio.*resultado/i);
// El catálogo de animaciones se cuenta aparte: va en el guion en lugar de en una segunda llamada de plan.
assert.ok(EXPLAINER_SCRIPT_SYSTEM_PROMPT.replace(CANVAS_TEMPLATE_GUIDE, "").length <= 2800, "presupuesto de caracteres del prompt de guion (con las reglas de narración hablada)");
// Guion a partir de las animaciones: lo elegido con la narración queda como plan Canvas; lo inválido no.
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /primero eliges las animaciones/);
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /PLANTILLAS \(campos exactos\)/, "el guionista ve el catálogo");
const animated2 = normalizeExplainerScript({ displayTitle: "DDoS", scenes: [
  { title: "Gancho", voiceover: "Un millón de peticiones por segundo.", visual: "v", beats: [{ template: "hook", words: [{ text: "1 millón", cue: "millón" }] }] },
  { title: "Pasos", voiceover: "Primero detectas, luego filtras.", visual: "v", beats: [{ template: "steps", items: [{ label: "Detectar", cue: "detectas" }, { label: "Filtrar", cue: "filtras" }] }, { template: "stat", value: 3, label: "x", from: "inventado" }] },
  { title: "Fin", voiceover: "Sígueme.", visual: "v", beats: [{ template: "nope" }] },
] }, input);
assert.equal((animated2.scenes[0].content.canvas as { template: string }).template, "hook");
assert.equal((animated2.scenes[1].content.canvas as { template: string }).template, "steps", "la cifra que la voz no dice se descarta");
assert.equal(animated2.scenes[2].content.canvas, undefined, "sin animación válida, la escena queda para planificar después");
// Narración hablable: reglas en el prompt y, en código, sin MAYÚSCULAS largas que la voz grita o deletrea.
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /nunca apuntes/);
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /una o dos cifras por escena/);
assert.match(EXPLAINER_SCRIPT_SYSTEM_PROMPT, /sin dígitos ni "%"/);
assert.equal(speakable("IA: ATACANTE usa una API; SNARKY SPIDER ataca."), "IA: Atacante usa una API; Snarky Spider ataca.");
const shouted = normalizeExplainerScript({ displayTitle: "x", scenes: Array.from({ length: 3 }, () => ({ title: "t", voiceover: "El ATACANTE entra.", visual: "v", beats: [{ template: "stat", value: 1, label: "Atacante", cue: "ATACANTE" }] })) }, input);
assert.equal(shouted.scenes[0].content.voiceover, "El Atacante entra.");
assert.equal((shouted.scenes[0].content.canvas as { template: string }).template, "stat", "el cue en mayúsculas sigue encontrando su palabra");
console.log("explainer ok");
