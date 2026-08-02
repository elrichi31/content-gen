import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { assetSchema } from "@content-gen/domain/schemas";
import { assertAssetFile, assertAssetMimeType, assertAssetSignature, assetExtensions, resolveAssetPath } from "./asset-file";
import { mediaRoot, withDatabase } from "./db";

type AssetInput = { mimeType: string; filename: string; campaignId?: string | null; contentItemId?: string | null };

async function validateRelations(campaignId: string | null, contentItemId: string | null) {
  if (campaignId && !await withDatabase((db) => db.prepare("SELECT id FROM campaigns WHERE id = ? AND archived_at IS NULL").get(campaignId))) throw new Error("Campaña inválida.");
  if (contentItemId && !await withDatabase((db) => db.prepare("SELECT id FROM content_items WHERE id = ? AND archived_at IS NULL").get(contentItemId))) throw new Error("Contenido inválido.");
  if (campaignId && contentItemId && !await withDatabase((db) => db.prepare("SELECT id FROM content_items WHERE id = ? AND campaign_id = ?").get(contentItemId, campaignId))) throw new Error("El contenido no pertenece a la campaña indicada.");
}

function buildAsset(hash: string, sizeBytes: number, { mimeType, filename, campaignId = null, contentItemId = null }: AssetInput) {
  const storageKey = `assets/${hash}.${assetExtensions[mimeType]}`; const now = new Date().toISOString();
  const asset = assetSchema.parse({ id: randomUUID(), schemaVersion: 1, filename: basename(filename), mimeType, sizeBytes, storageKey, campaignId, contentItemId, createdAt: now });
  return { asset, now, path: resolveAssetPath(mediaRoot, storageKey) };
}

async function insertAsset(asset: ReturnType<typeof buildAsset>) {
  await withDatabase((db) => db.prepare("INSERT INTO assets (id, schema_version, data_json, created_at) VALUES (?, ?, ?, ?)").run(asset.asset.id, 1, JSON.stringify(asset.asset), asset.now));
  return asset.asset;
}

export async function storeAsset({ bytes, mimeType, filename, campaignId = null, contentItemId = null }: AssetInput & { bytes: Buffer }) {
  assertAssetFile(bytes, mimeType); await validateRelations(campaignId, contentItemId);
  const stored = buildAsset(createHash("sha256").update(bytes).digest("hex"), bytes.length, { mimeType, filename, campaignId, contentItemId });
  await mkdir(dirname(stored.path), { recursive: true }); if (!existsSync(stored.path)) await writeFile(stored.path, bytes);
  return insertAsset(stored);
}

export async function storeAssetStream({ stream, mimeType, filename, campaignId = null, contentItemId = null }: AssetInput & { stream: ReadableStream<Uint8Array> }) {
  assertAssetMimeType(mimeType); await validateRelations(campaignId, contentItemId);
  if (!filename || basename(filename).length > 255) throw new Error("Nombre de archivo inválido.");
  const temporaryFolder = resolve(mediaRoot, ".uploads"); const temporaryPath = resolve(temporaryFolder, `${randomUUID()}.part`);
  await mkdir(temporaryFolder, { recursive: true });
  const file = await open(temporaryPath, "wx"); const hash = createHash("sha256"); const reader = stream.getReader();
  let sizeBytes = 0; let prefix = Buffer.alloc(0);
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      sizeBytes += part.value.byteLength; hash.update(part.value); await file.write(part.value);
      if (prefix.length < 12) prefix = Buffer.concat([prefix, Buffer.from(part.value.subarray(0, 12 - prefix.length))]);
    }
  } catch (error) {
    await file.close(); await rm(temporaryPath, { force: true }); throw error;
  }
  await file.close();
  try {
    if (!sizeBytes) throw new Error("El archivo está vacío.");
    assertAssetSignature(prefix, mimeType);
    const stored = buildAsset(hash.digest("hex"), sizeBytes, { mimeType, filename, campaignId, contentItemId });
    await mkdir(dirname(stored.path), { recursive: true });
    if (existsSync(stored.path)) await rm(temporaryPath, { force: true });
    else {
      try { await rename(temporaryPath, stored.path); }
      catch (error) { if (existsSync(stored.path)) await rm(temporaryPath, { force: true }); else throw error; }
    }
    return await insertAsset(stored);
  } catch (error) {
    await rm(temporaryPath, { force: true }); throw error;
  }
}
