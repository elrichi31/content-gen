import { adDocumentSchema, type AdDocument } from "@content-gen/domain/ad";
import { normalizeResponsesUsage } from "@content-gen/domain/cost";
import { z } from "zod";
import { openAiRequest } from "./openai.ts";

export const adGenerationInputSchema = z.object({
  topic: z.string().trim().min(3).max(240), audience: z.string().trim().min(2).max(160).default("Audiencia general"), tone: z.string().trim().min(2).max(120).default("Claro y directo"),
  language: z.string().trim().min(2).max(40).default("es"), context: z.string().trim().max(10000).default(""), campaignId: z.string().min(1).optional(), brandKitId: z.string().min(1).optional(),
  format: z.enum(["story", "square", "landscape"]).default("square"), layout: z.enum(["comparison", "promo", "feature", "testimonial", "painSolution"]).default("promo"),
});
export type AdGenerationInput = z.infer<typeof adGenerationInputSchema>;
type AdGenerationRequest = z.input<typeof adGenerationInputSchema> & { brandName?: string; primaryColor?: string; brandBrief?: string };
export class AdGenerationError extends Error { readonly status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

export function normalizeGeneratedAd(value: unknown, input: AdGenerationInput): AdDocument {
  try { return adDocumentSchema.parse({ ...(typeof value === "object" && value ? value : {}), schemaVersion: 1, format: input.format, layout: input.layout }); }
  catch { throw new AdGenerationError("La IA no devolvió un AdDocument válido.", 422); }
}

function responseText(value: unknown) {
  const response = value as { output_text?: unknown; output?: { content?: { type?: unknown; text?: unknown }[] }[] };
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output ?? []) for (const part of item.content ?? []) if (part.type === "output_text" && typeof part.text === "string") return part.text;
  throw new AdGenerationError("La IA no devolvió texto JSON.", 502);
}

export function buildAdPrompt(input: AdGenerationInput & { brandName?: string; primaryColor?: string; brandBrief?: string }) {
  const context = input.context ? ` Contexto: ${input.context}.` : "";
  // El perfil completo de la marca (giro, oferta, voz…) si lo hay; si no, al menos nombre y color.
  const brand = input.brandBrief ? ` ${input.brandBrief}` : input.brandName ? ` Marca: ${input.brandName}${input.primaryColor ? `; color principal ${input.primaryColor}` : ""}.` : "";
  return `Devuelve ÚNICAMENTE JSON de un anuncio ${input.layout} en formato ${input.format}. Tema: ${input.topic}. Audiencia: ${input.audience}. Tono: ${input.tone}. Idioma: ${input.language}.${context}${brand} Incluye todos estos campos string: accentColor, bgColor, textColor, cta, offerBadge, headline, body, originalPrice, newPrice, urgency, compHeadline, leftLabel, rightLabel, featHeadline, featBody, quote, authorName, authorRole, painEmoji, painHeadline, painDesc, solutionEmoji, solutionHeadline, solutionDesc; arrays leftItems, rightItems, features [{emoji,label}]; y stars entero de 0 a 5.`;
}

const IMAGE_FORMAT = { story: { ratio: "9:16", label: "vertical story" }, square: { ratio: "1:1", label: "square feed post" }, landscape: { ratio: "16:9", label: "landscape banner" } } as const;
export const adAspectRatio = (format: AdDocument["format"]) => IMAGE_FORMAT[format].ratio;

