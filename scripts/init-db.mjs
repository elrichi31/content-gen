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

// Contabilidad del gasto en IA (PLAN_RADAR.md, T-04). Tres cambios sobre generation_runs:
//   - `content_item_id` pasa a admitir nulos: la investigación del radar no es de ninguna pieza.
//   - columnas para consultar sin abrir el JSON (la pantalla de costos agrupa por ellas).
//   - el consumo guardado se normaliza a las unidades de `cost.ts`.
// SQLite no sabe relajar un NOT NULL con ALTER, así que toca reconstruir la tabla.
const runColumns = database.prepare("PRAGMA table_info(generation_runs)").all();
if (runColumns.length && !runColumns.some((column) => column.name === "radar_topic_id")) {
  const { normalizeResponsesUsage } = await import("../packages/domain/src/cost.ts");
  const previous = database.prepare("SELECT id, schema_version, content_item_id, data_json, created_at FROM generation_runs").all();
  const migrated = previous.map((row) => {
    const run = JSON.parse(row.data_json);
    // Lo que se guardaba era el `usage` crudo de la API. `normalizeResponsesUsage` espera el
    // cuerpo entero, así que se envuelve; las búsquedas web salen a cero, que es lo correcto:
    // ninguna de las operaciones ya registradas usaba la herramienta.
    const usage = run.usage ? normalizeResponsesUsage({ usage: run.usage }) : null;
    // Sin tarifa en el momento de gastarlo, el importe es desconocido, no cero.
    return { ...row, run: { ...run, usage, cost: null, radarTopicId: null } };
  });

  // El rebuild va con las claves foráneas apagadas: al soltar la tabla vieja, las referencias
  // quedan momentáneamente colgando. `foreign_key_check` verifica antes de confirmar.
  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("BEGIN;");
  try {
    database.exec(`
      CREATE TABLE generation_runs_new (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        content_item_id TEXT,
        radar_topic_id TEXT,
        operation TEXT NOT NULL DEFAULT 'generation',
        provider TEXT NOT NULL DEFAULT 'openai',
        status TEXT NOT NULL DEFAULT 'completed',
        cost_amount REAL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (content_item_id) REFERENCES content_items(id)
      );
    `);
    const insert = database.prepare(`
      INSERT INTO generation_runs_new (id, schema_version, content_item_id, radar_topic_id, operation, provider, status, cost_amount, data_json, created_at, completed_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)
    `);
    for (const { id, schema_version, content_item_id, created_at, run } of migrated) {
      insert.run(id, schema_version, content_item_id, run.operation ?? "generation", run.provider ?? "openai", run.status ?? "completed", JSON.stringify(run), created_at, run.completedAt ?? null);
    }
    database.exec("DROP TABLE generation_runs;");
    database.exec("ALTER TABLE generation_runs_new RENAME TO generation_runs;");
    const violations = database.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) throw new Error(`La migración dejó ${violations.length} referencias rotas; se deshace.`);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
  console.log(`generation_runs migrada: ${migrated.length} registros conservados.`);
}

// `radar_topic_id` nace sin clave foránea porque `radar_topics` todavía no existe en este punto:
// referenciar una tabla inexistente rompería cualquier inserción con foreign_keys activo. La
// migración 7, más abajo, la añade una vez creada la tabla.
database.exec("CREATE INDEX IF NOT EXISTS idx_generation_runs_report ON generation_runs (operation, created_at);");
database.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (5, datetime('now'))").run();

// Radar de contenido (PLAN_RADAR.md, F2). Fuera del JSON van solo las columnas por las que se
// filtra, ordena o deduplica, igual que en scheduled_posts. Un tema puede dar varias piezas, así
// que la relación con content_items es una tabla puente y no una columna (D-02).
database.exec(`
  CREATE TABLE IF NOT EXISTS radar_watchlist (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    vertical TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 5,
    brand_kit_id TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (brand_kit_id) REFERENCES brand_kits(id)
  );
  CREATE TABLE IF NOT EXISTS radar_runs (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    cost_amount REAL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS radar_topics (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    run_id TEXT NOT NULL,
    vertical TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'nuevo',
    score INTEGER NOT NULL DEFAULT 0,
    fingerprint TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'web',
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES radar_runs(id)
  );
  CREATE TABLE IF NOT EXISTS radar_topic_items (
    topic_id TEXT NOT NULL,
    content_item_id TEXT NOT NULL,
    format TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (topic_id, content_item_id),
    FOREIGN KEY (topic_id) REFERENCES radar_topics(id),
    FOREIGN KEY (content_item_id) REFERENCES content_items(id)
  );
  CREATE INDEX IF NOT EXISTS idx_radar_topics_review ON radar_topics (status, score DESC);
  CREATE INDEX IF NOT EXISTS idx_radar_topics_fingerprint ON radar_topics (fingerprint);
  CREATE INDEX IF NOT EXISTS idx_radar_topics_run ON radar_topics (run_id);
`);
database.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (6, datetime('now'))").run();

// Ya existe radar_topics, así que generation_runs.radar_topic_id puede tener por fin su clave
// foránea (quedó pendiente en la migración 5, cuando la tabla referenciada aún no existía).
const runsSql = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'generation_runs'").get()?.sql ?? "";
if (!runsSql.includes("REFERENCES radar_topics")) {
  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("BEGIN;");
  try {
    database.exec(`
      CREATE TABLE generation_runs_new (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        content_item_id TEXT,
        radar_topic_id TEXT,
        operation TEXT NOT NULL DEFAULT 'generation',
        provider TEXT NOT NULL DEFAULT 'openai',
        status TEXT NOT NULL DEFAULT 'completed',
        cost_amount REAL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (content_item_id) REFERENCES content_items(id),
        FOREIGN KEY (radar_topic_id) REFERENCES radar_topics(id)
      );
      INSERT INTO generation_runs_new SELECT id, schema_version, content_item_id, radar_topic_id, operation, provider, status, cost_amount, data_json, created_at, completed_at FROM generation_runs;
      DROP TABLE generation_runs;
      ALTER TABLE generation_runs_new RENAME TO generation_runs;
      CREATE INDEX IF NOT EXISTS idx_generation_runs_report ON generation_runs (operation, created_at);
    `);
    const violations = database.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) throw new Error(`La migración dejó ${violations.length} referencias rotas; se deshace.`);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
  console.log("generation_runs: clave foránea de radar_topic_id añadida.");
}
database.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (7, datetime('now'))").run();

// Un vertical puede pertenecer a una marca y heredar su giro. Para las bases que ya crearon la
// tabla en la migración 6, la columna se añade sin clave foránea —ALTER no sabe ponerla— y la
// relación se valida en código, igual que hace el cronograma con las campañas.
const watchlistColumns = database.prepare("PRAGMA table_info(radar_watchlist)").all();
if (watchlistColumns.length && !watchlistColumns.some((column) => column.name === "brand_kit_id")) {
  database.exec("ALTER TABLE radar_watchlist ADD COLUMN brand_kit_id TEXT;");
}
database.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (8, datetime('now'))").run();

const tableCount = database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().total;
database.close();

console.log(`Base de datos inicializada: ${databasePath} (${tableCount} tablas)`);
