import assert from "node:assert/strict";
import type { AdDocument } from "@content-gen/domain/ad";
import { adAspectRatio, buildBackgroundPrompt, buildImageAdPrompt } from "./ad-generation.ts";
import { generateGeminiImage } from "./gemini.ts";

const adFixture: AdDocument = { schemaVersion: 1, format: "square", layout: "promo", accentColor: "#62de91", bgColor: "#0d0f0d", textColor: "#f5f5f0", cta: "Empieza ahora", offerBadge: "-40% HOY", headline: "Crea contenido que se queda", body: "Todo desde un estudio.", originalPrice: "$49/mes", newPrice: "$29/mes", urgency: "Solo por 48 horas", compHeadline: "¿Por qué elegirnos?", leftLabel: "Otras", rightLabel: "Nosotros", leftItems: ["Flujos separados"], rightItems: ["Todo en un estudio"], featHeadline: "Todo", featBody: "Un flujo.", features: [{ emoji: "🎠", label: "Carruseles" }], quote: "Publico en minutos.", authorName: "Ana Ruiz", authorRole: "Social Media Manager", stars: 5, painEmoji: "😵", painHeadline: "Lento", painDesc: "Apps sueltas.", solutionEmoji: "🚀", solutionHeadline: "Un estudio", solutionDesc: "Todo junto." };

const promo = buildImageAdPrompt(adFixture);
assert.match(promo, /1:1/, "el formato square pide 1:1");
assert.match(promo, /"-40% HOY"[\s\S]*"Crea contenido que se queda"[\s\S]*"\$29\/mes"[\s\S]*"Empieza ahora"/, "el prompt lleva el texto exacto del anuncio");
assert.match(promo, /#62de91/, "el prompt lleva el color de acento");
assert.equal(adAspectRatio("story"), "9:16");
assert.equal(adAspectRatio("landscape"), "16:9");
assert.doesNotMatch(buildImageAdPrompt({ ...adFixture, urgency: "" }), /Urgency/, "un campo vacío no se le pide al modelo");
assert.match(buildImageAdPrompt({ ...adFixture, layout: "comparison" }), /"Flujos separados"[\s\S]*"Todo en un estudio"/, "la comparación lleva ambas columnas");

const background = buildBackgroundPrompt(adFixture, "taller de cerámica");
assert.match(background, /taller de cerámica/, "la idea del usuario manda sobre el titular");
assert.match(background, /Absolutely no text/, "el fondo se pide sin letras: el texto lo pone la plantilla");
assert.match(background, /1:1/, "el fondo respeta el formato");
assert.match(buildBackgroundPrompt(adFixture), /Crea contenido que se queda/, "sin idea, parte del titular");
assert.match(buildBackgroundPrompt(adFixture, "", "Consultora de ciberseguridad"), /brand works in: Consultora de ciberseguridad/, "el giro de la marca da ambiente al fondo");

delete process.env.GEMINI_API_KEY;
await assert.rejects(generateGeminiImage({ prompt: "x", aspectRatio: "1:1" }), /GEMINI_API_KEY/, "sin clave no llama a la API");

process.env.GEMINI_API_KEY = "test";
let sent: { url: string; key: string | null; body: Record<string, unknown> } | null = null;
const png = Buffer.from("imagen").toString("base64");
const image = await generateGeminiImage({ prompt: "anuncio", aspectRatio: "9:16", request: async (url, init) => {
  sent = { url: String(url), key: new Headers(init?.headers).get("x-goog-api-key"), body: JSON.parse(String(init?.body)) };
  return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text: "listo" }, { type: "image", mime_type: "image/jpeg", data: png }] }] }));
} });
assert.equal(sent!.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
assert.equal(sent!.key, "test", "la clave viaja en x-goog-api-key, no en la URL");
assert.deepEqual(sent!.body.response_format, { type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16", image_size: "1K" });
assert.equal(image.bytes.toString(), "imagen", "decodifica la imagen del paso model_output");
assert.equal(image.model, "gemini-3.1-flash-image");
assert.equal(image.usage.images, 1, "cuenta una imagen para el costo");

await assert.rejects(generateGeminiImage({ prompt: "x", aspectRatio: "1:1", request: async () => new Response(JSON.stringify({ error: { message: "cuota agotada" } }), { status: 429 }) }), /Gemini: cuota agotada/);
await assert.rejects(generateGeminiImage({ prompt: "x", aspectRatio: "1:1", request: async () => new Response(JSON.stringify({ steps: [] })) }), /no devolvió una imagen/);
console.log("Nano Banana: prompt, petición, respuesta y errores verificados.");
