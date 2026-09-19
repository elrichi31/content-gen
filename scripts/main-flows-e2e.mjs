/* global fetch */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTestDatabase } from "./test-db.mjs";

const root = resolve(".");
// `temporaryRoot` hace de STORAGE_ROOT (medios y renders); la base es una de Postgres efímera.
const temporaryRoot = mkdtempSync(join(tmpdir(), "content-gen-e2e-"));
const testDb = await createTestDatabase();
// El E2E lanza el worker él mismo para que el render sea determinista; en la app real arranca solo.
// BETTER_AUTH_SECRET tiene que ser el mismo valor con el que se compiló apps/studio (Next.js
// inlinea process.env.* en el build): por eso este script se invoca con --env-file-if-exists,
// igual que auth:create-user, en vez de fijar un secreto propio que no coincidiría con el build.
if (!process.env.BETTER_AUTH_SECRET) throw new Error("Falta BETTER_AUTH_SECRET: corré este script con `npm run test:e2e` (carga .env.local).");
// Better Auth nombra la cookie de sesión distinto en producción (prefijo __Secure-). Fijar
// NODE_ENV=production ANTES de crear la cuenta de prueba evita que el signUp (que corre antes
// de instanciar `next()`) firme una cookie con el nombre de dev que el server, ya en modo
// producción, no reconocería.
process.env.NODE_ENV = "production";
const environment = { ...process.env, DATABASE_URL: testDb.url, STORAGE_ROOT: temporaryRoot, MAX_ACTIVE_RENDER_JOBS: "2", RENDER_WORKER_AUTOSTART: "0" };
process.env.DATABASE_URL = environment.DATABASE_URL;
process.env.STORAGE_ROOT = environment.STORAGE_ROOT;
process.env.MAX_ACTIVE_RENDER_JOBS = environment.MAX_ACTIVE_RENDER_JOBS;
process.env.RENDER_WORKER_AUTOSTART = environment.RENDER_WORKER_AUTOSTART;
let app;
let server;
let baseUrl;
let authCookie;

async function json(path, options, status) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...options?.headers, cookie: authCookie } });
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
  // Toda la app vive detrás de login: el E2E se crea su propia cuenta en la base temporal
  // y reusa la cookie de sesión en cada fetch, igual que haría un browser real.
  process.env.ALLOW_SIGNUP = "1";
  const { auth } = await import("../apps/studio/src/lib/auth.ts");
  const signUpResponse = await auth.api.signUpEmail({ body: { email: "e2e@content-gen.test", password: "flujo-e2e-1234", name: "E2E" }, asResponse: true });
  // Set-Cookie puede venir en más de un header (sesión + su firma); Cookie solo admite
  // pares nombre=valor, sin los atributos (Path, HttpOnly, etc.) de cada Set-Cookie.
  authCookie = signUpResponse.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
  assert.ok(authCookie, "el E2E necesita una cookie de sesión para hablarle a la API");

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
    const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: authCookie }, body: JSON.stringify({ document, format: "png" }) });
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

  const assetResponse = await fetch(`${baseUrl}/api/assets/${jobs[0].outputAssetId}`, { headers: { cookie: authCookie } });
  const mp4 = Buffer.from(await assetResponse.arrayBuffer());
  assert.equal(assetResponse.status, 200);
  assert.ok(mp4.length > 10_000);

  const detail = await json(`/api/campaigns/${campaign.id}`, undefined, 200);
  assert.equal(detail.pieces.length, 3);
  const library = await json(`/api/content-items?campaignId=${campaign.id}`, undefined, 200);
  assert.deepEqual(new Set(library.map((item) => item.type)), new Set(["carousel", "ad", "video"]));
  const packageResponse = await fetch(`${baseUrl}/api/campaigns/${campaign.id}/export`, { headers: { cookie: authCookie } });
  const packageBytes = Buffer.from(await packageResponse.arrayBuffer());
  assert.equal(packageResponse.status, 200);
  assert.equal(packageBytes.subarray(0, 2).toString(), "PK");
  assert.ok(packageBytes.includes(Buffer.from("captions.txt")));
  assert.ok(packageBytes.includes(Buffer.from("Carrusel E2E guardado")));
  assert.ok(packageBytes.includes(Buffer.from(".mp4")));

  const counts = Object.fromEntries(await Promise.all(["brand_kits", "campaigns", "content_items", "render_jobs", "assets", "exports"].map(async (table) => [table, (await testDb.query(`SELECT COUNT(*)::int AS total FROM ${table}`))[0].total])));
  assert.deepEqual(counts, { brand_kits: 1, campaigns: 1, content_items: 3, render_jobs: 1, assets: 1, exports: 1 });
  console.log(`E2E principal: campaña, carrusel, anuncio, video, MP4 y ZIP verificados en ${mp4.length} bytes.`);
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  if (app) await app.close();
  // drop() cierra el pool de este proceso y borra la base con FORCE, que además expulsa las
  // conexiones de la copia compilada de Next que no alcanzamos desde acá.
  await testDb.drop();
  // En Windows los archivos de medios pueden seguir abiertos un instante más, así que el borrado
  // normal puede fallar con EPERM. Mismo remedio que usa persistence-integration.mjs.
  if (existsSync(temporaryRoot)) {
    try {
      rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      spawnSync("powershell.exe", ["-NoProfile", "-Command", `Remove-Item -LiteralPath '${temporaryRoot.replaceAll("'", "''")}' -Recurse -Force`], { encoding: "utf8" });
    }
  }
}
