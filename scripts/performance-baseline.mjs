/* global fetch */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const root = resolve(".");
const databasePath = resolve(root, "storage/content-gen.sqlite");
process.env.DATABASE_URL = `file:${databasePath}`;
const database = new DatabaseSync(databasePath, { readOnly: true });
const counts = {
  content: database.prepare("SELECT COUNT(*) AS total FROM content_items").get().total,
  assets: database.prepare("SELECT COUNT(*) AS total FROM assets").get().total,
};
database.close();

let app;
let server;
try {
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
    const response = await fetch(`${baseUrl}${path}`);
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
