import { randomUUID } from "node:crypto";
import { carouselDocumentSchema, type CarouselDocument } from "@content-gen/domain/carousel";
import { normalizeResponsesUsage } from "@content-gen/domain/cost";
import { z } from "zod";
import { openAiRequest } from "./openai.ts";

export const carouselGenerationInputSchema = z.object({
  topic: z.string().trim().min(3).max(240),
  audience: z.string().trim().min(2).max(160).default("Audiencia general"),
  tone: z.string().trim().min(2).max(120).default("Claro y editorial"),
  language: z.string().trim().min(2).max(40).default("es"),
  context: z.string().trim().max(10000).default(""),
  slideCount: z.number().int().min(3).max(20),
  campaignId: z.string().min(1).optional(),
  brandKitId: z.string().min(1).optional(),
});

export type CarouselGenerationInput = z.infer<typeof carouselGenerationInputSchema>;
type CarouselGenerationRequest = z.input<typeof carouselGenerationInputSchema> & { brandName?: string; primaryColor?: string; brandBrief?: string };

export class GenerationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function normalizeGeneratedCarousel(value: unknown, input: CarouselGenerationInput): CarouselDocument {
  if (typeof value !== "object" || !value || !Array.isArray((value as { slides?: unknown }).slides)) throw new GenerationError("La respuesta de IA no es un CarouselDocument válido.", 422);
  const generated = value as { caption?: { text?: unknown; hashtags?: unknown }; slides: Record<string, unknown>[] };
  if (generated.slides.length !== input.slideCount) throw new GenerationError(`La IA debe devolver exactamente ${input.slideCount} slides.`, 422);
  if (generated.slides.some((slide) => typeof slide !== "object" || !slide) || generated.slides[0]?.layout !== "cover" || generated.slides.at(-1)?.layout !== "cta") throw new GenerationError("La IA debe iniciar con cover y terminar con cta.", 422);
  return carouselDocumentSchema.parse({
    schemaVersion: 1,
    topic: input.topic,
    platform: "instagram",
    caption: { text: typeof generated.caption?.text === "string" ? generated.caption.text : "", hashtags: Array.isArray(generated.caption?.hashtags) && generated.caption.hashtags.every((tag) => typeof tag === "string") ? generated.caption.hashtags : [] },
    generation: { ...input, visualStyle: "Editorial oscuro", withImages: false, imageSource: "upload" },
    slides: generated.slides.map((slide) => ({ ...slide, id: randomUUID(), backgroundColor: "bg-card", textColor: "text-foreground", accentColor: "text-primary" })),
  });
}

export function parseGeneratedCarousel(text: string, input: CarouselGenerationInput) {
  try { return normalizeGeneratedCarousel(JSON.parse(text), input); }
  catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("La respuesta de IA no es un CarouselDocument válido.", 422);
  }
}

function readOutputText(value: unknown) {
  if (typeof value !== "object" || !value) throw new GenerationError("La IA no devolvió una respuesta utilizable.", 502);
  const response = value as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") return response.output_text;
  if (Array.isArray(response.output)) for (const item of response.output) {
    if (typeof item !== "object" || !item) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) if (typeof part === "object" && part && (part as { type?: unknown; text?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
  }
  throw new GenerationError("La IA no devolvió texto JSON.", 502);
}

export function buildCarouselPrompt(input: CarouselGenerationInput & { brandName?: string; primaryColor?: string; brandBrief?: string }) {
  // El perfil completo de la marca (giro, oferta, voz…) si lo hay; si no, al menos nombre y color.
  const brand = input.brandBrief ? ` ${input.brandBrief}` : input.brandName ? ` Marca: ${input.brandName}${input.primaryColor ? `; color principal ${input.primaryColor}` : ""}.` : "";
  const context = input.context ? ` Contexto: ${input.context}.` : "";
  return `Devuelve ÚNICAMENTE JSON con caption {text, hashtags} y slides. Tema: ${input.topic}. Audiencia: ${input.audience}. Tono: ${input.tone}. Idioma: ${input.language}.${context}${brand} Crea exactamente ${input.slideCount} slides: la primera layout cover, la última cta. Cada slide usa uno de cover, content, list, bigNumber, quote, split, imageOverlay, timeline, statGrid, cta y sus campos de texto correspondientes. En títulos, citas y cifras puedes resaltar UNA palabra o cifra clave envolviéndola en *asteriscos* (por ejemplo «Deja de *perder* ventas»); úsalo solo donde de verdad cargue la idea, en pocos slides, nunca en el cuerpo ni en más de una palabra por texto.`;
}

export async function generateCarousel(input: CarouselGenerationRequest, request: typeof fetch = fetch) {
  const resolved = { ...input, ...carouselGenerationInputSchema.parse(input) };
  if (process.env.CONTENT_GEN_AI_PROVIDER !== "openai") throw new GenerationError("La IA está desactivada. Configura CONTENT_GEN_AI_PROVIDER=openai para generar.", 503);
  const key = process.env.OPENAI_API_KEY; const model = process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol";
  if (!key) throw new GenerationError("Falta configurar OPENAI_API_KEY.", 503);
  const response = await openAiRequest("text", request, "https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model, input: [{ role: "system", content: "Generas carruseles de contenido. Responde solo JSON válido." }, { role: "user", content: buildCarouselPrompt(resolved) }], text: { format: { type: "json_object" } } }) });
  const payload = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
  if (!response.ok) throw new GenerationError(typeof payload?.error?.message === "string" ? `OpenAI: ${payload.error.message}` : "No se pudo generar el carrusel.", 502);
  return { document: parseGeneratedCarousel(readOutputText(payload), resolved), model, usage: normalizeResponsesUsage(payload) };
}
