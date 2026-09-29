import assert from "node:assert/strict";
import { carouselImageInputSchema, limitedImageBytes } from "./carousel-images.ts";

assert.equal(carouselImageInputSchema.parse({ source: "unsplash", prompt: "Una biblioteca nocturna" }).source, "unsplash");
assert.equal(carouselImageInputSchema.safeParse({ source: "otro", prompt: "Una biblioteca nocturna" }).success, false, "una fuente no permitida se rechaza");
assert.equal(carouselImageInputSchema.safeParse({ source: "openai", prompt: "x" }).success, false, "un prompt corto se rechaza");
await assert.rejects(() => limitedImageBytes(new Response("", { headers: { "content-length": String(10 * 1024 * 1024 + 1) } })), /10 MB/, "rechaza una imagen remota sobredimensionada antes de descargarla");
import { buildIllustrationPrompt } from "./carousel-images.ts";
assert.equal(carouselImageInputSchema.parse({ source: "illustration", prompt: "Equipo revisando datos", color: "#2f7d40" }).source, "illustration", "acepta ilustraciones");
assert.match(buildIllustrationPrompt("Equipo revisando datos", "#ff5500"), /#ff5500[\s\S]*transparent background[\s\S]*Equipo revisando datos/, "la ilustración lleva el color de marca y fondo transparente");
console.log("Imagen de carrusel: fuentes y prompt validados.");
