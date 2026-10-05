import { SIL_FRAMES, VIDEO_DEFAULTS, videoDocumentSchema, WORDS_PER_SECOND, type VideoDocument, type VideoScene } from "@content-gen/domain/video";
import { z } from "zod";
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

/** Una escena cada ~7 s, entre 4 y 10. */
export const explainerSceneCount = (seconds: number) => Math.min(10, Math.max(4, Math.round(seconds / 7)));

export const EXPLAINER_SCRIPT_SYSTEM_PROMPT = `Eres guionista de videos educativos cortos y verticales (TikTok, Reels, Shorts) que explican como funcionan las cosas: tecnologia, ciberseguridad, ciencia, redes, economia.

El video es 100% animado (motion graphics con formas, diagramas, iconos y texto en movimiento), sin fotos. Por cada escena escribes:
- "title": el texto corto en pantalla (2 a 6 palabras), no una frase larga.
- "voiceover": lo que dice el narrador. Es el que explica: claro, concreto y con ritmo. Voz documental, espanol neutro, cercano pero serio.
- "visual": la animacion que acompana a la narracion, como un diagrama simple que se entiende de un vistazo y sin sonido. UN elemento protagonista (un servidor, un candado, una barra, un contador...) y como mucho dos de apoyo, con una sola accion clara (algo llega, se llena, se rompe, se conecta, se bloquea). Menos es mas: nada decorativo, solo lo que ayuda a entender. No menciones colores: el video usa una sola paleta fija.

ESTRUCTURA
- Escena 1: gancho. Una pregunta o una situacion que genere curiosidad sobre el tema.
- Escenas del medio: la explicacion paso a paso, de lo simple a lo complejo. Una idea por escena, cada una apoyada en la anterior. Usa analogias cotidianas cuando ayuden.
- Penultima: consecuencia o ejemplo real.
- Ultima: cierre memorable (como defenderse, la idea clave o una pregunta para comentar).

REGLAS DE NARRACION
- Respeta el limite de palabras por escena que te indican.
- Escribe cifras y siglas como se pronuncian ("mil peticiones por segundo", "de de o ese" solo si hace falta; mejor "ataque de denegacion de servicio distribuido, o DDoS" la primera vez).
- Sin "en este video", "hoy vamos a hablar de" ni intros de presentador.
- NO inventes cifras ni estadisticas. Si no tienes un dato real, explica la idea sin numero.

Devuelve SOLO JSON con esta forma:
{
  "displayTitle": "...",
  "slug": "tema-en-kebab-case",
  "scenes": [ { "title": "...", "voiceover": "...", "visual": "..." } ]
}`;

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
  scenes: z.array(z.object({ title: z.string().trim().min(1).max(120), voiceover: z.string().trim().min(1).max(1200), visual: z.string().trim().min(1).max(1500) })).min(3).max(12),
});

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function normalizeExplainerScript(value: unknown, input: VideoGenerationInput & { primaryColor?: string }): VideoDocument {
  const parsed = scriptSchema.safeParse(value);
  if (!parsed.success) throw new VideoGenerationError("La IA no devolvió un guion educativo válido (título y escenas con narración y visual).", 422);
  const palette = explainerPalette(input.primaryColor);
  return videoDocumentSchema.parse({
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
      content: { title: scene.title, voiceover: scene.voiceover, visual: scene.visual },
    })),
  });
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

export const sceneSeconds = (document: VideoDocument, scene: VideoScene) => (scene.durationFrames + SIL_FRAMES) / document.fps;

