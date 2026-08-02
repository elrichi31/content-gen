import assert from "node:assert/strict";
import { assetSchema, campaignSchema, contentItemSchema, domainSchemas } from "./schemas.ts";

const now = "2026-07-23T00:00:00.000Z";
const base = { id: "id-1", schemaVersion: 1 as const, createdAt: now };

const fixtures = {
  BrandKit: { ...base, name: "Principal", primaryColor: "#2f7d40", updatedAt: now },
  Campaign: { ...base, name: "Lanzamiento", brief: "", brandKitId: null, updatedAt: now },
  ContentItem: { ...base, campaignId: "campaign-1", type: "carousel" as const, document: { schemaVersion: 1 as const, data: {} }, updatedAt: now },
  Asset: { ...base, filename: "cover.png", mimeType: "image/png", sizeBytes: 12, storageKey: `assets/${"a".repeat(64)}.png` },
  GenerationRun: { ...base, contentItemId: "content-1", provider: "local" as const, status: "queued" as const },
  RenderJob: { ...base, contentItemId: "content-1", compositionId: "FoundationVideo", status: "queued" as const, inputProps: {} },
  Export: { ...base, contentItemId: "content-1", format: "mp4" as const, assetId: "asset-1" },
};

for (const [name, schema] of Object.entries(domainSchemas)) {
  assert.equal(schema.safeParse(fixtures[name as keyof typeof fixtures]).success, true, `${name} válido debe pasar`);
}

assert.equal(contentItemSchema.safeParse({ ...fixtures.ContentItem, document: { schemaVersion: 2, data: {} } }).success, false, "documento con versión desconocida debe fallar");
assert.equal(assetSchema.safeParse({ ...fixtures.Asset, storageKey: "../secreto.png" }).success, false, "storageKey inseguro debe fallar");
const sharedBrief = { topic: "Seguridad digital", audience: "Jovenes", tone: "Directo", language: "es", context: "Lanzamiento regional" };
assert.deepEqual(campaignSchema.parse({ ...fixtures.Campaign, brief: sharedBrief }).brief, sharedBrief, "brief compartido conserva sus campos");
assert.equal(campaignSchema.safeParse({ ...fixtures.Campaign, brief: { ...sharedBrief, topic: "" } }).success, false, "brief compartido incompleto debe fallar");

console.log("Domain schemas: 7 fixtures válidos y 2 inválidos verificados.");
