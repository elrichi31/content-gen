import { z } from "zod";

/**
 * Modelo único para métricas externas: cada fila es un valor diario de una plataforma
 * para una dimensión concreta. Instagram y TikTok entran aquí sin tocar el esquema.
 */
export const METRIC_PLATFORMS = ["search-console", "google-analytics"] as const;
export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];

/** Dimensión "total" para la fila agregada del día (sin desglose). */
export const TOTAL_DIMENSION = "date";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe ser YYYY-MM-DD");

export const metricSnapshotSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  platform: z.enum(METRIC_PLATFORMS),
  /** Propiedad de origen: siteUrl de Search Console o propertyId de GA4. */
  propertyId: z.string().min(1).max(300),
  /** Desglose de la fila: "date" (total diario), "query", "page", "country", "device"... */
  dimension: z.string().min(1).max(60),
  /** Valor del desglose; cadena vacía cuando la dimensión es el total diario. */
  dimensionValue: z.string().max(2000).default(""),
  date: isoDate,
  metrics: z.record(z.string(), z.number().finite()),
  fetchedAt: z.string().datetime(),
});
export type MetricSnapshot = z.infer<typeof metricSnapshotSchema>;

/** Las queries de Search Console admiten cualquier carácter imprimible, así que el separador va fuera de ese rango. */
const KEY_SEPARATOR = String.fromCharCode(0);

/** Clave natural de deduplicación: reprocesar un rango sobrescribe en vez de duplicar. */
export function snapshotKey(snapshot: Pick<MetricSnapshot, "platform" | "propertyId" | "dimension" | "dimensionValue" | "date">) {
  return [snapshot.platform, snapshot.propertyId, snapshot.dimension, snapshot.dimensionValue, snapshot.date].join(KEY_SEPARATOR);
}

/** GA4 devuelve la dimensión `date` como YYYYMMDD; el resto de la app trabaja en ISO. */
export function normalizeApiDate(value: string) {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : value.trim();
}

export function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Ventana de sincronización. Search Console consolida con ~3 días de retraso y GA4 con ~1,
 * así que el borde final se retrasa por plataforma y el solapamiento se corrige al reprocesar.
 */
export function syncWindow({ days, lagDays = 0, today = new Date() }: { days: number; lagDays?: number; today?: Date }) {
  if (!Number.isInteger(days) || days < 1 || days > 460) throw new Error("La ventana de sincronización debe ser un entero entre 1 y 460 días.");
  const end = new Date(today.getTime() - lagDays * 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
}
