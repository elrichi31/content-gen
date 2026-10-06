"use client";

import { useCallback, useEffect, useState } from "react";
import { FileStack, Loader2, Pencil, Play, Plus, Radar, Trash2, Wallet, Workflow } from "lucide-react";
import type { PublishingRule } from "@content-gen/domain/schedule";
import type { Automation } from "@/lib/carousel-automation-rules";
import type { AutomationExecution } from "@/lib/automation-execution";
import type { RadarAutomation } from "@/lib/radar-automation";
import { AutomationForm, describeRule, type Campaign } from "@/components/automations/automation-form";
import { AutomationFlow } from "@/components/automations/automation-flow";
import { BudgetPanel, costMoney, type BudgetStatus } from "@/components/automations/budget-panel";
import { ExecutionDetails, executionLabels } from "@/components/automations/execution-details";
import type { FlowAutomation } from "@/components/automations/flow-model";
import { RadarAutomationForm } from "@/components/automations/radar-automation-form";
import type { BrandOption } from "@/components/brand-select";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Row = Automation & { nextSlot: { date: string; time: string } | null; horizonEnd: string; lastExecution: AutomationExecution | null };
type Item = { key: string; id: string; name: string; active: boolean; type: "carousel" | "radar"; next: string; lastExecution: AutomationExecution | null; flow: FlowAutomation; row: Row | RadarAutomation };
type Editor = { type: "carousel"; row: Row | null } | { type: "radar"; row: RadarAutomation | null } | { type: "budget" };
async function api(url: string, method = "GET", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { method, signal, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la acción. Intenta de nuevo.");
  return data;
}
const date = (iso: string) => new Date(iso).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
export default function AutomationsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [radars, setRadars] = useState<RadarAutomation[]>([]);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [rules, setRules] = useState<PublishingRule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [verticals, setVerticals] = useState<string[]>([]);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [loadError, setLoadError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState<{ id: string; since: number } | null>(null);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<{ id: string; rows: AutomationExecution[]; error: string } | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [view, setView] = useState<"flow" | "history">("flow");
  const [, tick] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const [nextRows, nextRadars, nextBudget] = await Promise.all([api("/api/automations"), api("/api/radar/automations"), api("/api/budget")]);
      if (!Array.isArray(nextRows) || !Array.isArray(nextRadars) || !nextBudget?.settings) throw new Error("La respuesta del servidor está incompleta. Reintenta la carga.");
      setRows(nextRows); setRadars(nextRadars); setBudget(nextBudget); setLoadError(""); setRevision(v => v + 1);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "No se pudieron cargar las automatizaciones."); }
  }, []);
  const loadOptions = useCallback(async () => {
    try {
      const [r, c, b, w] = await Promise.all([api("/api/schedule/rules"), api("/api/campaigns"), api("/api/brand-kits"), api("/api/radar/watchlist")]);
      if (!Array.isArray(r) || !Array.isArray(c) || !Array.isArray(b) || !Array.isArray(w?.watchlist)) throw new Error("No se pudieron cargar las opciones de configuración.");
      setRules(r); setCampaigns(c); setBrands(b); setVerticals(w.watchlist.filter((v: { active: boolean }) => v.active).map((v: { vertical: string }) => v.vertical)); setOptionsError("");
    } catch (e) { setOptionsError(e instanceof Error ? e.message : "No se pudieron cargar las opciones."); }
  }, []);
  useEffect(() => { void refresh(); void loadOptions(); }, [refresh, loadOptions]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => tick(v => v + 1), 1000); return () => clearInterval(timer); }, [busy]);

  const ruleById = new Map(rules.map(r => [r.id, r]));
  const items: Item[] = [
    ...(rows ?? []).map(row => ({ key: `carousel:${row.id}`, id: row.id, name: row.name, active: row.active, type: "carousel" as const, next: row.nextSlot ? `${row.nextSlot.date} · ${row.nextSlot.time}` : "Sin huecos libres", lastExecution: row.lastExecution, row, flow: { id: row.id, kind: "carousel" as const, name: row.name, active: row.active, topics: row.topics, usedTopics: row.usedTopics, radarVertical: row.radarVertical, kindLabel: row.kind === "editable" ? "Editable" : "Imágenes IA", slides: row.slides, ruleLabel: ruleById.get(row.ruleId) ? describeRule(ruleById.get(row.ruleId)!) : "Pauta no disponible" } })),
    ...radars.map(row => ({ key: `radar:${row.id}`, id: row.id, name: row.name, active: row.active, type: "radar" as const, next: `${date(row.nextRunAt)} (hora local)`, lastExecution: row.lastExecution ?? null, row, flow: { id: row.id, kind: "radar" as const, name: row.name, active: row.active, frequency: row.frequency, time: row.time, scan: row.scan } })),
  ];
  const filtered = items.filter(i => i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = items.find(i => i.key === selectedKey) ?? items[0] ?? null;
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void api(`/api/automation-runs?automationId=${encodeURIComponent(selectedId)}`, "GET", undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) { if (!Array.isArray(data)) throw new Error("Historial incompleto."); setHistory({ id: selectedId, rows: data, error: "" }); } })
      .catch(e => { if (!controller.signal.aborted) setHistory({ id: selectedId, rows: [], error: e instanceof Error ? e.message : "No se pudo cargar el historial." }); });
    return () => controller.abort();
  }, [selectedId, revision]);
  const runs = history && history.id === selectedId ? history.rows : [];
  const execution = runs.find(r => r.id === executionId) ?? runs[0] ?? selected?.lastExecution ?? null;
  const historyError = history && history.id === selectedId ? history.error : "";
  const base = (item: Item) => item.type === "radar" ? "/api/radar/automations" : "/api/automations";
  async function attempt(work: () => Promise<void>) { setNotice(null); try { await work(); } catch (e) { setNotice(noticeError(e instanceof Error ? e.message : "No se pudo completar la acción.")); } }
  async function save(body: Record<string, unknown>) {
    if (!editor || editor.type === "budget") return;
    const url = editor.type === "radar" ? "/api/radar/automations" : "/api/automations";
    const saved = await api(editor.row ? `${url}/${editor.row.id}` : url, editor.row ? "PATCH" : "POST", body);
    setSelectedKey(`${editor.type}:${saved.id}`); setEditor(null); setNotice(noticeOk("Automatización guardada.")); await refresh();
  }
  const run = (item: Item) => attempt(async () => {
    if (!window.confirm(`Ejecutar «${item.name}» consume créditos de IA si hay trabajo pendiente. Es una ejecución manual: no la bloquea el presupuesto. ¿Continuar?`)) return;
    setBusy({ id: item.id, since: Date.now() }); setExecutionId(null);
    try { const result = await api(`${base(item)}/${item.id}/run`, "POST"); setNotice(noticeOk(result.message ?? "Ejecución completada.")); }
    finally { setBusy(null); await refresh(); }
  });
  const toggle = (item: Item) => attempt(async () => { await api(`${base(item)}/${item.id}`, "PATCH", { active: !item.active }); await refresh(); });
  const remove = (item: Item) => attempt(async () => { if (!window.confirm(`¿Borrar «${item.name}»? El contenido y los costos registrados se conservarán.`)) return; await api(`${base(item)}/${item.id}`, "DELETE"); await refresh(); });

  return <PageShell className="flex max-w-none flex-col overflow-hidden">
    <PageHeading title="Automatizaciones" description="Búsquedas del radar y carruseles en borrador. Revisa cada ejecución; nada se publica solo." actions={<><Button variant="outline" onClick={() => setEditor({ type: "budget" })}><Wallet className="size-4" />Presupuesto</Button><Button variant="outline" onClick={() => setEditor({ type: "radar", row: null })} disabled={Boolean(optionsError)}><Radar className="size-4" />Automatizar radar</Button><Button onClick={() => setEditor({ type: "carousel", row: null })} disabled={Boolean(optionsError)}><Plus className="size-4" />Nuevo carrusel</Button></>} />
    {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
    {loadError || optionsError ? <div role="alert" className="mb-3 flex shrink-0 flex-wrap items-center gap-2 text-sm text-destructive"><p>{loadError || optionsError}</p><Button variant="outline" size="sm" onClick={() => { void refresh(); void loadOptions(); }}>Reintentar</Button></div> : null}
    <div className="grid min-h-0 flex-1 grid-rows-[170px_minmax(0,1fr)] gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-1">
      <section aria-label="Lista de automatizaciones" className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="shrink-0 border-b border-border p-3"><Input aria-label="Buscar automatizaciones" placeholder="Buscar automatizaciones" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {rows === null ? <p role="status" className="p-3 text-sm text-muted-foreground">Cargando automatizaciones…</p> : filtered.length ? <ul className="space-y-1">{filtered.map(item => <li key={item.key}><button type="button" onClick={() => { setSelectedKey(item.key); setExecutionId(null); }} aria-pressed={selected?.key === item.key} className={cn("w-full rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected?.key === item.key ? "border-border bg-accent" : "border-transparent hover:bg-accent/60")}>
            <span className="flex items-center gap-2 text-sm font-medium">{item.type === "radar" ? <Radar className="size-4 shrink-0 text-muted-foreground" /> : <FileStack className="size-4 shrink-0 text-muted-foreground" />}<span className="truncate">{item.name}</span></span><span className="mt-1 block text-xs text-muted-foreground">{item.type === "radar" ? "Búsqueda" : "Carrusel"} · {item.active ? "Activa" : "Pausada"}</span><span className="mt-1 block text-xs tabular-nums text-muted-foreground">{item.lastExecution ? `${executionLabels[item.lastExecution.status]} · ${costMoney(item.lastExecution.amount)}${item.lastExecution.unknown ? " + pendiente" : ""}` : "Sin ejecuciones registradas"}</span>
          </button></li>)}</ul> : <p className="p-3 text-sm text-muted-foreground">{items.length ? "Sin coincidencias." : "Crea una búsqueda o un carrusel para empezar."}</p>}
        </div>
      </section>
      {selected ? <section aria-label="Detalle de automatización" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border p-3 sm:p-4"><div className="min-w-0"><h2 className="break-words text-base font-semibold">{selected.name}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.active ? `Próximo: ${selected.next}` : "Pausada · ejecución manual disponible"}</p></div><div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" disabled={Boolean(busy) || selected.lastExecution?.status === "running"} onClick={() => void run(selected)}>{busy?.id === selected.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}Ejecutar</Button>
          <Button size="sm" variant="ghost" onClick={() => void toggle(selected)} disabled={Boolean(busy)}>{selected.active ? "Pausar" : "Activar"}</Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Editar ${selected.name}`} disabled={Boolean(busy)} onClick={() => setEditor(selected.type === "radar" ? { type: "radar", row: selected.row as RadarAutomation } : { type: "carousel", row: selected.row as Row })}><Pencil className="size-4" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Borrar ${selected.name}`} disabled={Boolean(busy) || selected.lastExecution?.status === "running"} onClick={() => void remove(selected)}><Trash2 className="size-4" /></Button>
        </div></div>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2"><Button size="sm" variant={view === "flow" ? "secondary" : "ghost"} aria-pressed={view === "flow"} onClick={() => setView("flow")}><Workflow className="size-3.5" />Flujo</Button><Button size="sm" variant={view === "history" ? "secondary" : "ghost"} aria-pressed={view === "history"} onClick={() => setView("history")}>Ejecuciones</Button>{busy?.id === selected.id ? <span role="status" className="ml-auto text-xs tabular-nums text-primary">Ejecutando · {Math.round((Date.now() - busy.since) / 1000)} s</span> : null}</div>
        {view === "flow" ? <div className="relative min-h-0 flex-1"><AutomationFlow automation={selected.flow} execution={execution} budget={budget} /><p className="absolute bottom-3 right-3 max-w-[60%] rounded bg-card/90 px-2 py-1 text-right text-xs text-muted-foreground">{execution ? "Estado de la ejecución seleccionada" : "Configuración · aún no ejecutada"} · usa + para ampliar</p></div> : <div className="grid min-h-0 flex-1 grid-rows-[140px_minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-1">
          <div className="min-h-0 overflow-y-auto overscroll-contain border-b border-border p-3 md:border-b-0 md:border-r" aria-label="Historial de ejecuciones">
            <p className="mb-2 text-xs text-muted-foreground">Últimas 20 ejecuciones</p>{historyError ? <div role="alert" className="text-sm text-destructive">{historyError}<Button size="sm" variant="outline" className="mt-2" onClick={() => setRevision(v => v + 1)}>Reintentar</Button></div> : history?.id !== selectedId ? <p role="status" className="text-sm text-muted-foreground">Cargando historial…</p> : runs.length ? <ul className="space-y-1">{runs.map(r => <li key={r.id}><button type="button" aria-pressed={execution?.id === r.id} onClick={() => setExecutionId(r.id)} className={cn("w-full rounded-md p-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", execution?.id === r.id ? "bg-accent" : "hover:bg-accent/60")}><time dateTime={r.startedAt} className="block tabular-nums">{date(r.startedAt)}</time><span className="mt-1 block">{executionLabels[r.status]}</span><span className="mt-1 block tabular-nums text-muted-foreground">{costMoney(r.amount)}{r.unknown ? " + pendiente" : ""}</span></button></li>)}</ul> : <p className="text-sm text-muted-foreground">Sin ejecuciones registradas.</p>}
          </div><div className="min-h-0 overflow-y-auto overscroll-contain p-4" aria-label="Resultado de ejecución"><ExecutionDetails execution={execution} /></div>
        </div>}
      </section> : <section className="flex min-h-0 items-center justify-center overflow-y-auto rounded-lg border border-border p-6"><div className="max-w-sm text-center"><Workflow className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="text-base font-semibold">Tu operación, en un flujo</h2><p className="mt-2 text-sm text-muted-foreground">Programa búsquedas o prepara carruseles. Aquí verás presupuesto, pasos y resultados de cada automatización.</p></div></section>}
    </div>
    <Sheet open={Boolean(editor)} onOpenChange={open => { if (!open) setEditor(null); }}><SheetContent side="right" contentClassName="w-full sm:max-w-md" className="h-full min-h-0 gap-0 overflow-hidden p-0">
      {editor?.type === "budget" ? <><div className="shrink-0 border-b border-border p-5 pr-12"><SheetTitle>Presupuesto del estudio</SheetTitle></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"><BudgetPanel onSaved={setBudget} /></div></> : editor?.type === "radar" ? <RadarAutomationForm key={editor.row?.id ?? "new-radar"} editing={editor.row} verticals={verticals} onSubmit={save} onCancel={() => setEditor(null)} /> : editor?.type === "carousel" ? <AutomationForm key={editor.row?.id ?? "new-carousel"} editing={editor.row} rules={rules} campaigns={campaigns} brands={brands} verticals={verticals} onSubmit={save} onCancel={() => setEditor(null)} /> : null}
    </SheetContent></Sheet>
  </PageShell>;
}
