import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = await mkdtemp(join(tmpdir(), "content-gen-runs-")); process.env.DATABASE_URL = `file:${join(root, "runs.sqlite")}`;
const database = new DatabaseSync(join(root, "runs.sqlite")); database.exec("CREATE TABLE campaigns (id TEXT PRIMARY KEY); CREATE TABLE content_items (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, type TEXT NOT NULL, archived_at TEXT, FOREIGN KEY (campaign_id) REFERENCES campaigns(id)); CREATE TABLE generation_runs (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, content_item_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (content_item_id) REFERENCES content_items(id));"); database.prepare("INSERT INTO campaigns VALUES (?)").run("campaign"); database.prepare("INSERT INTO content_items VALUES (?, ?, ?, ?)").run("video", "campaign", "video", null); database.close();
const { beginGenerationRun, finishGenerationRun } = await import("./generation-runs.ts");
const started = await beginGenerationRun({ contentItemId: "video", operation: "video-script", model: "script-test" }); const completed = await finishGenerationRun(started.id, { durationMs: 42, usage: { output_tokens: 12 } });
assert.equal(completed.status, "completed", "cierra el intento exitoso"); assert.equal(completed.model, "script-test", "conserva el modelo usado"); assert.equal(completed.usage?.output_tokens, 12, "conserva uso disponible");
await rm(root, { recursive: true, force: true }); console.log("GenerationRun: inicio, cierre y metadatos persistidos.");
