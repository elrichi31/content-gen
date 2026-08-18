import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = await mkdtemp(join(tmpdir(), "content-gen-metrics-")); process.env.DATABASE_URL = `file:${join(root, "metrics.sqlite")}`;
const database = new DatabaseSync(join(root, "metrics.sqlite"));
database.exec("CREATE TABLE metric_snapshots (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, platform TEXT NOT NULL, property_id TEXT NOT NULL, dimension TEXT NOT NULL, dimension_value TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, data_json TEXT NOT NULL, fetched_at TEXT NOT NULL, UNIQUE (platform, property_id, dimension, dimension_value, date));");
database.close();

const { latestMetricDates, listMetricSnapshots, saveMetricSnapshots, totalMetrics } = await import("./metric-snapshots.ts");
const gsc = (date: string, metrics: Record<string, number>) => ({ platform: "search-console" as const, propertyId: "sc-domain:ejemplo.com", dimension: "date", dimensionValue: "", date, metrics });

const first = await saveMetricSnapshots([gsc("2026-07-01", { clicks: 10, impressions: 400, ctr: 2.5, position: 12 }), gsc("2026-07-02", { clicks: 8, impressions: 300, ctr: 2.6, position: 11 })], { fetchedAt: "2026-07-03T00:00:00.000Z" });
assert.deepEqual(first, { inserted: 2, updated: 0 }, "inserta filas nuevas");

// Search Console reescribe días recientes al consolidar: el reproceso debe actualizar, no duplicar.
const second = await saveMetricSnapshots([gsc("2026-07-02", { clicks: 9, impressions: 320, ctr: 2.8, position: 10 })], { fetchedAt: "2026-07-05T00:00:00.000Z" });
assert.deepEqual(second, { inserted: 0, updated: 1 }, "reprocesar la ventana actualiza en vez de duplicar");
const stored = await listMetricSnapshots({ platform: "search-console" });
assert.equal(stored.length, 2, "no crecen las filas al reprocesar");
assert.equal(stored[0].date, "2026-07-02", "ordena por fecha descendente");
assert.equal(stored[0].metrics.clicks, 9, "conserva el valor consolidado más reciente");
assert.equal(stored[0].fetchedAt, "2026-07-05T00:00:00.000Z", "actualiza la marca de sincronización");
assert.equal(stored[0].id, (await listMetricSnapshots({ platform: "search-console" }))[0].id, "el id es estable entre reprocesos");

await saveMetricSnapshots([{ platform: "search-console", propertyId: "sc-domain:ejemplo.com", dimension: "query", dimensionValue: "generador de carruseles", date: "2026-07-02", metrics: { clicks: 4 } }], { fetchedAt: "2026-07-04T00:00:00.000Z" });
assert.equal((await listMetricSnapshots({ dimension: "date" })).length, 2, "los desgloses no contaminan el total diario");
assert.equal((await listMetricSnapshots({ dimension: "query" }))[0].dimensionValue, "generador de carruseles", "filtra por dimensión");
assert.equal((await listMetricSnapshots({ startDate: "2026-07-02" })).length, 1, "acota por fecha inicial");
assert.equal((await listMetricSnapshots({ endDate: "2026-07-01" })).length, 1, "acota por fecha final");
assert.equal((await listMetricSnapshots({ limit: 1 })).length, 1, "respeta el límite");

await assert.rejects(() => listMetricSnapshots({ startDate: "02-07-2026" }), /YYYY-MM-DD/, "valida el formato de fecha del filtro");
await assert.rejects(() => listMetricSnapshots({ platform: "instagram" as never }), /Plataforma desconocida/, "rechaza plataformas aún no soportadas");
await assert.rejects(() => saveMetricSnapshots([gsc("julio", { clicks: 1 })]), /Métrica inválida/, "valida antes de escribir");
assert.equal((await listMetricSnapshots({})).length, 2, "una tanda inválida no deja escrituras a medias");
assert.deepEqual(await saveMetricSnapshots([]), { inserted: 0, updated: 0 }, "una tanda vacía no toca la base");

assert.deepEqual(totalMetrics(stored), { clicks: 19, impressions: 720, ctr: 2.65, position: 11 }, "suma volúmenes y promedia tasas y posición");
assert.deepEqual(totalMetrics([]), {}, "sin datos no inventa totales");
assert.deepEqual(await latestMetricDates(), { "search-console": { lastDate: "2026-07-02", lastSync: "2026-07-05T00:00:00.000Z" } }, "reporta el último día y la última sincronización");

await rm(root, { recursive: true, force: true });
console.log("MetricSnapshots: idempotencia, filtros, totales y frescura validados.");
