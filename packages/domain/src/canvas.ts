import { z } from "zod";
import { sceneLeadFrames, sceneTimelineFrames, timelineTotalFrames, type VideoDocument, type VideoScene } from "./video.ts";

/**
 * Motor Canvas: cada escena del video educativo usa una plantilla animada (flujo de red, pasos,
 * comparación…) con parámetros que escribe la IA. Los momentos clave se anclan a palabras de la
 * narración («cue») y, con los tiempos por palabra de ElevenLabs, caen justo cuando se dicen.
 * Este módulo no dibuja: convierte el documento en una `CanvasSpec` con todo resuelto a segundos,
 * que la runtime del navegador (packages/canvas-engine) solo tiene que pintar.
 */

/* ----------------------------------------------------------------- tiempos por palabra */

/** Palabra de la narración con su inicio y fin en segundos desde que arranca el audio de la escena. */
export type WordTiming = { w: string; s: number; e: number };
export const wordTimingsSchema = z.array(z.object({ w: z.string().min(1).max(80), s: z.number().min(0), e: z.number().min(0) })).max(3000);

/** Alineación por carácter de ElevenLabs (`/with-timestamps`) → palabras. */
export function wordsFromAlignment(alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): WordTiming[] {
  const words: WordTiming[] = [];
  let current: WordTiming | null = null;
  alignment.characters.forEach((char, index) => {
    if (/\s/.test(char)) { if (current) words.push(current); current = null; return; }
    const s = alignment.character_start_times_seconds[index] ?? 0;
    const e = alignment.character_end_times_seconds[index] ?? s;
    if (current) { current.w += char; current.e = Math.max(current.e, e); }
    else current = { w: char, s, e };
  });
  if (current) words.push(current);
  return words.map((word) => ({ w: word.w, s: round(word.s), e: round(Math.max(word.s, word.e)) }));
}

/**
 * Sin tiempos reales (audio generado antes de este motor): reparte la duración por longitud de
 * palabra, con pausas extra en comas y puntos. Es aproximado pero mantiene el orden y el ritmo.
 */
export function estimateWordTimings(text: string, seconds: number): WordTiming[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || seconds <= 0) return [];
  const weight = (token: string) => token.length + 1 + (/[.!?…]$/.test(token) ? 5 : /[,;:]$/.test(token) ? 2.5 : 0);
  const total = tokens.reduce((sum, token) => sum + weight(token), 0);
  let cursor = 0;
  return tokens.map((token) => {
    const span = (weight(token) / total) * seconds;
    const word = { w: token, s: round(cursor), e: round(cursor + span * 0.85) };
    cursor += span;
    return word;
  });
}

const round = (value: number) => Math.round(value * 1000) / 1000;
export const normalizeWord = (word: string) => word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Segundo (desde el audio de la escena) en que empieza la frase `phrase`, o `null` si no se dice. */
export function findCue(words: readonly WordTiming[], phrase: string, after = 0): number | null {
  const target = phrase.split(/\s+/).map(normalizeWord).filter(Boolean);
  if (!target.length) return null;
  const spoken = words.map((word) => normalizeWord(word.w));
  for (let index = 0; index + target.length <= spoken.length; index++) {
    if (words[index].s < after) continue;
    // La primera palabra puede venir con prefijo/sufijo («servidores» para «servidor»).
    const word = spoken[index], head = target[0];
    const first = word === head || (head.length >= 4 && word.startsWith(head)) || (word.length >= 4 && head.startsWith(word));
    if (first && target.slice(1).every((token, offset) => spoken[index + 1 + offset] === token)) return words[index].s;
  }
  return null;
}

/* ----------------------------------------------------------------- plantillas */

const cue = z.string().trim().min(1).max(60);
const label = z.string().trim().min(1).max(28);

export const CANVAS_TEMPLATES = ["hook", "flow", "steps", "compare", "stat", "list", "timeline", "split", "chart", "network", "terminal", "funnel", "quote", "map", "outro", "title"] as const;
export type CanvasTemplate = (typeof CANVAS_TEMPLATES)[number];

