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
  /** De dónde salen las fotos de los slides que las llevan. `none`: el carrusel no usa layouts con foto. */
  imageSource: z.enum(["none", "unsplash", "openai", "illustration"]).default("none"),
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
    slides: generated.slides.map((raw, index) => { const slide = repairSlide(raw); return { ...slide, layoutVariant: pickVariant(String(slide.layout), slide.layoutVariant, index), id: randomUUID(), backgroundColor: "bg-card", textColor: "text-foreground", accentColor: "text-primary" }; }),
  });
}

type RawSlide = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const firstText = (slide: RawSlide, keys: string[]) => keys.map((key) => text(slide[key])).find(Boolean);

/** Lo que cada layout necesita para no dibujarse vacío. */
const FILLED: Record<string, (slide: RawSlide) => boolean> = {
  cover: (slide) => Boolean(slide.title), content: (slide) => Boolean(slide.title || slide.content), split: (slide) => Boolean(slide.title || slide.content),
  imageOverlay: (slide) => Boolean(slide.title), bigNumber: (slide) => Boolean(slide.bigNumber), quote: (slide) => Boolean(slide.quote), cta: (slide) => Boolean(slide.ctaText),
  list: (slide) => Array.isArray(slide.listItems) && slide.listItems.length > 0, timeline: (slide) => Array.isArray(slide.listItems) && slide.listItems.length > 0, statGrid: (slide) => Array.isArray(slide.listItems) && slide.listItems.length > 0,
};

/**
 * La IA a veces nombra los campos a su manera («items», «stats», «heading», «text»…) y el layout
 * los busca con otro nombre: el slide sale vacío. Aquí se recogen esos alias y, si aun así el
 * layout no tiene con qué dibujarse, pasa a `content` con el texto que haya.
 */
