/* global fetch */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import pg from "pg";

// Mide sobre la base de DATABASE_URL (la de desarrollo, con datos reales): es una línea base de
// rendimiento, no una prueba aislada.
if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL: corré con `npm run test:performance` (carga .env.local).");
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
const counts = {
  content: (await database.query("SELECT COUNT(*)::int AS total FROM content_items")).rows[0].total,
  assets: (await database.query("SELECT COUNT(*)::int AS total FROM assets")).rows[0].total,
};
await database.end();

let app;
let server;
try {
  // Toda la app vive detrás de login: se reusa (o crea) una cuenta de prueba en la base real
  // y su cookie de sesión viaja en cada medición, igual que un browser real.
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("Falta BETTER_AUTH_SECRET: corré con `npm run test:performance` (carga .env.local).");
  process.env.NODE_ENV = "production";
  process.env.ALLOW_SIGNUP = "1";
  const { auth } = await import("../apps/studio/src/lib/auth.ts");
  const { closeDatabase } = await import("../apps/studio/src/lib/db.ts");
  const signIn = await auth.api.signInEmail({ body: { email: "performance-baseline@content-gen.test", password: "performance-baseline-1234" }, asResponse: true }).catch(() => null);
  const signUpOrIn = signIn?.status === 200 ? signIn : await auth.api.signUpEmail({ body: { email: "performance-baseline@content-gen.test", password: "performance-baseline-1234", name: "Performance Baseline" }, asResponse: true });
  const authCookie = signUpOrIn.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
  await closeDatabase();
  assert.ok(authCookie, "la prueba de rendimiento necesita una cookie de sesión");

  const next = (await import("next")).default;
  app = next({ dev: false, dir: resolve("apps/studio"), hostname: "127.0.0.1" });
  await app.prepare();
  server = createServer(app.getRequestHandler());
  await new Promise((done, fail) => server.once("error", fail).listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const measure = async (path) => {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: authCookie } });
    const bytes = (await response.arrayBuffer()).byteLength;
    assert.equal(response.status, 200, `${path}: ${response.status}`);
    return { durationMs: performance.now() - startedAt, bytes };
  };
  const workloads = ["/api/content-items", "/library", "/carousel", "/ads", "/video"];
  const results = {};
  for (const path of workloads) {
    await measure(path);
    const samples = [];
    for (let index = 0; index < 10; index += 1) samples.push(await measure(path));
    samples.sort((a, b) => a.durationMs - b.durationMs);
    results[path] = {
      medianMs: samples[4].durationMs,
      p95Ms: samples[9].durationMs,
      bytes: samples[9].bytes,
    };
  }

  const burstStartedAt = performance.now();
  await Promise.all(Array.from({ length: 8 }, () => measure("/api/content-items")));
  const burstMs = performance.now() - burstStartedAt;
  for (const [path, result] of Object.entries(results)) {
    assert.ok(result.p95Ms < 500, `${path} p95 ${result.p95Ms.toFixed(1)} ms supera 500 ms`);
  }
  assert.ok(burstMs < 1_000, `ráfaga API ${burstMs.toFixed(1)} ms supera 1000 ms`);
  console.log(JSON.stringify({ dataset: counts, results, eightRequestBurstMs: burstMs }, null, 2));
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  if (app) await app.close();
}