export const canvasScenePlanSchema = z.discriminatedUnion("template", [
  // Palabras gigantes que golpean al decirse: el gancho.
  z.object({ template: z.literal("hook"), words: z.array(z.object({ text: z.string().trim().min(1).max(14), cue: cue.optional() })).min(1).max(4) }),
  // Emisores → (escudo) → destino con paquetes viajando: redes, ataques, APIs, colas.
  z.object({
    template: z.literal("flow"),
    sources: z.array(z.object({ label, count: z.number().int().min(1).max(60) })).min(1).max(3),
    target: label,
    shield: label.optional(),
    rate: z.enum(["calm", "busy", "flood"]).default("busy"),
    outcome: z.enum(["ok", "overload", "blocked"]).default("ok"),
    cues: z.object({ surge: cue.optional(), shield: cue.optional(), outcome: cue.optional() }).default({}),
  }),
  // Proceso en 2-4 pasos que se encienden al nombrarse.
  z.object({ template: z.literal("steps"), items: z.array(z.object({ label: z.string().trim().min(1).max(36), cue: cue.optional() })).min(2).max(4) }),
  // Dos barras que crecen hasta su valor.
  z.object({
    template: z.literal("compare"),
    left: z.object({ label, value: z.number().min(0).max(1e12), unit: z.string().trim().max(8).optional() }),
    right: z.object({ label, value: z.number().min(0).max(1e12), unit: z.string().trim().max(8).optional() }),
    cue: cue.optional(),
  }),
  // Una cifra que cuenta hasta su valor.
  z.object({ template: z.literal("stat"), value: z.number().min(0).max(1e12), decimals: z.number().int().min(0).max(2).default(0), unit: z.string().trim().max(8).optional(), label: z.string().trim().min(1).max(40), cue: cue.optional() }),
  // Lista con marcas que aparecen al nombrar cada punto.
  z.object({ template: z.literal("list"), icon: z.enum(["check", "cross", "dot"]).default("check"), items: z.array(z.object({ text: z.string().trim().min(1).max(40), cue: cue.optional() })).min(2).max(4) }),
  // Línea de tiempo horizontal: la cámara avanza de fecha en fecha al nombrarlas.
  z.object({ template: z.literal("timeline"), events: z.array(z.object({ date: z.string().trim().min(1).max(12), label: z.string().trim().min(1).max(40), cue: cue.optional() })).min(2).max(5) }),
  // Antes / después en pantalla partida: el «después» entra al decir el cue.
  z.object({
    template: z.literal("split"),
    before: z.object({ label: z.string().trim().min(1).max(20), items: z.array(z.string().trim().min(1).max(30)).min(1).max(3) }),
    after: z.object({ label: z.string().trim().min(1).max(20), items: z.array(z.string().trim().min(1).max(30)).min(1).max(3) }),
    cue: cue.optional(),
  }),
  // Gráfica de línea o de barras que se dibuja.
  z.object({
    template: z.literal("chart"),
    kind: z.enum(["line", "bar"]).default("bar"),
    points: z.array(z.object({ label: z.string().trim().min(1).max(10), value: z.number().min(0).max(1e12) })).min(3).max(8),
    unit: z.string().trim().max(8).optional(),
    cue: cue.optional(),
  }),
  // Red de nodos que se conectan: desde un centro (hub) o uno tras otro (chain).
  z.object({
    template: z.literal("network"),
    shape: z.enum(["hub", "chain"]).default("hub"),
    center: z.string().trim().min(1).max(18).optional(),
    nodes: z.array(z.object({ label: z.string().trim().min(1).max(18), cue: cue.optional() })).min(2).max(6),
  }),
  // Terminal: comandos que se escriben letra a letra y salidas que aparecen.
  z.object({
    template: z.literal("terminal"),
    title: z.string().trim().max(24).optional(),
    lines: z.array(z.object({ text: z.string().trim().min(1).max(40), output: z.boolean().default(false), cue: cue.optional() })).min(2).max(5),
  }),
  // Embudo: etapas que se estrechan, con su cifra opcional.
  z.object({
    template: z.literal("funnel"),
    stages: z.array(z.object({ label: z.string().trim().min(1).max(24), value: z.number().min(0).max(1e12).optional(), cue: cue.optional() })).min(3).max(5),
    unit: z.string().trim().max(8).optional(),
  }),
  // Cita destacada: la frase entra línea a línea con una parte resaltada.
  z.object({ template: z.literal("quote"), text: z.string().trim().min(1).max(140), author: z.string().trim().max(30).optional(), highlight: z.string().trim().max(40).optional(), cue: cue.optional() }),
  // Mapa de puntos: lugares que se encienden al nombrarlos, opcionalmente unidos por arcos.
  z.object({
    template: z.literal("map"),
    points: z.array(z.object({ label: z.string().trim().min(1).max(18), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), cue: cue.optional() })).min(1).max(5),
    connect: z.boolean().default(false),
  }),
  // Cierre.
  z.object({ template: z.literal("outro"), line: z.string().trim().min(1).max(40), cta: z.string().trim().max(40).optional() }),
  // Respaldo: el título de la escena en grande. Lo usa el motor si no hay plan.
  z.object({ template: z.literal("title") }),
]);
export type CanvasScenePlan = z.infer<typeof canvasScenePlanSchema>;

/** Plan guardado en la escena, o el de respaldo si falta o no es válido. */
export function scenePlan(scene: VideoScene, index: number, count: number): CanvasScenePlan {
  const parsed = canvasScenePlanSchema.safeParse(scene.content.canvas);
  if (parsed.success) return parsed.data;
  if (index === count - 1 && count > 1) return { template: "outro", line: sceneText(scene, "title") || "Fin" };
  return { template: "title" };
}

/**
 * Una escena larga encadena 2 o 3 animaciones. `from` es la frase literal de la narración con la que
 * entra cada una; la primera entra con la escena. En `scene.content.canvas` va un plan suelto (una
 * animación, el formato de siempre) o una lista de 1 a 3.
 */
export const canvasSceneBeatSchema = canvasScenePlanSchema.and(z.object({ from: cue.optional() }));
export const canvasSceneBeatsSchema = z.array(canvasSceneBeatSchema).min(1).max(3);
export type CanvasSceneBeat = z.infer<typeof canvasSceneBeatSchema>;

