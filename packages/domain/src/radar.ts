import { z } from "zod";
import { isoDate } from "./analytics.ts";
import { costSchema, usageSchema } from "./cost.ts";
import { slugify } from "./article.ts";

/**
 * Radar de contenido: busca en la web lo que se mueve en los verticales que vende la agencia y
 * devuelve **temas** revisables, no piezas. La conversión a carrusel, video o artículo la decide
 * una persona (D-01 de PLAN_RADAR.md).
 */

const id = z.string().min(1);
const timestamp = z.string().datetime();
const schemaVersion = z.literal(1);

export const RADAR_FORMATS = ["carousel", "video", "article"] as const;
export type RadarFormat = (typeof RADAR_FORMATS)[number];

/** `nuevo` es lo que sale de la corrida; el resto lo decide la persona que revisa. */
export const RADAR_TOPIC_STATUSES = ["nuevo", "guardado", "descartado", "usado"] as const;
export type RadarTopicStatus = (typeof RADAR_TOPIC_STATUSES)[number];

export const RADAR_RUN_STATUSES = ["running", "completed", "failed", "skipped"] as const;

/** De dónde salió el tema. `search-console` llega en F6; el campo existe desde ya para no migrar. */
export const RADAR_ORIGINS = ["web", "search-console"] as const;

/* ------------------------------ Vigilancia ------------------------------ */

/**
 * Un vertical vigilado. Vive en tabla y no en el prompt: cuando la agencia añade un servicio se
 * añade una fila, no se toca código (D-08).
 */
export const radarWatchlistSchema = z.object({
  id,
  schemaVersion,
  vertical: z.string().trim().min(2).max(80),
  /** Qué vende la agencia en este vertical: es lo que ancla el tema a algo vendible. */
  offering: z.string().trim().min(3).max(600),
  audience: z.string().trim().max(200).default("PyMEs de Latinoamérica"),
  /**
   * Marca a la que pertenece el vertical. Nulo significa que es de la agencia. Cuando apunta a
   * una marca, la investigación hereda su giro y su propuesta sin repetirlos aquí.
   */
  brandKitId: id.nullable().default(null),
  active: z.boolean().default(true),
  /** Orden de atención cuando hay que recortar la corrida por presupuesto. */
  priority: z.number().int().min(1).max(10).default(5),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type RadarWatchlistEntry = z.infer<typeof radarWatchlistSchema>;

/* -------------------------------- Corrida -------------------------------- */

export const radarRunSchema = z.object({
  id,
  schemaVersion,
  status: z.enum(RADAR_RUN_STATUSES),
  startedAt: timestamp,
  completedAt: timestamp.nullable().default(null),
  /** Verticales que se investigaron de verdad, no los configurados. */
  verticals: z.array(z.string().min(1)).default([]),
  /** Antigüedad máxima admitida para los hechos, en días. */
  windowDays: z.number().int().min(1).max(90).default(7),
  /**
   * Notas crudas de la investigación, tal como salieron del modelo, con sus fuentes.
   *
   * Es lo que permite separar **recolectar** de **interpretar**: buscar cuesta el 80% de la
   * corrida, así que una vez pagado se conserva y se puede volver a interpretar con otro modelo
   * cuantas veces haga falta, gratis en términos de búsqueda.
   */
  research: z.array(z.object({
    vertical: z.string().min(1),
    notes: z.string(),
    sources: z.array(z.object({ url: z.string(), title: z.string() })).default([]),
    model: z.string().nullable().default(null),
  })).default([]),
  topicsFound: z.number().int().nonnegative().default(0),
  topicsKept: z.number().int().nonnegative().default(0),
  error: z.string().max(1000).nullable().default(null),
  usage: usageSchema.nullable().default(null),
  cost: costSchema.nullable().default(null),
});
export type RadarRun = z.infer<typeof radarRunSchema>;

/* --------------------------------- Tema --------------------------------- */

export const radarEvidenceSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1).max(300),
  /** Sin fecha comprobada se deja nulo: inventarla sería peor que no tenerla. */
  publishedAt: isoDate.nullable().default(null),
});
export type RadarEvidence = z.infer<typeof radarEvidenceSchema>;

export const radarFormatSuggestionSchema = z.object({
  type: z.enum(RADAR_FORMATS),
  reason: z.string().trim().min(3).max(600),
  /** Gancho de apertura: primera slide o primeros segundos. Solo aplica a carrusel y video. */
  hook: z.string().trim().max(300).nullable().default(null),
  /** Palabra clave objetivo e intención de búsqueda; solo aplican al artículo. */
  keyword: z.string().trim().max(160).nullable().default(null),
  intent: z.string().trim().max(80).nullable().default(null),
});

