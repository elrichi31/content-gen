import { z } from "zod";

export const aiCarouselInputSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  slides: z.number().int().min(2).max(10).default(6),
  language: z.string().trim().min(2).max(40).default("es"),
  brandKitId: z.string().min(1).optional(),
  provider: z.enum(["gemini", "openai"]).default("gemini"),
});

/** Precio por slide según config/pricing.json: Nano Banana 2 a 1K y GPT Image 2 en calidad high. */
export const AI_CAROUSEL_PRICE = { gemini: 0.067, openai: 0.165 } as const;
export type AiCarouselInput = z.infer<typeof aiCarouselInputSchema>;

const planSchema = z.object({
  style: z.string().min(10),
  slides: z.array(z.object({ headline: z.string().min(1), body: z.string().default("") })).min(1),
});
export type AiCarouselPlan = z.infer<typeof planSchema>;

export function buildPlanPrompt(input: AiCarouselInput, brandBrief = "") {
  return `Planifica un carrusel de Instagram de exactamente ${input.slides} slides sobre: ${input.topic}. Idioma: ${input.language}.${brandBrief ? ` ${brandBrief}` : ""}
Slide 1 es el gancho, la última es el CTA. Textos cortos: headline de máximo 8 palabras, body de máximo 20.
Devuelve JSON {"style": "dirección de arte en inglés, detallada (paleta con hex, tipografía, fondo, ilustración/foto, composición), idéntica para todas las slides", "slides": [{"headline": "...", "body": "..."}]}`;
}

export function parsePlan(value: unknown, count: number): AiCarouselPlan {
  const plan = planSchema.parse(value);
  return { ...plan, slides: plan.slides.slice(0, count) };
}

/** Cada slide se genera aparte; el estilo repetido palabra por palabra es lo que las hace parecer una serie. */
export function buildSlidePrompt(plan: AiCarouselPlan, index: number, brand?: { name: string; primaryColor?: string; hasLogo?: boolean }) {
  const slide = plan.slides[index];
  const brandLines = brand ? `
Brand: "${brand.name}".${brand.primaryColor ? ` Use ${brand.primaryColor} as the dominant brand color.` : ""}${brand.hasLogo ? " The attached image is the brand logo: place it small and unaltered in a corner (same shapes, colors and lettering); do not redraw or invent a different logo." : ""}` : "";
  return `Design slide ${index + 1} of ${plan.slides.length} of a cohesive Instagram carousel, portrait. Art direction shared by every slide: ${plan.style}${brandLines}
Render exactly this text (same language, spelling and accents), and no other text or watermarks:
Headline: "${slide.headline}"${slide.body ? `\nBody: "${slide.body}"` : ""}
Small page indicator "${index + 1}/${plan.slides.length}" in a corner.`;
}
