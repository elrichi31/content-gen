"use client";

import type { AdDocument } from "@content-gen/domain/ad";
import type { AdState } from "./types";
import { ComparisonAd } from "./comparison-ad";
import { PromoAd } from "./promo-ad";
import { FeatureAd } from "./feature-ad";
import { TestimonialAd } from "./testimonial-ad";
import { PainSolutionAd } from "./pain-solution-ad";
import { alpha } from "./ad-style";
import { FONT, fill } from "./kit";

/** Cuánto vela el fondo cada plantilla: la que pone texto directo sobre la foto necesita más. */
const SCRIM: Record<AdState["layout"], number> = { promo: 0.4, testimonial: 0.7, comparison: 0.6, feature: 0.78, painSolution: 0.5 };

/** Con imagen: foto a sangre con un velo del color de fondo. Sin imagen: trama de puntos, como un impreso. */
function Backdrop({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  if (ad.imageAssetId) {
    const s = SCRIM[ad.layout];
    return (
      <>
        <img src={`/api/assets/${ad.imageAssetId}`} alt="" style={{ ...fill, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ ...fill, background: `linear-gradient(180deg, ${alpha(ad.bgColor, Math.min(1, s + 0.25))} 0%, ${alpha(ad.bgColor, s)} 45%, ${alpha(ad.bgColor, Math.min(1, s + 0.3))} 100%)` }} />
      </>
    );
  }
  const step = Math.min(w, h) * 0.022;
  return <div style={{ ...fill, backgroundImage: `radial-gradient(circle, ${alpha(ad.textColor, 0.1)} 0, ${alpha(ad.textColor, 0.1)} ${step * 0.07}px, transparent ${step * 0.12}px)`, backgroundSize: `${step}px ${step}px` }} />;
}

export function AdRenderer({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const props = { ad, w, h };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", backgroundColor: ad.bgColor, color: ad.textColor, fontFamily: FONT }}>
      <Backdrop {...props} />
      <div style={{ ...fill, display: "flex", flexDirection: "column" }}>
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
