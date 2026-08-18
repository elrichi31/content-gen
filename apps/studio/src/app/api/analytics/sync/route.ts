import { NextResponse } from "next/server";
import { parseSyncDays, syncAnalytics } from "@/lib/analytics-sync";
import { GoogleAuthError } from "@/lib/google-auth";

/** Dispara la ingesta bajo demanda. El cron usa `npm run analytics:sync`, que llama al mismo código. */
export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { days?: unknown } | null;
  try {
    const days = input?.days === undefined ? parseSyncDays() : parseSyncDays(String(input.days));
    const summary = await syncAnalytics({ days });
    // 207 cuando una plataforma falló pero otra sí trajo datos: la UI lo muestra como aviso, no como error.
    return NextResponse.json(summary, { status: summary.failed.length && summary.failed.length < summary.results.length ? 207 : summary.failed.length ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo sincronizar." }, { status: error instanceof GoogleAuthError ? error.status : 500 });
  }
}
