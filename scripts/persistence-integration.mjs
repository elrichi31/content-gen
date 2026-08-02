import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const storage = resolve("storage"); const folder = `f09-integration-${randomUUID()}`; const root = resolve(storage, folder);
if (!root.startsWith(`${storage}${sep}`)) throw new Error("Ruta temporal insegura.");
try {
  const setup = spawnSync(process.execPath, ["scripts/init-db.mjs"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:./storage/${folder}/content-gen.sqlite` } });
  if (setup.status !== 0) throw new Error(setup.stderr || "No se pudo inicializar SQLite temporal.");
  const path = resolve(root, "content-gen.sqlite"); const now = "2026-07-23T00:00:00.000Z";
  let db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys = ON;");
  db.prepare("INSERT INTO brand_kits VALUES (?, 1, ?, ?, ?, NULL)").run("brand", JSON.stringify({ id: "brand", schemaVersion: 1, name: "Prueba", primaryColor: "#123456", createdAt: now, updatedAt: now, archivedAt: null }), now, now);
  db.prepare("INSERT INTO campaigns VALUES (?, 1, ?, ?, ?, ?, NULL)").run("campaign", "brand", JSON.stringify({ id: "campaign", schemaVersion: 1, name: "Prueba", brief: "", brandKitId: "brand", createdAt: now, updatedAt: now, archivedAt: null }), now, now);
  const videoScenes = [["intro", "intro"], ["layers", "layers"], ["phase1", "phase"], ["phase2", "phase"], ["phase3", "phase"], ["reality", "reality"], ["close", "close"]];
  const video = { schemaVersion: 1, slug: "prueba-render", templateId: "standard", title: "Prueba", width: 1080, height: 1920, fps: 30, scenes: videoScenes.map(([id, kind]) => ({ id, kind, durationFrames: 2, content: { title: "Prueba" } })) };
  const document = JSON.stringify({ id: "content", schemaVersion: 1, campaignId: "campaign", type: "video", document: { schemaVersion: 1, data: video }, revision: 0, createdAt: now, updatedAt: now, archivedAt: null });
  db.prepare("INSERT INTO content_items VALUES (?, 1, ?, ?, ?, 0, ?, ?, NULL)").run("content", "campaign", "video", document, now, now);
  const renderJob = JSON.stringify({ id: "render-job", schemaVersion: 1, contentItemId: "content", compositionId: "StandardVideo", status: "queued", progress: 0, outputAssetId: null, inputProps: { document: video }, createdAt: now, completedAt: null, error: null });
  db.prepare("INSERT INTO render_jobs VALUES (?, 1, ?, ?, ?)").run("render-job", "content", renderJob, now);
  assert.equal(db.prepare("UPDATE content_items SET revision = 1 WHERE id = ? AND revision = 0").run("content").changes, 1, "actualiza con revisión vigente");
  assert.equal(db.prepare("UPDATE content_items SET revision = 2 WHERE id = ? AND revision = 0").run("content").changes, 0, "rechaza actualización obsoleta");
  assert.throws(() => db.prepare("INSERT INTO content_items VALUES (?, 1, ?, ?, ?, 0, ?, ?, NULL)").run("orphan", "missing", "ad", document, now, now), /FOREIGN KEY/, "rechaza contenido sin campaña");
  db.close(); db = new DatabaseSync(path);
  assert.equal(JSON.parse(db.prepare("SELECT document_json FROM content_items WHERE id = ?").get("content").document_json).document.data.title, "Prueba", "recupera documento al reabrir");
  assert.equal(JSON.parse(db.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get("render-job").data_json).status, "queued", "conserva job de render al reabrir");
  db.close();
  const worker = spawnSync(process.execPath, ["apps/render-worker/src/worker.mjs", "--once"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:./storage/${folder}/content-gen.sqlite` } });
  if (worker.status !== 0) throw new Error(worker.stderr || "El worker no pudo procesar el job.");
  db = new DatabaseSync(path);
  const finishedJob = JSON.parse(db.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get("render-job").data_json);
  assert.equal(finishedJob.status, "completed", "el worker completa el job persistido");
  assert.equal(finishedJob.progress, 100, "el worker publica progreso final");
  const asset = JSON.parse(db.prepare("SELECT data_json FROM assets WHERE id = ?").get(finishedJob.outputAssetId).data_json);
  assert.equal(asset.mimeType, "video/mp4", "registra el MP4 como asset");
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM exports WHERE asset_id = ?").get(asset.id).total, 1, "registra la exportación MP4");
  assert.equal(existsSync(resolve(root, "media", asset.storageKey)), true, "guarda el archivo MP4");
  const brokenJob = JSON.stringify({ ...finishedJob, id: "broken-render-job", compositionId: "", status: "queued", progress: 0, completedAt: null, error: null });
  db.prepare("INSERT INTO render_jobs VALUES (?, 1, ?, ?, ?)").run("broken-render-job", "content", brokenJob, now); db.close();
  const failedWorker = spawnSync(process.execPath, ["apps/render-worker/src/worker.mjs", "--once"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:./storage/${folder}/content-gen.sqlite` } });
  if (failedWorker.status !== 0) throw new Error(failedWorker.stderr || "El worker no pudo registrar el error.");
  db = new DatabaseSync(path);
  const failedJob = JSON.parse(db.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get("broken-render-job").data_json);
  assert.equal(failedJob.status, "failed", "el worker conserva el fallo");
  assert.match(failedJob.error, /composición/, "el worker conserva el diagnóstico");
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0, "no deja referencias rotas"); db.close();
  console.log("Persistencia: migración limpia, revisión, job recuperable y worker verificados.");
} finally {
  if (existsSync(root)) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch {
      spawnSync("powershell.exe", ["-NoProfile", "-Command", `Remove-Item -LiteralPath '${root.replaceAll("'", "''")}' -Recurse -Force`], { encoding: "utf8" });
    }
  }
}
