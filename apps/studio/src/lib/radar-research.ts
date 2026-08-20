import type { RadarWatchlistEntry } from "@content-gen/domain/radar";
import { z } from "zod";
import { generateOpenAiJson, generateOpenAiText, SEARCH_CONTEXT_SIZES, webSearchTool, type SearchContextSize } from "./openai.ts";

/**
 * Investigación del radar, en dos pasos por obligación y por conveniencia: la Responses API no
 * admite `web_search` junto al modo JSON, y separar los pasos permite además usar el modelo caro
 * solo para buscar y uno barato para ordenar el resultado (T-15).
 *
 * El coste se concentra en el paso 1: una llamada por vertical, no por tema.
 */

export const radarScanInputSchema = z.object({
  /** Antigüedad máxima de los hechos. Sin esto el modelo devuelve el panorama de siempre. */
  windowDays: z.number().int().min(1).max(90).default(7),
  /** Tope de temas. Los tokens de salida son los caros y el modelo se pasa si le dejas. */
  maxTopics: z.number().int().min(1).max(30).default(10),
  /** Subconjunto de verticales; vacío significa todos los activos. */
  verticals: z.array(z.string().min(1)).default([]),
  /**
   * Tope de búsquedas por vertical. Es la palanca de costo que más pesa: lo caro no son las
   * llamadas de búsqueda, son los tokens del contenido que devuelven, y esos se facturan al
   * precio del modelo. Sin tope, una corrida gastó 119.000 tokens de entrada en un solo vertical.
   */
  maxSearches: z.number().int().min(1).max(30).default(8),
  /**
   * Fuentes **independientes** (medios distintos) que se exigen para dar un tema por bueno. Con
   * una sola no hay forma de contrastar, y publicar sobre ella es fiarse de que ese medio acertó.
   */
  minSources: z.number().int().min(1).max(5).default(2),
  /**
   * Cuánto contenido de cada resultado entra en el contexto. Es la palanca de costo que sí se
   * cumple: `maxSearches` es una petición al modelo —en una corrida real se le pidieron 8 y
   * hizo 19—, mientras que esto lo impone la API.
   */
  searchContextSize: z.enum(SEARCH_CONTEXT_SIZES).default("low"),
  /**
   * Exigir que las fuentes de un tema aparezcan en la investigación. El paso que las escribe no
   * busca nada, así que una fuente que no está en las notas la puso él: es la única defensa contra
   * una cita inventada, que es peor que una cita ausente porque aparenta corroborar.
   *
   * Se puede apagar para una corrida concreta: si la comprobación se traga temas buenos, verlos
   * es más útil que discutir con el filtro a ciegas.
   */
  verifySources: z.boolean().default(true),
  /**
   * Modelos de cada paso. Nulo usa el configurado. Se eligen por corrida porque el compromiso
   * —cuánto cuesta frente a cuánto entiende— cambia según lo que se esté buscando.
   */
  researchModel: z.string().trim().min(1).max(160).nullable().default(null),
  structuringModel: z.string().trim().min(1).max(160).nullable().default(null),
  /** Marca la corrida como automática: el tope de presupuesto la frena, a la manual solo la avisa. */
  automatic: z.boolean().default(false),
});
export type RadarScanInput = z.infer<typeof radarScanInputSchema>;

/**
 * El sistema es idéntico entre verticales y entre semanas, y va al principio del prompt: es lo que
 * permite que se sirva desde caché a una décima parte del precio.
 */
const RESEARCH_SYSTEM = [
  "Eres un analista que vigila tendencias de tecnología para una consultora en Latinoamérica.",
  "Buscas en la web, priorizas fuentes primarias y recientes, y anotas cada hecho con su fecha y su origen.",
  "Distingues lo que ocurrió de verdad esta semana de lo que es contexto general de la industria.",
  "Si un dato no lo encuentras verificado, lo dices en vez de estimarlo.",
].join(" ");

