-- Up Migration
CREATE TABLE studio_settings (key TEXT PRIMARY KEY, data_json TEXT NOT NULL);
CREATE TABLE radar_automations (id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0, next_run_at TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE TABLE automation_runs (id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, data_json TEXT NOT NULL);
CREATE INDEX automation_runs_history ON automation_runs (automation_id, started_at DESC);
ALTER TABLE generation_runs ADD COLUMN automation_run_id TEXT REFERENCES automation_runs(id) ON DELETE SET NULL;
CREATE INDEX generation_runs_automation ON generation_runs (automation_run_id);
-- Down Migration
ALTER TABLE generation_runs DROP COLUMN automation_run_id;
DROP TABLE automation_runs;
DROP TABLE radar_automations;
DROP TABLE studio_settings;
