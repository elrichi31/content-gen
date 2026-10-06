"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DailySpendChart, RankedChart } from "@/components/cost-charts";
import type { ModelUsage, ToolUsage, DailyCost } from "@/lib/cost-analytics";
import type { CatalogEntry } from "@/lib/cost-catalog";
import type { Usage } from "@content-gen/domain/cost";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Operation = { operation: string; runs: number; tariffed: number; untariffed: number; failed: number; total: number; average: number | null; medianDurationMs: number | null };
type Provider = { provider: string; runs: number; total: number; untariffed: number };
type Expensive = { contentItemId: string; runs: number; total: number; title: string; type: string | null };
type Payload = {
  month: string;
  currency: string;
  pricingVersion: string | null;
  totals: { amount: number; runs: number; untariffed: number; failed: number };
  budget: { amount: number; used: number; ratio: number } | null;
  operations: Operation[];
  providers: Provider[];
  expensive: Expensive[];
  models: ModelUsage[];
  tools: ToolUsage[];
  daily: DailyCost[];
  usage: Usage;
  pending: number;
  unmetered: number;
  pricing: { version: string | null; status: string; missing: string[]; catalog: CatalogEntry[]; error?: string };
  error?: string;
};

/** Etiquetas de las operaciones que registra la aplicación; una nueva se muestra con su clave. */
const OPERATION_LABEL: Record<string, string> = {
  "article-research": "Artículo · investigación",
  "article-write": "Artículo · redacción",
  "carousel-generate": "Carrusel · generar",
  "carousel-remix": "Carrusel · remix",
  "carousel-slide-add": "Carrusel · añadir slide",
  "carousel-slide-regenerate": "Carrusel · rehacer slide",
  "carousel-image": "Carrusel · imagen",
  "ad-generate": "Anuncio · generar",
  "ad-regenerate": "Anuncio · rehacer",
  "video-standard-script": "Video · guion",
  "video-timeline-script": "Video · guion timeline",
  "video-voiceover-script": "Video · guion de voz",
  "video-caption": "Video · caption",
  "video-scene-image": "Video · imagen de escena",
  "video-scene-audio": "Video · audio de escena",
  "radar-research": "Radar · investigación",
  "radar-structure": "Radar · estructurar",
  "radar-restructure": "Radar · reestructurar",
  "ai-carousel-plan": "Carrusel IA · plan",
  "ai-carousel-slide": "Carrusel IA · imagen",
  "explainer-script": "Animación · guion",
};
const TOOL_LABEL: Record<string, string> = { "web-search": "Búsqueda web", image: "Imágenes IA", speech: "Síntesis de voz", "stock-photo": "Fotos de stock", text: "Generación de texto" };

const PROVIDER_LABEL: Record<string, string> = { openai: "OpenAI", gemini: "Gemini", elevenlabs: "ElevenLabs", unsplash: "Unsplash", local: "Local" };

/**
 * Los importes son céntimos de dólar: con dos decimales casi todo saldría «$0.00». Se muestran
 * cuatro, que es donde estas cifras empiezan a distinguirse entre sí.
 */
function money(amount: number, currency: string) {
  return `${amount.toLocaleString("es", { minimumFractionDigits: amount >= 1 ? 2 : 4, maximumFractionDigits: 6 })} ${currency}`;
}

