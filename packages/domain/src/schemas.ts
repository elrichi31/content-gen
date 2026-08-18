import { z } from "zod";
import { costSchema, usageSchema } from "./cost.ts";

const id = z.string().min(1);
const timestamp = z.string().datetime();
const schemaVersion = z.literal(1);

/**
 * Quién es el negocio, más allá de su aspecto. Lo usa el radar para buscar temas que conecten con
 * algo vendible, y lo pueden usar los generadores para no escribir en abstracto.
 *
 * Todo opcional y con valor por defecto: las marcas que ya existen se siguen leyendo sin migrar.
 */
export const businessProfileSchema = z.object({
  /** Giro del negocio: a qué se dedica. «Consultora de ciberseguridad y automatización». */
  sector: z.string().trim().max(200).default(""),
  /** Qué vende, en concreto. Es lo que ancla un tema del radar a una oferta real. */
  offering: z.string().trim().max(1000).default(""),
  /** A quién se lo vende. */
  audience: z.string().trim().max(300).default(""),
  /** Qué lo diferencia; útil para el ángulo de las piezas. */
  valueProposition: z.string().trim().max(1000).default(""),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const brandKitSchema = z.object({
  id,
  schemaVersion,
  name: z.string().min(1).max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "primaryColor debe ser hexadecimal #RRGGBB"),
  logoAssetId: id.nullable().default(null),
  business: businessProfileSchema.default({}),
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp.nullable().default(null),
});

export type BrandKit = z.infer<typeof brandKitSchema>;

export const campaignBriefSchema = z.object({
  topic: z.string().trim().min(3).max(240),
  audience: z.string().trim().min(2).max(160),
  tone: z.string().trim().min(2).max(120),
  language: z.string().trim().min(2).max(40),
  context: z.string().trim().max(10000).default(""),
});

export const campaignSchema = z.object({
  id,
  schemaVersion,
  name: z.string().min(1).max(160),
  brief: z.union([z.string().max(10000), campaignBriefSchema]).default(""),
  brandKitId: id.nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp.nullable().default(null),
});

export const contentItemSchema = z.object({
  id,
  schemaVersion,
  campaignId: id,
  type: z.enum(["carousel", "ad", "video", "article"]),
  document: z.object({ schemaVersion, data: z.record(z.unknown()) }),
  revision: z.number().int().nonnegative().default(0),
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp.nullable().default(null),
});

export const assetSchema = z.object({
  id,
  schemaVersion,
  filename: z.string().min(1).max(255),
  mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/, "mimeType inválido"),
  sizeBytes: z.number().int().positive(),
  storageKey: z.string().regex(/^assets\/[a-f0-9]{64}\.(?:jpg|json|mp3|mp4|png|wav|webp)$/, "storageKey debe ser una ruta relativa segura"),
  campaignId: id.nullable().default(null),
  contentItemId: id.nullable().default(null),
  createdAt: timestamp,
});

export const generationRunSchema = z.object({
  id,
  schemaVersion,
  /**
   * Nulo cuando la operación no pertenece a ninguna pieza: la investigación del radar es
   * exactamente ese caso, y es el gasto que más interesa medir por separado.
   */
  contentItemId: id.nullable().default(null),
  radarTopicId: id.nullable().default(null),
  provider: z.enum(["openai", "unsplash", "elevenlabs", "local"]),
  status: z.enum(["queued", "running", "completed", "failed", "skipped"]),
  createdAt: timestamp,
  completedAt: timestamp.nullable().default(null),
  error: z.string().max(1000).nullable().default(null),
  operation: z.string().min(1).max(80).default("generation"),
  model: z.string().min(1).max(160).nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  usage: usageSchema.nullable().default(null),
  /** Importe congelado con la tarifa vigente al terminar; ver `cost.ts`. */
  cost: costSchema.nullable().default(null),
});

export const renderJobSchema = z.object({
  id,
  schemaVersion,
  contentItemId: id,
  compositionId: z.string().min(1),
  status: z.enum(["queued", "processing", "completed", "failed", "cancelled"]),
  progress: z.number().int().min(0).max(100).default(0),
  outputAssetId: id.nullable().default(null),
  inputProps: z.record(z.unknown()),
  createdAt: timestamp,
  updatedAt: timestamp.optional(),
  completedAt: timestamp.nullable().default(null),
  error: z.string().max(1000).nullable().default(null),
});

export const exportSchema = z.object({
  id,
  schemaVersion,
  contentItemId: id,
  format: z.enum(["png", "zip", "mp4"]),
  assetId: id,
  createdAt: timestamp,
});

export const domainSchemas = {
  BrandKit: brandKitSchema,
  Campaign: campaignSchema,
  ContentItem: contentItemSchema,
  Asset: assetSchema,
  GenerationRun: generationRunSchema,
  RenderJob: renderJobSchema,
  Export: exportSchema,
};
