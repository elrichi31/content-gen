import { syncWindow, TOTAL_DIMENSION, type MetricPlatform } from "@content-gen/domain/analytics";
import { NextResponse } from "next/server";
import { configuredPlatforms } from "@/lib/analytics-sync";
import { latestMetricDates, listMetricSnapshots, MetricSnapshotError, totalMetrics } from "@/lib/metric-snapshots";

/** Periodo por defecto de las tarjetas, alineado con la ventana de sincronización. */
const DEFAULT_DAYS = 28;
/** Periodo máximo consultable, el mismo que admite la ventana de sincronización. */
const MAX_DAYS = 460;
/** Filas diarias del periodo: como mucho un día por plataforma, así que no hay riesgo de recorte. */
const DAILY_ROWS = MAX_DAYS * 2;
/** Filas del desglose que se envían a la tabla. */
const DEFAULT_LIMIT = 200;

function periodDays(raw: string | null) {
  const days = Number(raw ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new MetricSnapshotError(`El periodo debe ser un entero entre 1 y ${MAX_DAYS} días.`, 400);
  return days;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const platform = (params.get("platform") as MetricPlatform | null) ?? undefined;
    const dimension = params.get("dimension") ?? TOTAL_DIMENSION;
    const days = periodDays(params.get("days"));
    // El periodo lo fija la petición: unos totales sobre "las últimas N filas" no significan nada.
    const period = syncWindow({ days });

    const limit = Number(params.get("limit") ?? DEFAULT_LIMIT);
    const snapshots = await listMetricSnapshots({ platform, dimension, ...period, limit });
    // Los totales salen siempre del total diario: son los del periodo, no los del desglose que se esté mirando.
    const daily = await listMetricSnapshots({ platform, dimension: TOTAL_DIMENSION, ...period, limit: DAILY_ROWS });

    return NextResponse.json({
      snapshots,
      totals: totalMetrics(daily),
      period: { ...period, days },
      // Avisa a la UI de que la tabla del desglose está recortada y no lo enseñe como si fuera todo.
      truncated: snapshots.length >= limit,
      freshness: await latestMetricDates(),
      configured: configuredPlatforms(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron leer las métricas.", snapshots: [] }, { status: error instanceof MetricSnapshotError ? error.status : 500 });
  }
}
