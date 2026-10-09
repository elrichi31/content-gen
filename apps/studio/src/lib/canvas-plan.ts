import { beatMismatch, CANVAS_TEMPLATE_CATALOG, canvasSceneBeatSchema, canvasScenePlanSchema, pruneBeats, sceneWords, storedBeats, type CanvasSceneBeat, type CanvasTemplate } from "@content-gen/domain/canvas";
import { addUsage, emptyUsage } from "@content-gen/domain/cost";
import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { generateOpenAiJson, OpenAiError } from "./openai.ts";
import { VideoGenerationError } from "./video-generation.ts";

/**
 * Plan del motor Canvas: para cada escena, la IA elige 1 a 3 plantillas animadas (packages/domain/src/canvas.ts),
 * les pone los datos y ancla sus momentos clave a palabras literales de la narración. Se guarda en
 * `scene.content.canvas` (ver `storedBeats`); el render y la preview lo leen de ahí.
 */

/**
 * Catálogo y criterio de elección, compartido por el plan y por el guion educativo (que se escribe a
 * partir de las animaciones). El SÍ / NO de cada plantilla sale del catálogo del dominio (la misma
 * fuente que ve el agente en listar_animaciones): la IA usaba casi todas fuera de lugar.
 */
export const CANVAS_TEMPLATE_GUIDE = `PLANTILLAS (campos exactos):
- hook: palabras gigantes que golpean al decirse. { "template": "hook", "words": [{ "text": "1-14 letras", "cue": "..." }] } (1 a 4). Para el gancho de la primera escena.
- flow: emisores → (escudo) → destino, con paquetes viajando. { "template": "flow", "sources": [{ "label": "...", "count": 1-60 }] (1 a 3), "target": "...", "shield": "..." (opcional: lo que filtra o protege), "rate": "calm"|"busy"|"flood", "outcome": "ok"|"overload"|"blocked", "cues": { "surge": "...", "shield": "...", "outcome": "..." } }. surge = cuando el tráfico se dispara; outcome = cuando se ve el resultado.
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

CÓMO ELEGIR (SÍ / NO de cada plantilla)
${CANVAS_TEMPLATE_CATALOG.map(({ template, useFor, avoid }) => `- ${template}: SÍ ${useFor} NO ${avoid}`).join("\n")}

LA PRUEBA
- Cada elemento que muestra la animación (paso, punto, fecha, nodo, lugar, etapa, comando, cifra) tiene que DECIRSE en la narración, y su cue es esa palabra. Si tendrías que inventar elementos que la voz no dice, esa no es la animación. Las animaciones cuyos momentos casi no se dicen se descartan solas.
- Calidad antes que variedad: si una idea no encaja limpia en ninguna, usa menos animaciones o title. No repitas la misma plantilla en escenas seguidas salvo que la narración lo pida.
- Si la idea es un número, cuéntalo (stat, compare o chart) en vez de enumerarlo en una list.
- Tiempo para leerlas: una animación por cada ~7 s de voz (hasta unos 10 s, una; hasta 17 s, dos; más, tres). Las que sobran se recortan.`;

