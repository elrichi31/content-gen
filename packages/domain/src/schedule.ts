import { z } from "zod";
import { isoDate } from "./analytics.ts";

/**
 * Cronograma de publicación. El MVP no publica por API (ADR-007): aquí solo se planifica
 * qué se publica, dónde y qué día, y se marca a mano lo ya publicado.
 *
 * Todas las fechas son civiles (YYYY-MM-DD) y las horas locales (HH:MM). No se convierte
 * a UTC en ningún punto: un hueco de las 19:00 significa las 19:00 de quien publica,
 * y así el calendario no se descuadra con los cambios de horario.
 */

export const PUBLISH_PLATFORMS = ["instagram", "tiktok", "youtube", "linkedin", "blog"] as const;
export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number];

/** Estados de una publicación planificada. `omitida` conserva el hueco sin contarlo como pendiente. */
export const POST_STATUSES = ["planificada", "lista", "publicada", "omitida"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Día de la semana según `Date.getUTCDay`: 0 domingo … 6 sábado. */
export const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora debe ser HH:MM en formato 24 h");
const weekday = z.number().int().min(0).max(6);
const id = z.string().min(1);
const timestamp = z.string().datetime();
const schemaVersion = z.literal(1);

/** Pauta de cadencia: "en Instagram publico lunes, miércoles y viernes a las 19:00". */
export const publishingRuleSchema = z.object({
  id,
  schemaVersion,
  name: z.string().trim().min(1).max(120),
  platform: z.enum(PUBLISH_PLATFORMS),
  /** Sin días no hay huecos que generar, así que la lista no puede estar vacía. */
  weekdays: z.array(weekday).min(1).max(7).transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  times: z.array(clockTime).min(1).max(6).transform((times) => [...new Set(times)].sort()),
  campaignId: id.nullable().default(null),
  active: z.boolean().default(true),
  startDate: isoDate,
  /** Sin fin la pauta se repite indefinidamente. */
  endDate: isoDate.nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type PublishingRule = z.infer<typeof publishingRuleSchema>;

/** Pieza asignada a un día y una hora concretos. */
export const scheduledPostSchema = z.object({
  id,
  schemaVersion,
  platform: z.enum(PUBLISH_PLATFORMS),
  date: isoDate,
  time: clockTime,
  /** Nulo mientras el hueco está reservado pero aún no se sabe qué pieza va. */
  contentItemId: id.nullable().default(null),
  campaignId: id.nullable().default(null),
  /** Pauta que originó el hueco; nulo si se creó suelto sobre el calendario. */
  ruleId: id.nullable().default(null),
  title: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(2000).default(""),
  status: z.enum(POST_STATUSES).default("planificada"),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ScheduledPost = z.infer<typeof scheduledPostSchema>;

export type Slot = {
  date: string;
  time: string;
  platform: PublishPlatform;
  ruleId: string | null;
  ruleName: string;
  post: ScheduledPost | null;
};

export type CalendarDay = { date: string; weekday: number; slots: Slot[] };

/** Un hueco queda identificado por plataforma, día y hora: dos piezas no comparten sitio. */
export function slotKey(slot: { platform: string; date: string; time: string }) {
  return `${slot.platform}|${slot.date}|${slot.time}`;
}

/** Fechas civiles a mediodía UTC: así ningún desfase horario mueve el día. */
function toUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 12);
}

function toIso(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return toIso(toUtc(date) + days * 86_400_000);
}

export function weekdayOf(date: string) {
  return new Date(toUtc(date)).getUTCDay();
}

/**
 * Hoy en la zona horaria del equipo. `toISOString()` devuelve la fecha UTC, que a partir de
 * media tarde en América ya es la de mañana: con eso una pauta creada por la noche se saltaba
 * el día en curso. Todo el cronograma trabaja en fechas civiles, así que aquí también.
 */
export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Mes civil en curso, con el mismo cuidado que `todayLocal`. */
export function currentMonth(now = new Date()) {
  return todayLocal(now).slice(0, 7);
}

/** Rango inclusivo de fechas. Se acota para que un rango absurdo no genere millones de días. */
export function eachDate(startDate: string, endDate: string) {
  if (endDate < startDate) return [];
  const dates: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > 460) throw new Error("El rango del cronograma no puede superar 460 días.");
  }
  return dates;
}

export const monthPattern = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El mes debe ser YYYY-MM");

/** Primer y último día del mes indicado. */
export function monthRange(month: string) {
  const [year, monthNumber] = monthPattern.parse(month).split("-").map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  return { startDate, endDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * Rejilla del mes en semanas completas empezando en lunes, con los días de relleno del mes
 * anterior y el siguiente. La cuadrícula la necesita la UI y el cálculo de fechas es
 * justo lo que conviene tener probado.
 */
export function monthGrid(month: string) {
  const { startDate, endDate } = monthRange(month);
  const leading = (weekdayOf(startDate) + 6) % 7;
  const trailing = (7 - ((weekdayOf(endDate) + 6) % 7) - 1) % 7;
  const dates = eachDate(addDays(startDate, -leading), addDays(endDate, trailing));
  const weeks: string[][] = [];
  for (let index = 0; index < dates.length; index += 7) weeks.push(dates.slice(index, index + 7));
  return weeks;
}

function ruleCoversDate(rule: PublishingRule, date: string) {
  if (!rule.active || date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  return rule.weekdays.includes(weekdayOf(date));
}

/** Huecos que las pautas generan en el rango, sin mirar todavía qué hay asignado. */
export function generateSlots({ rules, startDate, endDate }: { rules: PublishingRule[]; startDate: string; endDate: string }) {
  const slots = new Map<string, Omit<Slot, "post">>();
  for (const date of eachDate(startDate, endDate)) {
    for (const rule of rules) {
      if (!ruleCoversDate(rule, date)) continue;
      for (const time of rule.times) {
        // Si dos pautas coinciden en plataforma, día y hora es el mismo hueco, no dos.
        const key = slotKey({ platform: rule.platform, date, time });
        if (!slots.has(key)) slots.set(key, { date, time, platform: rule.platform, ruleId: rule.id, ruleName: rule.name });
      }
    }
  }
  return [...slots.values()].sort(compareSlots);
}

function compareSlots(a: { date: string; time: string; platform: string }, b: { date: string; time: string; platform: string }) {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.platform.localeCompare(b.platform);
}

/**
 * Calendario final: huecos de las pautas con su pieza asignada, más las publicaciones
 * que no caen en ningún hueco (fecha movida a mano o pauta cambiada después). Perder una
 * publicación planificada porque su pauta ya no la genera sería el peor fallo posible aquí.
 */
export function buildCalendar({ rules, posts, startDate, endDate }: { rules: PublishingRule[]; posts: ScheduledPost[]; startDate: string; endDate: string }): CalendarDay[] {
  const byKey = new Map(posts.map((post) => [slotKey(post), post]));
  const slots: Slot[] = generateSlots({ rules, startDate, endDate }).map((slot) => ({ ...slot, post: byKey.get(slotKey(slot)) ?? null }));
  const covered = new Set(slots.map(slotKey));
  for (const post of posts) {
    if (covered.has(slotKey(post)) || post.date < startDate || post.date > endDate) continue;
    slots.push({ date: post.date, time: post.time, platform: post.platform, ruleId: null, ruleName: "", post });
  }
  slots.sort(compareSlots);

  const days = new Map<string, CalendarDay>(eachDate(startDate, endDate).map((date) => [date, { date, weekday: weekdayOf(date), slots: [] }]));
  for (const slot of slots) days.get(slot.date)?.slots.push(slot);
  return [...days.values()];
}

/** Resumen para la cabecera: cuántos huecos hay, cuántos sin pieza y cuántos ya publicados. */
export function summarizeCalendar(days: CalendarDay[]) {
  const slots = days.flatMap((day) => day.slots);
  return {
    slots: slots.length,
    empty: slots.filter((slot) => !slot.post).length,
    unassigned: slots.filter((slot) => slot.post && !slot.post.contentItemId).length,
    ready: slots.filter((slot) => slot.post?.status === "lista").length,
    published: slots.filter((slot) => slot.post?.status === "publicada").length,
  };
}
