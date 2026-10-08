import { CANVAS_TEMPLATE_CATALOG, canvasSceneBeatSchema, canvasScenePlanSchema, pruneBeats, sceneWords, storedBeats, type CanvasSceneBeat, type CanvasTemplate } from "@content-gen/domain/canvas";
import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { generateOpenAiJson, OpenAiError } from "./openai.ts";
import { VideoGenerationError } from "./video-generation.ts";

/**
 * Plan del motor Canvas: para cada escena, la IA elige 1 a 3 plantillas animadas (packages/domain/src/canvas.ts),
 * les pone los datos y ancla sus momentos clave a palabras literales de la narración. Se guarda en
 * `scene.content.canvas` (ver `storedBeats`); el render y la preview lo leen de ahí.
 */

export const CANVAS_PLAN_SYSTEM_PROMPT = `Eres director de motion graphics para videos educativos verticales. Para cada escena eliges 1 a 3 plantillas animadas que se suceden y escribes sus datos. No dibujas: el motor anima las plantillas.

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
- terminal: ventana de terminal. { "template": "terminal", "title": "máx 24 (opcional)", "lines": [{ "text": "máx 40", "output": true|false, "cue": "..." }] (2 a 5) }. output=false se escribe como comando; output=true es la respuesta. Tecnología, programación, seguridad defensiva.
- funnel: embudo que se estrecha. { "template": "funnel", "stages": [{ "label": "máx 24", "value": número (opcional), "cue": "..." }] (3 a 5, de mayor a menor), "unit": "máx 8 (opcional)" }. Conversiones, filtros.
- quote: cita destacada. { "template": "quote", "text": "máx 140", "author": "máx 30 (opcional)", "highlight": "parte literal de text a resaltar (opcional)", "cue": "..." }. Citas reales o la idea clave del video; nunca inventes autores.
- map: mapa del mundo de puntos. { "template": "map", "points": [{ "label": "máx 18", "lat": número, "lon": número, "cue": "..." }] (1 a 5), "connect": true|false }. connect=true une los lugares en orden con arcos (rutas, viajes). Coordenadas reales del lugar.
- outro: cierre. { "template": "outro", "line": "máx 40", "cta": "máx 40 (opcional)" }. Para la última escena.
- title: solo el título de la escena en grande. Úsalo solo si ninguna otra encaja.

REGLAS
- Varias animaciones por escena: si la narración dura más de unos 7 s y encadena ideas, usa 2 o 3 animaciones seguidas, una por idea y en el orden de la voz, que cuenten una progresión (no la misma idea dos veces). Desde la segunda, cada una lleva "from": frase literal de 1 a 3 palabras con la que empieza su idea; sus cues van después de esa frase. Escenas cortas o de una sola idea: una animación.
- Elige la plantilla que DEMUESTRE lo que dice la narración, no la que la decore. Varía: no repitas la misma plantilla en escenas seguidas salvo que la narración lo pida, y usa al menos 4 plantillas distintas en un video de 6 escenas o más (title solo como último recurso).
- Cada "cue" es una palabra o frase de 1 a 3 palabras copiada LITERALMENTE de la narración de ESA escena (mismas palabras, mismo orden). Es el instante en que se dispara la animación. Ponlos en el orden en que se dicen.
- Cifras (compare, stat, chart, funnel) y fechas (timeline) solo si la narración las dice o se deducen sin duda de ella. Nunca inventes datos; si no hay cifras, usa otra plantilla.
- Si la escena tiene IMAGEN, la plantilla se dibuja encima de la foto: prefiere las de pocos elementos (hook, stat, list, steps, timeline, title) y deja que la foto cuente el contexto.
- Etiquetas cortas (1 a 3 palabras), en el idioma de la narración, sin emojis. "label" de flow máx 28 caracteres.
- Devuelve SOLO JSON: { "scenes": [{ "sceneId": "...", "beats": [{ ...plan }, { ...plan, "from": "..." }] }] } con una entrada por escena, en orden.`;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const narrationSeconds = (scene: VideoDocument["scenes"][number], fps: number) => sceneWords(scene, fps).at(-1)?.e ?? scene.durationFrames / fps;
/** Lo guardado en `content.canvas`: un plan suelto o una lista de animaciones (ver `storedBeats`). */
type StoredPlan = ReturnType<typeof storedBeats>;