/** Animaciones guardadas en la escena, o la de respaldo. */
export function sceneBeats(scene: VideoScene, index: number, count: number): CanvasSceneBeat[] {
  const many = canvasSceneBeatsSchema.safeParse(scene.content.canvas);
  return many.success ? many.data : [scenePlan(scene, index, count)];
}

/** Lo que se guarda en `content.canvas`: una animación sola como plan suelto, varias como lista. */
export function storedBeats(beats: CanvasSceneBeat[]): CanvasScenePlan | CanvasSceneBeat[] {
  if (beats.length > 1) return beats;
  const plan = { ...beats[0] };
  delete plan.from;
  return plan;
}

/**
 * Quita los cues que no se dicen en la narración (la IA a veces parafrasea o cambia una palabra).
 * Sin cue, `buildCanvasSpec` reparte ese momento a lo largo de la escena: mejor eso que un cue
 * que nunca dispara y deja la animación a medias.
 */
export function pruneCues(plan: CanvasScenePlan, words: readonly WordTiming[]): CanvasScenePlan {
  const keep = (phrase: string | undefined) => (phrase && findCue(words, phrase) !== null ? phrase : undefined);
  switch (plan.template) {
    case "hook": return { ...plan, words: plan.words.map((word) => ({ ...word, cue: keep(word.cue) })) };
    case "flow": return { ...plan, cues: { surge: keep(plan.cues.surge), shield: keep(plan.cues.shield), outcome: keep(plan.cues.outcome) } };
    case "steps": return { ...plan, items: plan.items.map((item) => ({ ...item, cue: keep(item.cue) })) };
    case "list": return { ...plan, items: plan.items.map((item) => ({ ...item, cue: keep(item.cue) })) };
    case "timeline": return { ...plan, events: plan.events.map((event) => ({ ...event, cue: keep(event.cue) })) };
    case "network": return { ...plan, nodes: plan.nodes.map((node) => ({ ...node, cue: keep(node.cue) })) };
    case "terminal": return { ...plan, lines: plan.lines.map((line) => ({ ...line, cue: keep(line.cue) })) };
    case "funnel": return { ...plan, stages: plan.stages.map((stage) => ({ ...stage, cue: keep(stage.cue) })) };
    case "map": return { ...plan, points: plan.points.map((point) => ({ ...point, cue: keep(point.cue) })) };
    case "compare": case "stat": case "split": case "chart": case "quote": return { ...plan, cue: keep(plan.cue) };
    default: return plan;
  }
}

/**
 * Por qué una animación no encaja con lo que dice la voz, o null si encaja. Cada elemento que muestra
 * (paso, punto, fecha, nodo, lugar, cifra) tiene que decirse: su cue es esa palabra. Si casi ninguno se
 * dice, la IA eligió la plantilla y rellenó datos que la narración no cuenta (un flujo en un tema sin
 * tráfico, un mapa sin lugares…), y es mejor descartarla. Gancho, cierre y título no se exigen.
 */
export function beatMismatch(plan: CanvasScenePlan, words: readonly WordTiming[]): string | null {
  const said = (phrase: string | undefined) => Boolean(phrase && findCue(words, phrase) !== null);
  let cues: (string | undefined)[];
  switch (plan.template) {
    case "hook": case "outro": case "title": return null;
    case "flow": cues = [plan.cues.surge, plan.cues.shield, plan.cues.outcome].filter(Boolean); if (!cues.length) cues = [undefined]; break;
    case "steps": case "list": cues = plan.items.map((item) => item.cue); break;
    case "timeline": cues = plan.events.map((event) => event.cue); break;
    case "network": cues = plan.nodes.map((node) => node.cue); break;
    case "terminal": cues = plan.lines.map((line) => line.cue); break;
    case "funnel": cues = plan.stages.map((stage) => stage.cue); break;
    case "map": cues = plan.points.map((point) => point.cue); break;
    default: cues = [plan.cue];
  }
  const spoken = cues.filter(said).length;
  // Las de una sola idea, con su cue; las de varios elementos, al menos la mitad dichos.
  const needed = plan.template === "flow" ? 1 : Math.ceil(cues.length / 2);
  return spoken >= needed ? null : `${plan.template}: solo ${spoken} de ${cues.length} momentos se dicen en la narración`;
}

/** `pruneCues` en cada animación, también su frase de entrada. */
export function pruneBeats(beats: readonly CanvasSceneBeat[], words: readonly WordTiming[]): CanvasSceneBeat[] {
  return beats.map((beat) => ({ ...pruneCues(beat, words), from: beat.from && findCue(words, beat.from) !== null ? beat.from : undefined }));
}

const sceneText = (scene: VideoScene, key: string) => (typeof scene.content[key] === "string" ? (scene.content[key] as string).trim() : "");

/* ----------------------------------------------------------------- spec para la runtime */

