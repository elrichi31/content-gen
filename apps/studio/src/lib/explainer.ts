import { sceneLeadFrames, sceneTimelineFrames, VIDEO_DEFAULTS, videoDocumentSchema, WORDS_PER_SECOND, type VideoDocument, type VideoScene } from "@content-gen/domain/video";
import { z } from "zod";
import { storedBeats } from "@content-gen/domain/canvas";
import { CANVAS_TEMPLATE_GUIDE, entryBeats } from "./canvas-plan.ts";
import { generateOpenAiJson, OpenAiError } from "./openai.ts";
import { buildContextBlock, buildDateHeader } from "./video-script-prompt.ts";
import { researchField, researchVideoTopic, VideoGenerationError, videoGenerationInputSchema, withResearchContext, type VideoGenerationInput } from "./video-generation.ts";

/**
 * Video educativo ("explainer"): la IA escribe el guion del narrador escena por escena y, después,
 * la animación de cada escena en HTML + CSS + SVG que HyperFrames renderiza. No hay imágenes.
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
1. "beats": 1 a 3 animaciones del catálogo que se suceden, una por idea y en el orden de la voz, con sus datos completos. Escenas de una sola idea: una. Desde la segunda, cada una lleva "from": frase literal de 1 a 3 palabras de la narración con la que empieza su idea.
2. "voiceover": el tramo de la historia que esas animaciones demuestran, lenguaje cercano y preciso, en el idioma solicitado. Dice en voz alta lo que muestra cada animación (sus cifras, fechas, pasos, elementos) y contiene literalmente cada "cue" y cada "from" (1 a 3 palabras copiadas tal cual, en el orden en que se dicen). Empieza donde terminó la escena anterior (conectores: "entonces", "por eso", "pero"). Explica causa y efecto; respeta el máximo de palabras. Define tecnicismos y escribe cifras como se pronuncian (el número del plan va en cifras). Sin intros.
3. "title": 2 a 6 palabras.
4. "visual": storyboard breve de lo que se ve en el orden de la voz: estado inicial → cambio visible → resultado (sirve si se anima sin el catálogo).
5. "photo": 2 a 4 palabras en inglés para buscar una foto de stock que ambiente la escena de fondo (lugar, objeto o persona concretos; nada abstracto ni con texto).

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

export function normalizeExplainerScript(value: unknown, input: VideoGenerationInput & { primaryColor?: string }): VideoDocument {
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
      content: { title: scene.title, voiceover: scene.voiceover, visual: scene.visual, ...(scene.photo ? { imagePrompt: scene.photo } : {}) },
    })),
  });
  // Las animaciones elegidas con el guion quedan como plan Canvas; las inválidas se descartan y esa
  // escena se planifica después con generar_plan_canvas, como antes.
  return videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene, index) => {
    const beats = entryBeats({ beats: parsed.data.scenes[index].beats }, scene, document.fps);
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

/* ---------------------------------- Animación por escena ---------------------------------- */

export const sceneSeconds = (document: VideoDocument, scene: VideoScene) => {
  const index = document.scenes.findIndex((item) => item.id === scene.id);
  if (index < 0) throw new VideoGenerationError("La escena seleccionada no existe.", 404);
  return sceneTimelineFrames(document.scenes, index) / document.fps;
};

