import assert from "node:assert/strict";
import { adDocumentSchema, convertLegacyAd } from "./ad.ts";

const legacy = {
  format: "square", layout: "comparison", accentColor: "#6366f1", bgColor: "#0f0f0f", textColor: "#ffffff", cta: "Empieza gratis",
  offerBadge: "50% OFF", headline: "Transforma tu negocio con IA", body: "Crea contenido profesional en segundos.", originalPrice: "$99", newPrice: "$49", urgency: "Oferta termina hoy",
  compHeadline: "¿Por qué elegirnos?", leftLabel: "Competencia", rightLabel: "Nosotros", leftItems: ["Lento"], rightItems: ["Rápido"],
  featHeadline: "Todo lo que necesitas", featBody: "Una plataforma completa.", features: [{ emoji: "⚡", label: "Rápido" }],
  quote: "Transformó nuestro negocio.", authorName: "María", authorRole: "CEO", stars: 5,
  painEmoji: "😩", painHeadline: "El problema", painDesc: "Pierdes tiempo.", solutionEmoji: "🚀", solutionHeadline: "La solución", solutionDesc: "Crea con IA.", preservedLegacyField: "conservar",
};
const converted = convertLegacyAd(legacy);
assert.equal(converted.schemaVersion, 1, "asigna la versión del documento");
assert.equal(converted.preservedLegacyField, "conservar", "conserva campos legacy desconocidos");
assert.equal(adDocumentSchema.safeParse({ ...converted, stars: 6 }).success, false, "rechaza una calificación fuera de rango");
console.log("AdDocument: fixture legacy convertido sin pérdida.");
