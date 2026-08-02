"use client";

import type { AdDocument } from "@content-gen/domain/ad";
import type { AdState } from "./types";
import { ComparisonAd } from "./comparison-ad";
import { PromoAd } from "./promo-ad";
import { FeatureAd } from "./feature-ad";
import { TestimonialAd } from "./testimonial-ad";
import { PainSolutionAd } from "./pain-solution-ad";

export function AdRenderer({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const props = { ad, w, h };
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ backgroundColor: ad.bgColor }}>
      {ad.imageAssetId ? <><img src={`/api/assets/${ad.imageAssetId}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" /><div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black/75" /></> : null}
      <div className="relative flex h-full w-full flex-col">
        {ad.layout === "comparison" && <ComparisonAd {...props} />}
        {ad.layout === "promo" && <PromoAd {...props} />}
        {ad.layout === "feature" && <FeatureAd {...props} />}
        {ad.layout === "testimonial" && <TestimonialAd {...props} />}
        {ad.layout === "painSolution" && <PainSolutionAd {...props} />}
      </div>
    </div>
  );
}

export const adFixture: AdDocument = {
  schemaVersion: 1,
  format: "square",
  layout: "promo",
  accentColor: "#62de91",
  bgColor: "#0d0f0d",
  textColor: "#f5f5f0",
  cta: "Empieza ahora",
  offerBadge: "-40% HOY",
  headline: "Crea contenido que se queda",
  body: "Carruseles, anuncios y video desde un solo estudio con IA.",
  originalPrice: "$49/mes",
  newPrice: "$29/mes",
  urgency: "Solo por 48 horas",
  compHeadline: "¿Por qué elegir Content Gen?",
  leftLabel: "Otras herramientas",
  rightLabel: "Content Gen",
  leftItems: ["Flujos separados", "Sin marca compartida", "Exportación manual"],
  rightItems: ["Todo en un estudio", "Marca y campaña unificadas", "Exporta PNG y ZIP"],
  featHeadline: "Todo lo que necesitas",
  featBody: "Un flujo, muchos formatos.",
  features: [
    { emoji: "🎠", label: "Carruseles" },
    { emoji: "📣", label: "Anuncios" },
    { emoji: "🎬", label: "Video" },
    { emoji: "✨", label: "IA integrada" },
  ],
  quote: "Pasé de tardar horas a publicar en minutos. La marca se ve consistente en todo.",
  authorName: "Ana Ruiz",
  authorRole: "Social Media Manager",
  stars: 5,
  painEmoji: "😵",
  painHeadline: "Contenido disperso y lento",
  painDesc: "Saltas entre apps y pierdes la coherencia de marca.",
  solutionEmoji: "🚀",
  solutionHeadline: "Un solo estudio con IA",
  solutionDesc: "Genera, edita y exporta todo desde el mismo lugar.",
};