export const EXPLAINER_ANIMATION_SYSTEM_PROMPT = `Eres diseñador de explicaciones animadas. Produce HTML/CSS/SVG para demostrar el mecanismo narrado, no una diapositiva con entradas.

DIDÁCTICA
- Una idea: estado inicial → cambio visible → resultado. Haz visible qué causa qué: recorrido, acumulación, bloqueo, transferencia, comparación o transformación. Un icono que aparece no explica el mecanismo.
- Planifica internamente 2 o 3 acciones ligadas a frases de la voz. Título y diagrama aparecen juntos al inicio; dedica el tiempo a explicar, no a presentarlos. Un foco móvil a la vez; conserva objetos, posiciones y etiquetas para seguir el cambio.
- Ajusta delays al INICIO DE VOZ y reparte acciones según las frases y la duración disponible. Es sincronía aproximada, no hay marcas de palabra. Termina la acción al menos 0.6 s antes del final y deja visible el resultado.
- Elige la representación adecuada al tema; evita la tarjeta con icono genérica. Flechas conectan objetos y muestran dirección. Etiquetas de 1 a 3 palabras junto a su objeto, nunca párrafos ni toda la narración.
- Un protagonista y hasta 3 apoyos; reutiliza formas para flujos. Nada decorativo: sin partículas, glow, grillas, marcos ni degradados. Sin rebotes, giros o bucles sin significado. Un flujo en bucle solo si representa un proceso continuo.

LIENZO Y ESTILO
- Contenedor relativo 1080x1920 px, overflow hidden, fondo #07080d. Contenido importante x=90..990, y=200..1620; diagrama y=600..1500. No solapes objetos, flechas y etiquetas.
- Título top 260px, left 90px, max-width 900px, 84px/1.05, peso 800, blanco. Fuente Inter, "Segoe UI", Arial, sans-serif; etiquetas mínimo 40px.
- Solo COLOR PRINCIPAL, COLOR CLARO, blanco #ffffff y gris #3a3f4b sobre el fondo. Diferencia estados con forma, intensidad y texto, no colores nuevos.
- SVG de línea, stroke 6px, extremos redondeados; tarjetas solo si representan un objeto, radio 24px. Entradas breves (0.3–0.5 s), cubic-bezier(.2,.8,.2,1); movimientos de proceso legibles, no instantáneos.

RENDER OBLIGATORIO
- Solo CSS @keyframes + animation; sin JavaScript, eventos ni recursos externos (imágenes, url(), fuentes web, emojis). Tiempo local desde 0 por escena; usa animation-delay y fill-mode: both en todos los elementos animados.
- Prefiere transform/opacity; stroke-dashoffset para recorridos SVG. Para nodos SVG usa transform-box: fill-box y transform-origin: center; coloca y anima en wrappers distintos para conservar la posición base.
- Clases propias; no estilices html, body ni :root. CSS compartido y SVG simples; sin comentarios, paths excesivos ni reglas duplicadas. En correcciones conserva lo válido y aplica solo lo pedido.
- Revisa internamente legibilidad, causa/efecto, solapamientos y estado final. No devuelvas el plan ni la revisión.

Devuelve SOLO JSON: { "css": "...", "html": "..." }. HTML fragmento, sin html/head/body/style; CSS separado.`;

export function buildExplainerAnimationPrompt(document: VideoDocument, scene: VideoScene, feedback?: string) {
  const index = document.scenes.findIndex((item) => item.id === scene.id);
  const text = (key: string) => (typeof scene.content[key] === "string" ? scene.content[key] as string : "");
  // La paleta es del video, no de la escena: la de la primera manda para que todas combinen.
  const [accent, accent2] = document.scenes[0]?.accent ?? explainerPalette();
  const source = scene.content.animationSource as { css?: string; html?: string } | undefined;
  const previous = source ? JSON.stringify({ css: source.css ?? "", html: source.html ?? "" }) : "";
  return `VIDEO: ${document.title}
ESCENA ${index + 1} DE ${document.scenes.length}
DURACIÓN: ${sceneSeconds(document, scene).toFixed(2)} segundos
INICIO DE VOZ: ${(sceneLeadFrames(index) / document.fps).toFixed(2)} s
TÍTULO EN PANTALLA: ${text("title")}
NARRACIÓN (lo que se oye mientras se ve tu animación): ${text("voiceover")}
ANIMACIÓN PEDIDA: ${text("visual")}
COLOR PRINCIPAL: ${accent}
COLOR CLARO: ${accent2}${feedback?.trim() ? `

CAMBIOS PEDIDOS: ${feedback.trim()}` : ""}${feedback?.trim() && previous ? `

VERSIÓN ANTERIOR (aplícale los cambios, no empieces de cero salvo que se pida):
${previous}` : ""}`;
}

const animationSchema = z.object({ css: z.string().max(60_000).default(""), html: z.string().trim().min(1).max(120_000) });

