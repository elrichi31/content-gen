import type { Database } from "./db.ts";

// Compartido con el worker al guardar el MP4. Serializa deduplicación, registro y borrado físico.
export const ASSET_FILE_LOCK = 7_310_002;
export async function withAssetFileLock<T>(db: Database, operation: () => Promise<T>): Promise<T> {
  await db.exec(`SELECT pg_advisory_lock(${ASSET_FILE_LOCK});`);
  try { return await operation(); }
  finally { await db.exec(`SELECT pg_advisory_unlock(${ASSET_FILE_LOCK});`); }
}
