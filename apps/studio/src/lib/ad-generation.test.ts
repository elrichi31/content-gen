import assert from "node:assert/strict";
import { adGenerationInputSchema, buildAdPrompt, generateAd, normalizeGeneratedAd } from "./ad-generation.ts";

const input = adGenerationInputSchema.parse({ topic: "Contenido claro", format: "square", layout: "promo" });
const valid = { accentColor: "#111", bgColor: "#000", textColor: "#fff", cta: "Probar", offerBadge: "Oferta", headline: "Título", body: "Texto", originalPrice: "$9", newPrice: "$4", urgency: "Hoy", compHeadline: "Compara", leftLabel: "Antes", rightLabel: "Ahora", leftItems: ["Lento"], rightItems: ["Rápido"], featHeadline: "Todo", featBody: "Incluido", features: [{ emoji: "✓", label: "Simple" }], quote: "Funciona", authorName: "Ana", authorRole: "CEO", stars: 5, painEmoji: "!", painHeadline: "Problema", painDesc: "Tiempo", solutionEmoji: "+", solutionHeadline: "Solución", solutionDesc: "IA" };
const document = normalizeGeneratedAd({ ...valid, layout: "testimonial" }, input);
assert.equal(document.layout, "promo", "la regeneración conserva el layout solicitado");
assert.equal(document.format, "square", "conserva el formato solicitado");
assert.throws(() => normalizeGeneratedAd({ ...valid, stars: 7 }, input), /válido/, "rechaza respuestas fuera de contrato");
assert.match(buildAdPrompt(input), /promo.*square/, "el prompt fija layout y formato");
assert.match(buildAdPrompt({ ...input, language: "es", context: "Lanzamiento regional", brandName: "Norte", primaryColor: "#0a8f52" }), /Idioma: es.*Lanzamiento regional.*Norte.*#0a8f52/, "el prompt hereda brief y marca");
process.env.CONTENT_GEN_AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "test";
const generated = await generateAd(input, async () => new Response(JSON.stringify({ output_text: JSON.stringify(valid), usage: { input_tokens: 40, output_tokens: 90 } })));
assert.equal(generated.document.headline, "Título", "aplica una respuesta HTTP válida de IA");
assert.deepEqual(generated.usage, { inputTokens: 40, cachedInputTokens: 0, outputTokens: 90, webSearchCalls: 0, images: 0, characters: 0 }, "devuelve el consumo para poder contabilizarlo");
console.log("Generación de anuncio: contrato, formato, layout y consumo verificados.");
