import assert from "node:assert/strict";
import {
  articleGenerationInputSchema,
  ArticleGenerationError,
  buildArticlePrompt,
  generateArticle,
  normalizeGeneratedArticle,
} from "./article-generation.ts";
import { webSources } from "./openai.ts";

const input = articleGenerationInputSchema.parse({ prompt: "Explica cómo una PyME puede migrar de Shopify a Medusa sin perder ventas" });
assert.equal(input.webSearch, true, "la búsqueda web viene activada por defecto");
assert.equal(input.words, 1200, "extensión objetivo por defecto");
const corto = articleGenerationInputSchema.safeParse({ prompt: "corto" });
assert.equal(corto.success, false, "un encargo de dos palabras no sirve");
assert.match(corto.error?.issues[0]?.message ?? "", /detalle/, "y se explica por qué");

const prompt = buildArticlePrompt(input, { categories: ["Ecommerce", "Ciberseguridad"] });
assert.match(prompt, /migrar de Shopify a Medusa/, "el encargo del usuario llega al modelo");
assert.match(prompt, /Busca en la web/, "con búsqueda pide apoyarse en fuentes");
assert.match(prompt, /Ecommerce, Ciberseguridad/, "ofrece las categorías que ya usa el blog");
assert.match(buildArticlePrompt({ ...input, category: "Ecommerce" }), /Categoría: Ecommerce/, "si se fija la categoría, se impone");
// Sin búsqueda hay que impedir explícitamente que invente cifras: es el fallo más caro aquí.
assert.match(buildArticlePrompt({ ...input, webSearch: false }), /No dispones de búsqueda web.*evita cifras/s, "sin búsqueda prohíbe los datos concretos");

const generado = {
  title: "Cómo migrar de Shopify a Medusa.js sin perder ventas",
  excerpt: "Una guía práctica para mover tu tienda sin cortar el negocio durante la migración.",
  category: "Ecommerce",
  tags: ["ecommerce", "Medusa.js", "migración"],
  body: "# Migrar sin perder ventas\n\nEl orden importa.\n\n## Antes de empezar\n\nInventario de productos.",
};

const articulo = normalizeGeneratedArticle(generado, input, { today: "2026-08-03" });
assert.equal(articulo.slug, "como-migrar-de-shopify-a-medusa-js-sin-perder-ventas", "el slug lo calcula la app, no el modelo");
assert.equal(articulo.image, "/blog/como-migrar-de-shopify-a-medusa-js-sin-perder-ventas.png", "la portada sigue al slug");
assert.equal(articulo.date, "2026-08-03", "la fecha la pone el sistema");
assert.equal(articulo.readTime, "1 min", "el tiempo de lectura se mide sobre el texto real");
assert.equal(articulo.coverAssetId, null, "la portada se asigna después, a mano");

// Un modelo que devuelve medio contrato no puede acabar en un artículo a medio hacer.
assert.throws(() => normalizeGeneratedArticle({ ...generado, excerpt: "" }, input), ArticleGenerationError, "sin resumen se rechaza");
assert.throws(() => normalizeGeneratedArticle({ ...generado, tags: [] }, input), /utilizable/, "sin etiquetas se rechaza");
assert.throws(() => normalizeGeneratedArticle("no es json", input), /utilizable/, "una respuesta que no es objeto se rechaza");
assert.throws(() => normalizeGeneratedArticle({ ...generado, title: "###" }, input), /slug/, "un titular sin letras se rechaza");

// Si el modelo ignora la instrucción y devuelve frontmatter, el nuestro es el que manda.
const conFrontmatter = normalizeGeneratedArticle({ ...generado, body: '---\ntitle: "Otro"\ndate: "2020-01-01"\n---\n\n# Real\n\nCuerpo.' }, input, { today: "2026-08-03" });
assert.ok(!conFrontmatter.body.includes("2020-01-01"), "descarta el frontmatter que inventa el modelo");
assert.ok(conFrontmatter.body.startsWith("# Real"), "y conserva el cuerpo");
assert.equal(conFrontmatter.date, "2026-08-03", "la fecha sigue siendo la del sistema");

assert.equal(normalizeGeneratedArticle(generado, { ...input, category: "Tutoriales" }).category, "Tutoriales", "la categoría elegida gana a la del modelo");

