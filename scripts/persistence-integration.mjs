import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createTestDatabase } from "./test-db.mjs";

const storage = resolve("storage"); const folder = `f09-integration-${randomUUID()}`; const root = resolve(storage, folder);
if (!root.startsWith(`${storage}${sep}`)) throw new Error("Ruta temporal insegura.");
// Base efímera con las migraciones reales; el worker escribe medios y renders bajo `root`.
const testDb = await createTestDatabase();
const workerEnv = { ...process.env, DATABASE_URL: testDb.url, STORAGE_ROOT: root };
const runWorker = () => spawnSync(process.execPath, ["apps/render-worker/src/worker.mjs", "--once"], { cwd: process.cwd(), encoding: "utf8", env: workerEnv });
const jobOf = async (id) => JSON.parse((await testDb.query("SELECT data_json FROM render_jobs WHERE id = $1", [id]))[0].data_json);
try {
  const now = "2026-07-23T00:00:00.000Z";
  await testDb.query("INSERT INTO brand_kits (id, schema_version, data_json, created_at, updated_at) VALUES ($1, 1, $2, $3, $3)", ["brand", JSON.stringify({ id: "brand", schemaVersion: 1, name: "Prueba", primaryColor: "#123456", createdAt: now, updatedAt: now, archivedAt: null }), now]);
  await testDb.query("INSERT INTO campaigns (id, schema_version, brand_kit_id, data_json, created_at, updated_at) VALUES ($1, 1, $2, $3, $4, $4)", ["campaign", "brand", JSON.stringify({ id: "campaign", schemaVersion: 1, name: "Prueba", brief: "", brandKitId: "brand", createdAt: now, updatedAt: now, archivedAt: null }), now]);
  const videoScenes = [["intro", "intro"], ["layers", "layers"], ["phase1", "phase"], ["phase2", "phase"], ["phase3", "phase"], ["reality", "reality"], ["close", "close"]];
  const video = { schemaVersion: 1, slug: "prueba-render", templateId: "standard", title: "Prueba", width: 1080, height: 1920, fps: 30, scenes: videoScenes.map(([id, kind]) => ({ id, kind, durationFrames: 2, content: { title: "Prueba" } })) };
  const document = JSON.stringify({ id: "content", schemaVersion: 1, campaignId: "campaign", type: "video", document: { schemaVersion: 1, data: video }, revision: 0, createdAt: now, updatedAt: now, archivedAt: null });
  const insertContent = (id, campaignId, type) => testDb.query("INSERT INTO content_items (id, schema_version, campaign_id, type, document_json, revision, created_at, updated_at) VALUES ($1, 1, $2, $3, $4, 0, $5, $5)", [id, campaignId, type, document, now]);
  await insertContent("content", "campaign", "video");
  const renderJob = JSON.stringify({ id: "render-job", schemaVersion: 1, contentItemId: "content", compositionId: "StandardVideo", status: "queued", progress: 0, outputAssetId: null, inputProps: { document: video }, createdAt: now, completedAt: null, error: null });
  await testDb.query("INSERT INTO render_jobs (id, schema_version, content_item_id, data_json, created_at) VALUES ($1, 1, $2, $3, $4)", ["render-job", "content", renderJob, now]);
  // El UPDATE condicionado por revisión es el control de concurrencia optimista de la app.
  assert.equal((await testDb.query("UPDATE content_items SET revision = 1 WHERE id = $1 AND revision = 0 RETURNING id", ["content"])).length, 1, "actualiza con revisión vigente");
  assert.equal((await testDb.query("UPDATE content_items SET revision = 2 WHERE id = $1 AND revision = 0 RETURNING id", ["content"])).length, 0, "rechaza actualización obsoleta");
  // 23503 = foreign_key_violation: Postgres lo impide en el INSERT, sin necesidad de una revisión posterior.
  await assert.rejects(() => insertContent("orphan", "missing", "ad"), (error) => error.code === "23503", "rechaza contenido sin campaña");
  // Cada consulta de testDb abre una conexión nueva: leer aquí es leer lo que quedó persistido.
  assert.equal(JSON.parse((await testDb.query("SELECT document_json FROM content_items WHERE id = $1", ["content"]))[0].document_json).document.data.title, "Prueba", "recupera documento al reconectar");
  assert.equal((await jobOf("render-job")).status, "queued", "conserva job de render al reconectar");
  const worker = runWorker();
  if (worker.status !== 0) throw new Error(worker.stderr || "El worker no pudo procesar el job.");
  const finishedJob = await jobOf("render-job");
  assert.equal(finishedJob.status, "completed", "el worker completa el job persistido");
  assert.equal(finishedJob.progress, 100, "el worker publica progreso final");
  assert.ok(Array.isArray(finishedJob.log) && finishedJob.log.length > 0, "el worker deja un log de progreso legible en el job");
  const asset = JSON.parse((await testDb.query("SELECT data_json FROM assets WHERE id = $1", [finishedJob.outputAssetId]))[0].data_json);
  assert.equal(asset.mimeType, "video/mp4", "registra el MP4 como asset");
  assert.equal((await testDb.query("SELECT COUNT(*)::int AS total FROM exports WHERE asset_id = $1", [asset.id]))[0].total, 1, "registra la exportación MP4");
  assert.equal(existsSync(resolve(root, "media", asset.storageKey)), true, "guarda el archivo MP4");
  const brokenJob = JSON.stringify({ ...finishedJob, id: "broken-render-job", compositionId: "", status: "queued", progress: 0, completedAt: null, error: null });
  await testDb.query("INSERT INTO render_jobs (id, schema_version, content_item_id, data_json, created_at) VALUES ($1, 1, $2, $3, $4)", ["broken-render-job", "content", brokenJob, now]);
  const failedWorker = runWorker();
  if (failedWorker.status !== 0) throw new Error(failedWorker.stderr || "El worker no pudo registrar el error.");
  const failedJob = await jobOf("broken-render-job");
  assert.equal(failedJob.status, "failed", "el worker conserva el fallo");
  assert.match(failedJob.error, /composición/, "el worker conserva el diagnóstico");
  assert.equal((await testDb.query("SELECT COUNT(*)::int AS total FROM content_items c LEFT JOIN campaigns k ON k.id = c.campaign_id WHERE k.id IS NULL"))[0].total, 0, "no deja referencias rotas");
  console.log("Persistencia: migraciones limpias, revisión, job recuperable y worker verificados.");
} finally {
  await testDb.drop();
  if (existsSync(root)) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch {
      spawnSync("powershell.exe", ["-NoProfile", "-Command", `Remove-Item -LiteralPath '${root.replaceAll("'", "''")}' -Recurse -Force`], { encoding: "utf8" });
    }
  }
}
