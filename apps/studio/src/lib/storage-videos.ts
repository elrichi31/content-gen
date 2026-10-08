import { lstat, mkdir, readdir, rename, rm, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { assetSchema, renderJobSchema } from "@content-gen/domain/schemas";
import type { Database } from "./db.ts";
import { withAssetFileLock } from "./asset-file-lock.ts";
import { contentTitle } from "./content-title.ts";
import { getStorageUsage, type StorageEntry } from "./storage-usage.ts";

const finalKey = /^media\/assets\/[a-f0-9]{64}\.mp4$/;
const backupName = /^[a-f0-9]{64}\.mp4$/;
/** Pieza (o marca) a la que pertenece un archivo, con su campaña para ubicarla. */
export type StorageProject = { id: string; title: string; type: string; campaign: string | null };
/** Dirección para previsualizar el archivo; solo existe cuando es un asset que la app sabe servir. */
export type StoragePreview = { url: string; mimeType: string };
export type StorageFileRow = StorageEntry & { deletable: boolean; reason: string; exportCount: number; pieceTitles: string[]; projects: StorageProject[]; preview?: StoragePreview | null };
type Selection = { key: string; version: string };
export class StorageDeleteError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

async function snapshot(db: Database) {
  const assets = (await db.prepare("SELECT data_json FROM assets").all() as { data_json: string }[]).map(row => assetSchema.parse(JSON.parse(row.data_json)));
  const exports = await db.prepare("SELECT asset_id, content_item_id, data_json::jsonb->>'format' AS format FROM exports").all() as { asset_id: string; content_item_id: string; format: string }[];
  const contents = (await db.prepare("SELECT document_json FROM content_items").all() as { document_json: string }[]).map(row => JSON.parse(row.document_json) as Record<string, unknown>);
  const brands = (await db.prepare("SELECT data_json FROM brand_kits").all() as { data_json: string }[]).map(row => JSON.parse(row.data_json) as unknown);
  const jobs = (await db.prepare("SELECT data_json FROM render_jobs").all() as { data_json: string }[]).map(row => renderJobSchema.parse(JSON.parse(row.data_json)));
  const campaigns = (await db.prepare("SELECT id, data_json FROM campaigns").all() as { id: string; data_json: string }[]).map(row => ({ id: row.id, name: (JSON.parse(row.data_json) as { name?: unknown }).name }));
  return { assets, exports, contents, brands, jobs, campaigns };
}

function stringsIn(value: unknown, target = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    target.add(value);
    for (const match of value.matchAll(/\/api\/assets\/([A-Za-z0-9_-]+)/g)) target.add(match[1]!);
  } else if (Array.isArray(value)) for (const item of value) stringsIn(item, target);
  else if (value && typeof value === "object") for (const item of Object.values(value)) stringsIn(item, target);
  return target;
}

async function safePath(root: string, key: string) {
  if (!finalKey.test(key)) throw new StorageDeleteError("La selección no es válida.", 400);
  const base = await realpath(root);
  const path = join(base, key);
  if (!(await realpath(join(base, "media/assets"))).startsWith(`${base}${sep}`)) throw new StorageDeleteError("Carpeta de archivos no válida.");
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.nlink !== 1) throw new StorageDeleteError("El archivo está protegido o cambió.");
  return path;
}

async function trashFolder(root: string) {
  const path = join(root, ".storage-trash");
  await mkdir(path, { recursive: true });
  if (!(await lstat(path)).isDirectory()) throw new StorageDeleteError("No se puede preparar el borrado.");
  return path;
}