export function repairSlide(raw: RawSlide): RawSlide {
  const slide: RawSlide = { ...raw };
  slide.title ??= firstText(raw, ["heading", "headline", "titulo"]);
  slide.content ??= firstText(raw, ["text", "body", "description", "texto"]);
  if (!Array.isArray(slide.listItems)) {
    const items = [raw.items, raw.stats, raw.steps, raw.points].find(Array.isArray) as unknown[] | undefined;
    if (items) slide.listItems = items.map((item, index) => typeof item === "string" ? { emoji: String(index + 1).padStart(2, "0"), text: item } : { emoji: String((item as RawSlide).emoji ?? (item as RawSlide).value ?? (item as RawSlide).number ?? String(index + 1).padStart(2, "0")), text: String((item as RawSlide).text ?? (item as RawSlide).label ?? "") });
  }
  if (Array.isArray(slide.listItems)) slide.listItems = (slide.listItems as RawSlide[]).filter((item) => text(item?.text)).map((item) => ({ emoji: String(item.emoji ?? ""), text: String(item.text) }));
  slide.imagePrompt ??= firstText(raw, ["imageQuery", "image_query", "imageSearch"]);
  const layout = String(slide.layout);
  if (layout === "cta") { slide.ctaText ??= slide.title; slide.ctaSubtext ??= slide.content; }
  if (layout === "quote") slide.quote ??= slide.content ?? slide.title;
  if (FILLED[layout]?.(slide) ?? true) return slide;
  if (layout === "cover" || layout === "cta") return { ...slide, title: slide.title ?? slide.ctaText ?? slide.content, ctaText: slide.ctaText ?? slide.title };
  return { ...slide, layout: "content", title: slide.title ?? slide.bigNumberLabel ?? slide.quote };
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

/**
 * Variantes visuales que la IA puede elegir por layout, con una pista de cuándo sirve cada una.
 * Solo las que se dibujan bien sin foto propia (salvo en split/imageOverlay, que siempre la llevan).
 */
export const LAYOUT_VARIANTS: Record<string, Record<string, string>> = {
  cover: { centered: "centrado", bold: "titular enorme", minimal: "sobrio", badge: "con etiqueta" },
  content: { default: "clásico", centered: "centrado", editorial: "revista, número gigante detrás", sticker: "tarjeta llamativa, para una idea fuerte" },
  list: { default: "con emoji", numbered: "numerada", cards: "tarjetas", bento: "mosaico, para 4 elementos" },
  bigNumber: { default: "centrado", horizontal: "cifra y texto lado a lado", full: "a todo color", outline: "cifra gigante en contorno" },
  quote: { default: "centrada", left: "a la izquierda", card: "en tarjeta", mark: "comilla gigante" },
  split: { "image-right": "foto a la derecha", "image-left": "foto a la izquierda", arch: "foto en arco", circle: "foto en círculo" },
  imageOverlay: { bottom: "foto a sangre, texto abajo", polaroid: "foto como polaroid", band: "foto arriba, texto abajo", window: "foto enmarcada con tarjeta de texto" },
  timeline: { default: "línea", steps: "pasos", minimal: "minimal" },
  statGrid: { default: "grid 2×2", row: "fila", large: "grande" },
  cta: { centered: "centrado", card: "tarjeta", minimal: "minimal" },
};

/** Si la IA no eligió variante (o inventó una), se reparte una según la posición para que el carrusel no se repita. */
export function pickVariant(layout: string, requested: unknown, index: number) {
  const options = Object.keys(LAYOUT_VARIANTS[layout] ?? {});
  if (!options.length) return undefined;
  return typeof requested === "string" && options.includes(requested) ? requested : options[index % options.length];
}

/** Los campos que lee cada layout. Si la IA usa otros nombres, el slide se dibuja vacío. */
export const LAYOUT_FIELDS: Record<string, string> = {
  cover: "title (máx 40 caracteres), subtitle (máx 80 caracteres)",
  content: "title (máx 45 caracteres), content (máx 160 caracteres)",
  list: "title (máx 40 caracteres), listItems [{emoji, text}] con 3 a 5 elementos de máximo 60 caracteres cada uno",
  bigNumber: "bigNumber (cifra corta, ej. «73%»), bigNumberLabel (máx 90 caracteres)",
  quote: "quote (máx 140 caracteres), quoteAuthor (máx 30 caracteres)",
  split: "title (máx 40 caracteres), content (máx 130 caracteres), imageQuery",
  imageOverlay: "title (máx 40 caracteres), subtitle (máx 90 caracteres), imageQuery",
  timeline: "title (máx 40 caracteres), listItems [{emoji: \"01\", text}] con 3 a 5 pasos de máximo 50 caracteres",
  statGrid: "title (máx 40 caracteres), listItems [{emoji: cifra, text: etiqueta de máximo 30 caracteres}] con 4 elementos",
  cta: "ctaText (máx 40 caracteres), ctaSubtext (máx 90 caracteres)",
};

export function buildCarouselPrompt(input: CarouselGenerationInput & { brandName?: string; primaryColor?: string; brandBrief?: string }) {
  // El perfil completo de la marca (giro, oferta, voz…) si lo hay; si no, al menos nombre y color.
  const brand = input.brandBrief ? ` ${input.brandBrief}` : input.brandName ? ` Marca: ${input.brandName}${input.primaryColor ? `; color principal ${input.primaryColor}` : ""}.` : "";
  const context = input.context ? ` Contexto: ${input.context}.` : "";
  const images = input.imageSource === "none"
    ? "No uses los layouts split ni imageOverlay."
    : input.imageSource === "illustration"
    ? "Usa split en la mitad de los slides de contenido (alternando con los demás, nunca imageOverlay, nunca en la portada ni el cierre), y en esos incluye imageQuery: una escena concreta EN INGLÉS para ilustrar (ej. «person reviewing security alerts on a laptop»)."
    : "Usa split o imageOverlay en la mitad de los slides (alternando con los demás), y en esos incluye imageQuery: 3 a 6 palabras EN INGLÉS que describan una foto concreta para buscarla (ej. «team meeting laptop office»).";
  return `Devuelve ÚNICAMENTE JSON con caption {text, hashtags} y slides. Tema: ${input.topic}. Audiencia: ${input.audience}. Tono: ${input.tone}. Idioma: ${input.language}.${context}${brand} Crea exactamente ${input.slideCount} slides: la primera layout cover, la última cta. Varía los layouts; no repitas el mismo dos veces seguidas. Campos EXACTOS por layout (no inventes otros nombres). Los límites de caracteres son estrictos: si no cabe, resume; el texto largo se corta en el diseño:
${Object.entries(LAYOUT_FIELDS).map(([layout, fields]) => `- ${layout}: ${fields}`).join("\n")}
${images}
Cada slide lleva layoutVariant, elige la que mejor encaje con su contenido y varíalas a lo largo del carrusel:
${Object.entries(LAYOUT_VARIANTS).map(([layout, variants]) => `- ${layout}: ${Object.entries(variants).map(([id, hint]) => `${id} (${hint})`).join(", ")}`).join("\n")}
caption.text: 2 o 3 frases, máximo 280 caracteres, sin repetir los slides. caption.hashtags: 4 a 6. En títulos, citas y cifras puedes resaltar UNA palabra o cifra clave envolviéndola en *asteriscos* (por ejemplo «Deja de *perder* ventas»); úsalo solo donde de verdad cargue la idea, en pocos slides, nunca en el cuerpo ni en más de una palabra por texto.`;
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
