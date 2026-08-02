import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRepoRoot, isRenderJobStale, renderWorkerAutostartEnabled, startRenderWorker } from "./render-worker.ts";

assert.equal(renderWorkerAutostartEnabled(undefined), true, "el arranque automático viene activado por defecto");
assert.equal(renderWorkerAutostartEnabled("0"), false, "se puede desactivar con 0");
assert.equal(renderWorkerAutostartEnabled("false"), false);
assert.equal(renderWorkerAutostartEnabled("1"), true);
assert.equal(isRenderJobStale({ status: "processing", createdAt: "2026-01-01T00:00:00.000Z" }, Date.parse("2026-01-01T00:01:00.000Z")), true, "recupera el job si su worker dejó de dar señales");
assert.equal(isRenderJobStale({ status: "processing", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:30.000Z" }, Date.parse("2026-01-01T00:01:00.000Z")), false, "el latido de un worker vivo evita reintentos duplicados");

const root = await mkdtemp(join(tmpdir(), "content-gen-worker-"));
try {
  await mkdir(join(root, "apps", "render-worker", "src"), { recursive: true });
  await writeFile(join(root, "apps", "render-worker", "src", "worker.mjs"), "process.exit(0);\n");
  await mkdir(join(root, "apps", "studio", "src"), { recursive: true });

  assert.equal(findRepoRoot(join(root, "apps", "studio")), root, "encuentra la raíz del repo desde el directorio del servidor de Next");
  assert.equal(findRepoRoot(root), root, "también desde la propia raíz");
  assert.equal(findRepoRoot(tmpdir()), null, "devuelve null si no hay worker que lanzar");

  const previous = process.env.RENDER_WORKER_AUTOSTART;
  process.env.RENDER_WORKER_AUTOSTART = "0";
  assert.deepEqual(startRenderWorker(), { started: false, reason: "desactivado" }, "no lanza nada cuando está desactivado");
  if (previous === undefined) delete process.env.RENDER_WORKER_AUTOSTART; else process.env.RENDER_WORKER_AUTOSTART = previous;
  console.log("Worker de render: arranque automático, raíz del repo y desactivación validados.");
} finally {
  await rm(root, { recursive: true, force: true });
}