export const radarTopicSchema = z.object({
  id,
  schemaVersion,
  runId: id,
  vertical: z.string().trim().min(2).max(80),
  status: z.enum(RADAR_TOPIC_STATUSES).default("nuevo"),
  origin: z.enum(RADAR_ORIGINS).default("web"),
  /** Se recalcula al normalizar: no es opinión del modelo. */
  score: z.number().min(0).max(100).default(0),
  fingerprint: z.string().min(1).max(300),
  title: z.string().trim().min(4).max(200),
  whyNow: z.string().trim().min(10).max(1000),
  angleForAgency: z.string().trim().min(10).max(1000),
  evidence: z.array(radarEvidenceSchema).default([]),
  formats: z.array(radarFormatSuggestionSchema).min(1),
  shelfLife: z.enum(["perecedero", "evergreen"]).default("perecedero"),
  confidence: z.number().min(0).max(1).default(0.5),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type RadarTopic = z.infer<typeof radarTopicSchema>;

/* ---------------------------- Deduplicación ---------------------------- */

/**
 * Palabras que aparecen en cualquier titular y no distinguen un tema de otro. Sin quitarlas, dos
 * noticias distintas comparten demasiado y la huella deja de discriminar.
 */
const STOPWORDS = new Set([
  "para", "como", "este", "esta", "esto", "estos", "estas", "sobre", "desde", "hasta", "entre",
  "cuando", "donde", "porque", "pero", "sino", "todo", "toda", "todos", "todas", "otro", "otra",
  "mas", "menos", "muy", "cada", "segun", "tras", "ante", "bajo", "contra", "durante", "mediante",
  "the", "and", "for", "with", "from", "that", "this", "your", "you", "are", "was", "were",
  "nuevo", "nueva", "nuevos", "nuevas", "mejor", "mejores", "guia", "claves", "consejos",
]);

/**
 * Cuántas fuentes **independientes** respaldan el tema. Dos enlaces del mismo medio no son dos
 * confirmaciones: son la misma noticia dos veces. Corroborar exige medios distintos.
 */
export function independentSources(evidence: { url: string }[] = []) {
  return new Set(evidence.map((item) => hostOf(item.url))).size;
}

/** Hostname sin `www`; si la URL no es analizable se conserva el texto para no perder la señal. */
function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.trim().toLowerCase(); }
}

/**
 * Longitud a la que se recorta cada palabra. Absorbe la variación que más duplica en la práctica
 * —el plural— sin fundir palabras distintas: «hospital» y «hospitales» comparten raíz, «seguridad»
 * y «servidor» no.
 */
const STEM_LENGTH = 5;

/**
 * Huella de deduplicación. Combina las raíces de las palabras significativas del titular
 * —ordenadas, para que reformularlo no genere un tema nuevo— con los dominios que lo respaldan.
 *
 * Es deliberadamente legible en vez de un hash: cuando dos temas colisionan sin deberlo, se ve
 * por qué mirando la propia huella.
 *
 * Lo que **no** cubre: la derivación entre familias de palabras («ataca» frente a «ataque»). Ese
 * caso se le escapa y el tema entra repetido; para eso está la memoria de titulares recientes que
 * se le pasa al modelo, que sí razona sobre el significado.
 */
export function topicFingerprint({ title, evidence = [] }: { title: string; evidence?: { url: string }[] }) {
  const words = [...new Set(
    slugify(title)
      .split("-")
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
      .map((word) => word.slice(0, STEM_LENGTH)),
  )].sort().slice(0, 8);
  const hosts = [...new Set(evidence.map((item) => hostOf(item.url)))].sort().slice(0, 3);
  // Sin palabras significativas la huella caería en la cadena vacía y colisionaría con cualquiera:
  // el título completo, aunque sea largo, distingue mejor que nada.
  const subject = words.length ? words.join("-") : slugify(title) || "sin-titulo";
  return `${subject}|${hosts.join(",")}`.slice(0, 300);
}

/**
 * Separa lo nuevo de lo ya visto. Devuelve ambas listas porque saber cuántos temas se repitieron
 * es la señal de que la corrida está aportando poco.
 */
