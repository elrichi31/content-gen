/* global fetch */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import pg from "pg";
import { resolveAssetPath } from "../apps/studio/src/lib/asset-file.ts";

// Trabaja contra la base de DATABASE_URL (la de desarrollo) y la deja como la encontró.
if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL: corré este script con `npm run test:http-boundaries` (carga .env.local).");
const withClient = async (callback) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await callback(client); }
  finally { await client.end(); }
};
const tables = ["brand_kits", "campaigns", "content_items", "assets", "generation_runs", "render_jobs", "exports"];
const counts = () => withClient(async (client) => Object.fromEntries(await Promise.all(tables.map(async (table) => [table, (await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`)).rows[0].total]))));
const before = await counts();
let baseUrl = "http://127.0.0.1:3000";
let server = null;
let serverOutput = "";
let createdAsset = null;

// Toda la app vive detrás de login: se crea (o reusa) una cuenta de prueba en la base real y
// se manda su cookie de sesión en cada fetch, igual que main-flows-e2e.mjs.
if (!process.env.BETTER_AUTH_SECRET) throw new Error("Falta BETTER_AUTH_SECRET: corré este script con `npm run test:http-boundaries` (carga .env.local).");
process.env.ALLOW_SIGNUP = "1";
const { auth } = await import("../apps/studio/src/lib/auth.ts");
const { closeDatabase } = await import("../apps/studio/src/lib/db.ts");
const signIn = await auth.api.signInEmail({ body: { email: "http-boundaries@content-gen.test", password: "http-boundaries-1234" }, asResponse: true }).catch(() => null);
const signUpOrIn = signIn?.status === 200 ? signIn : await auth.api.signUpEmail({ body: { email: "http-boundaries@content-gen.test", password: "http-boundaries-1234", name: "HTTP Boundaries" }, asResponse: true });
const authCookie = signUpOrIn.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
await closeDatabase();
if (!authCookie) throw new Error("No se pudo autenticar la prueba de límites HTTP.");

async function cleanupAsset() {
  if (!createdAsset) return;
  const remaining = await withClient(async (client) => {
    await client.query("DELETE FROM assets WHERE id = $1", [createdAsset.id]);
    return (await client.query("SELECT COUNT(*)::int AS total FROM assets WHERE (data_json::jsonb->>'storageKey') = $1", [createdAsset.storageKey])).rows[0].total;
  });
  if (!remaining) rmSync(resolveAssetPath(resolve(process.env.STORAGE_ROOT ?? "storage", "media"), createdAsset.storageKey), { force: true });
  createdAsset = null;
}

try {
  // 401 (sin cookie todavía) cuenta como "el servidor respondió": solo nos interesa que
  // esté arriba, no que esta petición puntual esté autenticada.
  try {
    await fetch(`${baseUrl}/api/brand-kits`);
  } catch {
    baseUrl = "http://127.0.0.1:3219";
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3219"], { cwd: resolve("apps/studio") });
    server.stdout.on("data", (chunk) => { serverOutput += chunk; });
    server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    let ready = false;
    try { ready = Boolean(await fetch(`${baseUrl}/api/brand-kits`)); } catch { ready = false; }
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
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json", cookie: authCookie }, body: "{" });
    assert.ok(response.status >= 400 && response.status < 500, `${method} ${path} devolvió ${response.status}`);
  }
  const assetResponse = await fetch(`${baseUrl}/api/assets`, { method: "POST", headers: { "content-type": "application/json", cookie: authCookie }, body: "{}" });
  assert.equal(assetResponse.status, 400);
  for (const body of [Buffer.alloc(0), Buffer.from("no-es-png")]) {
    const response = await fetch(`${baseUrl}/api/assets`, { method: "POST", headers: { "content-type": "image/png", "x-asset-filename": "falso.png", cookie: authCookie }, body });
    assert.equal(response.status, 400);
  }
  assert.deepEqual(await counts(), before, "Los payloads inválidos no deben escribir filas.");
  const largePng = Buffer.alloc(11 * 1024 * 1024); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(largePng);
  const upload = await fetch(`${baseUrl}/api/assets`, { method: "POST", headers: { "content-type": "image/png", "x-asset-filename": "grande.png", cookie: authCookie }, body: largePng });
  assert.equal(upload.status, 201); createdAsset = await upload.json();
  assert.equal(createdAsset.sizeBytes, largePng.length);
  assert.equal((await (await fetch(`${baseUrl}/api/assets/${createdAsset.id}`, { headers: { cookie: authCookie } })).arrayBuffer()).byteLength, largePng.length);
  await cleanupAsset();
  assert.deepEqual(await counts(), before, "La prueba de upload debe limpiar su asset temporal.");
  console.log(`Boundaries HTTP: ${cases.length + 1} payloads inválidos y upload streaming de 11 MB verificados.`);
} finally {
  await cleanupAsset();
  if (server && process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else if (server) server.kill("SIGTERM");
}
