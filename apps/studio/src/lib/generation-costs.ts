import { addUsage, emptyUsage, totalCost, usageSchema, type Cost, type Usage } from "@content-gen/domain/cost";
import { isUntariffed, summarizeUsage } from "./cost-analytics.ts";
import { contentTitle } from "./content-title.ts";
import { withDatabase } from "./db.ts";
import { loadPricing } from "./pricing.ts";
import { getBudgetSettings } from "./budget-settings.ts";

export class CostReportError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Presupuesto mensual en la moneda de la tarifa. Sin él la pantalla informa pero no compara. */
export function monthlyBudget() {
  const raw = process.env.COST_BUDGET_MONTHLY?.trim();
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) throw new CostReportError("COST_BUDGET_MONTHLY debe ser un número positivo.", 500);
  return amount;
}

/**
 * Rango de un mes natural, en hora local, devuelto como marcas ISO. Los registros guardan
 * `created_at` en UTC, así que el corte se calcula sobre fechas locales y se convierte: de lo
 * contrario el gasto del día 1 aparecería en el mes anterior según la zona horaria.
 */
export function monthRange(month: string) {
  const parsed = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!parsed) throw new CostReportError("El mes debe tener el formato YYYY-MM.", 400);
  const year = Number(parsed[1]);
  const index = Number(parsed[2]) - 1;
  if (index < 0 || index > 11) throw new CostReportError("El mes debe estar entre 01 y 12.", 400);
  return { from: new Date(year, index, 1).toISOString(), to: new Date(year, index + 1, 1).toISOString() };
}

export function currentMonth(today = new Date()) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

type RunRow = { operation: string; provider: string; status: string; cost_amount: number | null; data_json: string; content_item_id: string | null; created_at: string };

function round(amount: number) {
  return Math.round(amount * 1e6) / 1e6;
}

/**
 * Informe del periodo. Todo sale de una sola lectura: son decenas o cientos de registros, y
 * agrupar en memoria evita cuatro consultas que podrían no cuadrar entre sí.
 */
export async function costReport({ month = currentMonth() }: { month?: string } = {}) {
  const { from, to } = monthRange(month);
  const pricing = safePricing();

  const rows = await withDatabase(async (database) => await database
    .prepare("SELECT operation, provider, status, cost_amount, data_json, content_item_id, created_at FROM generation_runs WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC")
    .all(from, to) as RunRow[]);

  const byOperation = new Map<string, { operation: string; runs: number; tariffed: number; untariffed: number; failed: number; total: number; durationMs: number[] }>();
  const byProvider = new Map<string, { provider: string; runs: number; total: number; untariffed: number }>();
  const byItem = new Map<string, { contentItemId: string; runs: number; total: number }>();
  let total = 0;
  let untariffed = 0;
  let failed = 0;

  for (const row of rows) {
    const run = JSON.parse(row.data_json) as { durationMs?: number | null };
    const missing = isUntariffed(row);
    const amount = row.cost_amount ?? 0;
    if (missing) untariffed += 1;
    if (row.status === "failed") failed += 1;
    total += amount;

    const operation = byOperation.get(row.operation) ?? { operation: row.operation, runs: 0, tariffed: 0, untariffed: 0, failed: 0, total: 0, durationMs: [] };
    operation.runs += 1;
    operation.total += amount;
    if (missing) operation.untariffed += 1;
    if (row.cost_amount !== null) operation.tariffed += 1;
    if (row.status === "failed") operation.failed += 1;
    if (typeof run.durationMs === "number") operation.durationMs.push(run.durationMs);
    byOperation.set(row.operation, operation);

    const provider = byProvider.get(row.provider) ?? { provider: row.provider, runs: 0, total: 0, untariffed: 0 };
    provider.runs += 1;
    provider.total += amount;
    if (missing) provider.untariffed += 1;
    byProvider.set(row.provider, provider);

    if (row.content_item_id) {
      const item = byItem.get(row.content_item_id) ?? { contentItemId: row.content_item_id, runs: 0, total: 0 };
      item.runs += 1;
      item.total += amount;
      byItem.set(row.content_item_id, item);
    }
  }

  const budget = (await getBudgetSettings()).limits.month;
  return {
    month,
    ...summarizeUsage(rows, month),
    period: { from, to },
    currency: pricing?.currency ?? "USD",
    pricingVersion: pricing?.version ?? null,
    totals: { amount: round(total), runs: rows.length, untariffed, failed },
    budget: budget === null ? null : { amount: budget, used: round(total), ratio: round(total / budget) },
    // El promedio se calcula solo sobre lo que tiene importe: incluir los no tarifados como cero
    // daría un «cuesta menos» que es falso.
    operations: [...byOperation.values()]
      .map(({ durationMs, ...operation }) => ({
        ...operation,
        total: round(operation.total),
        average: operation.tariffed ? round(operation.total / operation.tariffed) : null,
        medianDurationMs: median(durationMs),
      }))
      .sort((a, b) => b.total - a.total || a.operation.localeCompare(b.operation)),
    providers: [...byProvider.values()].map((provider) => ({ ...provider, total: round(provider.total) })).sort((a, b) => b.total - a.total),
    ...await piecesOf(byItem),
  };
}

/** Todas las piezas con gasto en el mes; `expensive` son las diez primeras, como antes. */
async function piecesOf(byItem: Map<string, { contentItemId: string; runs: number; total: number }>) {
  const pieces = await withTitles([...byItem.values()].sort((a, b) => b.total - a.total || b.runs - a.runs).map((item) => ({ ...item, total: round(item.total) })));
  return { pieces, expensive: pieces.slice(0, 10) };
}