const STRUCTURE_SYSTEM = [
  "Conviertes notas de investigación en temas de contenido accionables para una agencia.",
  "No inventas nada: cada tema se apoya únicamente en lo que dicen las notas.",
  "Respondes siempre con un único objeto JSON, sin texto alrededor y sin bloques de código.",
].join(" ");

/** Perfil del negocio para el que se busca. Sin él, el vertical se describe a sí mismo. */
export type ResearchBrand = { name: string; business: { sector: string; offering: string; audience: string; valueProposition: string } };

export function buildResearchPrompt(entry: RadarWatchlistEntry, { windowDays, today, recentTitles = [], brand = null, maxSearches = 8, minSources = 2 }: { windowDays: number; today: string; recentTitles?: string[]; brand?: ResearchBrand | null; maxSearches?: number; minSources?: number }) {
  return [
    brand ? `Negocio para el que buscas: ${brand.name}.` : "",
    brand?.business.sector ? `Giro: ${brand.business.sector}.` : "",
    brand?.business.valueProposition ? `Lo que lo diferencia: ${brand.business.valueProposition}.` : "",
    `Vertical a vigilar: ${entry.vertical}.`,
    `Lo que vende la agencia aquí: ${entry.offering}.`,
    `A quién se lo vende: ${entry.audience || brand?.business.audience || "PyMEs de Latinoamérica"}.`,
    `Hoy es ${today}. Busca solo hechos publicados en los últimos ${windowDays} días.`,
    "Descarta lo que sea contexto general o intemporal: interesa lo que ha cambiado en esa ventana.",
    "Busca en inglés y en español: buena parte de las fuentes primarias de este ámbito no están en español.",
    recentTitles.length
      ? `Ya se cubrieron estos temas recientemente, así que no los repitas salvo que haya novedades reales sobre ellos:\n${recentTitles.map((title) => `- ${title}`).join("\n")}`
      : "",
    "",
    `Presupuesto de búsqueda: no hagas más de ${maxSearches} búsquedas. Gastarlas en consultas amplias las desperdicia: busca hechos concretos.`,
    "Reporta TODO hecho relevante que encuentres, aunque solo lo respalde una fuente. No decidas tú qué se descarta: eso se filtra después.",
    `Para cada hecho, intenta encontrar confirmación en otros medios y anota TODAS las fuentes que lo respalden; el objetivo es llegar a ${minSources} dominios distintos, pero un hecho con menos también se reporta, indicando cuántas tiene.`,
    "Un aviso del propio fabricante, un CVE oficial o el comunicado de la empresa afectada son fuentes primarias: valen más que una nota de prensa que los repite, y cuentan como respaldo aunque estén solas.",
    "",
    "Devuelve notas en texto plano: hechos concretos, cada uno con su fecha y todas las fuentes que lo respaldan.",
    "Marca explícitamente lo que no hayas podido verificar, pero repórtalo igual: un hallazgo sin contrastar es información, y descartarlo en silencio no lo es.",
  ].filter(Boolean).join("\n");
}

/** Paso 1: buscar. Es la llamada cara —paga tokens y búsquedas— y va una vez por vertical. */
export async function researchVertical(entry: RadarWatchlistEntry, { windowDays, today, recentTitles = [], brand = null, maxSearches = 8, minSources = 2, searchContextSize = "low", model: requestedModel = null, request = fetch }: { windowDays: number; today: string; recentTitles?: string[]; brand?: ResearchBrand | null; maxSearches?: number; minSources?: number; searchContextSize?: SearchContextSize; model?: string | null; request?: typeof fetch }) {
  const { text, sources, usage, model } = await generateOpenAiText({
    system: RESEARCH_SYSTEM,
    prompt: buildResearchPrompt(entry, { windowDays, today, recentTitles, brand, maxSearches, minSources }),
    purpose: "research",
    model: requestedModel,
    tools: [webSearchTool({ contextSize: searchContextSize })],
    timeoutMs: 300_000,
    request,
  });
  return { vertical: entry.vertical, notes: text, sources, usage, model };
}

