import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Solo se sustituyen persistencia de costes/archivos y HTTP; el pipeline y la búsqueda son reales.
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (error) { if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context); throw error; }
  },
  load(url, context, next) {
    if (url.endsWith("/generation-runs.ts")) return { format: "module", shortCircuit: true, source: "export async function trackGeneration(options, work) { return (await work()).value; }" };
    if (url.endsWith("/asset-storage.ts")) return { format: "module", shortCircuit: true, source: "export async function storeAsset(image) { if (!image.bytes.length) throw new Error('empty image'); return {id:'fixture-asset'}; } export async function readAsset() { return null; }" };
    return next(url, context);
  },
});
const { createEditableCarousel } = await import("./carousel-pipeline.ts");
const originalFetch = globalThis.fetch;
const keys = ["CONTENT_GEN_AI_PROVIDER", "OPENAI_API_KEY", "UNSPLASH_ACCESS_KEY"];
const previous = keys.map(key => process.env[key]);
Object.assign(process.env, { CONTENT_GEN_AI_PROVIDER: "openai", OPENAI_API_KEY: "fixture-key", UNSPLASH_ACCESS_KEY: "fixture-key" });
let aiCalls = 0;
let photoStatus = 401;
const generated = { slides: [
  { layout: "cover", title: "Portada" },
  { layout: "split", layoutVariant: "arch", title: "Equipo", content: "Texto", imageQuery: "team office" },
  { layout: "cta", ctaText: "Contacto" },
] };
globalThis.fetch = async (url) => {
  const host = new URL(String(url)).hostname;
  if (host === "api.openai.com") { aiCalls++; return Response.json({ output_text: JSON.stringify(generated) }); }
  if (host === "api.unsplash.com") return photoStatus === 200 ? Response.json({ results: [{urls:{regular:"https://images.unsplash.com/fixture"}}] }) : Response.json({}, { status: photoStatus });
  if (host === "images.unsplash.com") return new Response("fixture-image", {headers:{"content-type":"image/jpeg"}});
  throw new Error(`Unexpected fixture request: ${host}`);
};
try {
  const input = {topic:"Tema de prueba",slideCount:3,imageSource:"unsplash"};
  const failed = await createEditableCarousel(input);
  assert.equal(failed.missingPhotos, 1);
  assert.ok("imageErrors" in failed, "el pipeline devuelve el motivo de la foto fallida, no lo oculta");
  assert.match((failed as {imageErrors: string[]}).imageErrors[0], /credencial/i);
  assert.equal(failed.document.slides[1].layout,"content");
  assert.equal(failed.document.slides[1].layoutVariant,"default", "no conserva una variante de foto en un layout de texto");
  assert.equal(failed.document.generation?.withImages,false,"sin fotos no marca el carrusel como ilustrado");
  photoStatus = 200;
  const successful = await createEditableCarousel(input);
  assert.equal(successful.missingPhotos,0);
  assert.equal(successful.document.slides[1].imageUrl,"/api/assets/fixture-asset");
  assert.equal(successful.document.generation?.withImages,true);
  delete process.env.UNSPLASH_ACCESS_KEY;
  const before = aiCalls;
  await assert.rejects(() => createEditableCarousel(input), /UNSPLASH_ACCESS_KEY/);
  assert.equal(aiCalls,before,"una clave ausente falla antes de pagar el guion");
  console.log("Carousel pipeline: fotos adjuntas, fallo visible, fallback de texto y preflight verificados con HTTP/almacenamiento aislados.");
} finally {
  globalThis.fetch = originalFetch;
  keys.forEach((key,index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key]=previous[index]; });
}
