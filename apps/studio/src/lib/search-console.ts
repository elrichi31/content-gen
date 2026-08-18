import { isoDate, normalizeApiDate, type MetricSnapshot } from "@content-gen/domain/analytics";
import { getGoogleAccessToken, googleApiError, GoogleAuthError, SEARCH_CONSOLE_SCOPE } from "./google-auth.ts";

/** Desgloses soportados. `date` es el total diario; el resto se consulta junto a la fecha. */
export const SEARCH_CONSOLE_DIMENSIONS = ["date", "query", "page", "country", "device"] as const;
export type SearchConsoleDimension = (typeof SEARCH_CONSOLE_DIMENSIONS)[number];

/** Search Console consolida con ~3 días de retraso: pedir más reciente devuelve huecos. */
export const SEARCH_CONSOLE_LAG_DAYS = 3;
const MAX_ROWS = 25_000;

export function readSearchConsoleSite() {
  const site = process.env.SEARCH_CONSOLE_SITE_URL?.trim();
  if (!site) throw new GoogleAuthError("Falta configurar SEARCH_CONSOLE_SITE_URL.", 503);
  // Los dos formatos que acepta la API: propiedad de dominio o prefijo de URL.
  if (!/^sc-domain:[a-z0-9.-]+$/i.test(site) && !/^https?:\/\/[^\s"']+\/$/i.test(site)) throw new GoogleAuthError("SEARCH_CONSOLE_SITE_URL debe ser 'sc-domain:ejemplo.com' o una URL terminada en '/'.", 503);
  return site;
}

type QueryOptions = { siteUrl?: string; startDate: string; endDate: string; dimension?: SearchConsoleDimension; rowLimit?: number; request?: typeof fetch };

/**
 * Devuelve filas diarias normalizadas al modelo de snapshots. Para desgloses distintos de
 * `date` se pide `[date, dimension]` para conservar granularidad diaria y poder reprocesar.
 */
export async function querySearchConsole({ siteUrl = readSearchConsoleSite(), startDate, endDate, dimension = "date", rowLimit = 5000, request = fetch }: QueryOptions) {
  isoDate.parse(startDate); isoDate.parse(endDate);
  if (startDate > endDate) throw new GoogleAuthError("El rango de fechas de Search Console está invertido.", 400);
  if (!SEARCH_CONSOLE_DIMENSIONS.includes(dimension)) throw new GoogleAuthError(`Dimensión no soportada en Search Console: ${dimension}.`, 400);

  const dimensions = dimension === "date" ? ["date"] : ["date", dimension];
  const token = await getGoogleAccessToken(SEARCH_CONSOLE_SCOPE, { request });
  const response = await request(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: Math.min(Math.max(rowLimit, 1), MAX_ROWS), dataState: "final", type: "web" }),
  });
  if (!response.ok) throw googleApiError(response.status, "Search Console");
  const body = await response.json().catch(() => null) as { rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[] } | null;

  return (body?.rows ?? []).flatMap((row) => {
    const date = normalizeApiDate(row.keys?.[0] ?? "");
    if (!isoDate.safeParse(date).success) return [];
    return [{
      platform: "search-console" as const,
      propertyId: siteUrl,
      dimension,
      dimensionValue: dimension === "date" ? "" : (row.keys?.[1] ?? "").slice(0, 2000),
      date,
      metrics: {
        clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        // La API entrega ctr como fracción; se guarda en porcentaje para que la UI no lo reinterprete.
        ctr: Number((((row.ctr ?? 0) * 100)).toFixed(4)),
        position: Number((row.position ?? 0).toFixed(2)),
      },
    } satisfies Omit<MetricSnapshot, "id" | "schemaVersion" | "fetchedAt">];
  });
}
