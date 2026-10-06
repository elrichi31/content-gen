"use client";

import { ChevronDown, Radar as RadarIcon, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { RadarWatchlistEntry } from "@content-gen/domain/radar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type ScanSettings = {
  focus: string;
  vertical: string;
  windowDays: number;
  maxSearches: number;
  minSources: number;
  contextSize: "low" | "medium" | "high";
  verifySources: boolean;
  researchModel: string | null;
  structuringModel: string | null;
};

export const DEFAULT_SETTINGS: ScanSettings = { focus: "", vertical: "", windowDays: 7, maxSearches: 8, minSources: 2, contextSize: "low", verifySources: true, researchModel: null, structuringModel: null };

type Models = { available: { id: string; inputPerMillion: number }[]; research: string | null; structuring: string | null };

const ALL = "__all";
const CONFIGURED = "__configured";
const label = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className={label}>{title}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Choice<T extends string | number>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; ariaLabel: string }) {
  return (
    <Select value={String(value)} onValueChange={(next) => onChange((typeof value === "number" ? Number(next) : next) as T)}>
      <SelectTrigger aria-label={ariaLabel}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={String(option.value)} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/**
 * Panel «Buscar temas». Lo que se decide siempre (tema, vertical, ventana) está a la vista; los
 * controles de costo y fiabilidad quedan plegados porque se tocan poco y asustan si están siempre.
 */
export function ScanSheet({ open, onOpenChange, verticals, models, canRestructure, onScan, onRestructure, onManageVerticals }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verticals: RadarWatchlistEntry[];
  models?: Models;
  canRestructure: boolean;
  onScan: (settings: ScanSettings) => void;
  onRestructure: (settings: ScanSettings) => void;
  onManageVerticals: () => void;
}) {
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof ScanSettings>(key: K, value: ScanSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const searching = Boolean(settings.focus.trim());
  // Un tema concreto mandado a todos los verticales paga una búsqueda en cada uno para lo mismo.
  const needsVertical = searching && !settings.vertical && verticals.length > 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" contentClassName="w-full sm:max-w-md" className="h-full gap-0 overflow-y-auto p-0">
        <div className="border-b border-border px-5 pb-5 pt-6 pr-12">
          <SheetTitle className="text-base">Buscar temas</SheetTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">El radar busca en la web novedades de tus verticales y propone temas con fuentes. Tarda unos minutos.</p>
        </div>

        <div className="flex-1 space-y-5 px-5 py-5">
          <Field title="Tema concreto (opcional)" hint={searching ? "Busca solo esto. Si no hubo novedades en la ventana, vuelve vacía en vez de traerte otra cosa." : "Vacío: barre los verticales a ver qué salió. Con tema: «ransomware en clínicas» en vez de «todo ciberseguridad»."}>
            <Input aria-label="Tema concreto que buscar" value={settings.focus} onChange={(event) => set("focus", event.target.value)} placeholder="Ej. ransomware en clínicas privadas" maxLength={300} />
          </Field>

          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <Field title="Dónde buscar">
              <Choice ariaLabel="Vertical" value={settings.vertical || ALL} onChange={(value) => set("vertical", value === ALL ? "" : value)}
                options={[{ value: ALL, label: `Todos los activos (${verticals.length})` }, ...verticals.map((entry) => ({ value: entry.vertical, label: entry.vertical }))]} />
            </Field>
            <Field title="Antigüedad">
              <Choice ariaLabel="Antigüedad máxima de las noticias" value={settings.windowDays} onChange={(value) => set("windowDays", value)}
                options={[7, 14, 30, 60, 90].map((days) => ({ value: days, label: `${days} días` }))} />
            </Field>
          </div>
          {needsVertical ? <p className="-mt-2 text-xs text-amber-600 dark:text-amber-500">Elige un vertical: mandar un tema concreto a los {verticals.length} activos paga una búsqueda en cada uno.</p> : null}

          <div className="rounded-lg border border-border">
            <button type="button" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-medium">
              Opciones avanzadas
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                costo y rigor
                <ChevronDown className={cn("size-4 transition-transform duration-200 ease-out", advanced && "rotate-180")} />
              </span>
            </button>
            {advanced ? (
              <div className="space-y-4 border-t border-border px-3 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field title="Búsquedas" hint="Máximo por vertical.">
                    <Choice ariaLabel="Búsquedas máximas por vertical" value={settings.maxSearches} onChange={(value) => set("maxSearches", value)} options={[4, 6, 8, 12, 20].map((n) => ({ value: n, label: String(n) }))} />
                  </Field>
                  <Field title="Fuentes mínimas" hint="Medios distintos que lo confirman.">
                    <Choice ariaLabel="Fuentes independientes mínimas" value={settings.minSources} onChange={(value) => set("minSources", value)} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
                  </Field>
                </div>
                <Field title="Cuánto leer de cada fuente" hint="Es lo que más pesa en la factura.">
                  <Choice ariaLabel="Texto leído por fuente" value={settings.contextSize} onChange={(value) => set("contextSize", value)}
                    options={[{ value: "low", label: "Resumen · barato" }, { value: "medium", label: "Medio" }, { value: "high", label: "Completo · caro" }]} />
                </Field>
                <label className="flex items-start gap-2.5 text-[13px]">
                  <input type="checkbox" aria-label="Descartar fuentes no comprobadas" className="mt-0.5 size-4 accent-primary" checked={settings.verifySources} onChange={(event) => set("verifySources", event.target.checked)} />
                  <span>
                    Descartar fuentes no comprobadas
                    <span className="block text-xs text-muted-foreground">Si el modelo cita un medio que no salió en la búsqueda, se lo inventó.</span>
                  </span>
                </label>
                {models?.available.length ? (
                  <div className="grid grid-cols-2 gap-3">
                    {([["Modelo para investigar", "researchModel", models.research], ["Modelo para ordenar", "structuringModel", models.structuring]] as const).map(([title, key, fallback]) => (
                      <Field key={key} title={title}>
                        <Choice ariaLabel={title} value={settings[key] ?? CONFIGURED} onChange={(value) => set(key, value === CONFIGURED ? null : value)}
                          options={[{ value: CONFIGURED, label: `Por defecto (${fallback ?? "—"})` }, ...models.available.map((model) => ({ value: model.id, label: model.id }))]} />
                      </Field>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="sticky bottom-0 space-y-2 border-t border-border bg-background px-5 py-4">
          <Button className="w-full" disabled={!verticals.length || needsVertical} onClick={() => onScan(settings)}>
            <RadarIcon className="size-4" />{searching ? "Buscar este tema" : "Buscar novedades"}
          </Button>
          {canRestructure ? (
            <Button variant="ghost" className="w-full" onClick={() => onRestructure(settings)} title="Relee lo que encontró la última búsqueda con estos ajustes, sin buscar de nuevo.">
              <RotateCcw className="size-4" />Reinterpretar la última búsqueda (céntimos)
            </Button>
          ) : null}
          {!verticals.length ? (
            <p className="text-center text-xs text-muted-foreground">
              No hay verticales activos. <button type="button" onClick={onManageVerticals} className="font-medium text-primary underline-offset-4 hover:underline">Configurar verticales</button>
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
