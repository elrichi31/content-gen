import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { articleDocumentSchema, articleFilename, serializeArticle, type ArticleDocument } from "@content-gen/domain/article";
import { assetExtensions, resolveAssetPath } from "./asset-file.ts";
import { mediaRoot, withDatabase } from "./db.ts";

export class BlogExportError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Carpetas del sitio: los `.md` se leen de aquí en tiempo de build y las portadas se sirven estáticas. */
const POSTS_DIRECTORY = ["content", "blog"];
const COVERS_DIRECTORY = ["public", "blog"];

/**
 * Raíz del repositorio del sitio. Se configura con BLOG_SITE_PATH porque el sitio vive en otro
 * repositorio: content-gen escribe el fichero, y el commit y el push los hace una persona.
 */
export function siteRoot() {
  const configured = process.env.BLOG_SITE_PATH?.trim();
  if (!configured) throw new BlogExportError("Falta BLOG_SITE_PATH: apunta a la raíz del repositorio del sitio para poder exportar.", 400);
  return resolve(configured);
}

/** Une rutas dentro del sitio y comprueba que nada se escape de la carpeta prevista. */
function insideSite(root: string, segments: string[], filename: string) {
  const directory = resolve(root, ...segments);
  const path = resolve(directory, filename);
  if (!path.startsWith(`${directory}${sep}`)) throw new BlogExportError("Ruta de destino inválida.", 400);
  return { directory, path };
}

async function exists(path: string) {
  return access(path).then(() => true, () => false);
}

/** Slugs ya publicados en el sitio, para avisar antes de pisar un artículo existente. */
export async function publishedSlugs() {
  const directory = resolve(siteRoot(), ...POSTS_DIRECTORY);
  const entries = await readdir(directory).catch(() => {
    throw new BlogExportError(`No se encontró ${POSTS_DIRECTORY.join("/")} en ${siteRoot()}. Revisa BLOG_SITE_PATH.`, 400);
  });
  return entries.filter((entry) => entry.endsWith(".md")).map((entry) => entry.replace(/\.md$/, ""));
}

/**
 * Categorías y autores que el sitio ya usa. El editor los ofrece como sugerencia para que el
 * blog no acabe con «Ciberseguridad» y «ciberseguridad» contando como dos categorías distintas.
 */
export async function siteIndex() {
  const slugs = await publishedSlugs();
  const directory = resolve(siteRoot(), ...POSTS_DIRECTORY);
  const categories = new Set<string>();
  const authors = new Set<string>();
  for (const slug of slugs) {
    const contents = await readFile(resolve(directory, `${slug}.md`), "utf8").catch(() => "");
    const frontmatter = contents.split(/^---$/m)[1] ?? "";
    const category = /^category:\s*"?(.+?)"?\s*$/m.exec(frontmatter)?.[1];
    const author = /^author:\s*"?(.+?)"?\s*$/m.exec(frontmatter)?.[1];
    if (category) categories.add(category);
    if (author) authors.add(author);
  }
  return { slugs, categories: [...categories].sort(), authors: [...authors].sort() };
}

/** Comprueba que la exportación es posible y qué haría, sin escribir nada. */
export async function previewExport(document: unknown) {
  const parsed = articleDocumentSchema.safeParse(document);
  if (!parsed.success) {
    return { ready: false as const, problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "artículo"}: ${issue.message}`) };
  }
  const article = parsed.data;
  const { path } = insideSite(siteRoot(), POSTS_DIRECTORY, articleFilename(article.slug));
  return {
    ready: true as const,
    problems: [] as string[],
    slug: article.slug,
    path,
    exists: await exists(path),
    url: `https://www.zenlorlabs.com/blog/${article.slug}`,
  };
}

export type ExportResult = { slug: string; path: string; coverPath: string | null; replaced: boolean; url: string };

/**
 * Escribe el artículo en el repositorio del sitio. No hace commit ni push a propósito: publicar
 * en producción sin que nadie lea el diff es exactamente lo que no queremos automatizar todavía.
 */
export async function exportArticle(document: unknown, { overwrite = false }: { overwrite?: boolean } = {}): Promise<ExportResult> {
  const parsed = articleDocumentSchema.safeParse(document);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BlogExportError(`El artículo aún no se puede publicar — ${issue?.path.join(".") || "artículo"}: ${issue?.message}`, 400);
  }
  const article = parsed.data;
  const root = siteRoot();
  const { directory, path } = insideSite(root, POSTS_DIRECTORY, articleFilename(article.slug));
  if (!await exists(directory)) throw new BlogExportError(`No se encontró ${POSTS_DIRECTORY.join("/")} en ${root}. Revisa BLOG_SITE_PATH.`, 400);

  const replaced = await exists(path);
  if (replaced && !overwrite) {
    throw new BlogExportError(`Ya existe un artículo con el slug «${article.slug}». Cambia el título o confirma que quieres reemplazarlo.`, 409);
  }

  // La portada primero: si falla, el `.md` no queda apuntando a una imagen que no existe.
  const cover = await copyCover(article, root);
  await writeFile(path, serializeArticle(article), "utf8");
  return { slug: article.slug, path, coverPath: cover, replaced, url: `https://www.zenlorlabs.com/blog/${article.slug}` };
}

/** Copia el asset de portada a `public/blog` con el nombre que declara el frontmatter. */
async function copyCover(article: ArticleDocument, root: string) {
  if (!article.coverAssetId) return null;
  const asset = await withDatabase((database) => database.prepare("SELECT data_json FROM assets WHERE id = ?").get(article.coverAssetId)) as { data_json: string } | undefined;
  if (!asset) throw new BlogExportError("La portada del artículo no existe entre los assets.", 400);
  const { storageKey, mimeType } = JSON.parse(asset.data_json) as { storageKey: string; mimeType: string };
  const source = resolveAssetPath(mediaRoot, storageKey);
  if (!await exists(source)) throw new BlogExportError("El archivo de la portada no está en el almacenamiento local.", 400);

  const filename = article.image.slice("/blog/".length);
  // Copiar un PNG con nombre .avif haría que el navegador lo rechace: la extensión debe decir la verdad.
  const declared = filename.split(".").pop() ?? "";
  const real = assetExtensions[mimeType];
  if (!real) throw new BlogExportError(`La portada tiene un tipo que el sitio no sirve: ${mimeType}.`, 400);
  if (real !== (declared === "jpeg" ? "jpg" : declared)) {
    throw new BlogExportError(`La portada es ${real} pero el frontmatter dice .${declared}. Corrige la extensión de la imagen.`, 400);
  }
  const { directory, path } = insideSite(root, COVERS_DIRECTORY, filename);
  await mkdir(directory, { recursive: true });
  await copyFile(source, path);
  return path;
}
