import { formatIsoDate, syncWindow } from "@content-gen/domain/analytics";
import { GA4_LAG_DAYS, runGa4Report, type Ga4Dimension } from "./google-analytics.ts";
import { GoogleAuthError } from "./google-auth.ts";
import { saveMetricSnapshots, type IncomingSnapshot } from "./metric-snapshots.ts";
import { querySearchConsole, SEARCH_CONSOLE_LAG_DAYS, type SearchConsoleDimension } from "./search-console.ts";
import { fetchTikTokStats, TikTokError } from "./tiktok.ts";

export const DEFAULT_SYNC_DAYS = 28;
const SEARCH_CONSOLE_SYNC_DIMENSIONS: SearchConsoleDimension[] = ["date", "query", "page", "country", "device"];
const GA4_SYNC_DIMENSIONS: Ga4Dimension[] = ["date", "page", "channel", "country", "device"];

export function parseSyncDays(raw = process.env.ANALYTICS_SYNC_DAYS) {
  if (!raw?.trim()) return DEFAULT_SYNC_DAYS;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 460) throw new GoogleAuthError("ANALYTICS_SYNC_DAYS debe ser un entero entre 1 y 460.", 400);
  return days;
}

/** Una plataforma solo se sincroniza si tiene su propiedad configurada; el resto sigue igual. */
export function configuredPlatforms() {
  return {
    "search-console": Boolean(process.env.SEARCH_CONSOLE_SITE_URL?.trim()),
    "google-analytics": Boolean(process.env.GA4_PROPERTY_ID?.trim()),
    tiktok: Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim()),
  };
}

export type PlatformSyncResult = { platform: string; status: "ok" | "skipped" | "failed"; startDate?: string; endDate?: string; inserted: number; updated: number; dimensions: string[]; error?: string };

async function syncPlatform(platform: string, days: number, today: Date, fetchRows: (window: { startDate: string; endDate: string }, dimension: string) => Promise<IncomingSnapshot[]>, dimensions: string[], lagDays: number): Promise<PlatformSyncResult> {
  const window = syncWindow({ days, lagDays, today });
  const totals = { inserted: 0, updated: 0 };
  const done: string[] = [];
  try {
    // Secuencial a propósito: las cuotas de Google se miden por minuto y no hay prisa en un cron.
    for (const dimension of dimensions) {
      const saved = await saveMetricSnapshots(await fetchRows(window, dimension));
      totals.inserted += saved.inserted;
      totals.updated += saved.updated;
      done.push(dimension);
    }
    return { platform, status: "ok", ...window, ...totals, dimensions: done };
  } catch (error) {
    // Se conserva lo ya guardado: una dimensión que falla no invalida las anteriores.
    return { platform, status: "failed", ...window, ...totals, dimensions: done, error: error instanceof Error ? error.message : "Error desconocido al sincronizar." };
  }
}

/** TikTok no tiene ventana ni desgloses: una lectura de los contadores de hoy. */
async function syncTikTok(today: Date, request: typeof fetch): Promise<PlatformSyncResult> {
  const date = formatIsoDate(today);
  try {
    const saved = await saveMetricSnapshots(await fetchTikTokStats({ today, request }));
    return { platform: "tiktok", status: "ok", startDate: date, endDate: date, ...saved, dimensions: ["date"] };
  } catch (error) {
    // Credenciales puestas pero cuenta sin conectar todavía: no es un fallo, es un paso pendiente.
    const pending = error instanceof TikTokError && error.status === 409;
    return { platform: "tiktok", status: pending ? "skipped" : "failed", inserted: 0, updated: 0, dimensions: [], error: error instanceof Error ? error.message : "Error desconocido al sincronizar." };
  }
}

/**
 * Sincroniza las plataformas configuradas y devuelve un resumen por plataforma. Nunca lanza
 * por un fallo de proveedor: el llamador decide si un fallo parcial es aceptable.
 */
export async function syncAnalytics({ days = parseSyncDays(), today = new Date(), request = fetch }: { days?: number; today?: Date; request?: typeof fetch } = {}) {
  const configured = configuredPlatforms();
  const results: PlatformSyncResult[] = [];

  results.push(configured["search-console"]
    ? await syncPlatform("search-console", days, today, (window, dimension) => querySearchConsole({ ...window, dimension: dimension as SearchConsoleDimension, request }), SEARCH_CONSOLE_SYNC_DIMENSIONS, SEARCH_CONSOLE_LAG_DAYS)
    : { platform: "search-console", status: "skipped", inserted: 0, updated: 0, dimensions: [], error: "SEARCH_CONSOLE_SITE_URL no está configurada." });

  results.push(configured["google-analytics"]
    ? await syncPlatform("google-analytics", days, today, (window, dimension) => runGa4Report({ ...window, dimension: dimension as Ga4Dimension, request }), GA4_SYNC_DIMENSIONS, GA4_LAG_DAYS)
    : { platform: "google-analytics", status: "skipped", inserted: 0, updated: 0, dimensions: [], error: "GA4_PROPERTY_ID no está configurada." });

  results.push(configured.tiktok
    ? await syncTikTok(today, request)
    : { platform: "tiktok", status: "skipped", inserted: 0, updated: 0, dimensions: [], error: "TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET no están configuradas." });

  return {
    days,
    syncedAt: new Date().toISOString(),
    results,
    inserted: results.reduce((total, result) => total + result.inserted, 0),
    updated: results.reduce((total, result) => total + result.updated, 0),
    failed: results.filter((result) => result.status === "failed").map((result) => result.platform),
  };
}
