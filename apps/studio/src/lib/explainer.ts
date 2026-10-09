import { VIDEO_DEFAULTS, videoDocumentSchema, WORDS_PER_SECOND, type VideoDocument } from "@content-gen/domain/video";
import { z } from "zod";
import { storedBeats } from "@content-gen/domain/canvas";
import { CANVAS_TEMPLATE_GUIDE, entryBeats } from "./canvas-plan.ts";
import { generateOpenAiJson, OpenAiError } from "./openai.ts";
import { buildContextBlock, buildDateHeader } from "./video-script-prompt.ts";
import { researchField, researchVideoTopic, VideoGenerationError, videoGenerationInputSchema, withResearchContext, type VideoGenerationInput } from "./video-generation.ts";

/**
 * Video educativo ("explainer"): la IA escribe el guion del narrador escena por escena junto con
 * las animaciones del motor Canvas que lo ilustran; las fotos de fondo son opcionales.
 */
export const EXPLAINER_TEMPLATE_ID = "explainer";

const DEFAULT_ACCENT = "#22d3ee";

/** Mezcla un #RRGGBB con blanco: el segundo color de la paleta es un tono claro del mismo acento. */
const tint = (hex: string, amount: number) => `#${[1, 3, 5].map((index) => {
  const channel = Number.parseInt(hex.slice(index, index + 2), 16);
  return Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, "0");
}).join("")}`;

/** Una sola paleta para todo el video: el color de la marca (o cian) y un tono claro del mismo. */
export function explainerPalette(primaryColor?: string): [string, string] {
  const accent = primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor.toLowerCase() : DEFAULT_ACCENT;
  return [accent, tint(accent, 0.55)];
}

/** Una escena cada ~12 s, entre 3 y 6: escenas largas con 2 o 3 momentos se siguen mejor que muchas cortas. */
export const explainerSceneCount = (seconds: number) => Math.min(6, Math.max(3, Math.round(seconds / 12)));

/**
 * El guion se escribe a partir de las animaciones del motor Canvas, no al revés: por escena la IA elige
 * primero qué animación demuestra mejor la idea y escribe la narración para ella (con sus cifras,
 * fechas y cues dichos en voz). Antes la narración se escribía suelta y luego se le buscaba animación,
 * y salían plantillas que no venían a cuento. El plan sale con el guion y no hace falta otra llamada.
 */
export const EXPLAINER_SCRIPT_SYSTEM_PROMPT = `Eres guionista y director de explicaciones animadas verticales. Enseña cómo funciona algo, no solo qué es. Las escenas se ilustran con un catálogo fijo de animaciones: primero eliges las animaciones de cada escena y luego escribes la narración PARA ellas.

${CANVAS_TEMPLATE_GUIDE}

Por escena, en este orden:
1. "beats": las animaciones del catálogo que se suceden, una por idea y en el orden de la voz, con sus datos completos: una por cada ~7 s de voz (escena corta, una; nunca más de tres). Desde la segunda, cada una lleva "from": frase literal de 1 a 3 palabras de la narración con la que empieza su idea.
2. "voiceover": el tramo de la historia que esas animaciones demuestran, contado como lo diría una persona a otra. Nombra lo que muestra cada animación y contiene literalmente cada "cue" y cada "from" (1 a 3 palabras copiadas tal cual, en el orden en que se dicen). Empieza donde terminó la escena anterior ("entonces", "por eso", "pero"). Explica causa y efecto; respeta el máximo de palabras. Sin intros.
3. "title": 2 a 6 palabras.
4. "visual": storyboard breve de lo que se ve en el orden de la voz: estado inicial → cambio visible → resultado (sirve si se anima sin el catálogo).
5. "photo": 2 a 4 palabras en inglés para buscar una foto de stock que ambiente la escena de fondo (lugar, objeto o persona concretos; nada abstracto ni con texto).

NARRACIÓN HABLADA (la lee una voz sintética)
- Frases completas, nunca apuntes ni "X: Y". Sin MAYÚSCULAS sostenidas, siglas raras ni abreviaturas (nada de "1H", "PoC", "Q3", "YoY"): escríbelas como se dicen ("el primer semestre", "una prueba de concepto").
- Todas las cifras escritas como se pronuncian, sin dígitos ni "%" ("ochenta y ocho por ciento"); en el plan van en número.
- En el idioma solicitado: los términos en inglés se traducen o se explican en la misma frase la primera vez.
- Historia antes que datos: una o dos cifras por escena como mucho. Si el contexto trae muchas, elige las más fuertes para la historia y deja el resto.

Progresión: gancho (hook) → mecanismo paso a paso → ejemplo o consecuencia → idea clave (outro en la última). Las escenas son capítulos de una sola historia: ninguna reinicia el tema ni repite lo dicho. Cifras, fechas, citas y lugares solo si son reales (del contexto o conocimiento sólido); si no los tienes, elige una animación que no los necesite. Las analogías aclaran el mecanismo, sin confundirse con su funcionamiento literal.

Devuelve SOLO JSON: { "displayTitle": "...", "slug": "tema-en-kebab-case", "scenes": [{ "beats": [{ ...plan }, { ...plan, "from": "..." }], "voiceover": "...", "title": "...", "visual": "...", "photo": "..." }] }`;

