import { randomUUID } from "node:crypto";
import { isoDate, METRIC_PLATFORMS, metricSnapshotSchema, type MetricPlatform, type MetricSnapshot } from "@content-gen/domain/analytics";
import { withDatabase } from "./db.ts";

export class MetricSnapshotError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export type IncomingSnapshot = Omit<MetricSnapshot, "id" | "schemaVersion" | "fetchedAt">;

/**
 * Alta idempotente: la clave natural (plataforma, propiedad, dimensión, valor, fecha) manda.
 * Reprocesar una ventana actualiza las filas existentes en vez de duplicarlas, que es justo
 * lo que hace falta con el retraso de consolidación de Search Console.
 */
export async function saveMetricSnapshots(incoming: IncomingSnapshot[], { fetchedAt = new Date().toISOString() }: { fetchedAt?: string } = {}) {
  const snapshots = incoming.map((row) => {
    const parsed = metricSnapshotSchema.safeParse({ ...row, id: randomUUID(), schemaVersion: 1, fetchedAt });
    if (!parsed.success) throw new MetricSnapshotError(`Métrica inválida para ${row.platform}: ${parsed.error.issues[0]?.message ?? "formato desconocido"}.`, 400);
    return parsed.data;
  });
  if (!snapshots.length) return { inserted: 0, updated: 0 };

  return withDatabase((database) => {
    const exists = database.prepare("SELECT id FROM metric_snapshots WHERE platform = ? AND property_id = ? AND dimension = ? AND dimension_value = ? AND date = ?");
    const upsert = database.prepare(`
      INSERT INTO metric_snapshots (id, schema_version, platform, property_id, dimension, dimension_value, date, data_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (platform, property_id, dimension, dimension_value, date)
      DO UPDATE SET data_json = excluded.data_json, fetched_at = excluded.fetched_at, schema_version = excluded.schema_version
    `);
    let inserted = 0;
    let updated = 0;
    database.exec("BEGIN");
    try {
      for (const snapshot of snapshots) {
        const previous = exists.get(snapshot.platform, snapshot.propertyId, snapshot.dimension, snapshot.dimensionValue, snapshot.date) as { id: string } | undefined;
        upsert.run(previous?.id ?? snapshot.id, snapshot.schemaVersion, snapshot.platform, snapshot.propertyId, snapshot.dimension, snapshot.dimensionValue, snapshot.date, JSON.stringify({ ...snapshot, id: previous?.id ?? snapshot.id }), snapshot.fetchedAt);
        if (previous) updated += 1; else inserted += 1;
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return { inserted, updated };
  });
}

export type MetricQuery = { platform?: MetricPlatform; propertyId?: string; dimension?: string; startDate?: string; endDate?: string; limit?: number };

/** Lectura para la UI y la API. Ordena por fecha descendente y acota el volumen devuelto. */
export async function listMetricSnapshots({ platform, propertyId, dimension = "date", startDate, endDate, limit = 500 }: MetricQuery = {}) {
  if (platform && !METRIC_PLATFORMS.includes(platform)) throw new MetricSnapshotError(`Plataforma desconocida: ${platform}.`, 400);
  for (const date of [startDate, endDate]) if (date && !isoDate.safeParse(date).success) throw new MetricSnapshotError("Las fechas del filtro deben ser YYYY-MM-DD.", 400);

  const clauses = ["dimension = ?"];
  const params: unknown[] = [dimension];
  if (platform) { clauses.push("platform = ?"); params.push(platform); }
  if (propertyId) { clauses.push("property_id = ?"); params.push(propertyId); }
  if (startDate) { clauses.push("date >= ?"); params.push(startDate); }
  if (endDate) { clauses.push("date <= ?"); params.push(endDate); }
  params.push(Math.min(Math.max(Math.trunc(limit), 1), 5000));

  return withDatabase((database) => (database
    .prepare(`SELECT data_json FROM metric_snapshots WHERE ${clauses.join(" AND ")} ORDER BY date DESC, platform ASC, dimension_value ASC LIMIT ?`)
    .all(...params) as { data_json: string }[]).map((row) => JSON.parse(row.data_json) as MetricSnapshot));
}

/**
 * Métrica derivada que se recalcula desde sus componentes en vez de promediarse. El CTR del
 * periodo es el de sus totales: promediar los CTR diarios da un número que no existe.
 */
const RATIOS: Record<string, { numerator: string; denominator: string; scale: number }> = {
  ctr: { numerator: "clicks", denominator: "impressions", scale: 100 },
};

/**
 * Métrica que es una media y hay que ponderar por el volumen de la fila. Sin ponderar, un día
 * de cola con 2 impresiones pesa lo mismo que uno con 10.000 y arruina el resultado.
 */
const WEIGHTED: Record<string, string> = {
  position: "impressions",
  engagementRate: "sessions",
  bounceRate: "sessions",
  averageSessionDuration: "sessions",
};

/**
 * Totales de un conjunto de filas para las tarjetas de la UI. Los volúmenes se suman; las tasas
 * se recalculan y las medias se ponderan. Si falta el peso, se cae a la media simple: es peor
 * que la ponderada, pero mejor que no dar el dato.
 */
export function totalMetrics(snapshots: MetricSnapshot[]) {
  const sums: Record<string, number> = Object.create(null);
  const counts: Record<string, number> = Object.create(null);
  const weighted: Record<string, number> = Object.create(null);
  const weights: Record<string, number> = Object.create(null);

  for (const snapshot of snapshots) {
    for (const [name, value] of Object.entries(snapshot.metrics)) {
      sums[name] = (sums[name] ?? 0) + value;
      counts[name] = (counts[name] ?? 0) + 1;
      const weight = WEIGHTED[name] === undefined ? 0 : snapshot.metrics[WEIGHTED[name]] ?? 0;
      if (weight > 0) {
        weighted[name] = (weighted[name] ?? 0) + value * weight;
        weights[name] = (weights[name] ?? 0) + weight;
      }
    }
  }

  return Object.fromEntries(Object.keys(sums).map((name) => {
    const ratio = RATIOS[name];
    if (ratio && sums[ratio.denominator]) {
      return [name, Number(((sums[ratio.numerator] ?? 0) / sums[ratio.denominator] * ratio.scale).toFixed(2))];
    }
    if (WEIGHTED[name] !== undefined) {
      const average = weights[name] ? weighted[name] / weights[name] : sums[name] / (counts[name] || 1);
      return [name, Number(average.toFixed(2))];
    }
    if (ratio) return [name, Number((sums[name] / (counts[name] || 1)).toFixed(2))];
    return [name, Math.round(sums[name])];
  }));
}

/** Última fecha con datos por plataforma; la UI la usa para avisar si la sincronización se atrasó. */
export async function latestMetricDates() {
  return withDatabase((database) => Object.fromEntries((database
    .prepare("SELECT platform, MAX(date) AS last_date, MAX(fetched_at) AS last_sync FROM metric_snapshots GROUP BY platform")
    .all() as { platform: string; last_date: string; last_sync: string }[]).map((row) => [row.platform, { lastDate: row.last_date, lastSync: row.last_sync }])));
}
