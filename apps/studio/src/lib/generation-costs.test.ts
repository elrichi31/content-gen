import assert from "node:assert/strict";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.COST_BUDGET_MONTHLY = "10";

const seededAt = "2026-08-01T00:00:00.000Z";
await testDb.query("INSERT INTO campaigns (id, schema_version, data_json, created_at, updated_at) VALUES ('campaign', 1, '{}', $1, $1)", [seededAt]);
const addItem = (id: string, type: string, title: string) => testDb.query("INSERT INTO content_items (id, schema_version, campaign_id, type, document_json, created_at, updated_at) VALUES ($1, 1, 'campaign', $2, $3, $4, $4)", [id, type, JSON.stringify({ document: { data: { title } } }), seededAt]);
await addItem("video-1", "video", "Video caro");
await addItem("carrusel-1", "carousel", "Carrusel barato");

let counter = 0;
const addRun = async (run: { operation: string; provider?: string; status?: string; cost: number | null; durationMs?: number; contentItemId?: string | null; createdAt?: string }) => {
  counter += 1;
  const data = { durationMs: run.durationMs ?? 1000 };
  await testDb.query("INSERT INTO generation_runs (id, schema_version, content_item_id, radar_topic_id, operation, provider, status, cost_amount, data_json, created_at, completed_at) VALUES ($1, 1, $2, NULL, $3, $4, $5, $6, $7, $8, $9)",
    [`run-${counter}`, run.contentItemId ?? null, run.operation, run.provider ?? "openai", run.status ?? "completed", run.cost, JSON.stringify(data), run.createdAt ?? "2026-08-10T12:00:00.000Z", "2026-08-10T12:00:05.000Z"]);
};

await addRun({ operation: "article-research", cost: 0.05, durationMs: 30000 });
await addRun({ operation: "article-write", cost: 0.02, durationMs: 8000 });
await addRun({ operation: "video-scene-image", cost: 0.005, contentItemId: "video-1", durationMs: 4000 });
await addRun({ operation: "video-scene-image", cost: 0.005, contentItemId: "video-1", durationMs: 6000 });
await addRun({ operation: "carousel-generate", cost: 0.01, contentItemId: "carrusel-1" });
// Cerrado sin importe: hueco contable. Distinto de uno en curso, que todavía no lo es.
await addRun({ operation: "video-scene-audio", provider: "elevenlabs", cost: null, contentItemId: "video-1" });
await addRun({ operation: "carousel-generate", status: "running", cost: null, contentItemId: "carrusel-1" });
await addRun({ operation: "carousel-generate", status: "failed", cost: 0, contentItemId: "carrusel-1" });
// Fuera del mes consultado: no debe contarse.
await addRun({ operation: "article-write", cost: 99, createdAt: "2026-07-10T12:00:00.000Z" });

const { costReport, currentMonth, monthRange, CostReportError } = await import("./generation-costs.ts");

const report = await costReport({ month: "2026-08" });

assert.equal(report.totals.amount, 0.09, "suma solo los importes del mes consultado");
assert.equal(report.totals.runs, 8, "cuenta todas las operaciones del mes, tarifadas o no");
assert.equal(report.totals.untariffed, 1, "el cerrado sin importe es un hueco; el que sigue en curso no");
assert.equal(report.totals.failed, 1, "los fallos se cuentan aparte: también se pagan");

assert.deepEqual(report.budget, { amount: 10, used: 0.09, ratio: 0.009 }, "compara contra el presupuesto configurado");

const research = report.operations.find((operation) => operation.operation === "article-research");
assert.equal(research?.average, 0.05, "el promedio por operación responde cuánto cuesta investigar");
const images = report.operations.find((operation) => operation.operation === "video-scene-image");
assert.equal(images?.average, 0.005, "promedia sobre las operaciones que sí tienen importe");
assert.equal(images?.medianDurationMs, 5000, "la mediana de duración sale del propio registro");
const carousel = report.operations.find((operation) => operation.operation === "carousel-generate");
assert.equal(carousel?.average, 0.005, "un fallo con importe cero baja el promedio, que es la verdad del gasto");
assert.equal(carousel?.runs, 3, "cuenta el intento en curso y el fallido");
assert.equal(report.operations[0]?.operation, "article-research", "ordena por gasto descendente");

const eleven = report.providers.find((provider) => provider.provider === "elevenlabs");
assert.equal(eleven?.untariffed, 1, "el desglose por proveedor señala dónde falta tarifa");
assert.equal(report.providers.reduce((sum, provider) => sum + provider.total, 0).toFixed(6), "0.090000", "los proveedores suman el total");

assert.equal(report.expensive[0]?.contentItemId, "video-1", "la pieza más cara encabeza la lista");
assert.equal(report.expensive[0]?.title, "Video caro", "resuelve el título de la pieza");
assert.equal(report.expensive[0]?.runs, 3, "suma todas las operaciones de la pieza, incluida la no tarifada");

const empty = await costReport({ month: "2026-01" });
assert.equal(empty.totals.amount, 0, "un mes sin actividad no rompe el informe");
assert.deepEqual(empty.expensive, [], "sin piezas no hay lista de caras");

assert.deepEqual(monthRange("2026-02").from.slice(0, 4), "2026", "acepta el formato YYYY-MM");
assert.throws(() => monthRange("2026-13"), (error: unknown) => error instanceof CostReportError && error.status === 400, "rechaza meses fuera de rango");
assert.throws(() => monthRange("agosto"), /YYYY-MM/, "rechaza formatos libres");
assert.equal(currentMonth(new Date(2026, 7, 18)), "2026-08", "el mes actual usa la fecha local");

process.env.COST_BUDGET_MONTHLY = "-5";
await assert.rejects(() => costReport({ month: "2026-08" }), /positivo/, "un presupuesto inválido se detecta en vez de ignorarse");

await testDb.drop();
console.log("Costos (informe): totales del mes, presupuesto, promedios por operación, proveedores y piezas caras validados.");
