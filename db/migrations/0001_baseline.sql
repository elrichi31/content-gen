-- Up Migration

-- Esquema base de Postgres. Recoge el estado final de las diez versiones que tuvo la base en
-- SQLite (las reconstrucciones de generation_runs de las versiones 5 y 7 ya no hacen falta: aquí
-- la tabla nace con su forma definitiva). Todo cambio posterior va en un archivo nuevo de esta
-- carpeta; nunca se edita uno ya aplicado. Los documentos JSON y las fechas siguen como TEXT a
-- propósito, para que el código que hace JSON.parse / compara ISO no cambie.

CREATE TABLE brand_kits (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  brand_kit_id TEXT REFERENCES brand_kits (id),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  type TEXT NOT NULL,
  document_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Radar de contenido. Fuera del JSON van solo las columnas por las que se filtra, ordena o
-- deduplica. Un tema puede dar varias piezas, así que la relación con content_items es una tabla
-- puente (radar_topic_items) y no una columna.
CREATE TABLE radar_watchlist (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  vertical TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 5,
  brand_kit_id TEXT REFERENCES brand_kits (id),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE radar_runs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  cost_amount DOUBLE PRECISION,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE radar_topics (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  run_id TEXT NOT NULL REFERENCES radar_runs (id),
  vertical TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nuevo',
  score INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'web',
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE radar_topic_items (
  topic_id TEXT NOT NULL REFERENCES radar_topics (id),
  content_item_id TEXT NOT NULL REFERENCES content_items (id),
  format TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (topic_id, content_item_id)
);

CREATE INDEX idx_radar_topics_review ON radar_topics (status, score DESC);
CREATE INDEX idx_radar_topics_fingerprint ON radar_topics (fingerprint);
CREATE INDEX idx_radar_topics_run ON radar_topics (run_id);

-- Contabilidad del gasto en IA. content_item_id admite nulos: la investigación del radar no es de
-- ninguna pieza. Las columnas sueltas permiten agrupar en la pantalla de costos sin abrir el JSON.
CREATE TABLE generation_runs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  content_item_id TEXT REFERENCES content_items (id),
  radar_topic_id TEXT REFERENCES radar_topics (id),
  operation TEXT NOT NULL DEFAULT 'generation',
  provider TEXT NOT NULL DEFAULT 'openai',
  status TEXT NOT NULL DEFAULT 'completed',
  cost_amount DOUBLE PRECISION,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_generation_runs_report ON generation_runs (operation, created_at);

CREATE TABLE render_jobs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  content_item_id TEXT NOT NULL REFERENCES content_items (id),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  content_item_id TEXT NOT NULL REFERENCES content_items (id),
  asset_id TEXT NOT NULL REFERENCES assets (id),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Métricas externas (Search Console, GA4, TikTok...). La clave única permite reprocesar una
-- ventana sin duplicar: los datos tardíos sobrescriben a los previos.
CREATE TABLE metric_snapshots (
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

CREATE INDEX idx_metric_snapshots_lookup ON metric_snapshots (platform, property_id, dimension, date);

-- Cronograma de publicación. Las pautas describen la cadencia y los huecos que genera;
-- scheduled_posts guarda lo que se planifica en cada hueco. La clave única impide asignar dos
-- piezas a la misma plataforma, día y hora. Borrar una pauta no borra lo ya planificado.
CREATE TABLE publishing_rules (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  campaign_id TEXT REFERENCES campaigns (id),
  platform TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE scheduled_posts (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  platform TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL,
  content_item_id TEXT REFERENCES content_items (id),
  campaign_id TEXT REFERENCES campaigns (id),
  rule_id TEXT REFERENCES publishing_rules (id) ON DELETE SET NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (platform, date, time)
);

CREATE INDEX idx_scheduled_posts_range ON scheduled_posts (date, platform);

-- Tokens OAuth de plataformas externas (TikTok): uno por plataforma, se sobrescribe al refrescar.
CREATE TABLE oauth_tokens (
  platform TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Tablas de Better Auth (login por email/contraseña), tal cual las genera `@better-auth/cli generate`
-- para Postgres: columnas camelCase entre comillas porque su adaptador las espera así.
CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
