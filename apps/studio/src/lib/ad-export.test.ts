import assert from "node:assert/strict";
import sharp from "sharp";
import { exportAd } from "./ad-export.ts";

const base = { schemaVersion: 1 as const, layout: "promo" as const, accentColor: "#62de91", bgColor: "#101210", textColor: "#ffffff", cta: "Probar", offerBadge: "Oferta", headline: "Exportar anuncio", body: "Prueba", originalPrice: "$9", newPrice: "$4", urgency: "Hoy", compHeadline: "Compara", leftLabel: "Antes", rightLabel: "Ahora", leftItems: ["Lento"], rightItems: ["Rápido"], featHeadline: "Todo", featBody: "Incluido", features: [{ emoji: "+", label: "Simple" }], quote: "Funciona", authorName: "Ana", authorRole: "CEO", stars: 5, painEmoji: "!", painHeadline: "Problema", painDesc: "Tiempo", solutionEmoji: "+", solutionHeadline: "Solución", solutionDesc: "IA" };
for (const layout of ["promo", "testimonial", "comparison", "feature", "painSolution"] as const) {
  const image = await sharp(await exportAd({ ...base, layout, format: "square" })).metadata(); assert.equal(image.width, 1080); assert.equal(image.height, 1080);
}
for (const [format, width, height] of [["story", 1080, 1920], ["square", 1080, 1080], ["landscape", 1920, 1080]] as const) {
  const image = await sharp(await exportAd({ ...base, format })).metadata(); assert.equal(image.width, width); assert.equal(image.height, height);
}
console.log("Exportación de anuncio: formatos PNG verificados.");
