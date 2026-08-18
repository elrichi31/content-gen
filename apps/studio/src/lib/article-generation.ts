import { articleDraftSchema, coverPath, estimateReadTime, slugify, type ArticleDraft } from "@content-gen/domain/article";
import { todayLocal } from "@content-gen/domain/schedule";
import { z } from "zod";
import { generateOpenAiJson, generateOpenAiText, WEB_SEARCH_TOOL, type WebSource } from "./openai.ts";

export class ArticleGenerationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export const articleGenerationInputSchema = z.object({
  /** Lo que pide el usuario: el encargo del artículo, en sus palabras. */
  prompt: z.string().trim().min(10, "Describe con algo más de detalle qué artículo quieres").max(4000),
  audience: z.string().trim().max(160).default("PyMEs de Latinoamérica"),
  tone: z.string().trim().max(120).default("Cercano, directo y técnico sin jerga innecesaria"),
  language: z.string().trim().max(40).default("es"),
  category: z.string().trim().max(80).default(""),
  /** Extensión aproximada; el tiempo de lectura se recalcula sobre el texto real. */
  words: z.number().int().min(300).max(3000).default(1200),
  /** Buscar en la web antes de escribir. Es lo que evita que invente datos y fechas. */
  webSearch: z.boolean().default(true),
  campaignId: z.string().min(1).optional(),
});
export type ArticleGenerationInput = z.infer<typeof articleGenerationInputSchema>;

const SYSTEM = [
  "Eres un redactor técnico que escribe artículos de blog para una consultora de tecnología en Latinoamérica.",
  "Escribes en markdown, con frases cortas, ejemplos concretos y cero relleno promocional.",
  "Nunca inventas datos, precios, fechas ni citas: si no lo has verificado, no lo afirmas.",
  "Respondes siempre con un único objeto JSON, sin texto alrededor y sin bloques de código.",
].join(" ");

/** Contrato que se le pide a la IA; se valida al normalizar, no se confía en que lo cumpla. */
const generatedArticleSchema = z.object({
  title: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  category: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1),
  body: z.string().trim().min(1),
});

export function buildArticlePrompt(input: ArticleGenerationInput, { categories = [] }: { categories?: string[] } = {}) {
  return [
    `Encargo: ${input.prompt}`,
    `Audiencia: ${input.audience}`,
    `Tono: ${input.tone}`,
    `Idioma: ${input.language}`,
    `Extensión objetivo: unas ${input.words} palabras.`,
    input.category ? `Categoría: ${input.category}` : categories.length ? `Elige la categoría entre estas del blog: ${categories.join(", ")}.` : "",
    input.webSearch
      ? "Busca en la web antes de escribir y apóyate en fuentes actuales. Cita las fuentes con enlaces markdown dentro del texto, junto al dato que respaldan."
      : "No dispones de búsqueda web: no cites datos concretos que no puedas justificar y evita cifras, precios o fechas.",
    "",
    "Devuelve un JSON con exactamente estas claves:",
    '- "title": titular del artículo, sin comillas alrededor.',
    '- "excerpt": resumen de 150 a 300 caracteres para la meta description.',
    '- "category": una sola categoría.',
    '- "tags": entre 3 y 6 etiquetas cortas.',
    '- "body": el artículo completo en markdown, empezando por un encabezado "# " y con secciones "## ".',
    "En 'body' no incluyas frontmatter: solo el cuerpo del artículo.",
  ].filter(Boolean).join("\n");
}

/**
 * Convierte la respuesta de la IA en un borrador del artículo. El slug, la portada, la fecha y
 * el tiempo de lectura los pone la aplicación: son datos del sistema, no opinión del modelo.
 */
