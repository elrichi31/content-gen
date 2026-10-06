"use client";

import { useCallback, useEffect, useState } from "react";
import type { BudgetSettings, budgetStatus } from "@/lib/budget-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type BudgetStatus = Awaited<ReturnType<typeof budgetStatus>>;
export const budgetLabels = { day: "Diario", week: "Semanal", month: "Mensual" };
export function costMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 4 }).format(amount);
}
export function BudgetPanel({ initialData, onSaved }: { initialData?: BudgetStatus; onSaved?: (data: BudgetStatus) => void }) {
  const [data, setData] = useState<BudgetStatus | null>(initialData ?? null);
  const [draft, setDraft] = useState<BudgetSettings | null>(initialData?.settings ?? null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/budget");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el presupuesto.");
      setData(payload); setDraft(payload.settings);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar el presupuesto."); }
  }, []);
  useEffect(() => { if (!initialData) void load(); }, [initialData, load]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar el presupuesto.");
      setData(payload); setDraft(payload.settings); setSaved(true); onSaved?.(payload);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar el presupuesto."); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-5">
      {error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{!data ? <Button variant="outline" onClick={() => void load()}>Reintentar</Button> : null}</div> : null}
      {!data || !draft ? !error && <p role="status" className="text-sm text-muted-foreground">Cargando presupuesto…</p> : (
        <form onSubmit={save} className="space-y-5">
          <div className="divide-y divide-border">
            {(["day", "week", "month"] as const).map((period) => {
              const usage = data.periods[period];
              const over = usage.limit !== null && usage.used >= usage.limit;
              return <div key={period} className="space-y-2 py-3 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`budget-${period}`}>{budgetLabels[period]}</Label>
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{data.currency}</span><Input id={`budget-${period}`} type="number" min="0.000001" max="1000000" step="any" placeholder="Sin límite" value={draft.limits[period] ?? ""} onChange={(e) => { setSaved(false); setDraft({ ...draft, limits: { ...draft.limits, [period]: e.target.value === "" ? null : Number(e.target.value) } }); }} className="w-32 text-right tabular-nums" /></div>
                </div>
                <p className={cn("text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>{costMoney(usage.used, data.currency)} registrado{usage.remaining !== null ? ` · ${over ? "Superado" : "Disponible"}: ${costMoney(Math.abs(usage.remaining), data.currency)}` : " · Sin límite"}</p>
                {usage.unknown ? <p className="text-xs text-muted-foreground">Costo incompleto: {usage.unknown} operaciones sin importe confirmado.</p> : null}
              </div>;
            })}
          </div>
          <div className="space-y-1.5"><Label htmlFor="budget-timezone">Zona horaria</Label><Input id="budget-timezone" value={draft.timezone} onChange={(e) => { setSaved(false); setDraft({ ...draft, timezone: e.target.value }); }} placeholder="America/Bogota" /><p className="text-xs text-muted-foreground">Semana de lunes a domingo; día y mes naturales en esta zona.</p></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={draft.blockAutomations} onChange={(e) => { setSaved(false); setDraft({ ...draft, blockAutomations: e.target.checked }); }} /><span>Frenar automatizaciones al alcanzar cualquiera de los límites</span></label>
          <p className="text-xs leading-relaxed text-muted-foreground">Presupuesto compartido por el estudio. Las ejecuciones manuales siguen disponibles. El freno se revisa antes de nuevas operaciones; no cancela llamadas en curso ni garantiza un techo exacto de facturación.</p>
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar presupuesto"}</Button>{saved ? <span role="status" className="text-sm text-primary">Presupuesto guardado.</span> : null}</div>
        </form>
      )}
    </div>
  );
}