export const CANVAS_PLAN_SYSTEM_PROMPT = `Eres director de motion graphics para videos educativos verticales. Para cada escena eliges 1 a 3 plantillas animadas que se suceden y escribes sus datos. No dibujas: el motor anima las plantillas.

${CANVAS_TEMPLATE_GUIDE}

REGLAS
- Varias animaciones por escena: si la narración dura más de unos 7 s y encadena ideas, usa 2 o 3 animaciones seguidas, una por idea y en el orden de la voz, que cuenten una progresión (no la misma idea dos veces). Desde la segunda, cada una lleva "from": frase literal de 1 a 3 palabras con la que empieza su idea; sus cues van después de esa frase. Escenas cortas o de una sola idea: una animación.
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
 * Con `strict`, se descartan las que no siguen la narración (ver `beatMismatch`) y el motivo va a
 * `rejected`. Los cues y frases de entrada que no se dicen se quitan. `null` si no queda ninguna.
 */
export function entryBeats(entry: unknown, scene: VideoDocument["scenes"][number], fps: number, rejected: string[] = [], strict = true): CanvasSceneBeat[] | null {
  const list = (entry as { beats?: unknown })?.beats;
  const words = sceneWords(scene, fps);
  // Una animación por cada ~7 s de voz: tres en 10 s pasaban sin que se alcanzaran a leer.
  const room = Math.max(1, Math.min(3, Math.round(narrationSeconds(scene, fps) / 7)));
  // Lo inválido también va a `rejected`: la revisión y el agente del MCP necesitan saber qué corregir.
  const parse = (item: unknown, schema: typeof canvasSceneBeatSchema | typeof canvasScenePlanSchema) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) return [parsed.data];
    const issue = parsed.error.issues[0];
    rejected.push(`Escena ${scene.id}: animación "${String((item as { template?: unknown })?.template ?? "?")}" con datos inválidos (${issue.path.join(".") || "plan"}: ${issue.message}).`);
    return [];
  };
  const valid = (Array.isArray(list) ? list.flatMap((item) => parse(item, canvasSceneBeatSchema)) : entry ? parse(entry, canvasScenePlanSchema) : [])
    .filter((beat) => { const reason = strict ? beatMismatch(beat, words) : null; if (reason) rejected.push(`Escena ${scene.id}: descartada ${reason}.`); return !reason; });
  if (valid.length > room) rejected.push(`Escena ${scene.id}: sobran ${valid.length - room} animaciones para ~${Math.round(narrationSeconds(scene, fps))} s de voz (caben ${room}); se quedan las primeras.`);
  const beats = valid.slice(0, room);
  return beats.length ? pruneBeats(beats, words) : null;
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
 * no lo trae); un plan inválido o que no sigue la narración se descarta (la escena queda con el respaldo
 * del motor) y los cues que no se dicen se quitan. `skipped` lista las escenas sin plan y `rejected`, por qué.
 */
export function normalizeCanvasPlans(value: unknown, document: VideoDocument) {
  const entries = Array.isArray((value as { scenes?: unknown })?.scenes) ? (value as { scenes: unknown[] }).scenes : [];
  const plans: Record<string, StoredPlan> = {};
  const skipped: string[] = [];
  const rejected: string[] = [];
  document.scenes.forEach((scene, index) => {
    const entry = entries.find((item) => (item as { sceneId?: unknown })?.sceneId === scene.id) ?? entries[index];
    const beats = entryBeats(entry, scene, document.fps, rejected);
    if (beats) plans[scene.id] = storedBeats(beats);
    else skipped.push(scene.id);
  });
  return { plans, skipped, rejected };
}

/** Guarda los planes en sus escenas; las escenas sin plan nuevo conservan el que tenían. */
export function replaceCanvasPlans(document: VideoDocument, plans: Record<string, StoredPlan>) {
  return videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene) => (plans[scene.id] ? { ...scene, content: { ...scene.content, canvas: plans[scene.id] } } : scene)) });
}

/**
 * Lo que le falta a un plan, en frases para devolvérselas a la IA: escenas que (salvo la última) solo
 * muestran el título. Ya no exige un mínimo de plantillas distintas: eso empujaba a elegir animaciones
 * que no venían a cuento. Vacío si está bien.
 */
export function planVarietyIssues(document: VideoDocument, plans: Record<string, StoredPlan>) {
  const templates = document.scenes.map((scene) => {
    const stored = (plans[scene.id] ?? scene.content.canvas) as { template?: string } | { template?: string }[] | undefined;
    return (Array.isArray(stored) ? stored : stored ? [stored] : []).map((beat) => beat.template ?? "title");
  });
  const issues: string[] = [];
  const titled = document.scenes.flatMap((scene, index) => (index < document.scenes.length - 1 && templates[index].every((template) => template === "title") ? [index + 1] : []));
  if (titled.length) issues.push(`Las escenas ${titled.join(", ")} solo muestran el título: dales una animación que demuestre su idea con sus datos, si alguna encaja de verdad.`);
  return issues;
}

export async function generateCanvasPlan(document: VideoDocument, feedback?: string, request: typeof fetch = fetch, focus?: CanvasPlanFocus, onlyMissing = false) {
  if (focus && !document.scenes.some((scene) => scene.id === focus.sceneId)) throw new VideoGenerationError("La escena seleccionada no existe.", 404);
  const missing = onlyMissing && !focus ? document.scenes.filter((scene) => !scene.content.canvas).map((scene) => scene.id) : null;
  if (missing && !missing.length) return { value: null, model: null, usage: emptyUsage(), sources: [], plans: {} as Record<string, StoredPlan>, skipped: [] as string[], rejected: [] as string[], reviewed: false };
  // Solo las escenas sin plan: las demás van de contexto y su plan se conserva aunque la IA lo devuelva.
  const pending = missing ? `\nSOLO FALTAN LAS ESCENAS ${missing.join(", ")}: devuelve únicamente esas; las demás ya tienen plan y no cambian.` : "";
  const keepMissing = <T extends { plans: Record<string, StoredPlan> }>(plan: T): T => (missing ? { ...plan, plans: Object.fromEntries(Object.entries(plan.plans).filter(([id]) => missing.includes(id))) } : plan);
  try {
    const result = await generateOpenAiJson({ system: CANVAS_PLAN_SYSTEM_PROMPT, prompt: buildCanvasPlanPrompt(document, feedback, focus) + pending, purpose: "explainer", timeoutMs: 180_000, request });
    if (focus) {
      // Solo cuenta la escena pedida, y solo si viene con la plantilla elegida: las demás no se tocan.
      const entries = Array.isArray((result.value as { scenes?: unknown })?.scenes) ? (result.value as { scenes: unknown[] }).scenes : [];
      const entry = entries.find((item) => (item as { sceneId?: unknown })?.sceneId === focus.sceneId) ?? (entries.length === 1 ? entries[0] : null);
      const scene = document.scenes.find((item) => item.id === focus.sceneId)!;
      // La plantilla la eligió la persona: no se descarta por no seguir la narración.
      const beats = entryBeats(entry, scene, document.fps, [], false);
      if (!beats || beats[0].template !== focus.template) throw new VideoGenerationError("La IA no devolvió un plan válido con esa animación. Intenta de nuevo.", 422);
      return { ...result, plans: { [focus.sceneId]: storedBeats(beats) }, skipped: [] as string[], rejected: [] as string[], reviewed: false };
    }
    const first = keepMissing(normalizeCanvasPlans(result.value, document));
    // Una revisión: si descartamos animaciones que no seguían la voz o quedaron escenas solo con título,
    // se le devuelven los problemas concretos y se queda la versión con menos problemas. No se repite
    // más: cada vuelta es otra llamada que se paga.
    const problems = (plan: ReturnType<typeof normalizeCanvasPlans>) => [...plan.rejected, ...planVarietyIssues(document, plan.plans)];
    const issues = problems(first);
    if (issues.length && (Object.keys(first.plans).length || first.rejected.length)) {
      const review = await generateOpenAiJson({ system: CANVAS_PLAN_SYSTEM_PROMPT, prompt: buildCanvasPlanPrompt(document, [feedback?.trim(), `REVISIÓN DE TU PLAN ANTERIOR: ${issues.join(" ")}\nPLAN ANTERIOR: ${JSON.stringify(first.plans)}`].filter(Boolean).join("\n")) + pending, purpose: "explainer", timeoutMs: 180_000, request }).catch(() => null);
      const second = review ? keepMissing(normalizeCanvasPlans(review.value, document)) : null;
      const usage = review ? addUsage(result.usage, review.usage) : result.usage;
      const best = second && Object.keys(second.plans).length >= Object.keys(first.plans).length && problems(second).length < issues.length ? second : first;
      if (!Object.keys(best.plans).length) throw new VideoGenerationError("La IA no devolvió ningún plan que siga la narración.", 422);
      return { ...result, usage, ...best, reviewed: Boolean(review) };
    }
    if (!Object.keys(first.plans).length) throw new VideoGenerationError("La IA no devolvió ningún plan válido para las escenas.", 422);
    return { ...result, ...first, reviewed: false };
  } catch (error) {
    if (error instanceof VideoGenerationError) throw error;
    if (error instanceof OpenAiError) throw new VideoGenerationError(error.message, error.status);
    throw new VideoGenerationError("No se pudo generar el plan de animación.", 502);
  }
}
