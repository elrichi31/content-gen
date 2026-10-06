"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DailyCost } from "@/lib/cost-analytics";

const money = (amount: number, currency: string) => `${amount.toLocaleString("es", { minimumFractionDigits: amount >= 1 ? 2 : 4, maximumFractionDigits: 6 })} ${currency}`;
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "long" });

export function DailySpendChart({ days, currency }: { days: DailyCost[]; currency: string }) {
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");
  const [selected, setSelected] = useState<number | null>(null);
  const values = days.map(day => mode === "daily" ? day.total : day.cumulative);
  const max = Math.max(0, ...values);
  const scale = max || 1;
  const width = 640, height = 180, bottom = 156, top = 12;
  const step = (width - 24) / Math.max(1, days.length);
  const x = (index: number) => 12 + step * (index + 0.5);
  const y = (value: number) => bottom - (value / scale) * (bottom - top);
  const hovered = selected === null ? null : days[selected];
  return (
    <Card className="min-w-0 py-4">
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Evolución del gasto</h2><p className="mt-1 text-xs text-muted-foreground">Importes registrados por día. Misma zona horaria que el periodo.</p></div>
          <div className="flex gap-1" role="group" aria-label="Tipo de evolución">
            <Button size="sm" variant={mode === "daily" ? "secondary" : "ghost"} aria-pressed={mode === "daily"} onClick={() => setMode("daily")}>Diario</Button>
            <Button size="sm" variant={mode === "cumulative" ? "secondary" : "ghost"} aria-pressed={mode === "cumulative"} onClick={() => setMode("cumulative")}>Acumulado</Button>
          </div>
        </div>
        {!days.some(day => day.runs) ? <p className="py-12 text-center text-sm text-muted-foreground">Sin actividad este mes. Las próximas generaciones aparecerán aquí.</p> : (
          <>
            <div className="mt-4 flex justify-between text-xs tabular-nums text-muted-foreground"><span>{mode === "daily" ? "Máximo diario" : "Acumulado"}</span><span>{money(max, currency)}</span></div>
            <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full" aria-label={`${mode === "daily" ? "Gasto diario" : "Gasto acumulado"} en ${currency}`}>
              {[0, 0.5, 1].map(fraction => <line key={fraction} x1={12} x2={width - 12} y1={y(scale * fraction)} y2={y(scale * fraction)} stroke="var(--border)" strokeDasharray={fraction === 0 ? undefined : "3 5"} />)}
              {mode === "cumulative" ? <polyline points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} fill="none" stroke="var(--chart-1)" strokeWidth={2.5} strokeLinejoin="round" /> : null}
              {days.map((day, index) => (
                <g key={day.date}>
                  <rect x={x(index) - step * 0.36} y={mode === "daily" ? y(day.total) : top} width={step * 0.72} height={mode === "daily" ? Math.max(2, bottom - y(day.total)) : bottom - top} fill={mode === "daily" ? day.total > 0 ? "var(--chart-1)" : "var(--muted)" : "transparent"} tabIndex={0} role="img" aria-label={`${dayLabel(day.date)}: ${money(values[index], currency)}, ${day.runs} operaciones, ${day.untariffed} sin importe`} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)} className="focus:outline-2 focus:outline-ring">
                    <title>{`${dayLabel(day.date)} · ${money(values[index], currency)} · ${day.runs} operaciones · ${day.untariffed} sin importe`}</title>
                  </rect>
                  {index === 0 || index === days.length - 1 || index % 7 === 0 ? <text x={x(index)} y={176} textAnchor="middle" fill="var(--muted-foreground)" fontSize={11}>{index + 1}</text> : null}
                </g>
              ))}
            </svg>
            <p aria-live="polite" className="mt-1 min-h-5 text-xs tabular-nums text-muted-foreground">{hovered ? `${dayLabel(hovered.date)} · ${money(mode === "daily" ? hovered.total : hovered.cumulative, currency)} · ${hovered.runs} operaciones${hovered.untariffed ? ` · ${hovered.untariffed} sin importe` : ""}` : "Pasa sobre un día o recorre la gráfica con el teclado para ver el detalle."}</p>
            <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Ver valores diarios</summary><div className="mt-2 max-h-56 overflow-auto"><table className="w-full tabular-nums"><thead><tr className="text-left text-muted-foreground"><th className="py-2 font-medium">Día</th><th className="text-right font-medium">Gasto</th><th className="text-right font-medium">Acumulado</th><th className="text-right font-medium">Sin importe</th></tr></thead><tbody>{days.map(day => <tr key={day.date} className="border-t"><td className="py-2">{dayLabel(day.date)}</td><td className="text-right">{money(day.total, currency)}</td><td className="text-right">{money(day.cumulative, currency)}</td><td className="text-right">{day.untariffed}</td></tr>)}</tbody></table></div></details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export type RankedRow = { key: string; label: string; detail: string; value: number; display: string };
export function RankedChart({ title, description, rows }: { title: string; description: string; rows: RankedRow[] }) {
  const max = Math.max(1e-6, ...rows.map(row => row.value));
  return <Card className="min-w-0 py-4"><CardContent><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p>{rows.length ? <ol className="mt-5 space-y-4">{rows.map((row, index) => <li key={row.key}><div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium">{row.label}</span><span className="shrink-0 tabular-nums">{row.display}</span></div><p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p><div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden><div className="h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(100, row.value / max * 100))}%`, background: `var(--chart-${index % 5 + 1})` }} /></div></li>)}</ol> : <p className="py-8 text-sm text-muted-foreground">Sin actividad registrada este mes.</p>}</CardContent></Card>;
}
