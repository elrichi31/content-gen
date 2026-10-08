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

export const CANVAS_TEMPLATES = ["hook", "flow", "steps", "compare", "stat", "list", "outro", "title"] as const;
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
    case "compare": case "stat": return { ...plan, cue: keep(plan.cue) };
    default: return plan;
  }
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
  | { template: "outro"; line: string; cta: string; at: number }
  | { template: "title"; at: number };

/** `image`: asset de la foto de fondo de la escena (videos con imágenes), o `null`. */
export type CanvasSceneSpec = { id: string; start: number; duration: number; voiceAt: number; voiceEnd: number; title: string; image: string | null; plan: ResolvedPlan; captions: CaptionChunk[] };
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
    // Instante de la frase, o la fracción `fallback` de la narración si no se dice.
    const at = (phrase: string | undefined, fallback: number, after = 0) => {
      const found = phrase ? findCue(local, phrase, after) : null;
      return round(found === null ? voiceAt + span * fallback : voiceAt + found);
    };
    const spread = (count: number, i: number, from = 0.05, to = 0.75) => from + (count > 1 ? (to - from) * i / (count - 1) : 0);
    const plan = scenePlan(scene, index, document.scenes.length);
    let resolved: ResolvedPlan;
    switch (plan.template) {
      case "hook": resolved = { template: "hook", words: plan.words.map((word, i) => ({ text: word.text, at: at(word.cue, spread(plan.words.length, i, 0, 0.6)) })) }; break;
      case "flow": resolved = { template: "flow", sources: plan.sources, target: plan.target, shield: plan.shield ?? null, rate: plan.rate, outcome: plan.outcome, surgeAt: at(plan.cues.surge, 0.3), shieldAt: at(plan.cues.shield, 0.55), outcomeAt: at(plan.cues.outcome, 0.65) }; break;
      case "steps": resolved = { template: "steps", items: plan.items.map((item, i) => ({ label: item.label, at: at(item.cue, spread(plan.items.length, i)) })) }; break;
      case "compare": resolved = { template: "compare", left: { ...plan.left, unit: plan.left.unit ?? "" }, right: { ...plan.right, unit: plan.right.unit ?? "" }, at: at(plan.cue, 0.15) }; break;
      case "stat": resolved = { template: "stat", value: plan.value, decimals: plan.decimals, unit: plan.unit ?? "", label: plan.label, at: at(plan.cue, 0.1) }; break;
      case "list": resolved = { template: "list", icon: plan.icon, items: plan.items.map((item, i) => ({ text: item.text, at: at(item.cue, spread(plan.items.length, i)) })) }; break;
      case "outro": resolved = { template: "outro", line: plan.line, cta: plan.cta ?? "", at: round(voiceAt) }; break;
      default: resolved = { template: "title", at: round(voiceAt) };
    }
    const spec = { id: scene.id, start: round(start), duration: round(duration), voiceAt: round(voiceAt), voiceEnd: round(voiceEnd), title: sceneText(scene, "title"), image: scene.imageAssetId ?? null, plan: resolved, captions: captionChunks(words) };
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
    useFor: "El arranque del video: una cifra o frase que frene el scroll.", fields: ["1 a 4 palabras (máx. 14 letras)", "cue de cada palabra"],
    example: { title: "El gancho", voiceover: "Un millón de peticiones por segundo. Así se tumba un servidor.", plan: { template: "hook", words: [{ text: "1 millón", cue: "millón" }, { text: "peticiones", cue: "peticiones" }, { text: "por segundo", cue: "segundo" }] } },
  },
  {
    template: "flow", name: "Flujo", description: "Grupos de emisores mandan paquetes a un destino; el tráfico se dispara, un escudo opcional filtra y se ve el desenlace (aguanta, se cae o se bloquea).",
    useFor: "Redes, ataques, APIs, colas: cualquier cosa que viaje de muchos a uno.", fields: ["1 a 3 emisores con etiqueta y cantidad", "destino", "escudo (opcional)", "ritmo: calm, busy o flood", "desenlace: ok, overload o blocked", "cues: surge, shield, outcome"],
    example: { title: "Así funciona un DDoS", voiceover: "Miles de bots envían tráfico al mismo servidor. De repente el tráfico se dispara y el servidor se cae.", plan: { template: "flow", sources: [{ label: "Bots", count: 40 }, { label: "Usuarios", count: 6 }], target: "Servidor web", rate: "flood", outcome: "overload", cues: { surge: "dispara", outcome: "cae" } } },
  },
  {
    template: "steps", name: "Pasos", description: "Una línea de tiempo vertical; cada paso se enciende y el riel avanza al nombrarlo.",
    useFor: "Procesos en orden: cómo se hace, cómo funciona por fases.", fields: ["2 a 4 pasos (máx. 36 letras)", "cue de cada paso"],
    example: { title: "Cómo se defiende", voiceover: "Primero detectas el pico, luego filtras en el borde y por último escalas tus servidores.", plan: { template: "steps", items: [{ label: "Detectar el pico", cue: "detectas" }, { label: "Filtrar en el borde", cue: "filtras" }, { label: "Escalar servidores", cue: "escalas" }] } },
  },
  {
    template: "compare", name: "Comparación", description: "Dos barras que crecen hasta su valor con la cifra contando encima; si la diferencia es grande, remata con «×N».",
    useFor: "Antes y después, normal contra extremo, A contra B con números.", fields: ["izquierda y derecha: etiqueta, valor y unidad", "cue"],
    example: { title: "Normal contra ataque", voiceover: "Un sitio normal recibe mil doscientas peticiones por segundo. Durante el ataque llegan casi un millón.", plan: { template: "compare", left: { label: "Normal", value: 1200, unit: "req/s" }, right: { label: "Ataque", value: 950000, unit: "req/s" }, cue: "ataque" } },
  },
  {
    template: "stat", name: "Cifra", description: "Un número enorme que cuenta desde cero hasta su valor, con una regla que se llena al ritmo del conteo.",
    useFor: "Un dato que impresiona por sí solo.", fields: ["valor, decimales y unidad", "etiqueta", "cue"],
    example: { title: "El récord", voiceover: "El mayor ataque registrado llegó a tres coma cuarenta y siete terabits por segundo.", plan: { template: "stat", value: 3.47, decimals: 2, unit: "Tbps", label: "El mayor ataque registrado", cue: "tres" } },
  },
  {
    template: "list", name: "Lista", description: "Puntos que aparecen con su marca (check, cruz o punto) cuando se nombran.",
    useFor: "Recomendaciones (check), errores o mitos (cruz), enumeraciones (punto).", fields: ["icono: check, cross o dot", "2 a 4 puntos (máx. 40 letras)", "cue de cada punto"],
    example: { title: "Checklist", voiceover: "Revisa tres cosas: que tengas un CDN, límites de peticiones y alertas de tráfico.", plan: { template: "list", icon: "check", items: [{ text: "Usa un CDN", cue: "CDN" }, { text: "Límites de peticiones", cue: "límites" }, { text: "Alertas de tráfico", cue: "alertas" }] } },
  },
  {
    template: "outro", name: "Cierre", description: "La frase final entra línea a línea y aparece una llamada a la acción en una pastilla.",
    useFor: "La última escena.", fields: ["frase (máx. 40 letras)", "llamada a la acción (opcional)"],
    example: { title: "Cierre", voiceover: "Ahora ya sabes cómo tumban un servidor. Sígueme para más.", plan: { template: "outro", line: "Ahora ya sabes cómo tumban un servidor", cta: "Sígueme para más" } },
  },
  {
    template: "title", name: "Título", description: "El título de la escena en grande, revelado línea a línea. Es el respaldo cuando no hay plan.",
    useFor: "Transiciones de tema o escenas donde la foto cuenta la historia.", fields: ["ninguno: usa el título de la escena"],
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
