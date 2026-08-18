import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = await mkdtemp(join(tmpdir(), "content-gen-blog-"));
const site = join(root, "sitio");
const storage = join(root, "storage");
const databasePath = join(storage, "content-gen.sqlite");

await mkdir(join(site, "content", "blog"), { recursive: true });
await mkdir(join(storage, "media", "assets"), { recursive: true });
await writeFile(join(site, "content", "blog", "articulo-existente.md"), "---\ntitle: \"Ya publicado\"\n---\n\nHola\n", "utf8");

// Una portada real: el exportador comprueba que el archivo exista antes de copiarlo.
const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const storageKey = `assets/${createHash("sha256").update(png).digest("hex")}.png`;
await writeFile(join(storage, "media", storageKey), png);

// `mediaRoot` sale de la carpeta de la base de datos, así que basta con situarla en el temporal.
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.BLOG_SITE_PATH = site;

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE assets (id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
  INSERT INTO assets (id, data_json) VALUES
    ('portada', '${JSON.stringify({ storageKey, mimeType: "image/png" }).replace(/'/g, "''")}'),
    ('portada-jpg', '${JSON.stringify({ storageKey, mimeType: "image/jpeg" }).replace(/'/g, "''")}'),
    ('portada-perdida', '${JSON.stringify({ storageKey: `assets/${"a".repeat(64)}.png`, mimeType: "image/png" }).replace(/'/g, "''")}');
`);
database.close();

const { BlogExportError, exportArticle, previewExport, publishedSlugs } = await import("./blog-export.ts");

const base = {
  schemaVersion: 1 as const,
  slug: "como-automatizar-el-blog",
  title: "Cómo automatizar el blog",
  excerpt: "Del editor al repositorio sin copiar y pegar.",
  date: "2026-08-03",
  author: "ZenlorLabs Team",
  category: "Automatización",
  tags: ["automatización", "blog"],
  image: "/blog/como-automatizar-el-blog.png",
  readTime: "6 min",
  body: "# Hola\n\nContenido del artículo.",
  coverAssetId: null as string | null,
};

try {
  assert.deepEqual(await publishedSlugs(), ["articulo-existente"], "lee los artículos que ya están en el sitio");

  // Un borrador incompleto tiene que explicar qué falta, no escribir medio artículo.
  const incompleto = await previewExport({ ...base, excerpt: "" });
  assert.equal(incompleto.ready, false, "sin resumen no está listo");
  assert.match(incompleto.problems.join(" "), /excerpt/, "señala el campo que falta");
  await assert.rejects(() => exportArticle({ ...base, excerpt: "" }), /no se puede publicar/, "y se niega a exportarlo");

  const listo = await previewExport(base);
  assert.equal(listo.ready, true, "el artículo completo está listo");
  assert.equal(listo.ready && listo.exists, false, "todavía no existe en el sitio");
  assert.equal(listo.ready && listo.url, "https://www.zenlorlabs.com/blog/como-automatizar-el-blog", "anticipa la URL pública");

  const resultado = await exportArticle(base);
  assert.equal(resultado.replaced, false, "es un artículo nuevo");
  assert.equal(resultado.coverPath, null, "sin portada asignada no copia nada");
  const escrito = await readFile(join(site, "content", "blog", "como-automatizar-el-blog.md"), "utf8");
  assert.match(escrito, /^title: "Cómo automatizar el blog"$/m, "escribe el frontmatter del sitio");
  assert.match(escrito, /^tags: \["automatización", "blog"\]$/m, "con las etiquetas en formato lista");
  assert.ok(escrito.endsWith("Contenido del artículo.\n"), "y el cuerpo al final");

  // Pisar un artículo publicado tiene que costar una confirmación explícita.
  await assert.rejects(() => exportArticle(base), (error: unknown) => error instanceof BlogExportError && error.status === 409, "no reemplaza sin permiso");
  const reemplazo = await exportArticle({ ...base, body: "# Hola\n\nVersión corregida." }, { overwrite: true });
  assert.equal(reemplazo.replaced, true, "con overwrite sí reemplaza");
  assert.match(await readFile(reemplazo.path, "utf8"), /Versión corregida/, "y deja la versión nueva");

  const conPortada = await exportArticle({ ...base, slug: "con-portada", image: "/blog/con-portada.png", coverAssetId: "portada" });
  assert.equal(await readFile(conPortada.coverPath!, "utf8").then(() => true, () => false), true, "copia la portada a public/blog");
  assert.deepEqual(await readFile(join(site, "public", "blog", "con-portada.png")), png, "y es el archivo del asset");

  // La extensión del frontmatter tiene que decir la verdad sobre el archivo copiado.
  await assert.rejects(
    () => exportArticle({ ...base, slug: "portada-mentirosa", image: "/blog/portada-mentirosa.avif", coverAssetId: "portada" }),
    /pero el frontmatter dice/,
    "no copia un PNG llamándolo avif",
  );
  await assert.rejects(() => exportArticle({ ...base, slug: "sin-archivo", image: "/blog/sin-archivo.png", coverAssetId: "portada-perdida" }), /almacenamiento local/, "avisa si falta el archivo de portada");
  await assert.rejects(() => exportArticle({ ...base, slug: "sin-asset", image: "/blog/sin-asset.png", coverAssetId: "no-existe" }), /no existe entre los assets/, "avisa si el asset no existe");
  assert.equal(await readFile(join(site, "content", "blog", "portada-mentirosa.md"), "utf8").then(() => true, () => false), false, "si la portada falla no queda el .md huérfano");

  // Sin configuración no se adivina dónde escribir.
  const configurado = process.env.BLOG_SITE_PATH;
  delete process.env.BLOG_SITE_PATH;
  await assert.rejects(() => exportArticle(base), /BLOG_SITE_PATH/, "exige la ruta del sitio");
  process.env.BLOG_SITE_PATH = join(root, "no-es-el-sitio");
  await assert.rejects(() => exportArticle(base), /Revisa BLOG_SITE_PATH/, "y que apunte a un repo con content/blog");
  process.env.BLOG_SITE_PATH = configurado;

  console.log("Exportador de blog: contrato del sitio, colisiones, portada y rutas validados.");
} finally {
  await rm(root, { recursive: true, force: true });
}
