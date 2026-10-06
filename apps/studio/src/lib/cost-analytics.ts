import { addUsage, emptyUsage, usageSchema, type Usage } from "@content-gen/domain/cost";

export type UsageRow = { operation: string; provider: string; status: string; cost_amount: number | null; created_at: string; data_json: string };
export type ModelUsage = { model: string | null; provider: string; runs: number; total: number; tariffed: number; untariffed: number; usage: Usage };
export type ToolUsage = { tool: string; runs: number; units: number; unit: string; associatedSpend: number };
export type DailyCost = { date: string; runs: number; total: number; cumulative: number; untariffed: number };
const round = (amount: number) => Math.round(amount * 1e6) / 1e6;

/** Un fallo sin consumo conocido no demuestra ni cobro ni gratuidad. */
export const isUntariffed = (row: { status: string; cost_amount: number | null }) => row.status !== "running" && row.cost_amount === null;

/** Agrupa consumo medido y costos congelados, sin retarifar el histórico. */
export function summarizeUsage(rows: UsageRow[], month: string) {
  const [year, index] = month.split("-").map(Number);
  const days = new Date(year, index, 0).getDate();
  // Misma zona local que monthRange; no cortar el día en UTC si el periodo es local.
  const daily: DailyCost[] = Array.from({ length: days }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, "0")}`, runs: 0, total: 0, cumulative: 0, untariffed: 0 }));
  const models = new Map<string, ModelUsage>();
  const tools = new Map<string, ToolUsage>();
  let usage = emptyUsage();
  let pending = 0;
  let unmetered = 0;
  for (const row of rows) {
    const parsed = JSON.parse(row.data_json) as { model?: string | null; usage?: unknown };
    const consumption = usageSchema.safeParse(parsed.usage);
    const measured = consumption.success ? consumption.data : emptyUsage();
    if (!consumption.success) unmetered++;
    usage = addUsage(usage, measured);
    const model = typeof parsed.model === "string" && parsed.model ? parsed.model : null;
    const key = JSON.stringify([row.provider, model]);
    const item = models.get(key) ?? { model, provider: row.provider, runs: 0, total: 0, tariffed: 0, untariffed: 0, usage: emptyUsage() };
    item.runs++;
    item.total += row.cost_amount ?? 0;
    item.tariffed += Number(row.cost_amount !== null);
    item.untariffed += Number(isUntariffed(row));
    item.usage = addUsage(item.usage, measured);
    models.set(key, item);
    if (row.status === "running") pending++;

    const addTool = (tool: string, units: number, unit: string) => {
      if (!units) return;
      const entry = tools.get(tool) ?? { tool, runs: 0, units: 0, unit, associatedSpend: 0 };
      entry.runs++;
      entry.units += units;
      // No es la comisión de la herramienta: es el importe de las operaciones que la usaron.
      entry.associatedSpend += row.cost_amount ?? 0;
      tools.set(tool, entry);
    };
    addTool("web-search", measured.webSearchCalls, "búsquedas");
    addTool("image", measured.images, "imágenes");
    addTool("speech", measured.characters, "caracteres");
    addTool("stock-photo", Number(row.provider === "unsplash"), "operaciones");
    addTool("text", Number(measured.inputTokens + measured.outputTokens > 0), "operaciones");

    const date = new Date(row.created_at);
    const day = date.getFullYear() === year && date.getMonth() === index - 1 ? daily[date.getDate() - 1] : undefined;
    if (day) {
      day.runs++;
      day.total += row.cost_amount ?? 0;
      day.untariffed += Number(isUntariffed(row));
    }
  }
  let cumulative = 0;
  for (const day of daily) {
    cumulative += day.total;
    day.total = round(day.total);
    day.cumulative = round(cumulative);
  }
  return {
    models: [...models.values()].map(item => ({ ...item, total: round(item.total) })).sort((a, b) => b.runs - a.runs || b.total - a.total || (a.model ?? "").localeCompare(b.model ?? "")),
    tools: [...tools.values()].map(item => ({ ...item, associatedSpend: round(item.associatedSpend) })).sort((a, b) => b.runs - a.runs || a.tool.localeCompare(b.tool)),
    daily, usage, pending, unmetered,
  };
}