/** Quita lo que no debe correr ni cargarse: scripts, eventos, iframes y recursos externos. */
export function sanitizeAnimationHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<\/?(?:script|iframe|object|embed|link|meta|base|style)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:src|href|xlink:href)\s*=\s*(["'])\s*(?:https?:|\/\/|javascript:|data:text)[^"']*\1/gi, "");
}

const sanitizeCss = (css: string) => css
  .replace(/@import[^;]*;?/gi, "")
  .replace(/url\(\s*['"]?\s*(?:https?:|\/\/|javascript:)[^)]*\)/gi, "none")
  .replace(/<\/style/gi, "");

/** Separa los bloques @keyframes (no se pueden anidar) del resto de reglas. */
function splitKeyframes(css: string) {
  const blocks: string[] = [];
  let rest = "";
  let cursor = 0;
  const pattern = /@(?:-webkit-)?keyframes\s+[\w-]+\s*\{/g;
  for (let match = pattern.exec(css); match; match = pattern.exec(css)) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (end < css.length && depth > 0) { if (css[end] === "{") depth++; else if (css[end] === "}") depth--; end++; }
    rest += css.slice(cursor, match.index);
    blocks.push(css.slice(match.index, end));
    cursor = end;
    pattern.lastIndex = end;
  }
  return { blocks, rest: rest + css.slice(cursor) };
}

/**
 * Aísla la animación de una escena para que conviva con las demás en el mismo documento:
 * las reglas quedan anidadas bajo una clase propia y los @keyframes se renombran con ese prefijo
 * (solo dentro de `animation`/`animation-name`, para no tocar clases que se llamen igual).
 */
export function scopeAnimation(sceneId: string, css: string, html: string) {
  const scope = `xa-${sceneId.replace(/[^a-z0-9-]/gi, "")}`;
  const { blocks, rest } = splitKeyframes(sanitizeCss(css));
  const names = blocks.map((block) => block.match(/keyframes\s+([\w-]+)/)![1]);
  const pattern = names.length ? new RegExp(`(?<![\\w-])(${names.map((name) => name.replace(/[-]/g, "\\-")).join("|")})(?![\\w-])`, "g") : null;
  const renameIn = (text: string) => pattern ? text.replace(/(animation(?:-name)?\s*:\s*)([^;}"']+)/gi, (_all, property: string, value: string) => property + value.replace(pattern, `${scope}-$1`)) : text;
  const keyframes = blocks.map((block) => block.replace(/(keyframes\s+)([\w-]+)/, `$1${scope}-$2`));
  return `<style>\n${keyframes.join("\n")}\n.${scope} {\n${renameIn(rest)}\n}\n</style>\n<div class="${scope}" style="position:absolute;inset:0;overflow:hidden;background:#07080d;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#fff">\n${renameIn(sanitizeAnimationHtml(html))}\n</div>`;
}

export async function generateExplainerAnimation(document: VideoDocument, scene: VideoScene, feedback?: string, request: typeof fetch = fetch) {
  try {
    const result = await generateOpenAiJson({ system: EXPLAINER_ANIMATION_SYSTEM_PROMPT, prompt: buildExplainerAnimationPrompt(document, scene, feedback), purpose: "explainer", timeoutMs: 240_000, request });
    const parsed = animationSchema.safeParse(result.value);
    if (!parsed.success) throw new VideoGenerationError("La IA no devolvió una animación válida (css y html).", 422);
    return { ...result, animationHtml: scopeAnimation(scene.id, parsed.data.css, parsed.data.html), animationSource: parsed.data };
  } catch (error) {
    if (error instanceof VideoGenerationError) throw error;
    if (error instanceof OpenAiError) throw new VideoGenerationError(error.message, error.status);
    throw new VideoGenerationError("No se pudo generar la animación.", 502);
  }
}

/**
 * `animationHtml` es lo que se pinta (preview y render). `animationSource` guarda el css/html crudo
 * de la IA para pedirle cambios sobre su propia versión, no sobre la ya aislada.
 */
export function replaceSceneAnimation(document: VideoDocument, sceneId: string, animation: { animationHtml: string; animationSource: { css: string; html: string } }) {
  if (!document.scenes.some((scene) => scene.id === sceneId)) throw new VideoGenerationError("La escena seleccionada no existe.", 404);
  return videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene) => scene.id === sceneId ? { ...scene, content: { ...scene.content, ...animation } } : scene) });
}