export function buildExplainerScriptPrompt(input: VideoGenerationInput & { brandName?: string }) {
  const scenes = explainerSceneCount(input.targetDurationSeconds);
  const wordsPerScene = Math.round((input.targetDurationSeconds / scenes) * WORDS_PER_SECOND * 0.9);
  return `${buildDateHeader()}
TEMA: ${input.topic}
DURACION OBJETIVO: ${input.targetDurationSeconds} segundos
ESCENAS: exactamente ${scenes}
PALABRAS POR ESCENA: maximo ${wordsPerScene} en "voiceover"
IDIOMA: ${input.language}${input.audience ? `\nAUDIENCIA: ${input.audience}` : ""}${input.tone ? `\nTONO: ${input.tone}` : ""}${input.brandName ? `\nMARCA: ${input.brandName}` : ""}${buildContextBlock(input.context)}`;
}

const scriptSchema = z.object({
  displayTitle: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(160).optional(),
  scenes: z.array(z.object({ title: z.string().trim().min(1).max(120), voiceover: z.string().trim().min(1).max(1200), visual: z.string().trim().min(1).max(1500), photo: z.string().trim().max(120).optional(), beats: z.array(z.unknown()).optional() })).min(3).max(12),
});

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Red de seguridad para la voz sintética: palabras en MAYÚSCULAS de 5 letras o más («ATACANTE»,
 * «SPIDER») se leen gritadas o deletreadas, así que pasan a «Atacante». Siglas cortas (IA, API, LLM) quedan.
 */
export const speakable = (text: string) => text.replace(/\p{Lu}{5,}/gu, (word) => word[0] + word.slice(1).toLowerCase());

/** `rejected` recibe por qué se descartó cada animación (el MCP se lo devuelve al agente que escribió el guion). */
export function normalizeExplainerScript(value: unknown, input: VideoGenerationInput & { primaryColor?: string }, rejected: string[] = []): VideoDocument {
  const parsed = scriptSchema.safeParse(value);
  if (!parsed.success) throw new VideoGenerationError("La IA no devolvió un guion educativo válido (título y escenas con narración y visual).", 422);
  const palette = explainerPalette(input.primaryColor);
  const document = videoDocumentSchema.parse({
    schemaVersion: 1,
    slug: parsed.data.slug || input.topic,
    templateId: EXPLAINER_TEMPLATE_ID,
    title: parsed.data.displayTitle,
    targetDurationSeconds: input.targetDurationSeconds,
    ...VIDEO_DEFAULTS,
    scenes: parsed.data.scenes.map((scene, index) => ({
      id: `scene-${index + 1}`,
      kind: "explainer",
      // Estimación por palabras hasta que exista la voz: el audio fija luego la duración real.
      durationFrames: Math.round(Math.max(3, wordCount(scene.voiceover) / WORDS_PER_SECOND) * VIDEO_DEFAULTS.fps),
      accent: palette,
      // `imagePrompt` es la búsqueda de la foto de fondo (Canvas), igual que en standard/timeline.
      content: { title: scene.title, voiceover: speakable(scene.voiceover), visual: scene.visual, ...(scene.photo ? { imagePrompt: scene.photo } : {}) },
    })),
  });
  // Las animaciones elegidas con el guion quedan como plan Canvas; las inválidas se descartan y esa
  // escena se planifica después con generar_plan_canvas, como antes.
  return videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene, index) => {
    const beats = entryBeats({ beats: parsed.data.scenes[index].beats }, scene, document.fps, rejected);
    return beats ? { ...scene, content: { ...scene.content, canvas: storedBeats(beats) } } : scene;
  }) });
}

export async function generateExplainerScriptRun(input: z.input<typeof videoGenerationInputSchema> & { brandName?: string; primaryColor?: string }, request: typeof fetch = fetch) {
  const parsed = { ...input, ...videoGenerationInputSchema.parse(input) };
  try {
    const research = parsed.webSearch ? await researchVideoTopic(parsed, request) : null;
    const resolved = { ...parsed, context: withResearchContext(parsed.context, research) };
    const result = await generateOpenAiJson({ system: EXPLAINER_SCRIPT_SYSTEM_PROMPT, prompt: buildExplainerScriptPrompt(resolved), purpose: "explainer", request });
    return { ...result, research, document: videoDocumentSchema.parse({ ...normalizeExplainerScript(result.value, resolved), ...researchField(research) }) };
  } catch (error) {
    if (error instanceof VideoGenerationError) throw error;
    if (error instanceof OpenAiError) throw new VideoGenerationError(error.message, error.status);
    throw new VideoGenerationError("No se pudo generar el guion educativo.", 502);
  }
}