/** Texto que debe aparecer en la imagen, por layout. Lo vacío se omite: el modelo inventa lo que se le deja abierto. */
function imageCopy(ad: AdDocument): string[] {
  switch (ad.layout) {
    case "promo": return [`Badge: "${ad.offerBadge}"`, `Headline: "${ad.headline}"`, `Body: "${ad.body}"`, `Old price (struck through): "${ad.originalPrice}"`, `New price (large, highlighted): "${ad.newPrice}"`, `Urgency line: "${ad.urgency}"`, `Button: "${ad.cta}"`];
    case "testimonial": return [`Customer quote: "${ad.quote}"`, `${ad.stars} out of 5 stars`, `Author: "${ad.authorName}", "${ad.authorRole}"`, `Button: "${ad.cta}"`];
    case "comparison": return [`Headline: "${ad.compHeadline}"`, `Left column "${ad.leftLabel}" (negative, muted): ${ad.leftItems.map((item) => `"${item}"`).join(", ")}`, `Right column "${ad.rightLabel}" (positive, accent color): ${ad.rightItems.map((item) => `"${item}"`).join(", ")}`, `Button: "${ad.cta}"`];
    case "feature": return [`Headline: "${ad.featHeadline}"`, `Subtitle: "${ad.featBody}"`, `Feature list with an icon each: ${ad.features.map((feature) => `${feature.emoji} "${feature.label}"`).join(", ")}`, `Button: "${ad.cta}"`];
    case "painSolution": return [`Problem half: ${ad.painEmoji} "${ad.painHeadline}" — "${ad.painDesc}"`, `Solution half: ${ad.solutionEmoji} "${ad.solutionHeadline}" — "${ad.solutionDesc}"`, `Button: "${ad.cta}"`];
  }
}

/** Prompt para que un modelo de imagen (Nano Banana) dibuje el anuncio terminado en vez de la plantilla HTML. */
export function buildImageAdPrompt(ad: AdDocument) {
  const { ratio, label } = IMAGE_FORMAT[ad.format];
  const copy = imageCopy(ad).filter((line) => !/""|: ,|: $/.test(line));
  return `Design a finished, ready-to-publish social media ad: a ${label}, aspect ratio ${ratio}, "${ad.layout}" layout. Modern, clean, professional advertising design with strong visual hierarchy. Background color ${ad.bgColor}, main text color ${ad.textColor}, accent color ${ad.accentColor} for badges, buttons and highlights. Render every text below exactly as written (same language, same spelling and accents), and add no other text, no logos, no watermarks and no placeholder copy.\n${copy.join("\n")}`;
}

/**
 * Prompt para el fondo del anuncio. El texto lo pone la plantilla encima, así que la imagen no puede
 * llevar letras: un modelo de imagen las inventa mal y pelean con el titular real.
 */
export function buildBackgroundPrompt(ad: AdDocument, description = "", industry = "") {
  const subject = description.trim() || ad.headline || ad.compHeadline || ad.featHeadline || ad.quote || ad.painHeadline;
  return `Background image for a social media ad, ${IMAGE_FORMAT[ad.format].label}, aspect ratio ${IMAGE_FORMAT[ad.format].ratio}. Subject and mood: ${subject}.${industry ? ` The brand works in: ${industry}.` : ""} Color palette built around ${ad.bgColor} with ${ad.accentColor} as the accent. Bold, high-quality, striking composition with calm areas of negative space where text will be placed on top. Absolutely no text, letters, numbers, logos, watermarks, buttons or interface elements.`;
}

export async function generateAd(input: AdGenerationRequest, request: typeof fetch = fetch) {
  const resolved = { ...input, ...adGenerationInputSchema.parse(input) };
  if (process.env.CONTENT_GEN_AI_PROVIDER !== "openai") throw new AdGenerationError("La IA está desactivada.", 503);
  const key = process.env.OPENAI_API_KEY; if (!key) throw new AdGenerationError("Falta configurar OPENAI_API_KEY.", 503);
  const response = await openAiRequest("text", request, "https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol", input: [{ role: "system", content: "Generas anuncios. Responde solo JSON válido." }, { role: "user", content: buildAdPrompt(resolved) }], text: { format: { type: "json_object" } } }) });
  const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
  if (!response.ok) throw new AdGenerationError(typeof body?.error?.message === "string" ? `OpenAI: ${body.error.message}` : "No se pudo generar el anuncio.", 502);
  try { return { document: normalizeGeneratedAd(JSON.parse(responseText(body)), resolved), model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol", usage: normalizeResponsesUsage(body) }; }
  catch (error) { if (error instanceof AdGenerationError) throw error; throw new AdGenerationError("La IA no devolvió JSON válido.", 422); }
}