function duration(ms: number | null) {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function monthLabel(month: string) {
  const [year, index] = month.split("-");
  const date = new Date(Number(year), Number(index) - 1, 1);
  return date.toLocaleDateString("es", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function CostsDashboard({ initialData }: { initialData?: Payload } = {}) {
  const [month, setMonth] = useState(() => initialData?.month ?? currentMonth());
  const [data, setData] = useState<Payload | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [rankBy, setRankBy] = useState<"usage" | "cost">("usage");
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/costs?month=${month}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json() as Payload;
      if (!response.ok || body.error) throw new Error(body.error ?? "No se pudo leer el gasto.");
      if (body.month !== month || !body.totals || !body.usage || !Array.isArray(body.models) || !Array.isArray(body.tools) || !Array.isArray(body.daily) || !Array.isArray(body.pricing?.catalog)) throw new Error("El informe recibido está incompleto.");
      if (!controller.signal.aborted) setData(body);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "No se pudo leer el gasto.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); return () => requestRef.current?.abort(); }, [load]);

  if (!data || data.month !== month) return <div className="space-y-3" role="status">{error ? <><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>Reintentar</Button><Button variant="ghost" onClick={() => setMonth(currentMonth())}>Volver al mes actual</Button></> : <><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="grid grid-cols-2 gap-4"><div className="h-24 animate-pulse rounded-lg bg-muted" /><div className="h-24 animate-pulse rounded-lg bg-muted" /></div><div className="h-56 animate-pulse rounded-lg bg-muted" /><span className="sr-only">Cargando gasto…</span></>}</div>;

  const { currency } = data;
  const overBudget = data.budget !== null && data.budget.ratio >= 1;
  const mostUsed = data.models.find(model => model.model !== null);
  const mostUsedTool = data.tools[0];
  const rankedModels = [...data.models].sort((a, b) => rankBy === "usage" ? b.runs - a.runs || b.total - a.total : b.total - a.total || b.runs - a.runs);
  const rankedTools = [...data.tools].sort((a, b) => rankBy === "usage" ? b.runs - a.runs || a.tool.localeCompare(b.tool) : b.associatedSpend - a.associatedSpend || b.runs - a.runs);

  return (
    <div className="space-y-6">
      {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p className="text-destructive">{error} Se conserva el último informe cargado.</p><Button size="sm" variant="outline" onClick={() => void load()}>Reintentar</Button></div> : null}
      <div className="flex flex-wrap items-center gap-2" aria-busy={loading}>
        <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>Mes anterior</Button>
        {/* `capitalize` pondría mayúscula en cada palabra: «Agosto De 2026». */}
        <span className="text-sm font-medium first-letter:uppercase">{monthLabel(month)}</span>
        <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()}>Mes siguiente</Button>
        <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Actualizar">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {data.pricing.status !== "configured" ? (
        <Card className="border-amber-500/40">
          <CardContent className="flex gap-3 py-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="font-medium">El gasto mostrado está incompleto.</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{data.pricing.error ?? `Faltan tarifas: ${data.pricing.missing.join(", ")}.`}</p>
              <p className="mt-1 text-muted-foreground">Los registros sin importe no se consideran gratis. El total es un mínimo.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="min-w-0 py-0">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Gasto API estimado</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{money(data.totals.amount, currency)}</p>
            {/* Un total bajo puede significar «gasté poco» o «falta importe»; hay que distinguirlo
                aunque la tarifa esté completa: los registros anteriores a ella no tienen importe. */}
            {data.totals.untariffed ? (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                Mínimo: {data.totals.untariffed} de {data.totals.runs} operaciones no tienen importe.
              </p>
            ) : null}
            {data.budget ? (
              <>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={overBudget ? "h-full bg-destructive" : "h-full bg-primary"}
                    style={{ width: `${Math.min(100, Math.round(data.budget.ratio * 100))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(data.budget.ratio * 100)}% de {money(data.budget.amount, currency)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Sin presupuesto: define <code>COST_BUDGET_MONTHLY</code>.</p>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 py-0">
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Operaciones</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data.totals.runs.toLocaleString("es")}</p>
            <p className="mt-3 text-xs text-muted-foreground">{data.totals.failed} fallidas · {data.pending} en curso</p>
            {data.unmetered ? <p className="mt-1 text-xs text-muted-foreground">{data.unmetered} sin consumo informado</p> : null}
          </CardContent>
        </Card>

        <Card className="min-w-0 py-0">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Modelo más usado</p>
            <p className="mt-2 break-words text-base font-semibold">{mostUsed?.model ?? "Sin actividad"}</p>
            <p className="mt-3 text-xs text-muted-foreground">{mostUsed ? `${mostUsed.runs} operaciones · ${money(mostUsed.total, currency)}` : "Se mostrará al registrar un modelo."}</p>
          </CardContent>
        </Card>

        <Card className="min-w-0 py-0">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Herramienta más usada</p>
            <p className="mt-2 text-base font-semibold">{mostUsedTool ? TOOL_LABEL[mostUsedTool.tool] ?? mostUsedTool.tool : "Sin actividad"}</p>
            <p className="mt-3 text-xs text-muted-foreground">{mostUsedTool ? `${mostUsedTool.runs} operaciones · ${mostUsedTool.units.toLocaleString("es")} ${mostUsedTool.unit}` : "El consumo medido aparecerá aquí."}</p>
          </CardContent>
        </Card>
      </div>

      <DailySpendChart key={month} days={data.daily} currency={currency} />
      <section className="space-y-3" aria-label="Rankings de uso y gasto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Top 6 · frecuencia de uso y gasto no son lo mismo.</p>
          <div className="flex gap-1" role="group" aria-label="Orden del ranking">
            <Button size="sm" variant={rankBy === "usage" ? "secondary" : "ghost"} aria-pressed={rankBy === "usage"} onClick={() => setRankBy("usage")}>Más usados</Button>
            <Button size="sm" variant={rankBy === "cost" ? "secondary" : "ghost"} aria-pressed={rankBy === "cost"} onClick={() => setRankBy("cost")}>Mayor gasto</Button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RankedChart title="Modelos" description={rankBy === "usage" ? "Ordenados por operaciones registradas, incluidos intentos y errores." : "Ordenados por importe registrado, no por la tarifa del modelo."} rows={rankedModels.slice(0, 6).map(model => ({ key: `${model.provider}:${model.model}`, label: model.model ?? "Sin modelo registrado", detail: `${PROVIDER_LABEL[model.provider] ?? model.provider} · ${model.runs} operaciones${model.untariffed ? ` · ${model.untariffed} sin importe` : ""}`, value: rankBy === "usage" ? model.runs : model.total, display: rankBy === "usage" ? `${model.runs} op` : money(model.total, currency) }))} />
          <RankedChart title="Herramientas" description={rankBy === "usage" ? "Operaciones que usaron cada herramienta, no comparación de caracteres con búsquedas." : "Gasto de las operaciones asociadas, no la comisión exclusiva de la herramienta. No sumar estas barras."} rows={rankedTools.slice(0, 6).map(tool => ({ key: tool.tool, label: TOOL_LABEL[tool.tool] ?? tool.tool, detail: `${tool.units.toLocaleString("es")} ${tool.unit} · ${tool.runs} operaciones`, value: rankBy === "usage" ? tool.runs : tool.associatedSpend, display: rankBy === "usage" ? `${tool.runs} op` : money(tool.associatedSpend, currency) }))} />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankedChart title="Gasto por proveedor" description="Desglose de los importes congelados del mes." rows={data.providers.map(provider => ({ key: provider.provider, label: PROVIDER_LABEL[provider.provider] ?? provider.provider, detail: `${provider.runs} operaciones${provider.untariffed ? ` · ${provider.untariffed} sin importe` : ""}`, value: provider.total, display: money(provider.total, currency) }))} />
        <Card className="py-4"><CardContent><h2 className="text-sm font-semibold">Consumo medido</h2><p className="mt-1 text-xs text-muted-foreground">La caché ya está incluida en la entrada; no se suma dos veces.</p><dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 text-sm">{[
          ["Tokens de entrada", data.usage.inputTokens], ["Tokens de salida", data.usage.outputTokens], ["Entrada en caché", data.usage.cachedInputTokens], ["Búsquedas web", data.usage.webSearchCalls], ["Imágenes generadas", data.usage.images], ["Caracteres de voz", data.usage.characters],
        ].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{Number(value).toLocaleString("es")}</dd></div>)}</dl>{data.unmetered ? <p className="mt-5 text-xs text-muted-foreground">Consumo no informado en {data.unmetered} operaciones. Estos valores muestran solo lo medido.</p> : null}</CardContent></Card>
      </div>

      <Card className="min-w-0 py-0">
        <CardContent className="py-4">
          <h2 className="text-sm font-semibold">Cuánto cuesta cada cosa</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            El promedio se calcula solo sobre las operaciones con importe. La mediana de duración señala lo lento, no lo caro.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Operación</th>
                  <th className="py-2 pr-3 text-right font-medium">Veces</th>
                  <th className="py-2 pr-3 text-right font-medium">Promedio</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">Mediana</th>
                </tr>
              </thead>
              <tbody>
                {data.operations.length ? data.operations.map((operation) => (
                  <tr key={operation.operation} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-3">
                      {OPERATION_LABEL[operation.operation] ?? operation.operation}
                      {operation.untariffed ? <Badge variant="outline" className="ml-2 text-[10px]">{operation.untariffed} sin tarifa</Badge> : null}
                      {operation.failed ? <Badge variant="outline" className="ml-2 text-[10px]">{operation.failed} con error</Badge> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{operation.runs}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{operation.average === null ? "—" : money(operation.average, currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(operation.total, currency)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{duration(operation.medianDurationMs)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sin operaciones este mes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data.expensive.length ? (
        <Card className="min-w-0 py-0">
          <CardContent className="py-4">
            <h2 className="text-sm font-semibold">Piezas más caras</h2>
            <p className="mt-1 text-xs text-muted-foreground">Suma de todo lo generado para cada pieza: sirve para detectar lo que se rehízo muchas veces.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {data.expensive.map((item) => (
                <li key={item.contentItemId} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{item.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    <span className="tabular-nums">{item.runs}</span> op · <span className="tabular-nums">{money(item.total, currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <details className="rounded-xl border bg-card px-4 py-4 sm:px-6">
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Tarifas y cobertura · {data.pricing.catalog.length} entradas</summary>
        <p className="mt-3 text-xs text-muted-foreground">Tarifas públicas consultadas, no factura de la cuenta. Los servicios sin medición y la infraestructura no se incluyen en el total.</p>
        <div className="mt-4 divide-y">
          {data.pricing.catalog.map(entry => <div key={entry.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0"><h3 className="break-words text-sm font-medium">{entry.name}</h3><p className="mt-1 text-xs text-muted-foreground">{entry.metered ? "Consumo registrado en generaciones" : "Sin medición de consumo en esta vista"}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{entry.verification === "verified" ? "Fuente verificada" : entry.verification === "review" ? "Revisar vigencia" : "Sin tarifa verificada"}</Badge>{entry.basis === "output-estimate" ? <Badge variant="outline">Solo salida</Badge> : entry.basis === "plan-estimate" ? <Badge variant="outline">Depende del plan</Badge> : null}</div></div>
            <div className="min-w-0"><ul className="space-y-1 text-sm">{entry.rates.map(rate => <li key={rate.label} className="flex flex-wrap justify-between gap-x-3 gap-y-1"><span className="text-muted-foreground">{rate.label}</span><span className="tabular-nums">{rate.amount === null ? "Desconocido" : rate.amount === 0 ? "Gratis" : `${money(rate.amount, currency)} / ${rate.unit}`}</span></li>)}</ul><p className="mt-2 text-xs text-muted-foreground">{entry.note}</p>{entry.source ? <a className="mt-2 inline-block text-xs underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring" href={entry.source} target="_blank" rel="noopener noreferrer">Documentación{entry.verifiedAt ? ` · consultada ${entry.verifiedAt}` : ""}</a> : null}</div>
          </div>)}
        </div>
      </details>
      {data.pricingVersion ? <p className="text-xs text-muted-foreground">Catálogo actual: {data.pricingVersion}. El histórico conserva su tarifa original. Total API estimado: imágenes excluyen entrada, voz no descuenta cuotas incluidas, escrituras de caché e infraestructura no medidas.</p> : null}
    </div>
  );
}