/**
 * Animaciones de una entrada de la IA: `beats` (se quedan las válidas, hasta 3) o un plan suelto.
 * Los cues y frases de entrada que no se dicen se quitan. `null` si no queda ninguna.
 */
function entryBeats(entry: unknown, scene: VideoDocument["scenes"][number], fps: number): CanvasSceneBeat[] | null {
  const list = (entry as { beats?: unknown })?.beats;
  const beats = Array.isArray(list)
    ? list.flatMap((item) => { const parsed = canvasSceneBeatSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }).slice(0, 3)
    : (() => { const parsed = canvasScenePlanSchema.safeParse(entry); return parsed.success ? [parsed.data] : []; })();
  return beats.length ? pruneBeats(beats, sceneWords(scene, fps)) : null;
}

/** Cambiar la animación de una sola escena: la IA solo rellena los datos de la plantilla elegida. */
export type CanvasPlanFocus = { sceneId: string; template: CanvasTemplate };

export function buildCanvasPlanPrompt(document: VideoDocument, feedback?: string, focus?: CanvasPlanFocus) {
  const scenes = document.scenes.map((scene, index) => [
    `ESCENA ${index + 1} (sceneId: ${scene.id})${index === 0 ? " — primera" : index === document.scenes.length - 1 ? " — última" : ""}`,
    `TÍTULO: ${text(scene.content.title)}`,
    `NARRACIÓN (${narrationSeconds(scene, document.fps).toFixed(1)} s): ${text(scene.content.voiceover)}`,
    text(scene.content.visual) ? `IDEA VISUAL: ${text(scene.content.visual)}` : "",
    scene.imageAssetId ? `IMAGEN: sí${text(scene.content.imagePrompt) ? ` (${text(scene.content.imagePrompt)})` : ""}` : "",
    scene.content.canvas ? `PLAN ACTUAL: ${JSON.stringify(scene.content.canvas)}` : "",
  ].filter(Boolean).join("\n"));
  const name = focus ? CANVAS_TEMPLATE_CATALOG.find((item) => item.template === focus.template)?.name ?? focus.template : "";
  const only = focus ? `\n\nSOLO ESCENA ${focus.sceneId}: devuelve únicamente esa escena con la plantilla "${focus.template}" (${name}) como primera animación, sus datos sacados de su narración y sus cues literales; puede seguir con otras si la narración lo pide. Las demás escenas no cambian.` : "";
  return `VIDEO: ${document.title}\n\n${scenes.join("\n\n")}${feedback?.trim() ? `\n\nCAMBIOS PEDIDOS: ${feedback.trim()}\nConserva los planes actuales que no afecte el cambio.` : ""}${only}`;
}

/**
 * Respuesta de la IA → animaciones válidas por escena. Se busca cada escena por `sceneId` (o por posición si
 * no lo trae); un plan inválido se descarta (la escena queda con el respaldo del motor) y los cues
 * que no se dicen se quitan. `skipped` lista las escenas que quedaron sin plan.
 */
export function normalizeCanvasPlans(value: unknown, document: VideoDocument) {
  const entries = Array.isArray((value as { scenes?: unknown })?.scenes) ? (value as { scenes: unknown[] }).scenes : [];
  const plans: Record<string, StoredPlan> = {};
  const skipped: string[] = [];
  document.scenes.forEach((scene, index) => {
    const entry = entries.find((item) => (item as { sceneId?: unknown })?.sceneId === scene.id) ?? entries[index];
    const beats = entryBeats(entry, scene, document.fps);
    if (beats) plans[scene.id] = storedBeats(beats);
    else skipped.push(scene.id);
  });
  return { plans, skipped };
}

/** Guarda los planes en sus escenas; las escenas sin plan nuevo conservan el que tenían. */
export function replaceCanvasPlans(document: VideoDocument, plans: Record<string, StoredPlan>) {
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
      const scene = document.scenes.find((item) => item.id === focus.sceneId)!;
      const beats = entryBeats(entry, scene, document.fps);
      if (!beats || beats[0].template !== focus.template) throw new VideoGenerationError("La IA no devolvió un plan válido con esa animación. Intenta de nuevo.", 422);
      return { ...result, plans: { [focus.sceneId]: storedBeats(beats) }, skipped: [] as string[] };
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
