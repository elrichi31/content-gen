/* global fetch */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as wait } from "node:timers/promises";
import { resolveAssetPath } from "../apps/studio/src/lib/asset-file.ts";

const tables = ["brand_kits", "campaigns", "content_items", "assets", "generation_runs", "render_jobs", "exports"];
const counts = () => {
  const database = new DatabaseSync("storage/content-gen.sqlite");
  try { return Object.fromEntries(tables.map((table) => [table, database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total])); }
  finally { database.close(); }
};
const before = counts();
let baseUrl = "http://127.0.0.1:3000";
let server = null;
let serverOutput = "";
let createdAsset = null;

function cleanupAsset() {
  if (!createdAsset) return;
  const database = new DatabaseSync("storage/content-gen.sqlite");
  database.prepare("DELETE FROM assets WHERE id = ?").run(createdAsset.id);
  const remaining = database.prepare("SELECT COUNT(*) AS total FROM assets WHERE json_extract(data_json, '$.storageKey') = ?").get(createdAsset.storageKey).total;
  database.close();
  if (!remaining) rmSync(resolveAssetPath(resolve("storage/media"), createdAsset.storageKey), { force: true });
  createdAsset = null;
}

try {
  try {
    if (!(await fetch(`${baseUrl}/api/brand-kits`)).ok) throw new Error();
  } catch {
    baseUrl = "http://127.0.0.1:3219";
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3219"], { cwd: resolve("apps/studio") });
    server.stdout.on("data", (chunk) => { serverOutput += chunk; });
    server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    let ready = false;
    try { ready = (await fetch(`${baseUrl}/api/brand-kits`)).ok; } catch { ready = false; }
    if (ready) break;
    await wait(500);
    if (attempt === 59) throw new Error(`Studio no inició para la prueba HTTP.\n${serverOutput.slice(-2000)}`);
  }

  const cases = [
    ["POST", "/api/brand-kits"], ["PATCH", "/api/brand-kits/missing"],
    ["POST", "/api/campaigns"], ["PATCH", "/api/campaigns/missing"],
    ["POST", "/api/content-items"], ["PATCH", "/api/content-items/missing"],
    ["POST", "/api/render-jobs"], ["PATCH", "/api/render-jobs/missing"],
    ["POST", "/api/ads/export"], ["POST", "/api/ads/generate"],
    ["POST", "/api/carousels/export"], ["POST", "/api/carousels/generate"],
    ["POST", "/api/carousels/image"], ["POST", "/api/carousels/remix"], ["POST", "/api/carousels/slides"],
    ["POST", "/api/videos/generate"], ["POST", "/api/videos/missing/caption"],
    ["POST", "/api/videos/missing/scenes/missing/audio"], ["POST", "/api/videos/missing/scenes/missing/image"],
    ["POST", "/api/videos/missing/voiceover-script"],
  ];
  for (const [method, path] of cases) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: "{" });
    assert.ok(response.status >= 400 && response.status < 500, `${method} ${path} devolvió ${response.status}`);
  }
  const assetResponse = await fetch(`${baseUrl}/api/assets`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(assetResponse.status, 400);
  for (const body of [Buffer.alloc(0), Buffer.from("no-es-png")]) {
    const response = await fetch(`${baseUrl}/api/assets`, { method: "POST", headers: { "content-type": "image/png", "x-asset-filename": "falso.png" }, body });
    assert.equal(response.status, 400);
  }
  assert.deepEqual(counts(), before, "Los payloads inválidos no deben escribir filas.");
  const largePng = Buffer.alloc(11 * 1024 * 1024); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(largePng);
  const upload = await fetch(`${baseUrl}/api/assets`, { method: "POST", headers: { "content-type": "image/png", "x-asset-filename": "grande.png" }, body: largePng });
  assert.equal(upload.status, 201); createdAsset = await upload.json();
  assert.equal(createdAsset.sizeBytes, largePng.length);
  assert.equal((await (await fetch(`${baseUrl}/api/assets/${createdAsset.id}`)).arrayBuffer()).byteLength, largePng.length);
  cleanupAsset();
  assert.deepEqual(counts(), before, "La prueba de upload debe limpiar su asset temporal.");
  console.log(`Boundaries HTTP: ${cases.length + 1} payloads inválidos y upload streaming de 11 MB verificados.`);
} finally {
  cleanupAsset();
  if (server && process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else if (server) server.kill("SIGTERM");
}
