import assert from "node:assert/strict";
import { carouselImageInputSchema, limitedImageBytes } from "./carousel-images.ts";

assert.equal(carouselImageInputSchema.parse({ source: "unsplash", prompt: "Una biblioteca nocturna" }).source, "unsplash");
assert.equal(carouselImageInputSchema.safeParse({ source: "otro", prompt: "Una biblioteca nocturna" }).success, false, "una fuente no permitida se rechaza");
assert.equal(carouselImageInputSchema.safeParse({ source: "openai", prompt: "x" }).success, false, "un prompt corto se rechaza");
await assert.rejects(() => limitedImageBytes(new Response("", { headers: { "content-length": String(10 * 1024 * 1024 + 1) } })), /10 MB/, "rechaza una imagen remota sobredimensionada antes de descargarla");
console.log("Imagen de carrusel: fuentes y prompt validados.");