export function dedupeTopics<T extends { fingerprint: string }>(topics: T[], { known = [] }: { known?: string[] } = {}) {
  const seen = new Set(known);
  const fresh: T[] = [];
  const repeated: T[] = [];
  for (const topic of topics) {
    if (seen.has(topic.fingerprint)) { repeated.push(topic); continue; }
    seen.add(topic.fingerprint);
    fresh.push(topic);
  }
  return { fresh, repeated };
}

/* ------------------------------ Puntuación ------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(date: string, today: Date) {
  const published = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(published)) return null;
  return Math.floor((Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`) - published) / DAY_MS);
}

/**
 * Puntuación de 0 a 100 para ordenar la revisión. No decide nada: solo pone arriba lo que más
 * probablemente merezca el tiempo de mirarlo.
 *
 * Pesa cuatro cosas: cuánto se fía el modelo, si hay fuentes y cuántas, cuán recientes son, y si
 * el tema caduca. Un tema perecedero de hace tres semanas ya no vale lo mismo que uno de ayer.
 */
export function scoreTopic(topic: { confidence: number; evidence?: { url: string; publishedAt: string | null }[]; shelfLife?: "perecedero" | "evergreen" }, { today = new Date() }: { today?: Date } = {}) {
  const evidence = topic.evidence ?? [];
  // Sin fuentes no hay tema verificable: el techo baja mucho por mucha confianza que declare.
  if (!evidence.length) return Math.round(Math.max(0, Math.min(1, topic.confidence)) * 25);

  const confidence = Math.max(0, Math.min(1, topic.confidence)) * 45;
  // Se cuentan medios distintos, no enlaces: tres notas del mismo sitio no corroboran nada.
  const support = Math.min(independentSources(evidence), 3) / 3 * 20;

  const ages = evidence.map((item) => (item.publishedAt ? daysSince(item.publishedAt, today) : null)).filter((age): age is number => age !== null && age >= 0);
  // Sin fechas comprobadas se puntúa la frescura por la mitad: no se premia ni se castiga.
  const freshness = ages.length ? Math.max(0, 1 - Math.min(...ages) / 30) * 25 : 12.5;

  // Lo evergreen no pierde valor con el tiempo, así que no arrastra la penalización de frescura.
  const durability = topic.shelfLife === "evergreen" ? 10 : Math.max(0, 1 - (ages.length ? Math.min(...ages) : 15) / 60) * 10;

  return Math.max(0, Math.min(100, Math.round(confidence + support + freshness + durability)));
}

/* ------------------------------- Estados ------------------------------- */

/**
 * Transiciones permitidas. `descartado` no es terminal a propósito: rescatar un tema descartado
 * por error debe ser posible sin tocar la base a mano.
 */
const TRANSITIONS: Record<RadarTopicStatus, RadarTopicStatus[]> = {
  nuevo: ["guardado", "descartado", "usado"],
  guardado: ["usado", "descartado", "nuevo"],
  descartado: ["nuevo", "guardado"],
  // Un tema ya usado se puede volver a guardar para otro formato, pero no vuelve a «nuevo»:
  // reaparecería en la revisión como si nadie lo hubiera visto.
  usado: ["guardado"],
};

