import assert from "node:assert/strict";
import { carouselImageInputSchema, limitedImageBytes } from "./carousel-images.ts";

assert.equal(carouselImageInputSchema.parse({ source: "unsplash", prompt: "Una biblioteca nocturna" }).source, "unsplash");
assert.equal(carouselImageInputSchema.safeParse({ source: "otro", prompt: "Una biblioteca nocturna" }).success, false, "una fuente no permitida se rechaza");
assert.equal(carouselImageInputSchema.safeParse({ source: "openai", prompt: "x" }).success, false, "un prompt corto se rechaza");
await assert.rejects(() => limitedImageBytes(new Response("", { headers: { "content-length": String(10 * 1024 * 1024 + 1) } })), /10 MB/, "rechaza una imagen remota sobredimensionada antes de descargarla");
import { buildIllustrationPrompt } from "./carousel-images.ts";
assert.equal(carouselImageInputSchema.parse({ source: "illustration", prompt: "Equipo revisando datos", color: "#2f7d40" }).source, "illustration", "acepta ilustraciones");
assert.match(buildIllustrationPrompt("Equipo revisando datos", "#ff5500"), /#ff5500[\s\S]*transparent background[\s\S]*Equipo revisando datos/, "la ilustración lleva el color de marca y fondo transparente");
const { createRemoteImage } = await import("./carousel-images.ts");
const originalKey = process.env.UNSPLASH_ACCESS_KEY;
process.env.UNSPLASH_ACCESS_KEY = "fixture-key";
try {
  const queries: string[] = [];
  const request: typeof fetch = async (url) => {
    const target = new URL(String(url));
    if (target.hostname === "api.unsplash.com") {
      const query = target.searchParams.get("query")!;
      queries.push(query);
      return Response.json({ results: query === "team office" ? [{ urls: { regular: "https://images.unsplash.com/fixture" } }] : [] });
    }
    return new Response("fixture-image", { headers: { "content-type": "image/jpeg" } });
  };
  const image = await createRemoteImage({ source: "unsplash", prompt: "team office workflow automation laptop" }, request);
  assert.equal(image.bytes.toString(), "fixture-image", "una búsqueda demasiado específica se simplifica y devuelve una foto");
  assert.deepEqual(queries, ["team office workflow automation laptop", "team office"], "solo reintenta una búsqueda sin resultados con palabras del mismo prompt");
  let attempts = 0;
  await assert.rejects(() => createRemoteImage({ source: "unsplash", prompt: "team office" }, async () => { attempts++; return Response.json({}, { status: 401 }); }), /credencial/i);
  assert.equal(attempts, 1, "una credencial inválida no genera reintentos");
} finally {
  if (originalKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
  else process.env.UNSPLASH_ACCESS_KEY = originalKey;
}
console.log("Imagen de carrusel: fuentes, búsquedas sin resultados y errores de credenciales validados.");