// Las anotaciones de web_search se convierten en fuentes citadas al final del artículo.
const respuesta = {
  output: [{
    content: [{
      type: "output_text",
      text: JSON.stringify(generado),
      annotations: [
        { type: "url_citation", url: "https://medusajs.com/docs", title: "Documentación de Medusa" },
        { type: "url_citation", url: "https://medusajs.com/docs", title: "Duplicada" },
        // La búsqueda añade `utm_source=openai`: es la misma página y no debe publicarse así.
        { type: "url_citation", url: "https://medusajs.com/docs?utm_source=openai&msockid=abc", title: "Con rastreo" },
        { type: "url_citation", url: "https://ejemplo.com/informe.pdf", title: "   " },
        { type: "file_citation", url: "https://ignorar.com" },
      ],
    }],
  }],
};
assert.deepEqual(webSources(respuesta), [
  { url: "https://medusajs.com/docs", title: "Documentación de Medusa" },
  { url: "https://ejemplo.com/informe.pdf", title: "ejemplo.com" },
], "deduplica quitando el rastreo, descarta lo que no es cita web y nunca deja un enlace sin texto");

process.env.CONTENT_GEN_AI_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "clave-de-prueba";
process.env.OPENAI_TEXT_MODEL = "gpt-5.6-sol";

type Llamada = { tools?: unknown[]; model?: string; text?: unknown; input?: { role: string; content: string }[] };
let llamadas: Llamada[] = [];

// La API rechaza `web_search` junto al modo JSON, así que investigar y redactar van separados:
// el primer paso busca sin formato JSON y el segundo redacta con él, sin herramientas.
const fake: typeof fetch = async (_url, init) => {
  const cuerpo = JSON.parse(String(init?.body)) as Llamada;
  llamadas.push(cuerpo);
  const esInvestigacion = Boolean(cuerpo.tools?.length);
  if (esInvestigacion && cuerpo.text) throw new Error("no se puede pedir búsqueda web y modo JSON a la vez");
  return new Response(
    JSON.stringify(esInvestigacion
      ? { ...respuesta, output_text: "Medusa 2.0 salió en 2024 según su documentación." }
      : { output_text: JSON.stringify(generado) }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const conBusqueda = await generateArticle(input, { request: fake, today: "2026-08-03", categories: ["Ecommerce"] });
assert.equal(llamadas.length, 2, "con búsqueda hay dos pasos: investigar y redactar");
assert.deepEqual(llamadas[0].tools, [{ type: "web_search" }], "el primer paso busca en la web");
assert.equal(llamadas[0].text, undefined, "y no pide modo JSON, que la API no lo admite con búsqueda");
assert.equal(llamadas[1].tools, undefined, "el segundo paso redacta sin herramientas");
assert.deepEqual(llamadas[1].text, { format: { type: "json_object" } }, "y sí en modo JSON");
assert.equal(llamadas[1].model, "gpt-5.6-sol", "usa el modelo de texto configurado");
assert.match(llamadas[1].input?.at(-1)?.content ?? "", /Medusa 2\.0 salió en 2024/, "las notas de la investigación llegan al redactor");
assert.deepEqual(conBusqueda.sources.map((source) => source.url), ["https://medusajs.com/docs", "https://ejemplo.com/informe.pdf"], "devuelve las fuentes consultadas");
assert.match(conBusqueda.article.body, /## Fuentes\n\n- \[Documentación de Medusa\]\(https:\/\/medusajs\.com\/docs\)/, "y las deja listadas en el artículo");
assert.ok(!/\[\]\(/.test(conBusqueda.article.body), "ningún enlace queda sin texto visible");

llamadas = [];
const sinBusqueda = await generateArticle({ ...input, webSearch: false }, { request: fake, today: "2026-08-03" });
assert.equal(llamadas.length, 1, "sin búsqueda basta una llamada");
assert.equal(llamadas[0].tools, undefined, "y no se manda la herramienta");
assert.deepEqual(sinBusqueda.sources, [], "sin búsqueda no hay fuentes que citar");
assert.ok(!sinBusqueda.article.body.includes("## Fuentes"), "ni sección de fuentes vacía");

console.log("Generación de artículos: encargo, contrato, fuentes web y datos del sistema verificados.");
