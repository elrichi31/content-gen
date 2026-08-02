import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databaseUrl = process.env.DATABASE_URL ?? "file:./storage/content-gen.sqlite";

if (!databaseUrl.startsWith("file:") || databaseUrl.includes("..")) {
  throw new Error("DATABASE_URL debe ser una ruta local segura con prefijo file:.");
}

const databasePath = resolve(databaseUrl.slice("file:".length));
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS brand_kits (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT);
  CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, brand_kit_id TEXT, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, FOREIGN KEY (brand_kit_id) REFERENCES brand_kits(id));
  CREATE TABLE IF NOT EXISTS content_items (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, campaign_id TEXT NOT NULL, type TEXT NOT NULL, document_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, FOREIGN KEY (campaign_id) REFERENCES campaigns(id));
  CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS generation_runs (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, content_item_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (content_item_id) REFERENCES content_items(id));
  CREATE TABLE IF NOT EXISTS render_jobs (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, content_item_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (content_item_id) REFERENCES content_items(id));
  CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, content_item_id TEXT NOT NULL, asset_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (content_item_id) REFERENCES content_items(id), FOREIGN KEY (asset_id) REFERENCES assets(id));
  INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (1, datetime('now'));
`);
const columns = database.prepare("PRAGMA table_info(content_items)").all();
if (!columns.some((column) => column.name === "revision")) database.exec("ALTER TABLE content_items ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;");
database.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (2, datetime('now'))").run();
const tableCount = database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().total;
database.close();

console.log(`Base de datos inicializada: ${databasePath} (${tableCount} tablas)`);
