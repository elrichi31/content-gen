import { z } from "zod";
import { isoDate } from "./analytics.ts";

/**
 * Artículos del blog. El contrato lo manda el sitio (zenlorlabs.com), que lee los `.md` de
 * `content/blog` con gray-matter y espera exactamente estos campos: si falta uno, el artículo
 * se publica roto. Por eso el frontmatter se valida aquí y no al escribir el fichero.
 */

/** El slug es el nombre del fichero y la URL: solo minúsculas, dígitos y guiones simples. */
export const articleSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug solo admite minúsculas, números y guiones simples")
  .max(120);

/** Formatos que el sitio ya sirve en `public/blog`. */
export const COVER_EXTENSIONS = ["avif", "png", "jpg", "jpeg", "webp"] as const;

const coverImage = z
  .string()
  .regex(new RegExp(`^/blog/[a-z0-9-]+\\.(?:${COVER_EXTENSIONS.join("|")})$`), "La portada debe ser /blog/<slug>.<extensión>");

/**
 * Borrador: lo que se guarda mientras se escribe. Admite resumen y cuerpo vacíos porque un
 * artículo a medias tiene que poder guardarse; lo que no puede es salir al sitio así.
 */
export const articleDraftSchema = z.object({
  schemaVersion: z.literal(1),
  slug: articleSlug,
  title: z.string().trim().min(1).max(200),
  /** El sitio lo usa como meta description y en las tarjetas del listado. */
  excerpt: z.string().trim().max(300).default(""),
  date: isoDate,
  author: z.string().trim().min(1).max(120).default("ZenlorLabs Team"),
  category: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  image: coverImage,
  readTime: z.string().regex(/^\d{1,3} min$/, "El tiempo de lectura debe ser «N min»"),
  /** Cuerpo en markdown, sin el frontmatter. */
  body: z.string().default(""),
  /** Asset de la portada, para copiarlo a `public/blog` al exportar. */
  coverAssetId: z.string().min(1).nullable().default(null),
});
export type ArticleDraft = z.infer<typeof articleDraftSchema>;

/** Artículo publicable: el sitio exige resumen, cuerpo y al menos una etiqueta. */
export const articleDocumentSchema = articleDraftSchema.extend({
  excerpt: z.string().trim().min(1, "El resumen es obligatorio: el sitio lo usa como meta description").max(300),
  tags: z.array(z.string().trim().min(1).max(60)).min(1, "Hace falta al menos una etiqueta").max(12),
  body: z.string().trim().min(1, "El artículo no tiene cuerpo"),
});
export type ArticleDocument = z.infer<typeof articleDocumentSchema>;

/**
 * Mismo slug que produce `scripts/new-blog-post.js` en el sitio: sin acentos, todo lo que no
 * sea letra o número pasa a guion. Dos artículos con el mismo título darían el mismo fichero,
 * y eso lo detecta el exportador, no esta función.
 */
export function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
}

/** Palabras por minuto de lectura en prosa. */
const READING_SPEED = 200;

/**
 * Tiempo de lectura a partir del cuerpo. Se descuentan los bloques de código y las imágenes,
 * que no se leen palabra por palabra pero inflarían el conteo.
 */
export function estimateReadTime(body: string) {
  const prose = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_`|-]/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / READING_SPEED))} min`;
}

/** Orden de los campos tal cual aparecen en los artículos ya publicados. */
const FRONTMATTER_FIELDS = ["title", "excerpt", "date", "author", "category", "tags", "image", "readTime"] as const;

/**
 * Serializa el `.md`. Los valores van entre comillas dobles con escape JSON porque gray-matter
 * los lee como YAML: un título con comillas o dos puntos rompería el parseo si se dejara suelto.
 */
export function serializeArticle(article: ArticleDocument) {
  const lines = FRONTMATTER_FIELDS.map((field) => {
    const value = article[field];
    if (Array.isArray(value)) return `${field}: [${value.map((item) => JSON.stringify(item)).join(", ")}]`;
    return `${field}: ${JSON.stringify(value)}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n${article.body.trim()}\n`;
}

/** Nombre del fichero dentro de `content/blog`. */
export function articleFilename(slug: string) {
  return `${articleSlug.parse(slug)}.md`;
}

/** Ruta pública de la portada dentro del sitio, a partir del slug y el formato del asset. */
export function coverPath(slug: string, extension: string) {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  if (!(COVER_EXTENSIONS as readonly string[]).includes(normalized)) {
    throw new Error(`Formato de portada no admitido: ${extension}. Usa ${COVER_EXTENSIONS.join(", ")}.`);
  }
  return `/blog/${articleSlug.parse(slug)}.${normalized}`;
}

/** Borrador inicial a partir del título, para que el editor abra con todo lo obligatorio puesto. */
export function draftArticle({ title, date, body = "", category = "Automatización", author, extension = "png" }: {
  title: string;
  date: string;
  body?: string;
  category?: string;
  author?: string;
  extension?: string;
}) {
  const slug = slugify(title);
  if (!slug) throw new Error("El título no produce un slug válido: usa letras o números.");
  return articleDraftSchema.parse({
    schemaVersion: 1,
    slug,
    title,
    date,
    author,
    category,
    image: coverPath(slug, extension),
    readTime: estimateReadTime(body),
    body,
  });
}