export type CaptionChunk = { s: number; e: number; words: WordTiming[] };
export type ResolvedPlan =
  | { template: "hook"; words: { text: string; at: number }[] }
  | { template: "flow"; sources: { label: string; count: number }[]; target: string; shield: string | null; rate: "calm" | "busy" | "flood"; outcome: "ok" | "overload" | "blocked"; surgeAt: number; shieldAt: number; outcomeAt: number }
  | { template: "steps"; items: { label: string; at: number }[] }
  | { template: "compare"; left: { label: string; value: number; unit: string }; right: { label: string; value: number; unit: string }; at: number }
  | { template: "stat"; value: number; decimals: number; unit: string; label: string; at: number }
  | { template: "list"; icon: "check" | "cross" | "dot"; items: { text: string; at: number }[] }
  | { template: "timeline"; events: { date: string; label: string; at: number }[] }
  | { template: "split"; before: { label: string; items: string[] }; after: { label: string; items: string[] }; at: number }
  | { template: "chart"; kind: "line" | "bar"; points: { label: string; value: number }[]; unit: string; at: number }
  | { template: "network"; shape: "hub" | "chain"; center: string | null; nodes: { label: string; at: number }[] }
  | { template: "terminal"; title: string; lines: { text: string; output: boolean; at: number }[] }
  | { template: "funnel"; stages: { label: string; value: number | null; at: number }[]; unit: string }
  | { template: "quote"; text: string; author: string; highlight: string; at: number }
  | { template: "map"; connect: boolean; points: { label: string; lat: number; lon: number; at: number }[] }
  | { template: "outro"; line: string; cta: string; at: number }
  | { template: "title"; at: number };

/** `image`: asset de la foto de fondo de la escena (videos con imágenes), o `null`. */
/** `beats`: animaciones de la escena en orden, cada una de `start` a `end`; `plan` es la primera. */
export type CanvasSceneSpec = { id: string; start: number; duration: number; voiceAt: number; voiceEnd: number; title: string; image: string | null; plan: ResolvedPlan; beats: { start: number; end: number; plan: ResolvedPlan }[]; captions: CaptionChunk[] };
export type CanvasSpec = { width: number; height: number; duration: number; palette: [string, string]; title: string; scenes: CanvasSceneSpec[] };

/** Agrupa palabras en bloques cortos para subtítulos estilo TikTok: máx. 3 palabras o 20 letras, corta en puntuación. */
export function captionChunks(words: readonly WordTiming[]): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];
  let current: WordTiming[] = [];
  const flush = () => { if (current.length) chunks.push({ s: current[0].s, e: current[current.length - 1].e, words: current }); current = []; };
  for (const word of words) {
    const letters = current.reduce((sum, item) => sum + item.w.length + 1, 0) + word.w.length;
    if (current.length >= 3 || (current.length && letters > 20)) flush();
    current.push(word);
    if (/[.,;:!?…]$/.test(word.w)) flush();
  }
  flush();
  // Cada bloque se queda en pantalla hasta que empieza el siguiente (sin parpadeos entre palabras).
  return chunks.map((chunk, index) => ({ ...chunk, e: round(Math.max(chunk.e, Math.min(chunks[index + 1]?.s ?? chunk.e + 0.4, chunk.e + 0.6))) }));
}

/** Tiempos de la escena: guardados de ElevenLabs o estimados sobre la duración del audio. */
export function sceneWords(scene: VideoScene, fps: number): WordTiming[] {
  const stored = wordTimingsSchema.safeParse(scene.content.wordTimings);
  if (stored.success && stored.data.length) return stored.data;
  const text = sceneText(scene, "voiceover");
  const seconds = typeof scene.content.audioDurationSeconds === "number" ? scene.content.audioDurationSeconds : scene.durationFrames / fps;
  return estimateWordTimings(text, seconds);
}

/**
 * Documento → spec con todo en segundos absolutos del video. Un cue que no aparece en la narración
 * cae en un punto razonable de la escena en vez de fallar: el plan nunca rompe el render.
 */