export type VerticalResearch = Awaited<ReturnType<typeof researchVertical>>;

export function buildStructurePrompt(research: VerticalResearch[], { maxTopics, recentTitles = [], minSources = 2 }: { maxTopics: number; recentTitles?: string[]; minSources?: number }) {
  const notes = research
    .map((item) => [
      `## Vertical: ${item.vertical}`,
      item.notes,
      item.sources.length ? `Fuentes consultadas:\n${item.sources.map((source) => `- ${source.title}: ${source.url}`).join("\n")}` : "Sin fuentes citadas.",
    ].join("\n"))
    .join("\n\n");

  return [
    `Convierte estas notas en como mucho ${maxTopics} temas de contenido.`,
    `Incluye en "evidence" todas las fuentes que respalden cada tema. Los temas con menos de ${minSources} dominios distintos se filtran al guardarlos, pero propónlos igual: es el sistema quien cuenta, no tú.`,
    "Prioriza lo que tenga fuente fechada y encaje con lo que vende la agencia; si un vertical no dio nada sólido, devuelve menos temas antes que rellenar.",
    recentTitles.length
      ? `No propongas temas equivalentes a estos, ya cubiertos:\n${recentTitles.map((title) => `- ${title}`).join("\n")}`
      : "",
    "",
    'Responde con un JSON { "topics": [...] }. Cada tema con exactamente estas claves:',
    '- "title": titular del tema, concreto.',
    '- "why_now": qué ocurrió en la ventana investigada que lo hace relevante ahora.',
    '- "vertical": el vertical del que sale.',
    '- "angle_for_agency": cómo conecta con lo que vende la agencia.',
    `- "evidence": lista de {url, title, published_at} con al menos ${minSources} dominios distintos. ` + '`published_at` en formato YYYY-MM-DD, o null si no lo verificaste. Usa solo URLs que aparezcan en las notas: las de dominios que no estén ahí se descartan al guardar, así que completar la lista con fuentes plausibles no salva el tema, lo tumba.',
    '- "formats": lista de {type, reason, hook, keyword, intent}. `type` es "carousel", "video" o "article". `hook` solo para carousel y video; `keyword` e `intent` solo para article. Usa null en los que no apliquen.',
    '- "shelf_life": "perecedero" si pierde valor en semanas, "evergreen" si no.',
    '- "confidence": número de 0 a 1 según lo verificado que esté el tema.',
    "",
    "Notas de investigación:",
    notes,
  ].filter(Boolean).join("\n");
}

const structuredSchema = z.object({ topics: z.array(z.unknown()).default([]) });

/**
 * Paso 2: ordenar. Sin herramientas y con el modelo barato: aquí no se busca nada, solo se le da
 * forma a lo que ya se investigó.
 */
export async function structureTopics(research: VerticalResearch[], { maxTopics, recentTitles = [], minSources = 2, model: requestedModel = null, request = fetch }: { maxTopics: number; recentTitles?: string[]; minSources?: number; model?: string | null; request?: typeof fetch }) {
  const { value, usage, model } = await generateOpenAiJson({
    system: STRUCTURE_SYSTEM,
    prompt: buildStructurePrompt(research, { maxTopics, recentTitles, minSources }),
    purpose: "structuring",
    model: requestedModel,
    timeoutMs: 120_000,
    request,
  });
  const parsed = structuredSchema.safeParse(value);
  // Los temas se validan uno a uno más adelante: aquí solo interesa que venga la lista. Perder
  // toda la investigación —que ya se pagó— porque un tema venga mal sería un mal negocio.
  return { topics: parsed.success ? parsed.data.topics.slice(0, maxTopics) : [], usage, model };
}
