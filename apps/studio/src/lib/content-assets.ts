import type { AdDocument } from "@content-gen/domain/ad";
import type { VideoDocument } from "@content-gen/domain/video";
import { withDatabase } from "./db.ts";

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
