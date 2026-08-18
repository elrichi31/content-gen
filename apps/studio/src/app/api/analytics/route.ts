import type { MetricPlatform } from "@content-gen/domain/analytics";
import { NextResponse } from "next/server";
import { configuredPlatforms } from "@/lib/analytics-sync";
import { latestMetricDates, listMetricSnapshots, MetricSnapshotError, totalMetrics } from "@/lib/metric-snapshots";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const snapshots = await listMetricSnapshots({
      platform: (params.get("platform") as MetricPlatform | null) ?? undefined,
      dimension: params.get("dimension") ?? "date",
      startDate: params.get("startDate") ?? undefined,
      endDate: params.get("endDate") ?? undefined,
      limit: Number(params.get("limit") ?? 500),
    });
    return NextResponse.json({ snapshots, totals: totalMetrics(snapshots), freshness: await latestMetricDates(), configured: configuredPlatforms() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron leer las métricas.", snapshots: [] }, { status: error instanceof MetricSnapshotError ? error.status : 500 });
  }
}