export function canTransition(from: RadarTopicStatus, to: RadarTopicStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

/* ------------------------- Contrato con la IA ------------------------- */

/** Lo que se le exige al modelo. Se valida al normalizar: no se confía en que lo cumpla. */
export const generatedTopicSchema = z.object({
  title: z.string().trim().min(4),
  why_now: z.string().trim().min(10),
  vertical: z.string().trim().min(2),
  angle_for_agency: z.string().trim().min(10),
  evidence: z.array(z.object({
    url: z.string().trim().min(1),
    title: z.string().trim().min(1),
    published_at: z.string().trim().nullish(),
  })).default([]),
  formats: z.array(z.object({
    type: z.string().trim().min(1),
    reason: z.string().trim().min(3),
    hook: z.string().trim().nullish(),
    keyword: z.string().trim().nullish(),
    intent: z.string().trim().nullish(),
  })).min(1),
  shelf_life: z.string().trim().nullish(),
  confidence: z.number().nullish(),
});

export class RadarTopicError extends Error {}

function trim(value: string | null | undefined, max: number) {
  const text = value?.trim();
  return text ? text.slice(0, max) : null;
}

/**
 * Convierte un tema del modelo en uno del sistema. La huella, la puntuación, el estado y las
 * fechas los pone la aplicación: son datos del sistema, no opinión de la IA.
 */
export function normalizeGeneratedTopic(value: unknown, { runId, vertical, now = new Date().toISOString(), today = new Date(), makeId, minSources = 0 }: { runId: string; vertical: string; now?: string; today?: Date; makeId: () => string; minSources?: number }): RadarTopic {
  const parsed = generatedTopicSchema.safeParse(value);
  if (!parsed.success) throw new RadarTopicError(`El tema no es utilizable: falta ${parsed.error.issues[0]?.path.join(".") || "contenido"}.`);
  const generated = parsed.data;

  // Solo se conservan las fuentes con URL válida: una cita que no se puede abrir no es evidencia.
  const evidence = generated.evidence.flatMap((item) => {
    const url = item.url.trim();
    if (!/^https?:\/\//i.test(url)) return [];
    const publishedAt = item.published_at?.trim();
    return [{
      url,
      title: item.title.trim().slice(0, 300),
      publishedAt: publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ? publishedAt : null,
    }];
  });

  const formats = generated.formats.flatMap((format) => {
    const type = format.type.trim().toLowerCase();
    if (!RADAR_FORMATS.includes(type as RadarFormat)) return [];
    return [{
      type: type as RadarFormat,
      reason: format.reason.trim().slice(0, 600),
      hook: trim(format.hook, 300),
      keyword: trim(format.keyword, 160),
      intent: trim(format.intent, 80),
    }];
  });
  if (!formats.length) throw new RadarTopicError("El tema no propone ningún formato conocido (carousel, video o article).");

  // Corroboración: un tema respaldado por un solo medio no se puede contrastar, y publicar sobre
  // él es asumir que ese medio no se equivocó. Se rechaza antes de llegar a la revisión.
  const independent = independentSources(evidence);
  if (independent < minSources) {
    throw new RadarTopicError(`«${generated.title.trim().slice(0, 80)}» solo tiene ${independent} fuente(s) independiente(s); se exigen ${minSources}.`);
  }

  const confidence = typeof generated.confidence === "number" && Number.isFinite(generated.confidence)
    ? Math.max(0, Math.min(1, generated.confidence))
    : 0.5;
  const shelfLife = generated.shelf_life?.trim().toLowerCase() === "evergreen" ? "evergreen" as const : "perecedero" as const;
  const title = generated.title.trim().slice(0, 200);

  return radarTopicSchema.parse({
    id: makeId(),
    schemaVersion: 1,
    runId,
    // El vertical lo fija quien lanzó la búsqueda, no el modelo: si se equivoca de etiqueta, el
    // tema desaparecería del filtro por el que se buscó.
    vertical,
    status: "nuevo",
    origin: "web",
    score: scoreTopic({ confidence, evidence, shelfLife }, { today }),
    fingerprint: topicFingerprint({ title, evidence }),
    title,
    whyNow: generated.why_now.trim().slice(0, 1000),
    angleForAgency: generated.angle_for_agency.trim().slice(0, 1000),
    evidence,
    formats,
    shelfLife,
    confidence,
    createdAt: now,
    updatedAt: now,
  });
}

/* ------------------------- Del tema a la pieza ------------------------- */

/**
 * Convierte un tema del radar en el encargo que espera cada generador.
 *
 * Vive aquí, y no en la pantalla, porque es la traducción que decide qué sabe el generador sobre
 * el tema: si se pierde el «por qué ahora» o las fuentes, la pieza sale genérica y el trabajo del
 * radar no sirve de nada.
 */
export function topicBrief(topic: RadarTopic, format: RadarFormat) {
  const suggestion = topic.formats.find((item) => item.type === format);
  const sources = topic.evidence.map((item) => `- ${item.title}: ${item.url}${item.publishedAt ? ` (${item.publishedAt})` : ""}`);

  // El contexto es el mismo para los tres formatos: son los hechos verificados y de dónde salen.
  const context = [
    `Por qué ahora: ${topic.whyNow}`,
    `Ángulo para la agencia: ${topic.angleForAgency}`,
    suggestion?.reason ? `Por qué en este formato: ${suggestion.reason}` : "",
    sources.length ? `Fuentes verificadas (no contradigas sus datos):\n${sources.join("\n")}` : "",
    // El gancho es una sugerencia, no una orden: el generador tiene su propio criterio de forma.
    suggestion?.hook ? `Gancho propuesto: ${suggestion.hook}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    topic: topic.title,
    context,
    vertical: topic.vertical,
    keyword: suggestion?.keyword ?? null,
    hook: suggestion?.hook ?? null,
    /** Encargo en una sola cadena, para los generadores que reciben texto libre. */
    prompt: [`Escribe sobre: ${topic.title}`, context].join("\n\n"),
  };
}
