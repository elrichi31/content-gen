import assert from "node:assert/strict";
import {
  articleDocumentSchema,
  articleDraftSchema,
  articleFilename,
  coverPath,
  draftArticle,
  estimateReadTime,
  serializeArticle,
  slugify,
} from "./article.ts";

// El slug tiene que salir igual que el de `scripts/new-blog-post.js` del sitio: si difiere,
// el fichero y la URL dejan de coincidir con lo que el equipo espera.
assert.equal(slugify("Checklist de seguridad para Google Workspace en PyMEs"), "checklist-de-seguridad-para-google-workspace-en-pymes", "minúsculas y guiones");
assert.equal(slugify("Automatización de WhatsApp: guía 2026"), "automatizacion-de-whatsapp-guia-2026", "quita acentos y signos");
assert.equal(slugify("  ¿Qué es Medusa.js?  "), "que-es-medusa-js", "sin guiones sueltos en los extremos");
assert.equal(slugify("Ñandú & Co."), "nandu-co", "la eñe se transcribe");
assert.equal(slugify("!!!"), "", "un título sin letras no produce slug");

assert.equal(estimateReadTime("palabra ".repeat(200).trim()), "1 min", "200 palabras es un minuto");
assert.equal(estimateReadTime("palabra ".repeat(1762).trim()), "9 min", "redondea hacia arriba");
assert.equal(estimateReadTime(""), "1 min", "nunca baja de un minuto");
// Un bloque de código de 500 líneas no son 500 palabras de lectura.
assert.equal(estimateReadTime("hola\n```js\n" + "const x = 1;\n".repeat(300) + "```\n"), "1 min", "descuenta el código");

assert.equal(coverPath("mi-articulo", "avif"), "/blog/mi-articulo.avif", "ruta pública de la portada");
assert.equal(coverPath("mi-articulo", ".PNG"), "/blog/mi-articulo.png", "normaliza el formato");
assert.throws(() => coverPath("mi-articulo", "gif"), /no admitido/, "solo los formatos que el sitio sirve");
assert.equal(articleFilename("mi-articulo"), "mi-articulo.md", "nombre del fichero");
assert.throws(() => articleFilename("Mi Artículo"), "el nombre del fichero no admite mayúsculas ni espacios");

const draft = draftArticle({ title: "Cómo automatizar tu blog", date: "2026-08-03" });
assert.equal(draft.slug, "como-automatizar-tu-blog", "el borrador deriva su slug del título");
assert.equal(draft.author, "ZenlorLabs Team", "autor por defecto");
assert.equal(draft.image, "/blog/como-automatizar-tu-blog.png", "portada apuntando al slug");
assert.equal(draft.excerpt, "", "un borrador puede empezar sin resumen");
assert.throws(() => draftArticle({ title: "###", date: "2026-08-03" }), /slug válido/, "avisa si el título no da slug");

// La diferencia entre borrador y publicable es justo lo que el sitio necesita para no romperse.
const publicable = { ...draft, excerpt: "Guía corta para publicar sin tocar el repo a mano.", tags: ["automatización", "blog"], body: "# Hola\n\nContenido real." };
assert.ok(articleDraftSchema.safeParse(draft).success, "el borrador incompleto se guarda");
assert.ok(!articleDocumentSchema.safeParse(draft).success, "pero no se exporta");
assert.match(articleDocumentSchema.safeParse(draft).error?.issues[0]?.message ?? "", /resumen/i, "y dice por qué");
assert.ok(!articleDocumentSchema.safeParse({ ...publicable, tags: [] }).success, "exige al menos una etiqueta");
assert.ok(!articleDocumentSchema.safeParse({ ...publicable, readTime: "14" }).success, "el tiempo de lectura lleva «min»");
assert.ok(!articleDocumentSchema.safeParse({ ...publicable, image: "/imagenes/foo.png" }).success, "la portada vive en /blog");
assert.ok(!articleDocumentSchema.safeParse({ ...publicable, date: "01-05-2026" }).success, "la fecha es ISO");

const articulo = articleDocumentSchema.parse(publicable);
const md = serializeArticle(articulo);
assert.ok(md.startsWith("---\n"), "abre con el frontmatter");
assert.match(md, /^title: "Cómo automatizar tu blog"$/m, "título entre comillas");
assert.match(md, /^tags: \["automatización", "blog"\]$/m, "etiquetas como lista YAML");
assert.match(md, /^date: "2026-08-03"$/m, "la fecha va citada, como en los artículos existentes");
assert.equal(md.split("---\n")[2], "\n# Hola\n\nContenido real.\n", "el cuerpo va tras el frontmatter");

// gray-matter lee esto como YAML: un título con comillas o dos puntos no puede romperlo.
const peligroso = serializeArticle(articleDocumentSchema.parse({ ...publicable, title: 'El "truco": 3 pasos', excerpt: 'Dijo: "hazlo"' }));
assert.match(peligroso, /^title: "El \\"truco\\": 3 pasos"$/m, "escapa las comillas del título");
assert.match(peligroso, /^excerpt: "Dijo: \\"hazlo\\""$/m, "escapa las del resumen");

console.log("Artículos: slug, tiempo de lectura, portada, borrador vs publicable y frontmatter validados.");
