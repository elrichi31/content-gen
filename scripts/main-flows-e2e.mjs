/* global fetch */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = resolve(".");
const temporaryRoot = mkdtempSync(join(tmpdir(), "content-gen-e2e-"));
const databasePath = join(temporaryRoot, "content-gen.sqlite");
// El E2E lanza el worker él mismo para que el render sea determinista; en la app real arranca solo.
const environment = { ...process.env, DATABASE_URL: `file:${databasePath}`, MAX_ACTIVE_RENDER_JOBS: "2", RENDER_WORKER_AUTOSTART: "0" };
process.env.DATABASE_URL = environment.DATABASE_URL;
process.env.MAX_ACTIVE_RENDER_JOBS = environment.MAX_ACTIVE_RENDER_JOBS;
process.env.RENDER_WORKER_AUTOSTART = environment.RENDER_WORKER_AUTOSTART;
let app;
let server;
let baseUrl;

async function json(path, options, status) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  assert.equal(response.status, status, `${options?.method ?? "GET"} ${path}: ${response.status} ${text}`);
  return JSON.parse(text);
}

const post = (path, body, status = 201) => json(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, status);

const carouselDocument = {
  schemaVersion: 1,
  topic: "Flujo E2E",
  platform: "instagram",
  caption: { text: "Carrusel E2E", hashtags: ["#e2e"] },
  slides: [
    { id: "portada", layout: "cover", title: "Carrusel E2E", backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "cierre", layout: "cta", ctaText: "Continuar", backgroundColor: "bg-card", textColor: "text-foreground" },
  ],
};
const adDocument = {
  schemaVersion: 1, format: "square", layout: "promo", accentColor: "#62de91", bgColor: "#101210", textColor: "#ffffff", cta: "Probar",
  offerBadge: "E2E", headline: "Anuncio E2E", body: "Flujo completo", originalPrice: "$9", newPrice: "$4", urgency: "Hoy",
  compHeadline: "Compara", leftLabel: "Antes", rightLabel: "Ahora", leftItems: ["Lento"], rightItems: ["Rápido"],
  featHeadline: "Todo", featBody: "Incluido", features: [{ emoji: "+", label: "Simple" }],
  quote: "Funciona", authorName: "Ana", authorRole: "CEO", stars: 5,
  painEmoji: "!", painHeadline: "Problema", painDesc: "Tiempo", solutionEmoji: "+", solutionHeadline: "Solución", solutionDesc: "IA",
};
// Las siete escenas fijas de la plantilla estándar, con la duración mínima para que el render del E2E sea corto.
const videoScenes = [["intro", "intro"], ["layers", "layers"], ["phase1", "phase"], ["phase2", "phase"], ["phase3", "phase"], ["reality", "reality"], ["close", "close"]];
const videoDocument = {
  schemaVersion: 1, slug: "video-e2e", templateId: "standard", title: "Video E2E", width: 1080, height: 1920, fps: 30,
  scenes: videoScenes.map(([id, kind]) => ({ id, kind, durationFrames: 4, content: { tag: "E2E", title: "Video E2E", subtitle: "Render real", timestamp: "E2E", indicator: ["Dato"], actions: ["Uno", "Dos"], terminal: ["> e2e = ok"], definition: "Render real", event: "E2E", year: "2026", headline: "E2E", impact: "Render real" } })),
};

try {
  const init = spawnSync(process.execPath, ["scripts/init-db.mjs"], { cwd: root, env: environment, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const next = (await import("next")).default;
  app = next({ dev: false, dir: resolve("apps/studio"), hostname: "127.0.0.1" });
  await app.prepare();
  server = createServer(app.getRequestHandler());
  // El render del worker deja la conexión inactiva más de los 5s por defecto: sin esto,
  // el servidor cierra el socket y la siguiente petición reutilizada falla con ECONNRESET.
  server.keepAliveTimeout = 300_000;
  server.headersTimeout = 305_000;
  await new Promise((done, fail) => server.once("error", fail).listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const brand = await post("/api/brand-kits", { name: "Marca E2E", primaryColor: "#62de91", logoAssetId: null });
  const campaign = await post("/api/campaigns", { name: "Campaña E2E", brandKitId: brand.id, brief: { topic: "Prueba integral", audience: "Equipo", tone: "Directo", language: "es", context: "Temporal" } });
  const carousel = await post("/api/content-items", { campaignId: campaign.id, type: "carousel", document: { schemaVersion: 1, data: carouselDocument } });
  await post("/api/content-items", { campaignId: campaign.id, type: "ad", document: { schemaVersion: 1, data: adDocument } });
  const video = await post("/api/content-items", { campaignId: campaign.id, type: "video", document: { schemaVersion: 1, data: videoDocument } });

  const updatedCarousel = await json(`/api/content-items/${carousel.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision: carousel.revision, document: { schemaVersion: 1, data: { ...carouselDocument, caption: { ...carouselDocument.caption, text: "Carrusel E2E guardado" } } } }),
  }, 200);
  assert.equal(updatedCarousel.revision, 1);

  for (const [path, document] of [["/api/carousels/export", carouselDocument], ["/api/ads/export", adDocument]]) {
    const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ document, format: "png" }) });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }

  const job = await post("/api/render-jobs", { contentItemId: video.id });
  const worker = spawnSync(process.execPath, ["apps/render-worker/src/worker.mjs", "--once"], { cwd: root, env: environment, encoding: "utf8", timeout: 120_000 });
  assert.equal(worker.status, 0, worker.stderr || worker.stdout);
  const jobs = await json(`/api/render-jobs?contentItemId=${video.id}`, undefined, 200);
  assert.equal(jobs[0].id, job.id);
  assert.equal(jobs[0].status, "completed", worker.stdout);
  assert.ok(jobs[0].outputAssetId);

  const assetResponse = await fetch(`${baseUrl}/api/assets/${jobs[0].outputAssetId}`);
  const mp4 = Buffer.from(await assetResponse.arrayBuffer());
  assert.equal(assetResponse.status, 200);
  assert.ok(mp4.length > 10_000);

  const detail = await json(`/api/campaigns/${campaign.id}`, undefined, 200);
  assert.equal(detail.pieces.length, 3);
  const library = await json(`/api/content-items?campaignId=${campaign.id}`, undefined, 200);
  assert.deepEqual(new Set(library.map((item) => item.type)), new Set(["carousel", "ad", "video"]));
  const packageResponse = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/export`);
  const packageBytes = Buffer.from(await packageResponse.arrayBuffer());
  assert.equal(packageResponse.status, 200);
  assert.equal(packageBytes.subarray(0, 2).toString(), "PK");
  assert.ok(packageBytes.includes(Buffer.from("captions.txt")));
  assert.ok(packageBytes.includes(Buffer.from("Carrusel E2E guardado")));
  assert.ok(packageBytes.includes(Buffer.from(".mp4")));

  const database = new DatabaseSync(databasePath, { readOnly: true });
  const counts = Object.fromEntries(["brand_kits", "campaigns", "content_items", "render_jobs", "assets", "exports"].map((table) => [table, database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total]));
  database.close();
  assert.deepEqual(counts, { brand_kits: 1, campaigns: 1, content_items: 3, render_jobs: 1, assets: 1, exports: 1 });
  console.log(`E2E principal: campaña, carrusel, anuncio, video, MP4 y ZIP verificados en ${mp4.length} bytes.`);
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  if (app) await app.close();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
