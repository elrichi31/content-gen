import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

const storage = resolve(process.cwd(), "storage"); const folder = process.argv[2] ?? ".";
if (!/^[\w.-]+$/.test(folder)) throw new Error("La carpeta de storage no es segura.");
const root = resolve(storage, folder); if (!root.startsWith(`${storage}${sep}`) && root !== storage) throw new Error("La carpeta de storage no es segura.");
const databasePath = resolve(root, "content-gen.sqlite"); if (!existsSync(databasePath)) throw new Error("No existe una base de datos para verificar.");
const database = new DatabaseSync(databasePath); database.exec("PRAGMA foreign_keys = ON;");
const foreignKeys = database.prepare("PRAGMA foreign_key_check").all(); if (foreignKeys.length) throw new Error("SQLite detectó referencias foráneas rotas.");
const ids = (table) => new Set(database.prepare(`SELECT id FROM ${table}`).all().map((row) => row.id));
const campaigns = ids("campaigns"); const content = new Map(database.prepare("SELECT id, campaign_id FROM content_items").all().map((row) => [row.id, row.campaign_id]));
const media = resolve(root, "media"); const assets = database.prepare("SELECT data_json FROM assets").all();
for (const row of assets) {
  const asset = JSON.parse(row.data_json); const path = resolve(media, asset.storageKey);
  if (!asset.storageKey || asset.storageKey.includes("..") || !path.startsWith(`${media}${sep}`) || !existsSync(path)) throw new Error(`Asset inválido: ${asset.id}`);
  if (asset.campaignId && !campaigns.has(asset.campaignId)) throw new Error(`Campaña faltante para asset ${asset.id}`);
  if (asset.contentItemId && !content.has(asset.contentItemId)) throw new Error(`Contenido faltante para asset ${asset.id}`);
  if (asset.campaignId && asset.contentItemId && content.get(asset.contentItemId) !== asset.campaignId) throw new Error(`Relación inconsistente para asset ${asset.id}`);
}
database.close(); console.log(`Integridad correcta: ${assets.length} assets y ${content.size} contenidos.`);
