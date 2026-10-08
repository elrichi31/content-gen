import { CANVAS_TEMPLATE_CATALOG, canvasScenePlanSchema, pruneCues, sceneWords, type CanvasScenePlan, type CanvasTemplate } from "@content-gen/domain/canvas";
import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { generateOpenAiJson, OpenAiError } from "./openai.ts";
import { VideoGenerationError } from "./video-generation.ts";

/**
 * Plan del motor Canvas: para cada escena, la IA elige una plantilla animada (packages/domain/src/canvas.ts),
 * le pone los datos y ancla sus momentos clave a palabras literales de la narración. Se guarda en
 * `scene.content.canvas`; el render y la preview lo leen de ahí.
 */

export const CANVAS_PLAN_SYSTEM_PROMPT = `Eres director de motion graphics para videos educativos verticales. Para cada escena eliges UNA plantilla animada y escribes sus datos. No dibujas: el motor anima la plantilla.

PLANTILLAS (campos exactos):
- hook: palabras gigantes que golpean al decirse. { "template": "hook", "words": [{ "text": "1-14 letras", "cue": "..." }] } (1 a 4). Para el gancho de la primera escena.
- flow: emisores → (escudo) → destino, con paquetes viajando. Redes, ataques, APIs, colas, cualquier cosa que fluya hacia algo. { "template": "flow", "sources": [{ "label": "...", "count": 1-60 }] (1 a 3), "target": "...", "shield": "..." (opcional: lo que filtra o protege), "rate": "calm"|"busy"|"flood", "outcome": "ok"|"overload"|"blocked", "cues": { "surge": "...", "shield": "...", "outcome": "..." } }. surge = cuando el tráfico se dispara; outcome = cuando se ve el resultado.
- steps: proceso en orden. { "template": "steps", "items": [{ "label": "máx 36", "cue": "..." }] } (2 a 4).
- compare: dos magnitudes. { "template": "compare", "left": { "label": "...", "value": número, "unit": "máx 8" }, "right": { ... }, "cue": "..." }.
- stat: una cifra que cuenta hasta su valor. { "template": "stat", "value": número, "decimals": 0-2, "unit": "máx 8", "label": "máx 40", "cue": "..." }.
- list: puntos con marca. { "template": "list", "icon": "check"|"cross"|"dot", "items": [{ "text": "máx 40", "cue": "..." }] } (2 a 4). check = recomendaciones, cross = errores o mitos.
- timeline: línea de tiempo horizontal; la cámara avanza de hito en hito. { "template": "timeline", "events": [{ "date": "máx 12 (año, mes, «Día 1»…)", "label": "máx 40", "cue": "..." }] } (2 a 5). Historia, evolución, cronologías.
- split: antes / después en pantalla partida. { "template": "split", "before": { "label": "máx 20", "items": ["máx 30"] (1 a 3) }, "after": { "label": "máx 20", "items": [...] }, "cue": "..." }. cue = cuando entra el «después». Sin y con algo, error contra solución.
- chart: gráfica que se dibuja. { "template": "chart", "kind": "line"|"bar", "points": [{ "label": "máx 10", "value": número }] (3 a 8), "unit": "máx 8 (opcional)", "cue": "..." }. line = tendencia en el tiempo; bar = categorías.
- network: red de nodos que se conectan. { "template": "network", "shape": "hub"|"chain", "center": "máx 18 (opcional, solo hub)", "nodes": [{ "label": "máx 18", "cue": "..." }] (2 a 6) }. hub = todo sale de un centro (botnet, servidor, IA); chain = se propaga uno tras otro (contagio, cadena).
- outro: cierre. { "template": "outro", "line": "máx 40", "cta": "máx 40 (opcional)" }. Para la última escena.
- title: solo el título de la escena en grande. Úsalo solo si ninguna otra encaja.

REGLAS
- Elige la plantilla que DEMUESTRE lo que dice la narración, no la que la decore. Varía: no repitas la misma plantilla en escenas seguidas salvo que la narración lo pida, y usa al menos 4 plantillas distintas en un video de 6 escenas o más (title solo como último recurso).
- Cada "cue" es una palabra o frase de 1 a 3 palabras copiada LITERALMENTE de la narración de ESA escena (mismas palabras, mismo orden). Es el instante en que se dispara la animación. Ponlos en el orden en que se dicen.
- Cifras (compare, stat, chart) y fechas (timeline) solo si la narración las dice o se deducen sin duda de ella. Nunca inventes datos; si no hay cifras, usa otra plantilla.
- Si la escena tiene IMAGEN, la plantilla se dibuja encima de la foto: prefiere las de pocos elementos (hook, stat, list, steps, timeline, title) y deja que la foto cuente el contexto.
- Etiquetas cortas (1 a 3 palabras), en el idioma de la narración, sin emojis. "label" de flow máx 28 caracteres.
- Devuelve SOLO JSON: { "scenes": [{ "sceneId": "...", ...plan }] } con una entrada por escena, en orden.`;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Cambiar la animación de una sola escena: la IA solo rellena los datos de la plantilla elegida. */
export type CanvasPlanFocus = { sceneId: string; template: CanvasTemplate };

