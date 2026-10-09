-- Up Migration
-- Cola de generaciones pedidas por agentes (MCP): nada que gaste corre hasta que una persona la aprueba.
CREATE TABLE generation_requests (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  status TEXT NOT NULL,
  args_key TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_generation_requests_status ON generation_requests (status, created_at);
-- Down Migration
DROP TABLE generation_requests;
