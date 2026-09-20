"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
  pricing: { version: string | null; status: string; missing: string[]; error?: string };
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
};

const PROVIDER_LABEL: Record<string, string> = { openai: "OpenAI", gemini: "Gemini", elevenlabs: "ElevenLabs", unsplash: "Unsplash", local: "Local" };

/**
 * Los importes son céntimos de dólar: con dos decimales casi todo saldría «$0.00». Se muestran
 * cuatro, que es donde estas cifras empiezan a distinguirse entre sí.
 */
function money(amount: number, currency: string) {
  return `${amount.toLocaleString("es", { minimumFractionDigits: amount >= 1 ? 2 : 4, maximumFractionDigits: 4 })} ${currency}`;
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

export function CostsDashboard() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/costs?month=${month}`, { cache: "no-store" });
      setData(await response.json() as Payload);
    } catch {
      setData({ error: "No se pudo leer el gasto." } as Payload);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <p className="text-sm text-muted-foreground">Cargando gasto…</p>;
  if (!data || data.error) return <p className="text-sm text-destructive">{data?.error ?? "No se pudo leer el gasto."}</p>;

  const { currency } = data;
  const overBudget = data.budget !== null && data.budget.ratio >= 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>Mes anterior</Button>
        {/* `capitalize` pondría mayúscula en cada palabra: «Agosto De 2026». */}
        <span className="text-sm font-medium first-letter:uppercase">{monthLabel(month)}</span>
        <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()}>Mes siguiente</Button>
        <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {data.pricing.status !== "configured" ? (
        <Card className="border-amber-500/40">
          <CardContent className="flex gap-3 py-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="font-medium">El gasto mostrado está incompleto.</p>
              <p className="text-muted-foreground">
                {data.pricing.error ?? `Faltan tarifas en config/pricing.json: ${data.pricing.missing.join(", ")}.`} Las operaciones sin
                tarifa se registran igual, pero sin importe: el total es un mínimo, no el gasto real.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Gasto del mes</p>
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

        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Operaciones</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data.totals.runs.toLocaleString("es")}</p>
            <p className="mt-3 text-xs text-muted-foreground">{data.totals.failed} fallidas (también se pagan)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sin tarifar</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data.totals.untariffed.toLocaleString("es")}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {data.totals.untariffed ? "Operaciones cerradas sin importe" : "Todo el gasto del mes está tarifado"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Por proveedor</p>
            <ul className="mt-2 space-y-1 text-sm">
              {data.providers.length ? data.providers.map((provider) => (
                <li key={provider.provider} className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">{PROVIDER_LABEL[provider.provider] ?? provider.provider}</span>
                  <span className="tabular-nums">{money(provider.total, currency)}</span>
                </li>
              )) : <li className="text-muted-foreground">Sin actividad</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
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
        <Card>
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

      {data.pricingVersion ? <p className="text-xs text-muted-foreground">Tarifa aplicada al calcular: {data.pricingVersion}. Los importes ya registrados no se recalculan.</p> : null}
    </div>
  );
}
