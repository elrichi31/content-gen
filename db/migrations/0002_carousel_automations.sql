-- Up Migration

-- Automatizaciones de carruseles: cada una rellena con borradores los huecos de una pauta del
-- cronograma. Al borrar la pauta se borra la automatización: sin huecos no tiene nada que hacer.
CREATE TABLE carousel_automations (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES publishing_rules (id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Down Migration

DROP TABLE carousel_automations;