type PieceRun = { id: string; operation: string; provider: string; status: string; cost_amount: number | null; data_json: string; created_at: string };

/**
 * Desglose de toda la vida de una pieza, no solo del mes: un video se hace en varios días y lo que
 * interesa es cuánto costó entero. Agrupa por operación (guion, imágenes, voz…) y lista cada
 * operación para ver qué se repitió.
 */
export async function pieceCost(contentItemId: string) {
  const item = await withDatabase(async (database) => await database
    .prepare("SELECT id, type, document_json, created_at FROM content_items WHERE id = ?")
    .get(contentItemId) as { id: string; type: string; document_json: string; created_at: string } | undefined);
  const rows = await withDatabase(async (database) => await database
    .prepare("SELECT id, operation, provider, status, cost_amount, data_json, created_at FROM generation_runs WHERE content_item_id = ? ORDER BY created_at ASC")
    .all(contentItemId) as PieceRun[]);
  if (!item && !rows.length) throw new CostReportError("La pieza no existe o no tiene gasto registrado.", 404);

  const byOperation = new Map<string, { operation: string; runs: number; failed: number; untariffed: number; total: number; usage: Usage; models: string[] }>();
  let total = 0;
  let failed = 0;
  let untariffed = 0;
  const runs = rows.map((row) => {
    const data = JSON.parse(row.data_json) as { model?: string | null; usage?: unknown; durationMs?: number | null; error?: string | null };
    const parsed = usageSchema.safeParse(data.usage);
    const usage = parsed.success ? parsed.data : null;
    const missing = isUntariffed(row);
    const model = typeof data.model === "string" && data.model ? data.model : null;
    total += row.cost_amount ?? 0;
    failed += Number(row.status === "failed");
    untariffed += Number(missing);
    const group = byOperation.get(row.operation) ?? { operation: row.operation, runs: 0, failed: 0, untariffed: 0, total: 0, usage: emptyUsage(), models: [] };
    group.runs += 1;
    group.total += row.cost_amount ?? 0;
    group.failed += Number(row.status === "failed");
    group.untariffed += Number(missing);
    if (usage) group.usage = addUsage(group.usage, usage);
    const label = model ?? row.provider;
    if (!group.models.includes(label)) group.models.push(label);
    byOperation.set(row.operation, group);
    return {
      id: row.id, operation: row.operation, provider: row.provider, model, status: row.status, createdAt: row.created_at,
      amount: row.cost_amount === null ? null : round(row.cost_amount), durationMs: typeof data.durationMs === "number" ? data.durationMs : null,
      usage, error: typeof data.error === "string" ? data.error : null,
    };
  });
  return {
    contentItemId,
    type: item?.type ?? null,
    title: item ? contentTitle({ ...JSON.parse(item.document_json), type: item.type }) : "(pieza eliminada)",
    createdAt: item?.created_at ?? null,
    currency: safePricing()?.currency ?? "USD",
    totals: { amount: round(total), runs: rows.length, failed, untariffed },
    operations: [...byOperation.values()].map((group) => ({ ...group, total: round(group.total) })).sort((a, b) => b.total - a.total || b.runs - a.runs),
    runs,
  };
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** La tarifa solo se usa para etiquetar el informe; que falte no debe impedir verlo. */
function safePricing() {
  try { return loadPricing(); }
  catch { return null; }
}

async function withTitles(items: { contentItemId: string; runs: number; total: number }[]) {
  if (!items.length) return [] as (typeof items[number] & { title: string; type: string | null })[];
  const rows = await withDatabase(async (database) => await database
    .prepare(`SELECT id, type, document_json FROM content_items WHERE id IN (${items.map(() => "?").join(", ")})`)
    .all(...items.map((item) => item.contentItemId)) as { id: string; type: string; document_json: string }[]);
  const found = new Map(rows.map((row) => [row.id, row]));
  return items.map((item) => {
    const row = found.get(item.contentItemId);
    // Una pieza borrada conserva su gasto: se muestra sin título en vez de desaparecer del total.
    // El tipo se toma de la columna, que es la autoridad, y no del JSON del documento.
    return { ...item, type: row?.type ?? null, title: row ? contentTitle({ ...JSON.parse(row.document_json), type: row.type }) : "(pieza eliminada)" };
  });
}

/**
 * Gasto tarifado del mes en curso, incluidas las corridas del radar. Lo usa el freno de
 * presupuesto: lo no tarifado no suma, así que el número es siempre un mínimo, y frenar sobre un
 * mínimo es lo correcto —si ya se pasó contando de menos, se pasó.
 */
export async function monthSpend({ month = currentMonth() }: { month?: string } = {}) {
  const { from, to } = monthRange(month);
  const rows = await withDatabase(async (database) => await database
    .prepare("SELECT COALESCE(SUM(cost_amount), 0) AS total FROM generation_runs WHERE created_at >= ? AND created_at < ?")
    .get(from, to) as { total: number });
  const radar = await withDatabase(async (database) => await database
    .prepare("SELECT COALESCE(SUM(cost_amount), 0) AS total FROM radar_runs WHERE created_at >= ? AND created_at < ?")
    .get(from, to) as { total: number });
  // Las operaciones del radar ya están en generation_runs; radar_runs agrega lo mismo. Se toma el
  // mayor de los dos en vez de sumarlos, que contaría el gasto del radar por partida doble.
  return { month, amount: round(Math.max(rows.total, radar.total)), budget: (await getBudgetSettings()).limits.month };
}

/** Suma de importes ya congelados, para cuando haga falta agregarlos fuera del informe. */
export function sumCosts(costs: (Cost | null)[], currency = "USD") {
  return totalCost(costs, { currency });
}
