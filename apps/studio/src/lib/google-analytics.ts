import { isoDate, normalizeApiDate, type MetricSnapshot } from "@content-gen/domain/analytics";
import { ANALYTICS_SCOPE, getGoogleAccessToken, googleApiError, GoogleAuthError } from "./google-auth.ts";

/** Desgloses soportados, con el nombre de dimensión que espera la Data API. */
export const GA4_DIMENSIONS = {
  date: null,
  page: "pagePath",
  channel: "sessionDefaultChannelGroup",
  country: "country",
  device: "deviceCategory",
} as const;
export type Ga4Dimension = keyof typeof GA4_DIMENSIONS;

/** Métricas estables en cualquier propiedad GA4; `keyEvents` sustituyó a `conversions`. */
export const GA4_METRICS = ["sessions", "totalUsers", "newUsers", "screenPageViews", "engagementRate", "keyEvents"] as const;

/** GA4 consolida a las pocas horas, pero el día en curso sigue moviéndose. */
export const GA4_LAG_DAYS = 1;

export function readGa4PropertyId() {
  const property = process.env.GA4_PROPERTY_ID?.trim().replace(/^properties\//, "");
  if (!property) throw new GoogleAuthError("Falta configurar GA4_PROPERTY_ID.", 503);
  if (!/^\d{6,20}$/.test(property)) throw new GoogleAuthError("GA4_PROPERTY_ID debe ser el identificador numérico de la propiedad.", 503);
  return property;
}

/** `pageSize` solo se baja en las pruebas: en producción manda el máximo de la API. */
type ReportOptions = { propertyId?: string; startDate: string; endDate: string; dimension?: Ga4Dimension; maxRows?: number; pageSize?: number; metrics?: readonly string[]; request?: typeof fetch };

type Ga4Row = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };

/** Máximo de filas que la Data API entrega por petición. */
const PAGE_SIZE = 100_000;
/** Tope por informe, para que un desglose enorme no se coma la memoria del proceso. */
const MAX_ROWS = 200_000;

/**
 * Ejecuta runReport y normaliza al modelo de snapshots. Siempre incluye la dimensión `date`
 * para mantener granularidad diaria; los desgloses se piden como segunda dimensión.
 *
 * Se pagina con `offset` hasta agotar el `rowCount` que declara la respuesta: sin eso, un
 * informe más largo que el límite se guardaría recortado sin que nada lo indicara.
 */
export async function runGa4Report({ propertyId = readGa4PropertyId(), startDate, endDate, dimension = "date", maxRows = MAX_ROWS, pageSize = PAGE_SIZE, metrics = GA4_METRICS, request = fetch }: ReportOptions) {
  isoDate.parse(startDate); isoDate.parse(endDate);
  if (startDate > endDate) throw new GoogleAuthError("El rango de fechas de GA4 está invertido.", 400);
  // `hasOwn` y no `!== undefined`: una clave heredada de Object.prototype pasaría el filtro.
  if (!Object.hasOwn(GA4_DIMENSIONS, dimension)) throw new GoogleAuthError(`Dimensión no soportada en GA4: ${dimension}.`, 400);
  const breakdown = GA4_DIMENSIONS[dimension];

  const token = await getGoogleAccessToken(ANALYTICS_SCOPE, { request });
  const limit = Math.min(Math.max(Math.trunc(maxRows), 1), MAX_ROWS);
  const rows: Ga4Row[] = [];
  let headers: string[] = [];

  while (rows.length < limit) {
    const rowLimit = Math.min(Math.max(Math.trunc(pageSize), 1), PAGE_SIZE, limit - rows.length);
    const response = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }, ...(breakdown ? [{ name: breakdown }] : [])],
        metrics: metrics.map((name) => ({ name })),
        limit: rowLimit,
        offset: rows.length,
        keepEmptyRows: false,
      }),
    });
    if (!response.ok) throw googleApiError(response.status, "GA4");
    const body = await response.json().catch(() => null) as { rows?: Ga4Row[]; metricHeaders?: { name?: string }[]; rowCount?: number } | null;
    if (!headers.length) headers = (body?.metricHeaders ?? []).map((header) => header.name ?? "");
    const page = body?.rows ?? [];
    rows.push(...page);
    if (!page.length || rows.length >= (body?.rowCount ?? rows.length)) break;
  }

  return rows.flatMap((row) => {
    const date = normalizeApiDate(row.dimensionValues?.[0]?.value ?? "");
    if (!isoDate.safeParse(date).success) return [];
    const values = Object.fromEntries((row.metricValues ?? []).flatMap((metric, index) => {
      const name = headers[index] ?? metrics[index];
      const value = Number(metric.value);
      // GA4 devuelve todo como string; una métrica no numérica se descarta en vez de romper la fila.
      return name && Number.isFinite(value) ? [[name, Number(value.toFixed(4))]] : [];
    }));
    return [{
      platform: "google-analytics" as const,
      propertyId,
      dimension,
      dimensionValue: dimension === "date" ? "" : (row.dimensionValues?.[1]?.value ?? "").slice(0, 2000),
      date,
      metrics: values,
    } satisfies Omit<MetricSnapshot, "id" | "schemaVersion" | "fetchedAt">];
  });
}
