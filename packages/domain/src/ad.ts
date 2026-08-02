import { z } from "zod";

const format = z.enum(["story", "square", "landscape"]);
const layout = z.enum(["comparison", "promo", "feature", "testimonial", "painSolution"]);
const feature = z.object({ emoji: z.string(), label: z.string() });

export const adDocumentSchema = z.object({
  schemaVersion: z.literal(1), format, layout,
  imageAssetId: z.string().uuid().nullable().optional(),
  accentColor: z.string().min(1), bgColor: z.string().min(1), textColor: z.string().min(1), cta: z.string(),
  offerBadge: z.string(), headline: z.string(), body: z.string(), originalPrice: z.string(), newPrice: z.string(), urgency: z.string(),
  compHeadline: z.string(), leftLabel: z.string(), rightLabel: z.string(), leftItems: z.array(z.string()), rightItems: z.array(z.string()),
  featHeadline: z.string(), featBody: z.string(), features: z.array(feature),
  quote: z.string(), authorName: z.string(), authorRole: z.string(), stars: z.number().int().min(0).max(5),
  painEmoji: z.string(), painHeadline: z.string(), painDesc: z.string(), solutionEmoji: z.string(), solutionHeadline: z.string(), solutionDesc: z.string(),
}).passthrough();

export const legacyAdSchema = adDocumentSchema.omit({ schemaVersion: true });
export function convertLegacyAd(value: unknown) { return adDocumentSchema.parse({ ...legacyAdSchema.parse(value), schemaVersion: 1 }); }
export type AdDocument = z.infer<typeof adDocumentSchema>;