export const EXPLAINER_ANIMATION_SYSTEM_PROMPT = `Eres un motion designer que anima escenas de videos educativos verticales escribiendo HTML, CSS y SVG. Tu escena se renderiza a video frame a frame con HyperFrames (Chrome headless).

LIENZO
- Tu HTML se inserta dentro de un contenedor de 1080x1920 px (vertical), con position: relative, overflow: hidden y fondo oscuro #07080d. Posiciona todo dentro de ese contenedor (usa position: absolute con px, o flex/grid).
- Zona segura: deja libres los 200 px de arriba y los 300 px de abajo (ahí va la interfaz de TikTok). El contenido importante va entre y=200 y y=1620.
- Tipografía: font-family Inter, "Segoe UI", Arial, sans-serif. Etiquetas de mínimo 40 px para que se lean en un móvil. Poco texto en pantalla: la narración ya explica.

ANIMACIÓN (reglas del render, obligatorias)
- SOLO CSS: @keyframes + animation. Nada de JavaScript, <script>, ni eventos.
- El tiempo empieza en 0 cuando empieza la escena. Coreografía los momentos con animation-delay para acompañar la narración en orden.
- Usa animation-fill-mode: both (o forwards) para que nada parpadee antes de entrar ni desaparezca al terminar.
- Todo lo que entra debe haber entrado antes de la duración de la escena menos 0.5 s.
- Anima transform y opacity preferentemente (también stroke-dashoffset para dibujar líneas SVG, width/height para barras).
- Nada externo: sin imágenes, sin url(), sin fuentes web, sin emojis (dibuja los iconos con SVG o formas CSS).
- No estilices html, body ni :root. Usa clases propias y descriptivas.

MENOS ES MÁS (lo más importante)
- La escena explica UNA idea con UN elemento protagonista, grande y centrado (ocupa buena parte del ancho). Como mucho 2 o 3 elementos de apoyo. En total, no más de 4 o 5 cosas en pantalla.
- Que se entienda de un vistazo, como un diagrama de pizarra: el espectador debe captar la idea aunque no oiga la narración.
- Como mucho 3 momentos de animación, en orden y separados: 1) entra el título, 2) entra el protagonista, 3) ocurre la acción clave (algo llega, se llena, se rompe, se conecta, se bloquea). Después, quietud o un solo movimiento suave en bucle que refuerce la idea (por ejemplo, flechas que siguen llegando).
- Prohibido lo decorativo: nada de grillas, partículas, estrellas, brillos, glow, líneas de escaneo, viñetas, marcos, fondos degradados ni elementos que solo "adornan".
- Etiquetas solo si aclaran algo, de 1 a 3 palabras. El único texto largo es el título.

SISTEMA VISUAL (igual en todas las escenas del video, para que se vea como una sola pieza)
- Paleta cerrada: fondo #07080d; COLOR PRINCIPAL para lo importante; COLOR CLARO (el mismo tono, más claro) para lo secundario; blanco #ffffff para textos; gris #3a3f4b para elementos inactivos o de fondo. NINGÚN otro color, ni rojo, ni verde, ni morado. Para "peligro" o "mal" usa el color principal más intenso, tamaño o movimiento, no un color nuevo.
- Título: arriba a la izquierda, top 260px, left 90px, ancho máximo 900px, 84px, peso 800, blanco, line-height 1.05. Entra con un fundido y un desplazamiento de 30px hacia arriba en 0.6 s.
- Iconos: dibujados con SVG de línea (stroke 6px, stroke-linecap round, sin relleno o con relleno muy tenue), esquinas redondeadas de 24px en tarjetas. Mismo estilo en todos.
- Movimiento: entradas de 0.5 a 0.7 s con cubic-bezier(.2,.8,.2,1). Nada rebota ni gira sin motivo.
- El protagonista va en la zona central (entre y=600 y y=1500).

Devuelve SOLO JSON: { "css": "...", "html": "..." }. "html" es el fragmento de HTML (sin <html>, <head>, <body> ni <style>); "css" es la hoja de estilos de ese fragmento.`;

export function buildExplainerAnimationPrompt(document: VideoDocument, scene: VideoScene, feedback?: string) {
  const index = document.scenes.findIndex((item) => item.id === scene.id);
  const text = (key: string) => (typeof scene.content[key] === "string" ? scene.content[key] as string : "");
  // La paleta es del video, no de la escena: la de la primera manda para que todas combinen.
  const [accent, accent2] = document.scenes[0]?.accent ?? explainerPalette();
  const source = scene.content.animationSource as { css?: string; html?: string } | undefined;
  const previous = source ? JSON.stringify({ css: source.css ?? "", html: source.html ?? "" }) : "";
  return `VIDEO: ${document.title}
ESCENA ${index + 1} DE ${document.scenes.length}
DURACIÓN: ${sceneSeconds(document, scene).toFixed(1)} segundos
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
