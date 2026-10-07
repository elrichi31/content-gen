"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Usage } from "@content-gen/domain/cost";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { money, OPERATION_LABEL, PROVIDER_LABEL } from "@/lib/cost-labels";

export type Piece = { contentItemId: string; runs: number; total: number; title: string; type: string | null };
type Run = { id: string; operation: string; provider: string; model: string | null; status: string; createdAt: string; amount: number | null; durationMs: number | null; usage: Usage | null; error: string | null };
type OperationGroup = { operation: string; runs: number; failed: number; untariffed: number; total: number; usage: Usage; models: string[] };
type Detail = {
  contentItemId: string; type: string | null; title: string; createdAt: string | null; currency: string;
  totals: { amount: number; runs: number; failed: number; untariffed: number };
  operations: OperationGroup[]; runs: Run[]; error?: string;
};

const TYPE_LABEL: Record<string, string> = { carousel: "Carrusel", video: "Video", ad: "Anuncio", article: "Artículo" };
const TYPES = ["all", "carousel", "video", "ad", "article"] as const;
// Colores fijos por posición para la barra de reparto; se repiten si hay más operaciones.
const SEGMENT = ["bg-primary", "bg-sky-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-teal-500", "bg-orange-500", "bg-slate-500"];

/** Lo consumido en las unidades en que se cobra: «12.4k tokens · 7 imágenes · 830 caracteres». */
function usageText(usage: Usage | null) {
  if (!usage) return "—";
  const compact = (value: number) => value >= 1000 ? `${(value / 1000).toLocaleString("es", { maximumFractionDigits: 1 })}k` : value.toLocaleString("es");
  const parts = [
    usage.inputTokens + usage.outputTokens ? `${compact(usage.inputTokens)} entrada / ${compact(usage.outputTokens)} salida` : "",
    usage.webSearchCalls ? `${usage.webSearchCalls} búsquedas` : "",
    usage.images ? `${usage.images} ${usage.images === 1 ? "imagen" : "imágenes"}` : "",
    usage.characters ? `${compact(usage.characters)} caracteres` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

const when = (iso: string) => new Date(iso).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Cuánto costó cada pieza y en qué se fue el dinero. La lista es del mes; al abrir una pieza se
 * carga su desglose completo (de toda su vida), para ver el costo real de un video o carrusel.
 */
export function CostPieces({ pieces, currency }: { pieces: Piece[]; currency: string }) {
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const present = TYPES.filter((item) => item === "all" || pieces.some((piece) => piece.type === item));
  const filtered = pieces.filter((piece) => type === "all" || piece.type === type);
  const visible = showAll ? filtered : filtered.slice(0, 12);
  const sum = filtered.reduce((total, piece) => total + piece.total, 0);

  return (
    <Card className="min-w-0 py-0">
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Costo por pieza</h2>
            <p className="mt-1 text-xs text-muted-foreground">Lo que gastó cada carrusel, video, anuncio o artículo este mes. Ábrelo para ver el desglose completo: guion, imágenes, voz, caption…</p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por tipo">
            {present.map((item) => (
              <Button key={item} size="sm" variant={type === item ? "secondary" : "ghost"} aria-pressed={type === item} onClick={() => { setType(item); setOpen(null); }}>
                {item === "all" ? "Todas" : TYPE_LABEL[item]}
              </Button>
            ))}
          </div>
        </div>

        {filtered.length ? (
          <>
            <p className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "pieza" : "piezas"} · <span className="tabular-nums">{money(Math.round(sum * 1e6) / 1e6, currency)}</span> en el mes · promedio <span className="tabular-nums">{money(Math.round((sum / filtered.length) * 1e6) / 1e6, currency)}</span></p>
            <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
              {visible.map((piece) => {
                const expanded = open === piece.contentItemId;
                return (
                  <li key={piece.contentItemId}>
                    <button type="button" onClick={() => setOpen(expanded ? null : piece.contentItemId)} aria-expanded={expanded}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-muted/40">
                      <Badge variant="outline" className="w-20 shrink-0 justify-center text-[10px]">{piece.type ? TYPE_LABEL[piece.type] ?? piece.type : "Eliminada"}</Badge>
                      <span className="min-w-0 flex-1 truncate">{piece.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground"><span className="tabular-nums">{piece.runs}</span> op</span>
                      <span className="w-28 shrink-0 text-right font-semibold tabular-nums">{money(piece.total, currency)}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded ? <PieceDetail contentItemId={piece.contentItemId} monthTotal={piece.total} /> : null}
                  </li>
                );
              })}
            </ul>
            {filtered.length > 12 ? <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "Ver menos" : `Ver las ${filtered.length}`}</Button> : null}
          </>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">Sin piezas con gasto este mes.</p>}
      </CardContent>
    </Card>
  );
}

function PieceDetail({ contentItemId, monthTotal }: { contentItemId: string; monthTotal: number }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/costs/items/${encodeURIComponent(contentItemId)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as Detail;
        if (!response.ok || body.error) throw new Error(body.error ?? "No se pudo leer el desglose.");
        setDetail(body);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "No se pudo leer el desglose.");
      }
    })();
    return () => controller.abort();
  }, [contentItemId]);

  if (error) return <p className="px-3 pb-3 text-xs text-destructive">{error}</p>;
  if (!detail) return <p className="flex items-center gap-2 px-3 pb-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando desglose…</p>;

  const { currency, totals } = detail;
  const share = (amount: number) => totals.amount > 0 ? amount / totals.amount : 0;

  return (
    <div className="space-y-4 border-t border-border/50 bg-muted/20 px-3 py-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Costo total de la pieza", money(totals.amount, currency)],
          ["Este mes", money(monthTotal, currency)],
          ["Operaciones", `${totals.runs}${totals.failed ? ` · ${totals.failed} con error` : ""}`],
          ["Creada", detail.createdAt ? new Date(detail.createdAt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {totals.untariffed ? <p className="text-xs text-amber-600 dark:text-amber-500">{totals.untariffed} operaciones no tienen importe: el total es un mínimo.</p> : null}

      {totals.amount > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">En qué se fue el dinero</p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {detail.operations.filter((group) => group.total > 0).map((group, index) => (
              <div key={group.operation} className={SEGMENT[index % SEGMENT.length]} style={{ width: `${share(group.total) * 100}%` }} title={`${OPERATION_LABEL[group.operation] ?? group.operation}: ${money(group.total, currency)}`} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Concepto</th>
              <th className="py-2 pr-3 text-right font-medium">Veces</th>
              <th className="py-2 pr-3 font-medium">Consumo</th>
              <th className="py-2 pr-3 text-right font-medium">Costo</th>
              <th className="py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {detail.operations.map((group, index) => (
              <tr key={group.operation} className="border-b border-border/30 last:border-0 align-top">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${group.total > 0 ? SEGMENT[detail.operations.filter((item) => item.total > 0).indexOf(group) % SEGMENT.length] : "bg-muted-foreground/30"}`} />
                    {OPERATION_LABEL[group.operation] ?? group.operation}
                  </span>
                  <span className="ml-4 block text-[11px] text-muted-foreground">{group.models.map((model) => PROVIDER_LABEL[model] ?? model).join(", ")}</span>
                  {group.failed ? <Badge variant="outline" className="ml-4 mt-1 text-[10px]">{group.failed} con error</Badge> : null}
                  {group.untariffed ? <Badge variant="outline" className="ml-2 mt-1 text-[10px]">{group.untariffed} sin tarifa</Badge> : null}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{group.runs}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">{usageText(group.usage)}</td>
                <td className="py-2 pr-3 text-right font-medium tabular-nums">{money(group.total, currency)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{totals.amount > 0 ? `${Math.round(share(group.total) * 100)}%` : "—"}</td>
              </tr>
            ))}
            <tr className="border-t border-border/60 font-semibold">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right tabular-nums">{totals.runs}</td>
              <td className="py-2 pr-3" />
              <td className="py-2 pr-3 text-right tabular-nums">{money(totals.amount, currency)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{totals.amount > 0 ? "100%" : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">Ver cada operación ({detail.runs.length})</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {detail.runs.map((run) => (
            <li key={run.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-3 rounded-md px-2 py-1 odd:bg-card">
              <span className="tabular-nums text-muted-foreground">{when(run.createdAt)}</span>
              <span className="min-w-0 truncate">
                {OPERATION_LABEL[run.operation] ?? run.operation}
                <span className="text-muted-foreground"> · {run.model ?? PROVIDER_LABEL[run.provider] ?? run.provider} · {usageText(run.usage)}</span>
                {run.status === "failed" ? <span className="text-destructive" title={run.error ?? undefined}> · error</span> : run.status === "running" ? <span className="text-muted-foreground"> · en curso</span> : null}
              </span>
              <span className="text-right tabular-nums">{run.amount === null ? "sin importe" : money(run.amount, currency)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