export function buildCanvasSpec(document: VideoDocument): CanvasSpec {
  let start = 0;
  const palette = (document.scenes[0]?.accent ?? ["#22d3ee", "#9be9f6"]) as [string, string];
  const scenes = document.scenes.map((scene, index): CanvasSceneSpec => {
    const duration = sceneTimelineFrames(document.scenes, index) / document.fps;
    const voiceAt = start + sceneLeadFrames(index) / document.fps;
    const local = sceneWords(scene, document.fps);
    const words = local.map((word) => ({ w: word.w, s: round(voiceAt + word.s), e: round(voiceAt + word.e) }));
    const voiceEnd = words.length ? words[words.length - 1].e : voiceAt + duration * 0.8;
    const span = Math.max(0.5, voiceEnd - voiceAt);
    const spread = (count: number, i: number, from = 0.05, to = 0.75) => from + (count > 1 ? (to - from) * i / (count - 1) : 0);
    const beats = sceneBeats(scene, index, document.scenes.length);
    // Dónde entra cada animación: su frase `from`, o un reparto parejo de la narración. Siempre en orden y con aire.
    const starts: number[] = [];
    beats.forEach((beat, k) => {
      if (!k) { starts.push(voiceAt); return; }
      const found = beat.from ? findCue(local, beat.from, starts[k - 1] - voiceAt + 0.5) : null;
      starts.push(round(Math.min(start + duration - 0.5, Math.max(starts[k - 1] + 1, found === null ? voiceAt + span * k / beats.length : voiceAt + found - 0.15))));
    });
    const resolvedBeats = beats.map((plan, k) => {
      const from = starts[k], to = starts[k + 1] ?? voiceEnd;
      // Instante de la frase (buscada desde que entra esta animación), o la fracción `fallback` de su tramo si no se dice.
      const at = (phrase: string | undefined, fallback: number) => {
        const found = phrase ? findCue(local, phrase, k ? Math.max(0, from - voiceAt - 0.3) : 0) : null;
        return round(found === null ? from + Math.max(0.5, to - from) * fallback : voiceAt + found);
      };
      let resolved: ResolvedPlan;
      switch (plan.template) {
        case "hook": resolved = { template: "hook", words: plan.words.map((word, i) => ({ text: word.text, at: at(word.cue, spread(plan.words.length, i, 0, 0.6)) })) }; break;
        case "flow": resolved = { template: "flow", sources: plan.sources, target: plan.target, shield: plan.shield ?? null, rate: plan.rate, outcome: plan.outcome, surgeAt: at(plan.cues.surge, 0.3), shieldAt: at(plan.cues.shield, 0.55), outcomeAt: at(plan.cues.outcome, 0.65) }; break;
        case "steps": resolved = { template: "steps", items: plan.items.map((item, i) => ({ label: item.label, at: at(item.cue, spread(plan.items.length, i)) })) }; break;
        case "compare": resolved = { template: "compare", left: { ...plan.left, unit: plan.left.unit ?? "" }, right: { ...plan.right, unit: plan.right.unit ?? "" }, at: at(plan.cue, 0.15) }; break;
        case "stat": resolved = { template: "stat", value: plan.value, decimals: plan.decimals, unit: plan.unit ?? "", label: plan.label, at: at(plan.cue, 0.1) }; break;
        case "list": resolved = { template: "list", icon: plan.icon, items: plan.items.map((item, i) => ({ text: item.text, at: at(item.cue, spread(plan.items.length, i)) })) }; break;
        case "timeline": resolved = { template: "timeline", events: plan.events.map((event, i) => ({ date: event.date, label: event.label, at: at(event.cue, spread(plan.events.length, i)) })) }; break;
        case "split": resolved = { template: "split", before: plan.before, after: plan.after, at: at(plan.cue, 0.45) }; break;
        case "chart": resolved = { template: "chart", kind: plan.kind, points: plan.points, unit: plan.unit ?? "", at: at(plan.cue, 0.1) }; break;
        case "network": resolved = { template: "network", shape: plan.shape, center: plan.center ?? null, nodes: plan.nodes.map((node, i) => ({ label: node.label, at: at(node.cue, spread(plan.nodes.length, i, 0.08, 0.75)) })) }; break;
        case "terminal": resolved = { template: "terminal", title: plan.title ?? "", lines: plan.lines.map((line, i) => ({ text: line.text, output: line.output, at: at(line.cue, spread(plan.lines.length, i)) })) }; break;
        case "funnel": resolved = { template: "funnel", unit: plan.unit ?? "", stages: plan.stages.map((stage, i) => ({ label: stage.label, value: stage.value ?? null, at: at(stage.cue, spread(plan.stages.length, i)) })) }; break;
        case "quote": resolved = { template: "quote", text: plan.text, author: plan.author ?? "", highlight: plan.highlight ?? "", at: at(plan.cue, 0.05) }; break;
        case "map": resolved = { template: "map", connect: plan.connect, points: plan.points.map((point, i) => ({ label: point.label, lat: point.lat, lon: point.lon, at: at(point.cue, spread(plan.points.length, i, 0.1, 0.75)) })) }; break;
        case "outro": resolved = { template: "outro", line: plan.line, cta: plan.cta ?? "", at: round(from) }; break;
        default: resolved = { template: "title", at: round(from) };
      }
      return { start: k ? from : round(start), end: round(starts[k + 1] ?? start + duration), plan: resolved };
    });
    const spec = { id: scene.id, start: round(start), duration: round(duration), voiceAt: round(voiceAt), voiceEnd: round(voiceEnd), title: sceneText(scene, "title") || sceneText(scene, "headline"), image: scene.imageAssetId ?? null, plan: resolvedBeats[0].plan, beats: resolvedBeats, captions: captionChunks(words) };
    start += duration;
    return spec;
  });
  return { width: document.width, height: document.height, duration: round(timelineTotalFrames(document.scenes) / document.fps), palette, title: document.title, scenes };
}

/* ----------------------------------------------------------------- catálogo */

export type CanvasTemplateInfo = {
  template: CanvasTemplate;
  name: string;
  /** Qué se ve en pantalla. */
  description: string;
  /** Cuándo elegirla. */
  useFor: string;
  /** Cuándo NO: los usos equivocados que la IA hacía (flujo para cualquier proceso, mapa sin lugares…). */
  avoid: string;
  /** Datos que la IA rellena. */
  fields: string[];
  /** Ejemplo completo: título, narración y plan con cues que se dicen en ella. */
  example: { title: string; voiceover: string; plan: CanvasScenePlan };
};

