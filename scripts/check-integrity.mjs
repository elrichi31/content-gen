// Comprueba que los assets guardados en la base existan en disco y que sus referencias sean coherentes.
// Postgres ya impide referencias rotas en las claves foráneas; esto valida lo que la base no puede
// saber: que el archivo esté en el volumen de medios y que campaña/contenido del asset coincidan.
//   npm run check:integrity
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL debe ser una URL de Postgres.");
const root = resolve(process.env.STORAGE_ROOT ?? "storage");
const media = resolve(root, "media");
const database = new pg.Client({ connectionString: url });
await database.connect();
try {
  const rows = async (sql) => (await database.query(sql)).rows;
  const campaigns = new Set((await rows("SELECT id FROM campaigns")).map((row) => row.id));
  const content = new Map((await rows("SELECT id, campaign_id FROM content_items")).map((row) => [row.id, row.campaign_id]));
  const assets = await rows("SELECT data_json FROM assets");
  for (const row of assets) {
    const asset = JSON.parse(row.data_json); const path = resolve(media, asset.storageKey);
    if (!asset.storageKey || asset.storageKey.includes("..") || !path.startsWith(`${media}${sep}`) || !existsSync(path)) throw new Error(`Asset inválido: ${asset.id}`);
    if (asset.campaignId && !campaigns.has(asset.campaignId)) throw new Error(`Campaña faltante para asset ${asset.id}`);
    if (asset.contentItemId && !content.has(asset.contentItemId)) throw new Error(`Contenido faltante para asset ${asset.id}`);
    if (asset.campaignId && asset.contentItemId && content.get(asset.contentItemId) !== asset.campaignId) throw new Error(`Relación inconsistente para asset ${asset.id}`);
  }
  console.log(`Integridad correcta: ${assets.length} assets y ${content.size} contenidos.`);
} finally {
  await database.end();
}
