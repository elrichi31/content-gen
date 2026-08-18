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

// Métricas externas (Search Console, GA4 y más adelante Instagram/TikTok). La clave única
// permite reprocesar una ventana sin duplicar: los datos tardíos sobrescriben a los previos.
database.exec(`
  CREATE TABLE IF NOT EXISTS metric_snapshots (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    platform TEXT NOT NULL,
    property_id TEXT NOT NULL,
    dimension TEXT NOT NULL,
    dimension_value TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    data_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    UNIQUE (platform, property_id, dimension, dimension_value, date)
  );
  CREATE INDEX IF NOT EXISTS idx_metric_snapshots_lookup ON metric_snapshots (platform, property_id, dimension, date);
`);
database.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (3, datetime('now'))").run();

// Cronograma de publicación. Las pautas describen la cadencia y los huecos que genera;
// scheduled_posts guarda lo que se planifica en cada hueco. La clave única impide asignar
// dos piezas a la misma plataforma, día y hora. Borrar una pauta no borra lo ya planificado.
database.exec(`
  CREATE TABLE IF NOT EXISTS publishing_rules (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    campaign_id TEXT,
    platform TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );
  CREATE TABLE IF NOT EXISTS scheduled_posts (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    platform TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL,
    content_item_id TEXT,
    campaign_id TEXT,
    rule_id TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (platform, date, time),
    FOREIGN KEY (content_item_id) REFERENCES content_items(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (rule_id) REFERENCES publishing_rules(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scheduled_posts_range ON scheduled_posts (date, platform);
`);
database.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (4, datetime('now'))").run();
const tableCount = database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().total;
database.close();

console.log(`Base de datos inicializada: ${databasePath} (${tableCount} tablas)`);
