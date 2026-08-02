import assert from "node:assert/strict";
import { buildCarouselPrompt, carouselGenerationInputSchema, normalizeGeneratedCarousel, parseGeneratedCarousel } from "./carousel-generation.ts";

const input = carouselGenerationInputSchema.parse({ topic: "Contenido claro", slideCount: 3 });
const valid = { caption: { text: "Guárdalo", hashtags: ["#contenido"] }, slides: [{ layout: "cover", title: "Una idea" }, { layout: "content", title: "El punto", content: "Explica el punto." }, { layout: "cta", ctaText: "Guárdalo", ctaSubtext: "Vuelve cuando lo necesites." }] };
const document = normalizeGeneratedCarousel(valid, input);
assert.equal(document.slides.length, 3, "conserva el número solicitado de slides");
assert.equal(new Set(document.slides.map((slide) => slide.id)).size, 3, "asigna IDs nuevos y únicos");
assert.throws(() => normalizeGeneratedCarousel({ ...valid, slides: valid.slides.slice(0, 2) }, input), /exactamente/, "una cantidad incorrecta se rechaza");
assert.throws(() => parseGeneratedCarousel("{", input), /no es un CarouselDocument/, "JSON inválido se rechaza antes de guardar");
assert.match(buildCarouselPrompt({ ...input, brandName: "Norte", primaryColor: "#0a8f52" }), /Norte.*#0a8f52/, "la marca se incorpora al contexto de IA");
assert.match(buildCarouselPrompt({ ...input, language: "es", context: "Lanzamiento regional" }), /Idioma: es.*Lanzamiento regional/, "idioma y contexto llegan al prompt");
console.log("Generación de carrusel: contrato, cantidad exacta y JSON inválido verificados.");
