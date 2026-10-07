import type { AdDocument } from "@content-gen/domain/ad";
import type { VideoDocument } from "@content-gen/domain/video";
import { existsSync } from "node:fs";
import { resolveAssetPath } from "./asset-file.ts";
import { mediaRoot, withDatabase } from "./db.ts";

type AssetKind = "audio" | "image";
type StoredAsset = { mimeType?: unknown; campaignId?: unknown };

export function assertAssetReference(asset: StoredAsset | undefined, kind: AssetKind, campaignId: string) {
  if (!asset) throw new Error("El asset seleccionado no existe.");
  if (typeof asset.mimeType !== "string" || !asset.mimeType.startsWith(`${kind}/`)) throw new Error(`El asset seleccionado no es ${kind === "image" ? "una imagen" : "un audio"}.`);
  if (asset.campaignId !== null && asset.campaignId !== undefined && asset.campaignId !== campaignId) throw new Error("El asset pertenece a otra campaña.");
}

async function validateReference(id: string, kind: AssetKind, campaignId: string) {
  const row = await withDatabase(async (database) => await database.prepare("SELECT data_json FROM assets WHERE id = ?").get(id) as { data_json: string } | undefined);
  assertAssetReference(row ? JSON.parse(row.data_json) as StoredAsset : undefined, kind, campaignId);
}

export async function validateAdImageAsset(ad: AdDocument, campaignId: string) {
  if (ad.imageAssetId) await validateReference(ad.imageAssetId, "image", campaignId);
}

export async function validateVideoAssets(video: VideoDocument, campaignId: string) {
  await Promise.all(video.scenes.flatMap((scene) => [
    ...(scene.imageAssetId ? [validateReference(scene.imageAssetId, "image", campaignId)] : []),
    ...(scene.audioAssetId ? [validateReference(scene.audioAssetId, "audio", campaignId)] : []),
  ]));
}

/**
 * Escenas cuyo archivo ya no está en el disco aunque su registro siga en la base. Pasa cuando
 * `/app/storage` no es un volumen persistente: un redeploy borra los medios y Postgres conserva las
 * filas. El navegador puede seguir mostrando la imagen desde su caché, así que hay que mirarlo aquí.
 */
export async function missingVideoAssetFiles(video: VideoDocument) {
  const references = video.scenes.flatMap((scene) => [
    ...(scene.imageAssetId ? [{ sceneId: scene.id, kind: "image" as const, id: scene.imageAssetId }] : []),
    ...(scene.audioAssetId ? [{ sceneId: scene.id, kind: "audio" as const, id: scene.audioAssetId }] : []),
  ]);
  if (!references.length) return [];
  const rows = await withDatabase(async (database) => await database
    .prepare(`SELECT id, data_json FROM assets WHERE id IN (${references.map(() => "?").join(", ")})`)
    .all(...references.map((reference) => reference.id)) as { id: string; data_json: string }[]);
  const keys = new Map(rows.map((row) => [row.id, (JSON.parse(row.data_json) as { storageKey?: unknown }).storageKey]));
  return references.filter((reference) => {
    const key = keys.get(reference.id);
    if (typeof key !== "string") return true;
    try { return !existsSync(resolveAssetPath(mediaRoot, key)); }
    catch { return true; }
  });
}
