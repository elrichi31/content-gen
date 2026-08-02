import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string().datetime();
const schemaVersion = z.literal(1);

export const brandKitSchema = z.object({
  id,
  schemaVersion,
  name: z.string().min(1).max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "primaryColor debe ser hexadecimal #RRGGBB"),
  logoAssetId: id.nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp.nullable().default(null),
});

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
  type: z.enum(["carousel", "ad", "video"]),
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
  contentItemId: id,
  provider: z.enum(["openai", "unsplash", "elevenlabs", "local"]),
  status: z.enum(["queued", "running", "completed", "failed"]),
  createdAt: timestamp,
  completedAt: timestamp.nullable().default(null),
  error: z.string().max(1000).nullable().default(null),
  operation: z.string().min(1).max(80).default("generation"),
  model: z.string().min(1).max(160).nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  usage: z.record(z.string(), z.unknown()).nullable().default(null),
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
