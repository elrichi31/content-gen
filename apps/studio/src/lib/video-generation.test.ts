import assert from "node:assert/strict";
import { STANDARD_SCENE_KEYS, TIMELINE_SCENE_KEYS } from "@content-gen/domain/video";
import { buildStandardVideoPrompt, buildTimelineVideoPrompt, generateStandardVideoScript, normalizeTimelineVideoScript, videoGenerationInputSchema } from "./video-generation.ts";

const input = videoGenerationInputSchema.parse({ topic: "Estafas con clonación de voz", targetDurationSeconds: 60 });
assert.match(buildStandardVideoPrompt(input), /DURACION OBJETIVO: 60 segundos en total \(7 escenas\)/, "el prompt fija la duración objetivo y las siete escenas");
assert.match(buildStandardVideoPrompt(input), /Niche sugerido por el tema: fraud/, "infiere el niche desde el tema como en el legacy");
assert.match(buildStandardVideoPrompt({ ...input, audience: "Emprendedores", tone: "Urgente", context: "Lanzamiento regional", brandName: "Norte", primaryColor: "#0a8f52" }), /Lanzamiento regional[\s\S]*Emprendedores[\s\S]*Urgente[\s\S]*Norte[\s\S]*#0a8f52/, "añade contexto, audiencia, tono y marca de la campaña");
assert.match(buildTimelineVideoPrompt(input), /cronologia completa/, "el prompt de cronología pide la línea temporal");

const intro = { tag: "ALERTA", title: "UNA VOZ\nQUE NO ES TUYA", subtitle: "el fraude que suena familiar" };
const phase = (n: number) => ({ phase: `CASO ${n}`, timestamp: "MINUTO CERO", title: `LLAMADA\nNÚMERO ${n}`, narrative: "Alguien contesta y reconoce la voz.", detail: "El audio dura segundos.", indicator: ["Segundos de audio bastan", "La víctima reconoce la voz"] });
const standardPayload = {
  slug: "estafas-clonacion-voz", displayTitle: "Estafas con clonación de voz", niche: "fraud", hookStyle: "shock",
  accents: { intro: ["#FF4500", "#FFD700"], layers: ["bad"], phase1: ["#1E90FF", "#00BFFF"] },
  imagePrompts: { intro: "Hyper-realistic cinematic photograph." },
  scenes: {
    intro,
    layers: { tag: "CÓMO FUNCIONA", terminal: ["> audio = segundos", "> modelo = voz clonada"], definition: "Basta un audio corto\npara clonar una voz.", detail: "Las muestras salen de redes sociales." },
    phase1: phase(1), phase2: phase(2), phase3: phase(3),
    reality: { tag: "REALIDAD · CONTEXTO", title: "La voz ya no es\nuna prueba de identidad", actions: ["Acuerda una palabra clave", "Cuelga y devuelve la llamada", "Verifica por otro canal", "Avisa a tu familia"] },
    close: { tag: "FRAUDE · CONCLUSIÓN", title: "SI SUENA\nURGENTE,\nDESCONFÍA", subtitle: "La prisa es la herramienta del estafador." },
  },
};

process.env.CONTENT_GEN_AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "test";
const document = await generateStandardVideoScript(input, async () => new Response(JSON.stringify({ output_text: JSON.stringify(standardPayload) })));
assert.equal(document.templateId, "standard");
assert.deepEqual(document.scenes.map((item) => item.id), [...STANDARD_SCENE_KEYS], "produce las siete escenas del legacy");
assert.deepEqual(document.scenes.map((item) => item.kind), ["intro", "layers", "phase", "phase", "phase", "reality", "close"]);
assert.deepEqual([document.niche, document.hookStyle, document.targetDurationSeconds], ["fraud", "shock", 60]);
assert.deepEqual(document.scenes[0].accent, ["#FF4500", "#FFD700"], "conserva los accents válidos de la IA");
assert.deepEqual(document.scenes[1].accent, ["#00FF7F", "#32CD32"], "cae al accent por defecto cuando la IA devuelve un color inválido");
assert.equal(document.scenes[0].content.imagePrompt, "Hyper-realistic cinematic photograph.", "guarda el prompt de imagen de cada escena");
assert.deepEqual(document.scenes.map((item) => item.durationFrames / 30), [4, 9, 10, 11, 10, 10, 6], "reparte los 60s con las proporciones del legacy");
assert.deepEqual(document.scenes[1].content.terminal, ["> audio = segundos", "> modelo = voz clonada"], "conserva las líneas de terminal");

const event = (year: string) => ({ event: "PRIMER CASO", year, headline: `AÑO\n${year}`, impact: "Un caso documentado cambia la conversación." });
const timelinePayload = { ...standardPayload, scenes: { intro, event1: event("2019"), event2: event("2021"), event3: event("2023"), event4: event("2026"), today: standardPayload.scenes.reality, close: standardPayload.scenes.close } };
const timeline = normalizeTimelineVideoScript(timelinePayload, input);
assert.deepEqual(timeline.scenes.map((item) => item.id), [...TIMELINE_SCENE_KEYS]);
assert.deepEqual(timeline.scenes.slice(1, 5).map((item) => item.content.year), ["2019", "2021", "2023", "2026"], "conserva los eventos en orden temporal");
assert.throws(() => normalizeTimelineVideoScript({ ...timelinePayload, scenes: { ...timelinePayload.scenes, event2: event("2018") } }, input), /orden ascendente/, "rechaza cronologías desordenadas");
assert.throws(() => normalizeTimelineVideoScript(standardPayload, input), /siete escenas de la cronología/, "rechaza un guion estándar en la plantilla timeline");
console.log("Guion de video: prompts legacy, siete escenas, accents y duraciones validados.");