/** Un reinicio entre rename y COMMIT restaura el original; después de COMMIT completa la limpieza. */
async function recoverStaged(root: string, registered: Set<string>) {
  const folder = join(root, ".storage-trash");
  let names: string[];
  try { names = await readdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  if (!(await lstat(folder)).isDirectory()) throw new StorageDeleteError("Carpeta de limpieza no válida.");
  for (const name of names) {
    if (!backupName.test(name)) continue;
    const path = join(folder, name);
    if (!(await lstat(path)).isFile()) throw new StorageDeleteError("Copia de limpieza no válida.");
    const key = `media/assets/${name}`;
    if (registered.has(key)) {
      const base = await realpath(root);
      if (!(await realpath(join(base, "media/assets"))).startsWith(`${base}${sep}`)) throw new StorageDeleteError("Carpeta de archivos no válida.");
      const target = join(base, key);
      // No sobrescribir una copia nueva: conservar el respaldo para revisión si ambas existen.
      try { await lstat(target); throw new StorageDeleteError("Hay una recuperación pendiente; revisa el almacenamiento."); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rename(path, target);
    } else await rm(path);
  }
}

async function readCatalog(root: string, db: Database) {
  const state = await snapshot(db);
  await recoverStaged(root, new Set(state.assets.map(asset => `media/${asset.storageKey}`)));
  const usage = await getStorageUsage(root, { includeEntries: true });
  const used = stringsIn([...state.contents, ...state.brands, ...state.jobs.map(job => job.inputProps)]);
  for (const job of state.jobs) if (["queued", "processing"].includes(job.status) && job.outputAssetId) used.add(job.outputAssetId);
  const byKey = new Map<string, typeof state.assets>();
  for (const asset of state.assets) { const key = `media/${asset.storageKey}`; byKey.set(key, [...(byKey.get(key) ?? []), asset]); }
  const exportsByAsset = new Map<string, typeof state.exports>();
  for (const item of state.exports) exportsByAsset.set(item.asset_id, [...(exportsByAsset.get(item.asset_id) ?? []), item]);
  const contentById = new Map(state.contents.map(item => [item.id, item]));
  // A qué pieza pertenece cada asset: la que lo creó, la que lo exportó y cualquiera que lo use
  // (una imagen de la campaña puede estar en varios carruseles). Las marcas cuentan como proyecto.
  const campaignName = new Map(state.campaigns.map(campaign => [campaign.id, typeof campaign.name === "string" ? campaign.name : null]));
  const projectOf = new Map<string, StorageProject>();
  const usedBy = new Map<string, Set<string>>();
  const assetIds = new Set(state.assets.map(asset => asset.id));
  const link = (assetId: string, projectId: string) => assetIds.has(assetId) && usedBy.set(assetId, (usedBy.get(assetId) ?? new Set()).add(projectId));
  for (const item of state.contents) {
    const id = String(item.id);
    projectOf.set(id, { id, title: contentTitle(item as Parameters<typeof contentTitle>[0]), type: String(item.type ?? "content"), campaign: campaignName.get(String(item.campaignId)) ?? null });
    for (const value of stringsIn(item.document)) link(value, id);
  }
  for (const brand of state.brands as { id?: unknown; name?: unknown }[]) {
    if (typeof brand?.id !== "string") continue;
    const id = `brand:${brand.id}`;
    projectOf.set(id, { id, title: typeof brand.name === "string" ? brand.name : "Marca", type: "brand", campaign: null });
    for (const value of stringsIn(brand)) link(value, id);
  }
  for (const asset of state.assets) if (asset.contentItemId) link(asset.id, asset.contentItemId);
  for (const item of state.exports) link(item.asset_id, item.content_item_id);
  const files: StorageFileRow[] = (usage.entries ?? []).map(entry => {
    const aliases = byKey.get(entry.key) ?? [];
    const ids = new Set(aliases.map(asset => asset.id));
    const exports = [...ids].flatMap(id => exportsByAsset.get(id) ?? []);
    const titles = [...new Set(exports.map(item => item.content_item_id))].map(id => contentById.get(id)).filter((item): item is Record<string, unknown> => Boolean(item)).map(item => {
      const data = (item.document as { data?: { title?: string; slug?: string } } | undefined)?.data;
      return data?.title ?? data?.slug ?? String(item.id);
    });
    const inUse = [...ids].some(id => used.has(id));
    const deletable = finalKey.test(entry.key) && entry.links === 1 && !inUse && aliases.every(asset => asset.mimeType === "video/mp4") && exports.every(item => item.format === "mp4");
    const projects = [...new Set([...ids].flatMap(id => [...(usedBy.get(id) ?? [])]))].map(id => projectOf.get(id)).filter((project): project is StorageProject => Boolean(project));
    const preview = aliases[0] ? { url: `/api/assets/${aliases[0].id}`, mimeType: aliases[0].mimeType } : null;
    return { ...entry, name: aliases[0]?.filename ?? entry.name, deletable, preview, exportCount: exports.length, pieceTitles: [...new Set([...titles, ...projects.map(project => project.title)])], projects, reason: inUse ? "Lo utiliza un proyecto o una marca" : entry.links !== 1 ? "Archivo compartido mediante enlaces" : deletable ? exports.length ? "Video final · se puede volver a renderizar" : "MP4 sin exportación" : entry.kind === "renders" ? "Temporal del worker · limpieza automática" : "Archivo fuente protegido" };
  }).sort((a, b) => b.allocatedBytes - a.allocatedBytes || a.key.localeCompare(b.key));
  delete usage.entries;
  return { usage, files };
}

export async function getStorageCatalog(root: string, db: Database) {
  return withAssetFileLock(db, () => readCatalog(resolve(root), db));
}

export async function deleteStorageVideos(root: string, selection: Selection[], db: Database) {
  if (!selection.length || selection.length > 100 || new Set(selection.map(item => item.key)).size !== selection.length || selection.some(item => !finalKey.test(item.key) || !/^[a-f0-9]{64}$/.test(item.version))) throw new StorageDeleteError("La selección no es válida (máximo 100 videos distintos).", 400);
  root = resolve(root);
  return withAssetFileLock(db, async () => {
    const staged: { original: string; backup: string; bytes: number; key: string }[] = [];
    let committed = false;
    await db.exec("BEGIN;");
    try {
      await db.exec("SET LOCAL lock_timeout = '5s'; LOCK TABLE assets, exports, render_jobs, content_items, brand_kits IN SHARE ROW EXCLUSIVE MODE;");
      const catalog = await readCatalog(root, db);
      const selected = selection.map(input => {
        const file = catalog.files.find(file => file.key === input.key);
        if (!file || file.version !== input.version) throw new StorageDeleteError("Un archivo cambió o ya no existe. Actualiza la lista antes de borrar.");
        if (!file.deletable) throw new StorageDeleteError("Un archivo está protegido porque lo utiliza un proyecto.");
        return file;
      });
      const state = await snapshot(db);
      const folder = await trashFolder(root);
      for (const file of selected) {
        const original = await safePath(root, file.key);
        const backup = join(folder, file.key.split("/").at(-1)!);
        await rename(original, backup);
        staged.push({ original, backup, bytes: file.allocatedBytes, key: file.key });
        const aliases = state.assets.filter(asset => `media/${asset.storageKey}` === file.key);
        for (const asset of aliases) {
          for (const job of state.jobs.filter(job => job.outputAssetId === asset.id)) {
            const next = renderJobSchema.parse({ ...job, status: "failed", progress: 0, outputAssetId: null, updatedAt: new Date().toISOString(), error: "MP4 eliminado desde Almacenamiento. Vuelve a renderizar para descargarlo.", log: [...job.log, "Archivo final eliminado por el usuario."].slice(-100) });
            await db.prepare("UPDATE render_jobs SET data_json = ? WHERE id = ?").run(JSON.stringify(next), job.id);
          }
          await db.prepare("DELETE FROM exports WHERE asset_id = ?").run(asset.id);
          await db.prepare("DELETE FROM assets WHERE id = ?").run(asset.id);
        }
      }
      await db.exec("COMMIT;");
      committed = true;
    } catch (error) {
      if (!committed) {
        await db.exec("ROLLBACK;");
        for (const file of staged.reverse()) await rename(file.backup, file.original);
      }
      throw error;
    }
    let estimatedFreedBytes = 0;
    const pending: string[] = [];
    for (const file of staged) {
      try { await rm(file.backup); estimatedFreedBytes += file.bytes; }
      catch { pending.push(file.key); }
    }
    // Relectura de DB y filesystem: ninguna descarga eliminada debe seguir registrada.
    const keys = new Set(staged.map(file => file.key));
    if ((await snapshot(db)).assets.some(asset => keys.has(`media/${asset.storageKey}`))) throw new StorageDeleteError("No se pudo verificar el borrado.");
    return { deleted: staged.length - pending.length, estimatedFreedBytes, pending: pending.length };
  });
}