export function normalizeGeneratedArticle(value: unknown, input: ArticleGenerationInput, { today = todayLocal(), sources = [] }: { today?: string; sources?: WebSource[] } = {}): ArticleDraft {
  const parsed = generatedArticleSchema.safeParse(value);
  if (!parsed.success) throw new ArticleGenerationError(`La IA no devolvió un artículo utilizable: falta ${parsed.error.issues[0]?.path.join(".") || "el contenido"}.`, 422);
  const generated = parsed.data;

  const slug = slugify(generated.title);
  if (!slug) throw new ArticleGenerationError("El titular que devolvió la IA no produce un slug válido.", 422);

  const body = appendSources(stripFrontmatter(generated.body), sources);
  return articleDraftSchema.parse({
    schemaVersion: 1,
    slug,
    title: generated.title,
    excerpt: generated.excerpt.slice(0, 300),
    date: today,
    category: input.category || generated.category,
    tags: generated.tags.slice(0, 12),
    image: coverPath(slug, "png"),
    readTime: estimateReadTime(body),
    body,
    coverAssetId: null,
  });
}

/** Si el modelo ignora la instrucción y devuelve frontmatter, se descarta: el nuestro manda. */
function stripFrontmatter(body: string) {
  const trimmed = body.trim();
  if (!trimmed.startsWith("---")) return trimmed;
  const end = trimmed.indexOf("\n---", 3);
  return end === -1 ? trimmed : trimmed.slice(end + 4).trim();
}

/**
 * Deja las fuentes al final del artículo. Aunque el modelo las cite en línea, tenerlas listadas
 * permite comprobar de un vistazo en qué se apoyó antes de publicar nada.
 */
function appendSources(body: string, sources: WebSource[]) {
  if (!sources.length) return body;
  const cited = sources.map((source) => `- [${source.title}](${source.url})`).join("\n");
  return `${body}\n\n## Fuentes\n\n${cited}`;
}

const RESEARCH_SYSTEM = [
  "Eres un investigador que documenta temas de tecnología para artículos de blog.",
  "Buscas en la web, priorizas fuentes primarias y recientes, y anotas cada dato con su fecha y su origen.",
  "Si un dato no lo encuentras verificado, lo dices en vez de estimarlo.",
].join(" ");

/** Paso 1: buscar en la web y volver con notas y fuentes. Sin modo JSON, que la API no lo permite aquí. */
export async function researchTopic(input: ArticleGenerationInput, { request = fetch }: { request?: typeof fetch } = {}) {
  const { text, sources, usage } = await generateOpenAiText({
    system: RESEARCH_SYSTEM,
    prompt: [
      `Investiga para escribir este artículo: ${input.prompt}`,
      `Audiencia: ${input.audience}. Idioma de las notas: ${input.language}.`,
      "Devuelve notas en texto plano: hechos concretos, cifras con su fecha, y qué fuente respalda cada uno.",
      "Marca explícitamente lo que no hayas podido verificar.",
    ].join("\n"),
    tools: [WEB_SEARCH_TOOL],
    timeoutMs: 300_000,
    request,
  });
  return { notes: text, sources, usage };
}

/**
 * Redacta el artículo. Con búsqueda activada primero investiga y luego escribe sobre esas notas:
 * la Responses API no admite `web_search` junto al modo JSON, y separar los pasos además le da
 * al redactor material verificado en vez de pedirle buscar y estructurar a la vez.
 */
export async function generateArticle(input: ArticleGenerationInput, { categories = [], request = fetch, today }: { categories?: string[]; request?: typeof fetch; today?: string } = {}) {
  const research = input.webSearch ? await researchTopic(input, { request }) : null;
  const { value, model, usage } = await generateOpenAiJson({
    system: SYSTEM,
    prompt: research
      ? `${buildArticlePrompt(input, { categories })}\n\nNotas de investigación verificadas (úsalas como base y no contradigas sus datos):\n${research.notes}`
      : buildArticlePrompt(input, { categories }),
    timeoutMs: 120_000,
    request,
  });
  const sources = research?.sources ?? [];
  return { article: normalizeGeneratedArticle(value, input, { sources, today }), model, usage, sources, notes: research?.notes ?? null };
}