export function buildCanvasPlanPrompt(document: VideoDocument, feedback?: string, focus?: CanvasPlanFocus) {
  const scenes = document.scenes.map((scene, index) => [
    `ESCENA ${index + 1} (sceneId: ${scene.id})${index === 0 ? " — primera" : index === document.scenes.length - 1 ? " — última" : ""}`,
    `TÍTULO: ${text(scene.content.title)}`,
    `NARRACIÓN: ${text(scene.content.voiceover)}`,
    text(scene.content.visual) ? `IDEA VISUAL: ${text(scene.content.visual)}` : "",
    scene.imageAssetId ? `IMAGEN: sí${text(scene.content.imagePrompt) ? ` (${text(scene.content.imagePrompt)})` : ""}` : "",
    scene.content.canvas ? `PLAN ACTUAL: ${JSON.stringify(scene.content.canvas)}` : "",
  ].filter(Boolean).join("\n"));
  const name = focus ? CANVAS_TEMPLATE_CATALOG.find((item) => item.template === focus.template)?.name ?? focus.template : "";
  const only = focus ? `\n\nSOLO ESCENA ${focus.sceneId}: devuelve únicamente esa escena con la plantilla "${focus.template}" (${name}), sus datos sacados de su narración y sus cues literales. Las demás escenas no cambian.` : "";
  return `VIDEO: ${document.title}\n\n${scenes.join("\n\n")}${feedback?.trim() ? `\n\nCAMBIOS PEDIDOS: ${feedback.trim()}\nConserva los planes actuales que no afecte el cambio.` : ""}${only}`;
}

/**
 * Respuesta de la IA → plan válido por escena. Se busca cada escena por `sceneId` (o por posición si
 * no lo trae); un plan inválido se descarta (la escena queda con el respaldo del motor) y los cues
 * que no se dicen se quitan. `skipped` lista las escenas que quedaron sin plan.
 */
export function normalizeCanvasPlans(value: unknown, document: VideoDocument) {
  const entries = Array.isArray((value as { scenes?: unknown })?.scenes) ? (value as { scenes: unknown[] }).scenes : [];
  const plans: Record<string, CanvasScenePlan> = {};
  const skipped: string[] = [];
  document.scenes.forEach((scene, index) => {
    const entry = entries.find((item) => (item as { sceneId?: unknown })?.sceneId === scene.id) ?? entries[index];
    const parsed = canvasScenePlanSchema.safeParse(entry);
    if (parsed.success) plans[scene.id] = pruneCues(parsed.data, sceneWords(scene, document.fps));
    else skipped.push(scene.id);
  });
  return { plans, skipped };
}

/** Guarda los planes en sus escenas; las escenas sin plan nuevo conservan el que tenían. */
export function replaceCanvasPlans(document: VideoDocument, plans: Record<string, CanvasScenePlan>) {
  return videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene) => (plans[scene.id] ? { ...scene, content: { ...scene.content, canvas: plans[scene.id] } } : scene)) });
}

export async function generateCanvasPlan(document: VideoDocument, feedback?: string, request: typeof fetch = fetch, focus?: CanvasPlanFocus) {
  if (focus && !document.scenes.some((scene) => scene.id === focus.sceneId)) throw new VideoGenerationError("La escena seleccionada no existe.", 404);
  try {
    const result = await generateOpenAiJson({ system: CANVAS_PLAN_SYSTEM_PROMPT, prompt: buildCanvasPlanPrompt(document, feedback, focus), purpose: "explainer", timeoutMs: 180_000, request });
    if (focus) {
      // Solo cuenta la escena pedida, y solo si viene con la plantilla elegida: las demás no se tocan.
      const entries = Array.isArray((result.value as { scenes?: unknown })?.scenes) ? (result.value as { scenes: unknown[] }).scenes : [];
      const entry = entries.find((item) => (item as { sceneId?: unknown })?.sceneId === focus.sceneId) ?? (entries.length === 1 ? entries[0] : null);
      const parsed = canvasScenePlanSchema.safeParse(entry);
      if (!parsed.success || parsed.data.template !== focus.template) throw new VideoGenerationError("La IA no devolvió un plan válido con esa animación. Intenta de nuevo.", 422);
      const scene = document.scenes.find((item) => item.id === focus.sceneId)!;
      return { ...result, plans: { [focus.sceneId]: pruneCues(parsed.data, sceneWords(scene, document.fps)) }, skipped: [] as string[] };
    }
    const { plans, skipped } = normalizeCanvasPlans(result.value, document);
    if (!Object.keys(plans).length) throw new VideoGenerationError("La IA no devolvió ningún plan válido para las escenas.", 422);
    return { ...result, plans, skipped };
  } catch (error) {
    if (error instanceof VideoGenerationError) throw error;
    if (error instanceof OpenAiError) throw new VideoGenerationError(error.message, error.status);
    throw new VideoGenerationError("No se pudo generar el plan de animación.", 502);
  }
}