/**
 * Las plantillas del motor Canvas con un ejemplo que funciona: la biblioteca del Studio las muestra
 * en vivo con `sampleCanvasSpec` y la herramienta MCP `listar_animaciones` las describe.
 */
export const CANVAS_TEMPLATE_CATALOG: CanvasTemplateInfo[] = [
  {
    template: "hook", name: "Gancho", description: "Palabras gigantes que golpean una a una justo cuando se dicen, con onda de choque y temblor de cámara.",
    useFor: "La primera escena: 1 a 4 palabras o una cifra que la voz dice literalmente al arrancar y frenan el scroll.", avoid: "Fuera de la primera escena, o con palabras que la voz no dice.", fields: ["1 a 4 palabras (máx. 14 letras)", "cue de cada palabra"],
    example: { title: "El gancho", voiceover: "Un millón de peticiones por segundo. Así se tumba un servidor.", plan: { template: "hook", words: [{ text: "1 millón", cue: "millón" }, { text: "peticiones", cue: "peticiones" }, { text: "por segundo", cue: "segundo" }] } },
  },
  {
    template: "flow", name: "Flujo", description: "Grupos de emisores mandan paquetes a un destino; el tráfico se dispara, un escudo opcional filtra y se ve el desenlace (aguanta, se cae o se bloquea).",
    useFor: "Tráfico real de muchos emisores a un destino que aguanta, se satura o se bloquea: peticiones a un servidor, ataques, colas de pedidos.", avoid: "Procesos, ideas, relaciones o cualquier «flujo» metafórico (dinero, información, emociones).", fields: ["1 a 3 emisores con etiqueta y cantidad", "destino", "escudo (opcional)", "ritmo: calm, busy o flood", "desenlace: ok, overload o blocked", "cues: surge, shield, outcome"],
    example: { title: "Así funciona un DDoS", voiceover: "Miles de bots envían tráfico al mismo servidor. De repente el tráfico se dispara y el servidor se cae.", plan: { template: "flow", sources: [{ label: "Bots", count: 40 }, { label: "Usuarios", count: 6 }], target: "Servidor web", rate: "flood", outcome: "overload", cues: { surge: "dispara", outcome: "cae" } } },
  },
  {
    template: "steps", name: "Pasos", description: "Una línea de tiempo vertical; cada paso se enciende y el riel avanza al nombrarlo.",
    useFor: "Un proceso con orden real (primero, luego, al final) de 2 a 4 pasos que la voz nombra.", avoid: "Cosas sin orden (eso es list), fechas (timeline) o un único paso.", fields: ["2 a 4 pasos (máx. 36 letras)", "cue de cada paso"],
    example: { title: "Cómo se defiende", voiceover: "Primero detectas el pico, luego filtras en el borde y por último escalas tus servidores.", plan: { template: "steps", items: [{ label: "Detectar el pico", cue: "detectas" }, { label: "Filtrar en el borde", cue: "filtras" }, { label: "Escalar servidores", cue: "escalas" }] } },
  },
  {
    template: "compare", name: "Comparación", description: "Dos barras que crecen hasta su valor con la cifra contando encima; si la diferencia es grande, remata con «×N».",
    useFor: "Exactamente dos cifras reales, en la misma unidad, que la voz dice: normal contra extremo, antes contra ahora.", avoid: "Contrastes sin números (split), más de dos valores (chart) o cifras inventadas o «ilustrativas».", fields: ["izquierda y derecha: etiqueta, valor y unidad", "cue"],
    example: { title: "Normal contra ataque", voiceover: "Un sitio normal recibe mil doscientas peticiones por segundo. Durante el ataque llegan casi un millón.", plan: { template: "compare", left: { label: "Normal", value: 1200, unit: "req/s" }, right: { label: "Ataque", value: 950000, unit: "req/s" }, cue: "ataque" } },
  },
  {
    template: "stat", name: "Cifra", description: "Un número enorme que cuenta desde cero hasta su valor, con una regla que se llena al ritmo del conteo.",
    useFor: "Una sola cifra real y concreta que la voz dice y que impresiona por sí sola.", avoid: "Cifras aproximadas o inventadas, porcentajes de relleno o cuando hay dos cifras (compare).", fields: ["valor, decimales y unidad", "etiqueta", "cue"],
    example: { title: "El récord", voiceover: "El mayor ataque registrado llegó a tres coma cuarenta y siete terabits por segundo.", plan: { template: "stat", value: 3.47, decimals: 2, unit: "Tbps", label: "El mayor ataque registrado", cue: "tres" } },
  },
  {
    template: "list", name: "Lista", description: "Puntos que aparecen con su marca (check, cruz o punto) cuando se nombran.",
    useFor: "2 a 4 elementos paralelos sin orden que la voz nombra: consejos (check), errores o mitos (cross), rasgos (dot).", avoid: "Cifras (stat, compare o chart: un número se cuenta, no se enumera), pasos con orden (steps), un solo punto o frases largas que no caben.", fields: ["icono: check, cross o dot", "2 a 4 puntos (máx. 40 letras)", "cue de cada punto"],
    example: { title: "Checklist", voiceover: "Revisa tres cosas: que tengas un CDN, límites de peticiones y alertas de tráfico.", plan: { template: "list", icon: "check", items: [{ text: "Usa un CDN", cue: "CDN" }, { text: "Límites de peticiones", cue: "límites" }, { text: "Alertas de tráfico", cue: "alertas" }] } },
  },
  {
    template: "timeline", name: "Línea de tiempo", description: "Una línea horizontal por la que la cámara avanza: cada fecha se enciende y muestra su hito justo cuando se nombra.",
    useFor: "2 a 5 fechas o años reales que la voz dice, en orden cronológico.", avoid: "Pasos sin fecha (steps) o fechas inventadas.", fields: ["2 a 5 hitos: fecha (máx. 12 letras) y texto (máx. 40)", "cue de cada hito"],
    example: { title: "La historia de los DDoS", voiceover: "En mil novecientos noventa y seis cayó el primer proveedor. En dos mil dieciséis Mirai usó cámaras. Y en dos mil veinte ya se medían en terabits.", plan: { template: "timeline", events: [{ date: "1996", label: "Cae el primer proveedor", cue: "noventa" }, { date: "2016", label: "Mirai usa cámaras", cue: "dieciséis" }, { date: "2020", label: "Ataques de terabits", cue: "veinte" }] } },
  },
  {
    template: "split", name: "Antes / después", description: "Pantalla partida: primero el «antes» con cruces y, al decir el cue, entra el «después» con checks y el antes se apaga.",
    useFor: "Un contraste cualitativo con dos estados opuestos: sin/con, antes/después, mito/realidad, error/solución.", avoid: "Dos cifras (compare) o cuando no hay dos estados que se opongan.", fields: ["antes y después: etiqueta (máx. 20) y 1 a 3 puntos (máx. 30)", "cue del después"],
    example: { title: "Sin protección y con ella", voiceover: "Sin protección, el sitio se cae y pierdes clientes. Con un CDN, el tráfico se reparte y todo sigue en pie.", plan: { template: "split", before: { label: "Sin protección", items: ["El sitio se cae", "Pierdes clientes"] }, after: { label: "Con CDN", items: ["Tráfico repartido", "Todo sigue en pie"] }, cue: "CDN" } },
  },
  {
    template: "chart", name: "Gráfica", description: "Una gráfica de línea que se traza de izquierda a derecha o barras que crecen una tras otra, con su valor encima y el máximo resaltado.",
    useFor: "3 a 8 valores reales de una misma serie que la voz dice: crecimiento mes a mes, cifras por categoría.", avoid: "Menos de 3 valores o valores inventados para «dibujar» una tendencia.", fields: ["tipo: line o bar", "3 a 8 puntos: etiqueta (máx. 10) y valor", "unidad (opcional)", "cue"],
    example: { title: "Así crece una cuenta", voiceover: "En enero tenías cien seguidores, en febrero trescientos, en marzo ochocientos y en abril dos mil.", plan: { template: "chart", kind: "line", points: [{ label: "Ene", value: 100 }, { label: "Feb", value: 300 }, { label: "Mar", value: 800 }, { label: "Abr", value: 2000 }], cue: "enero" } },
  },
  {
    template: "network", name: "Red de nodos", description: "Nodos que se encienden y se conectan al nombrarlos, desde un centro (hub) o uno tras otro (chain), con pulsos viajando por las conexiones.",
    useFor: "Entidades que de verdad se conectan o se propagan y la voz nombra: dispositivos infectados, personas que contagian, servicios que se llaman entre sí.", avoid: "Conceptos sueltos o una lista disfrazada de nodos.", fields: ["forma: hub o chain", "centro (opcional, para hub)", "2 a 6 nodos (máx. 18 letras)", "cue de cada nodo"],
    example: { title: "Cómo se arma una botnet", voiceover: "Todo empieza en un servidor de control. Infecta una cámara, luego un router, después una impresora y al final miles de dispositivos.", plan: { template: "network", shape: "hub", center: "Control", nodes: [{ label: "Cámara", cue: "cámara" }, { label: "Router", cue: "router" }, { label: "Impresora", cue: "impresora" }, { label: "Miles más", cue: "miles" }] } },
  },
  {
    template: "terminal", name: "Terminal", description: "Una ventana de terminal donde cada comando se escribe letra a letra al nombrarlo y las salidas aparecen de golpe.",
    useFor: "Temas de software, servidores o seguridad con comandos o registros reales y plausibles que la voz menciona.", avoid: "Temas no técnicos o «comandos» inventados como metáfora.", fields: ["título de la ventana (opcional)", "2 a 5 líneas (máx. 40): comando o salida", "cue de cada línea"],
    example: { title: "Revisa tu servidor", voiceover: "Primero miras quién está conectado. Luego revisas los registros y ves miles de peticiones.", plan: { template: "terminal", title: "servidor-web", lines: [{ text: "who", output: false, cue: "conectado" }, { text: "tail -f /var/log/nginx/access.log", output: false, cue: "registros" }, { text: "12.430 peticiones en 10 s", output: true, cue: "miles" }] } },
  },
  {
    template: "funnel", name: "Embudo", description: "Etapas apiladas que se estrechan hacia abajo; cada una entra al nombrarla con su cifra contando.",
    useFor: "3 a 5 etapas donde la cantidad de verdad se reduce: visitas → clientes, candidatos → elegidos.", avoid: "Pasos que no reducen nada (steps) o etapas sin relación de cantidad.", fields: ["3 a 5 etapas: etiqueta (máx. 24) y valor opcional", "unidad (opcional)", "cue de cada etapa"],
    example: { title: "De vista a cliente", voiceover: "De diez mil personas que ven tu video, mil visitan tu perfil, doscientas te siguen y veinte compran.", plan: { template: "funnel", stages: [{ label: "Ven el video", value: 10000, cue: "ven" }, { label: "Visitan el perfil", value: 1000, cue: "visitan" }, { label: "Te siguen", value: 200, cue: "siguen" }, { label: "Compran", value: 20, cue: "compran" }] } },
  },
  {
    template: "quote", name: "Cita destacada", description: "Una frase grande entre comillas que entra línea a línea, con una parte resaltada en color y el autor debajo.",
    useFor: "Una cita real con autor verificable, o la frase clave del video sin autor.", avoid: "Autores inventados o atribuciones dudosas.", fields: ["frase (máx. 140)", "autor (opcional)", "parte resaltada, copiada de la frase (opcional)", "cue"],
    example: { title: "Una idea clave", voiceover: "Como dijo Bruce Schneier, la seguridad es un proceso, no un producto.", plan: { template: "quote", text: "La seguridad es un proceso, no un producto.", author: "Bruce Schneier", highlight: "un proceso", cue: "seguridad" } },
  },
  {
    template: "map", name: "Mapa", description: "Un mapa del mundo hecho de puntos; cada lugar se enciende con un pulso al nombrarlo y, si se pide, un arco lo une con el anterior.",
    useFor: "La voz nombra lugares reales (países, ciudades) y dónde pasa importa: orígenes, rutas, alcance.", avoid: "Temas sin geografía o un «global» genérico sin lugares concretos.", fields: ["1 a 5 lugares: etiqueta (máx. 18), latitud y longitud", "unir con arcos (sí/no)", "cue de cada lugar"],
    example: { title: "El viaje de un paquete", voiceover: "Tu mensaje sale de Madrid, pasa por Frankfurt y llega a Singapur en menos de un segundo.", plan: { template: "map", connect: true, points: [{ label: "Madrid", lat: 40.4, lon: -3.7, cue: "Madrid" }, { label: "Frankfurt", lat: 50.1, lon: 8.7, cue: "Frankfurt" }, { label: "Singapur", lat: 1.35, lon: 103.8, cue: "Singapur" }] } },
  },
  {
    template: "outro", name: "Cierre", description: "La frase final entra línea a línea y aparece una llamada a la acción en una pastilla.",
    useFor: "Solo la última escena: la idea final y la llamada a la acción.", avoid: "Cualquier escena que no sea la última.", fields: ["frase (máx. 40 letras)", "llamada a la acción (opcional)"],
    example: { title: "Cierre", voiceover: "Ahora ya sabes cómo tumban un servidor. Sígueme para más.", plan: { template: "outro", line: "Ahora ya sabes cómo tumban un servidor", cta: "Sígueme para más" } },
  },
  {
    template: "title", name: "Título", description: "El título de la escena en grande, revelado línea a línea. Es el respaldo cuando no hay plan.",
    useFor: "Último recurso: transiciones o escenas donde ninguna animación encaja limpia.", avoid: "Escenas con cifras, fechas, pasos o contrastes que mostrar.", fields: ["ninguno: usa el título de la escena"],
    example: { title: "Qué es un DDoS", voiceover: "Pero antes, qué es exactamente un ataque de denegación de servicio.", plan: { template: "title" } },
  },
];

/** Spec de una sola escena con el ejemplo de la plantilla: la misma cuenta que un video real. */
export function sampleCanvasSpec(template: CanvasTemplate, palette: [string, string] = ["#22d3ee", "#9be9f6"]): CanvasSpec {
  const info = CANVAS_TEMPLATE_CATALOG.find((item) => item.template === template) ?? CANVAS_TEMPLATE_CATALOG[0];
  const seconds = info.example.voiceover.split(/\s+/).length / 2.4 + 0.6;
  return buildCanvasSpec({
    schemaVersion: 1, slug: `demo-${template}`, templateId: "explainer", title: info.example.title, niche: "general", hookStyle: "curiosity", targetDurationSeconds: 15,
    width: 1080, height: 1920, fps: 30,
    scenes: [{ id: `demo-${template}`, kind: "explainer", durationFrames: Math.ceil(seconds * 30), accent: palette, content: { title: info.example.title, voiceover: info.example.voiceover, canvas: info.example.plan } }],
  } as VideoDocument);
}
