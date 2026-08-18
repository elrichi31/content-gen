import { randomUUID } from "node:crypto";
import { carouselDocumentSchema, carouselSlideSchema, type CarouselDocument } from "@content-gen/domain/carousel";
import { normalizeResponsesUsage } from "@content-gen/domain/cost";
import { openAiRequest } from "./openai.ts";

type Slide = CarouselDocument["slides"][number];
const text = (value: unknown): unknown => typeof value === "string" ? value : Array.isArray(value) ? value.map(text).filter((item): item is string => typeof item === "string" && item.length > 0).join(" ") : value && typeof value === "object" ? Object.values(value).map(text).filter((item): item is string => typeof item === "string" && item.length > 0).join(" ") : value;
const normalize = (value: object) => ({ ...value, content: text((value as { content?: unknown }).content), title: text((value as { title?: unknown }).title), subtitle: text((value as { subtitle?: unknown }).subtitle), ctaText: text((value as { ctaText?: unknown }).ctaText), ctaSubtext: text((value as { ctaSubtext?: unknown }).ctaSubtext) });

export function replaceSlide(document: CarouselDocument, index: number, value: unknown) {
  if (!Number.isInteger(index) || index < 0 || index >= document.slides.length) throw new Error("Índice de slide inválido.");
  const base = typeof value === "object" && value ? value : {}; const slide = carouselSlideSchema.parse({ ...normalize(base), layout: document.slides[index].layout, id: document.slides[index].id, backgroundColor: "bg-card", textColor: "text-foreground", accentColor: "text-primary" });
  return carouselDocumentSchema.parse({ ...document, slides: document.slides.map((current, currentIndex) => currentIndex === index ? slide : current) });
}

export function addBeforeCta(document: CarouselDocument, value: unknown) {
  const base = typeof value === "object" && value ? value : {}; const slide = carouselSlideSchema.parse({ ...normalize(base), id: randomUUID(), backgroundColor: "bg-card", textColor: "text-foreground", accentColor: "text-primary" }); const ctaIndex = document.slides.findIndex((item) => item.layout === "cta"); const at = ctaIndex < 0 ? document.slides.length : ctaIndex;
  return carouselDocumentSchema.parse({ ...document, slides: [...document.slides.slice(0, at), slide, ...document.slides.slice(at)] });
}

function outputText(value: unknown) {
  const response = value as { output_text?: unknown; output?: { content?: { type?: unknown; text?: unknown }[] }[] }; if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) for (const part of item.content ?? []) if (part.type === "output_text" && typeof part.text === "string") return part.text;
  throw new Error("La IA no devolvió JSON de slide.");
}

export async function generateSlide(topic: string, layout: Slide["layout"], request: typeof fetch = fetch) {
  if (process.env.CONTENT_GEN_AI_PROVIDER !== "openai" || !process.env.OPENAI_API_KEY) throw new Error("OpenAI no está configurado.");
  const response = await openAiRequest("text", request, "https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol", input: `Responde solamente JSON de una slide layout ${layout} para el tema "${topic}". Incluye los campos de texto adecuados para ese layout.`, text: { format: { type: "json_object" } } }) });
  const body = await response.json().catch(() => null); if (!response.ok) throw new Error("No se pudo generar la slide.");
  return { slide: JSON.parse(outputText(body)), model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol", usage: normalizeResponsesUsage(body) };
}
