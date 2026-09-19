import assert from "node:assert/strict";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";

const testDb = await createTestDatabase(); process.env.DATABASE_URL = testDb.url;

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

// clicks/impressions = 19/720 = 2.64 %; posición ponderada = (12*400 + 10*320) / 720 = 11.11.
assert.deepEqual(totalMetrics(stored), { clicks: 19, impressions: 720, ctr: 2.64, position: 11.11 }, "suma volúmenes, recalcula el CTR y pondera la posición");
assert.deepEqual(totalMetrics([]), {}, "sin datos no inventa totales");

// Un día de cola no puede pesar lo mismo que uno de tráfico real: sin ponderar daban 47.5 y 0.5.
const desigual = [gsc("2026-08-01", { clicks: 100, impressions: 10_000, ctr: 1, position: 5 }), gsc("2026-08-02", { clicks: 0, impressions: 2, ctr: 0, position: 90 })]
  .map((row) => ({ ...row, id: row.date, schemaVersion: 1 as const, fetchedAt: "2026-08-03T00:00:00.000Z" }));
assert.deepEqual(totalMetrics(desigual), { clicks: 100, impressions: 10_002, ctr: 1, position: 5.02 }, "una cola de 2 impresiones no arrastra la media del mes");

// GA4 no trae impresiones: engagementRate se pondera por sesiones y las tasas sin peso caen a la media simple.
const ga4 = [{ sessions: 900, engagementRate: 0.8 }, { sessions: 100, engagementRate: 0.3 }]
  .map((metrics, index) => ({ platform: "google-analytics" as const, propertyId: "123456", dimension: "date", dimensionValue: "", date: `2026-08-0${index + 1}`, metrics, id: `ga${index}`, schemaVersion: 1 as const, fetchedAt: "2026-08-03T00:00:00.000Z" }));
assert.deepEqual(totalMetrics(ga4), { sessions: 1000, engagementRate: 0.75 }, "pondera la tasa de interacción por sesiones");
assert.deepEqual(totalMetrics([{ ...ga4[0], metrics: { position: 4 } }]), { position: 4 }, "sin métrica de peso usa la media simple en vez de descartar el dato");
assert.deepEqual(await latestMetricDates(), { "search-console": { lastDate: "2026-07-02", lastSync: "2026-07-05T00:00:00.000Z" } }, "reporta el último día y la última sincronización");

// Los seguidores son un contador acumulado: el «total» del periodo es el último valor, no la suma de días.
const tiktok = (date: string, followerCount: number) => ({ platform: "tiktok" as const, propertyId: "abc-123", dimension: "date", dimensionValue: "", date, metrics: { followerCount } });
await saveMetricSnapshots([tiktok("2026-07-01", 100), tiktok("2026-07-03", 130), tiktok("2026-07-02", 120)]);
assert.equal(totalMetrics(await listMetricSnapshots({ platform: "tiktok" })).followerCount, 130, "los contadores usan el valor más reciente y no se suman");

await testDb.drop();
console.log("MetricSnapshots: idempotencia, filtros, totales y frescura validados.");
