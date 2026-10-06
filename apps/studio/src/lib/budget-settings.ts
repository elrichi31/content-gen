import { z } from "zod";
import { withDatabase } from "./db.ts";

export class BudgetError extends Error { readonly status = 400; }
const limit = z.number().finite().positive().max(1_000_000).nullable();
export const budgetSettingsSchema = z.object({
  timezone: z.string().max(100).refine((zone) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }),
  limits: z.object({ day: limit, week: limit, month: limit }),
  blockAutomations: z.boolean(),
});
export type BudgetSettings = z.infer<typeof budgetSettingsSchema>;
export type BudgetPeriod = "day" | "week" | "month";

export async function getBudgetSettings(): Promise<BudgetSettings> {
  const row = await withDatabase((db) => db.prepare("SELECT data_json FROM studio_settings WHERE key = 'budget'").get()) as { data_json: string } | undefined;
  if (row) return budgetSettingsSchema.parse(JSON.parse(row.data_json));
  const raw = process.env.COST_BUDGET_MONTHLY?.trim();
  const monthly = raw ? Number(raw) : null;
  if (monthly !== null && (!Number.isFinite(monthly) || monthly <= 0)) throw new Error("COST_BUDGET_MONTHLY debe ser un número positivo.");
  return { timezone: "UTC", limits: { day: null, week: null, month: monthly }, blockAutomations: true };
}
export async function saveBudgetSettings(input: unknown) {
  const parsed = budgetSettingsSchema.safeParse(input);
  if (!parsed.success) throw new BudgetError("Presupuesto inválido: revisa importes positivos y zona horaria.");
  await withDatabase((db) => db.prepare("INSERT INTO studio_settings (key, data_json) VALUES ('budget', ?) ON CONFLICT (key) DO UPDATE SET data_json = EXCLUDED.data_json").run(JSON.stringify(parsed.data)));
  return parsed.data;
}

function civilParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}
// Convierte medianoche civil a UTC, calculando el offset en la propia fecha (incluye DST).
function midnight(date: Date, timezone: string) {
  const desired = date.getTime();
  let guess = desired;
  for (let i = 0; i < 5; i++) {
    const p = civilParts(new Date(guess), timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const next = guess + desired - represented;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}
export function budgetPeriodRange(period: BudgetPeriod, now: Date, timezone: string) {
  const p = civilParts(now, timezone);
  const from = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (period === "week") from.setUTCDate(from.getUTCDate() - (from.getUTCDay() + 6) % 7);
  if (period === "month") from.setUTCDate(1);
  const to = new Date(from);
  if (period === "month") to.setUTCMonth(to.getUTCMonth() + 1);
  else to.setUTCDate(to.getUTCDate() + (period === "week" ? 7 : 1));
  return { from: midnight(from, timezone), to: midnight(to, timezone) };
}
export async function budgetStatus(now = new Date()) {
  const settings = await getBudgetSettings();
  const periods = {} as Record<BudgetPeriod, { limit: number | null; used: number; remaining: number | null; unknown: number; from: string; to: string }>;
  for (const period of ["day", "week", "month"] as const) {
    const range = budgetPeriodRange(period, now, settings.timezone);
    const row = await withDatabase((db) => db.prepare("SELECT COALESCE(SUM(cost_amount),0) AS used, COUNT(*) FILTER (WHERE cost_amount IS NULL) AS unknown FROM generation_runs WHERE created_at >= ? AND created_at < ?").get(range.from, range.to)) as { used: number; unknown: number };
    const used = Math.round(row.used * 1e6) / 1e6;
    const limit = settings.limits[period];
    periods[period] = { ...range, limit, used, unknown: row.unknown, remaining: limit === null ? null : Math.round((limit - used) * 1e6) / 1e6 };
  }
  return { settings, periods, currency: "USD" };
}
export async function assertAutomationBudget(now = new Date()) {
  const status = await budgetStatus(now);
  if (!status.settings.blockAutomations) return;
  const reached = Object.entries(status.periods).find(([, p]) => p.limit !== null && p.used >= p.limit);
  if (reached) throw new BudgetError(`Se alcanzó el presupuesto ${ { day: "diario", week: "semanal", month: "mensual" }[reached[0] as BudgetPeriod] }. Ajusta el límite o espera al siguiente período.`);
}
