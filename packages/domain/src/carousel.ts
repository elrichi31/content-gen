import { z } from "zod";

const schemaVersion = z.literal(1);
const layout = z.enum(["cover", "content", "list", "bigNumber", "quote", "split", "imageOverlay", "timeline", "statGrid", "cta"]);

export const carouselSlideSchema = z.object({
  id: z.string().min(1), layout, title: z.string().optional(), subtitle: z.string().optional(), content: z.string().optional(), emoji: z.string().optional(),
  listItems: z.array(z.object({ emoji: z.string(), text: z.string() })).optional(), bigNumber: z.string().optional(), bigNumberLabel: z.string().optional(), quote: z.string().optional(), quoteAuthor: z.string().optional(), ctaText: z.string().optional(), ctaSubtext: z.string().optional(),
  imageUrl: z.string().optional(), imagePosition: z.enum(["left", "right", "background"]).optional(), imagePrompt: z.string().optional(), imageSource: z.enum(["unsplash", "dalle", "upload"]).optional(), layoutVariant: z.string().optional(),
  backgroundColor: z.string().min(1), textColor: z.string().min(1), accentColor: z.string().optional(), bgStyleOverride: z.string().optional(), titleSize: z.enum(["compact", "regular", "large", "display"]).optional(),
}).passthrough();

const caption = z.object({ text: z.string(), hashtags: z.array(z.string()) });
const generation = z.object({ topic: z.string(), audience: z.string(), tone: z.string(), slideCount: z.number().int().positive(), visualStyle: z.string(), withImages: z.boolean(), imageSource: z.enum(["unsplash", "dalle", "upload"]) });

export const carouselDocumentSchema = z.object({
  schemaVersion, topic: z.string().min(1), slides: z.array(carouselSlideSchema).min(1).max(20).superRefine((slides, context) => { if (new Set(slides.map((slide) => slide.id)).size !== slides.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Los IDs de slide deben ser únicos." }); }),
  caption: caption.default({ text: "", hashtags: [] }), platform: z.enum(["instagram", "tiktok"]).default("instagram"), generation: generation.optional(),
}).passthrough();

export const legacyCarouselSchema = z.object({ id: z.string().min(1).optional(), topic: z.string().min(1), slides: z.array(carouselSlideSchema).min(1), caption: caption.optional(), platform: z.enum(["instagram", "tiktok"]).optional(), formData: generation.optional() }).passthrough();

export function convertLegacyCarousel(value: unknown) {
  const legacy = legacyCarouselSchema.parse(value);
  return carouselDocumentSchema.parse({ ...legacy, schemaVersion: 1, caption: legacy.caption ?? { text: "", hashtags: [] }, platform: legacy.platform ?? "instagram", generation: legacy.formData });
}

export type CarouselDocument = z.infer<typeof carouselDocumentSchema>;
