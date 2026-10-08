import { CANVAS_TEMPLATE_CATALOG, canvasSceneBeatSchema, canvasScenePlanSchema, pruneBeats, sceneWords, storedBeats, type CanvasSceneBeat, type CanvasTemplate } from "@content-gen/domain/canvas";
import { addUsage } from "@content-gen/domain/cost";
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
- Recorre TODO el catálogo para cada idea antes de elegir y quédate con la plantilla que mejor la DEMUESTRE, no la que la decore: fechas o años → timeline; pasos o fases → steps; acciones, señales o recomendaciones → list; una cifra → stat; dos cifras → compare; serie de cifras → chart; etapas que se reducen → funnel; algo que viaja o satura → flow; cosas conectadas o que se propagan → network; comandos o registros → terminal; antes y después → split; lugares → map; una frase clave o cita → quote.
- Varía: no repitas la misma plantilla en escenas seguidas salvo que la narración lo pida, y usa tantas plantillas distintas como permitan las ideas (al menos 5 en un video de 5 escenas o más).
- title es el último recurso: solo si la escena no tiene ninguna fecha, cifra, lista, proceso, comparación ni relación que mostrar. Cerrar con outro está bien.
- Cada "cue" es una palabra o frase de 1 a 3 palabras copiada LITERALMENTE de la narración de ESA escena (mismas palabras, mismo orden). Es el instante en que se dispara la animación. Ponlos en el orden en que se dicen.
- DATOS DE LA ESCENA (fechas, titulares, listas, cifras, comandos) son material para rellenar las plantillas: úsalos. Cifras (compare, stat, chart, funnel) y fechas (timeline) solo si están en la narración o en esos datos; nunca las inventes.
- Si la escena tiene IMAGEN, la foto va de fondo con un velo oscuro y cualquier plantilla se lee encima: la foto no es motivo para elegir una plantilla más pobre.
- Etiquetas cortas (1 a 3 palabras), en el idioma de la narración, sin emojis. "label" de flow máx 28 caracteres.
- Devuelve SOLO JSON: { "scenes": [{ "sceneId": "...", "beats": [{ ...plan }, { ...plan, "from": "..." }] }] } con una entrada por escena, en orden.`;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const narrationSeconds = (scene: VideoDocument["scenes"][number], fps: number) => sceneWords(scene, fps).at(-1)?.e ?? scene.durationFrames / fps;
// Campos de la escena que ya van aparte o no son contenido.
const NOT_DATA = new Set(["title", "voiceover", "visual", "imagePrompt", "canvas", "wordTimings", "audioDurationSeconds", "animationHtml", "animationSource"]);

/**
 * El resto del contenido de la escena (las de standard/timeline traen año, titular, indicadores,
 * acciones, comandos…): sin esto la IA no sabe que hay fechas o listas que animar.
 */
function sceneData(content: Record<string, unknown>) {
  const lines = Object.entries(content).flatMap(([key, value]) => {
    if (NOT_DATA.has(key)) return [];
    const shown = Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).join(" | ") : typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    return shown ? [`- ${key}: ${shown.slice(0, 400)}`] : [];
  });
  return lines.length ? `DATOS DE LA ESCENA:\n${lines.join("\n")}` : "";
}

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
    sceneData(scene.content),
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

/**
 * Lo que le falta de variedad a un plan, en frases para devolvérselas a la IA: escenas que (salvo la
 * última) solo muestran el título y pocas plantillas distintas. Vacío si está bien.
 */
export function planVarietyIssues(document: VideoDocument, plans: Record<string, StoredPlan>) {
  const templates = document.scenes.map((scene) => {
    const stored = (plans[scene.id] ?? scene.content.canvas) as { template?: string } | { template?: string }[] | undefined;
    return (Array.isArray(stored) ? stored : stored ? [stored] : []).map((beat) => beat.template ?? "title");
  });
  const issues: string[] = [];
  const titled = document.scenes.flatMap((scene, index) => (index < document.scenes.length - 1 && templates[index].every((template) => template === "title") ? [index + 1] : []));
  if (titled.length) issues.push(`Las escenas ${titled.join(", ")} solo muestran el título: dales una animación que demuestre su idea con sus datos.`);
  const distinct = new Set(templates.flat().filter((template) => template !== "title" && template !== "outro"));
  const target = Math.min(5, document.scenes.length - 1);
  if (distinct.size < target) issues.push(`Solo usaste ${distinct.size} plantillas distintas (${[...distinct].join(", ") || "ninguna"}); usa al menos ${target}, eligiendo para cada idea la que mejor la demuestre.`);
  return issues;
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
      return { ...result, plans: { [focus.sceneId]: storedBeats(beats) }, skipped: [] as string[], reviewed: false };
    }
    const first = normalizeCanvasPlans(result.value, document);
    // Una revisión: si el plan se quedó corto de variedad, se le devuelven los problemas concretos y se
    // queda la versión con menos problemas. No se repite más: cada vuelta es otra llamada que se paga.
    const issues = planVarietyIssues(document, first.plans);
    if (issues.length && Object.keys(first.plans).length) {
      const review = await generateOpenAiJson({ system: CANVAS_PLAN_SYSTEM_PROMPT, prompt: buildCanvasPlanPrompt(document, [feedback?.trim(), `REVISIÓN DE TU PLAN ANTERIOR: ${issues.join(" ")}\nPLAN ANTERIOR: ${JSON.stringify(first.plans)}`].filter(Boolean).join("\n")), purpose: "explainer", timeoutMs: 180_000, request }).catch(() => null);
      const second = review ? normalizeCanvasPlans(review.value, document) : null;
      const usage = review ? addUsage(result.usage, review.usage) : result.usage;
      if (second && Object.keys(second.plans).length >= Object.keys(first.plans).length && planVarietyIssues(document, second.plans).length < issues.length) return { ...result, usage, ...second, reviewed: true };
      return { ...result, usage, ...first, reviewed: Boolean(review) };
    }
    if (!Object.keys(first.plans).length) throw new VideoGenerationError("La IA no devolvió ningún plan válido para las escenas.", 422);
    return { ...result, ...first, reviewed: false };
  } catch (error) {
    if (error instanceof VideoGenerationError) throw error;
    if (error instanceof OpenAiError) throw new VideoGenerationError(error.message, error.status);
    throw new VideoGenerationError("No se pudo generar el plan de animación.", 502);
  }
}
