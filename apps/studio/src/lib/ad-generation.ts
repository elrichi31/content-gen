import { adDocumentSchema, type AdDocument } from "@content-gen/domain/ad";
import { z } from "zod";
import { openAiRequest } from "./openai.ts";

export const adGenerationInputSchema = z.object({
  topic: z.string().trim().min(3).max(240), audience: z.string().trim().min(2).max(160).default("Audiencia general"), tone: z.string().trim().min(2).max(120).default("Claro y directo"),
  language: z.string().trim().min(2).max(40).default("es"), context: z.string().trim().max(10000).default(""), campaignId: z.string().min(1).optional(),
  format: z.enum(["story", "square", "landscape"]).default("square"), layout: z.enum(["comparison", "promo", "feature", "testimonial", "painSolution"]).default("promo"),
});
export type AdGenerationInput = z.infer<typeof adGenerationInputSchema>;
type AdGenerationRequest = z.input<typeof adGenerationInputSchema> & { brandName?: string; primaryColor?: string };
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

export function buildAdPrompt(input: AdGenerationInput & { brandName?: string; primaryColor?: string }) {
  const context = input.context ? ` Contexto: ${input.context}.` : "";
  const brand = input.brandName ? ` Marca: ${input.brandName}${input.primaryColor ? `; color principal ${input.primaryColor}` : ""}.` : "";
  return `Devuelve ÚNICAMENTE JSON de un anuncio ${input.layout} en formato ${input.format}. Tema: ${input.topic}. Audiencia: ${input.audience}. Tono: ${input.tone}. Idioma: ${input.language}.${context}${brand} Incluye todos estos campos string: accentColor, bgColor, textColor, cta, offerBadge, headline, body, originalPrice, newPrice, urgency, compHeadline, leftLabel, rightLabel, featHeadline, featBody, quote, authorName, authorRole, painEmoji, painHeadline, painDesc, solutionEmoji, solutionHeadline, solutionDesc; arrays leftItems, rightItems, features [{emoji,label}]; y stars entero de 0 a 5.`;
}

export async function generateAd(input: AdGenerationRequest, request: typeof fetch = fetch) {
  const resolved = { ...input, ...adGenerationInputSchema.parse(input) };
  if (process.env.CONTENT_GEN_AI_PROVIDER !== "openai") throw new AdGenerationError("La IA está desactivada.", 503);
  const key = process.env.OPENAI_API_KEY; if (!key) throw new AdGenerationError("Falta configurar OPENAI_API_KEY.", 503);
  const response = await openAiRequest("text", request, "https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol", input: [{ role: "system", content: "Generas anuncios. Responde solo JSON válido." }, { role: "user", content: buildAdPrompt(resolved) }], text: { format: { type: "json_object" } } }) });
  const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
  if (!response.ok) throw new AdGenerationError(typeof body?.error?.message === "string" ? `OpenAI: ${body.error.message}` : "No se pudo generar el anuncio.", 502);
  try { return normalizeGeneratedAd(JSON.parse(responseText(body)), resolved); }
  catch (error) { if (error instanceof AdGenerationError) throw error; throw new AdGenerationError("La IA no devolvió JSON válido.", 422); }
}
