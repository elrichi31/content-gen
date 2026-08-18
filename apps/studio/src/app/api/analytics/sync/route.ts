import { NextResponse } from "next/server";
import { parseSyncDays, syncAnalytics } from "@/lib/analytics-sync";
import { GoogleAuthError } from "@/lib/google-auth";

/** Dispara la ingesta bajo demanda. El cron usa `npm run analytics:sync`, que llama al mismo código. */
export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { days?: unknown } | null;
  try {
    const days = input?.days === undefined ? parseSyncDays() : parseSyncDays(String(input.days));
    const summary = await syncAnalytics({ days });
    // 207 solo si algo falló y algo salió bien de verdad. Contar los «skipped» como éxito daba
    // un 207 optimista cuando la única plataforma configurada era justo la que había fallado.
    const succeeded = summary.results.filter((result) => result.status === "ok").length;
    return NextResponse.json(summary, { status: !summary.failed.length ? 200 : succeeded ? 207 : 502 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo sincronizar." }, { status: error instanceof GoogleAuthError ? error.status : 500 });
  }
}
