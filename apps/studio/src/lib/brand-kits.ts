import { brandKitSchema, type BrandKit } from "@content-gen/domain/schemas";
import { withDatabase } from "./db.ts";

export class BrandNotFoundError extends Error {}

/**
 * La marca de una solicitud: la elegida a mano manda; si no hay, la de la campaña, que las rutas ya
 * leen junto a ella. Una marca elegida que no existe es un error, no un silencio: generar sin ella
 * daría justo el contenido genérico que se quería evitar.
 */
export async function resolveBrand(brandKitId: unknown, campaignBrandJson?: string | null): Promise<BrandKit | undefined> {
  if (typeof brandKitId === "string" && brandKitId && brandKitId !== "none") {
    const row = await withDatabase(async (db) => await db.prepare("SELECT data_json FROM brand_kits WHERE id = ? AND archived_at IS NULL").get(brandKitId) as { data_json: string } | undefined);
    if (!row) throw new BrandNotFoundError("La marca no existe o está archivada.");
    return brandKitSchema.parse(JSON.parse(row.data_json));
  }
  return campaignBrandJson ? brandKitSchema.parse(JSON.parse(campaignBrandJson)) : undefined;
}

/** Igual que `resolveBrand`, pero el fallo llega como valor: las rutas responden 400 sin repetir el try/catch. */
export async function brandOrError(brandKitId: unknown, campaignBrandJson?: string | null): Promise<{ brand?: BrandKit; error?: string }> {
  try { return { brand: await resolveBrand(brandKitId, campaignBrandJson) }; }
  catch (error) { return { error: error instanceof BrandNotFoundError ? error.message : "La marca no es válida." }; }
}
