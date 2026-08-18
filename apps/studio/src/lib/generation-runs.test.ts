import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = await mkdtemp(join(tmpdir(), "content-gen-runs-"));
process.env.DATABASE_URL = `file:${join(root, "runs.sqlite")}`;

const pricingFile = join(root, "pricing.json");
await writeFile(pricingFile, JSON.stringify({
  version: "2026-08-18",
  currency: "USD",
  models: { "script-test": { inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 10 } },
  tools: { webSearchPerCall: 0.01 },
  speech: { perThousandCharacters: null },
}), "utf8");
process.env.PRICING_FILE = pricingFile;

const database = new DatabaseSync(join(root, "runs.sqlite"));
database.exec(`
  CREATE TABLE campaigns (id TEXT PRIMARY KEY);
  CREATE TABLE content_items (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, type TEXT NOT NULL, archived_at TEXT, FOREIGN KEY (campaign_id) REFERENCES campaigns(id));
  CREATE TABLE generation_runs (
    id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, content_item_id TEXT, radar_topic_id TEXT,
    operation TEXT NOT NULL DEFAULT 'generation', provider TEXT NOT NULL DEFAULT 'openai',
    status TEXT NOT NULL DEFAULT 'completed', cost_amount REAL, data_json TEXT NOT NULL,
    created_at TEXT NOT NULL, completed_at TEXT,
    FOREIGN KEY (content_item_id) REFERENCES content_items(id)
  );
`);
database.prepare("INSERT INTO campaigns VALUES (?)").run("campaign");
database.prepare("INSERT INTO content_items VALUES (?, ?, ?, ?)").run("video", "campaign", "video", null);
database.prepare("INSERT INTO content_items VALUES (?, ?, ?, ?)").run("carrusel", "campaign", "carousel", null);
database.prepare("INSERT INTO content_items VALUES (?, ?, ?, ?)").run("archivado", "campaign", "carousel", "2026-08-01T00:00:00.000Z");
database.close();

const { beginGenerationRun, finishGenerationRun, GenerationRunError } = await import("./generation-runs.ts");

/* -------- Video: sigue funcionando igual que antes de la migración -------- */

const started = await beginGenerationRun({ contentItemId: "video", operation: "video-script", model: "script-test" });
const completed = await finishGenerationRun(started.id, { durationMs: 42, usage: { inputTokens: 1200, cachedInputTokens: 1000, outputTokens: 300, webSearchCalls: 0, images: 0, characters: 0 } });
assert.equal(completed.status, "completed", "cierra el intento exitoso");
assert.equal(completed.model, "script-test", "conserva el modelo usado");
assert.equal(completed.usage?.outputTokens, 300, "conserva el consumo normalizado");
assert.equal(completed.cost?.amount, 0.0036, "congela el importe: 200 input + 1000 cacheados + 300 salida");
assert.equal(completed.cost?.pricingVersion, "2026-08-18", "guarda con qué tarifa se calculó");

/* ---- Lo que la migración desbloquea: piezas que no son video, y sin pieza ---- */

const carousel = await beginGenerationRun({ contentItemId: "carrusel", operation: "carousel-generate", model: "script-test" });
assert.equal(carousel.contentItemId, "carrusel", "un carrusel ya puede registrar su generación");

const research = await beginGenerationRun({ contentItemId: null, operation: "radar-research", model: "script-test" });
const researchDone = await finishGenerationRun(research.id, { durationMs: 9000, usage: { inputTokens: 500, cachedInputTokens: 0, outputTokens: 100, webSearchCalls: 4, images: 0, characters: 0 } });
assert.equal(researchDone.contentItemId, null, "la investigación no pertenece a ninguna pieza");
assert.equal(researchDone.cost?.amount, 0.042, "cobra las 4 búsquedas web aparte de los tokens");

await assert.rejects(
  () => beginGenerationRun({ contentItemId: "archivado", operation: "carousel-generate", model: "script-test" }),
  (error: unknown) => error instanceof GenerationRunError && error.status === 404,
  "una pieza archivada sigue rechazándose",
);

/* --------- Las columnas permiten informar sin abrir el data_json --------- */

const report = new DatabaseSync(join(root, "runs.sqlite"));
const rows = report.prepare("SELECT operation, provider, status, cost_amount, completed_at FROM generation_runs ORDER BY operation").all() as { operation: string; provider: string; status: string; cost_amount: number | null; completed_at: string | null }[];
assert.deepEqual(rows.map((row) => row.operation), ["carousel-generate", "radar-research", "video-script"], "la operación se consulta como columna");
const totals = report.prepare("SELECT SUM(cost_amount) AS total FROM generation_runs WHERE status = 'completed'").get() as { total: number };
assert.equal(Number(totals.total.toFixed(6)), 0.0456, "el gasto se suma en SQL sin recorrer los JSON");
assert.equal(rows.find((row) => row.operation === "carousel-generate")?.cost_amount, null, "una operación en curso no tiene importe todavía");
assert.equal(rows.find((row) => row.operation === "video-script")?.completed_at !== null, true, "el cierre queda fechado en columna");
report.close();

/* ---------- Sin tarifa cargada se registra igual, sin importe ---------- */

// La tarifa se cachea por ruta, así que apuntar a un fichero inexistente basta para simularla rota.
process.env.PRICING_FILE = join(root, "no-existe.json");
const untariffed = await beginGenerationRun({ contentItemId: "video", operation: "video-caption", model: "script-test" });
const untariffedDone = await finishGenerationRun(untariffed.id, { durationMs: 10, usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, webSearchCalls: 0, images: 0, characters: 0 } });
assert.equal(untariffedDone.cost, null, "una tarifa ilegible no tumba la generación: se registra sin importe");

await rm(root, { recursive: true, force: true });
console.log("GenerationRun: piezas de cualquier tipo, runs sin pieza, importe congelado y columnas de informe validados.");
