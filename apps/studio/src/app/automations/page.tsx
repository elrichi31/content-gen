"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CalendarClock, CircleDollarSign, Clock, FileStack, History, Loader2, Pencil, Play, Plus, Radar, Trash2, Wallet } from "lucide-react";
import type { PublishingRule } from "@content-gen/domain/schedule";
import type { Automation } from "@/lib/carousel-automation-rules";
import type { AutomationExecution } from "@/lib/automation-execution";
import type { RadarAutomation } from "@/lib/radar-automation";
import { AutomationForm, describeRule, type Campaign } from "@/components/automations/automation-form";
import { BudgetPanel, costMoney, type BudgetStatus } from "@/components/automations/budget-panel";
import { AutomationSteps, ExecutionDetails, executionLabels, fullDate, relativeTime, RunStatusBadge, runTone, StatusDot, tones } from "@/components/automations/execution-details";
import { buildAutomationSteps, type StepAutomation } from "@/components/automations/automation-steps";
import { RadarAutomationForm } from "@/components/automations/radar-automation-form";
import type { BrandOption } from "@/components/brand-select";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Row = Automation & { nextSlot: { date: string; time: string } | null; horizonEnd: string; lastExecution: AutomationExecution | null };
type Item = { key: string; id: string; name: string; active: boolean; type: "carousel" | "radar"; next: string; lastExecution: AutomationExecution | null; config: StepAutomation; row: Row | RadarAutomation };
type Editor = { type: "carousel"; row: Row | null } | { type: "radar"; row: RadarAutomation | null } | { type: "budget" };
async function api(url: string, method = "GET", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { method, signal, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la acción. Intenta de nuevo.");
  return data;
}
function Stat({ icon: Icon, color, label, children }: { icon: typeof Clock; color: { soft: string; text: string; border: string }; label: string; children: React.ReactNode }) {
  return <div className={cn("flex min-w-0 items-start gap-2.5 rounded-lg border bg-background px-2.5 py-2", color.border)}><span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", color.soft)}><Icon aria-hidden className={cn("size-4", color.text)} /></span><div className="min-w-0 flex-1"><p className="text-[11px] text-muted-foreground">{label}</p>{children}</div></div>;
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
    ...(rows ?? []).map(row => ({ key: `carousel:${row.id}`, id: row.id, name: row.name, active: row.active, type: "carousel" as const, next: row.nextSlot ? `${row.nextSlot.date} · ${row.nextSlot.time}` : "Sin huecos libres", lastExecution: row.lastExecution, row, config: { id: row.id, kind: "carousel" as const, name: row.name, active: row.active, topics: row.topics, usedTopics: row.usedTopics, radarVertical: row.radarVertical, kindLabel: row.kind === "editable" ? "Editable" : "Imágenes IA", slides: row.slides, ruleLabel: ruleById.get(row.ruleId) ? describeRule(ruleById.get(row.ruleId)!) : "Pauta no disponible" } })),
    ...radars.map(row => ({ key: `radar:${row.id}`, id: row.id, name: row.name, active: row.active, type: "radar" as const, next: `${date(row.nextRunAt)} (hora local)`, lastExecution: row.lastExecution ?? null, row, config: { id: row.id, kind: "radar" as const, name: row.name, active: row.active, frequency: row.frequency, time: row.time, scan: row.scan } })),
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
  const latest = runs[0] ?? selected?.lastExecution ?? null;
  const failures = runs.filter(r => r.status === "failed" || r.status === "blocked");
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
          {rows === null ? <p role="status" className="p-3 text-sm text-muted-foreground">Cargando automatizaciones…</p> : filtered.length ? <ul className="space-y-1">{filtered.map(item => <li key={item.key}><button type="button" onClick={() => { setSelectedKey(item.key); setExecutionId(null); }} aria-pressed={selected?.key === item.key} className={cn("w-full rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected?.key === item.key ? "border-border bg-accent" : "border-transparent hover:bg-accent/60")}>
            <span className="flex items-center gap-2 text-sm font-medium">{item.type === "radar" ? <Radar className="size-4 shrink-0 text-violet-500" /> : <FileStack className="size-4 shrink-0 text-sky-500" />}<span className="truncate">{item.name}</span></span><span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">{item.type === "radar" ? "Búsqueda" : "Carrusel"} · <span className={item.active ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}>{item.active ? "Activa" : "Pausada"}</span></span><span className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">{item.lastExecution ? <><StatusDot status={item.lastExecution.status} /><span className={runTone[item.lastExecution.status].text}>{executionLabels[item.lastExecution.status]}</span> · <time dateTime={item.lastExecution.startedAt} title={fullDate(item.lastExecution.startedAt)}>{relativeTime(item.lastExecution.startedAt)}</time></> : "Nunca se ha ejecutado"}</span>
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
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border p-2.5 xl:grid-cols-4" aria-label="Resumen">
          <Stat icon={Clock} color={latest ? runTone[latest.status] : tones.zinc} label="Última ejecución">{latest ? <><p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold"><time dateTime={latest.startedAt}>{relativeTime(latest.startedAt)}</time><RunStatusBadge status={latest.status} /></p><p className="truncate text-[11px] tabular-nums text-muted-foreground">{fullDate(latest.startedAt)} · {latest.automatic ? "programada" : "manual"}</p></> : <p className="text-sm font-semibold">Nunca</p>}</Stat>
          <Stat icon={CalendarClock} color={selected.active ? tones.violet : tones.zinc} label="Próxima ejecución"><p className="truncate text-sm font-semibold">{selected.active ? selected.next : "Pausada"}</p><p className="text-[11px] text-muted-foreground">{selected.active ? "Automática" : "Solo ejecución manual"}</p></Stat>
          <Stat icon={Activity} color={!runs.length ? tones.zinc : failures.length ? tones.red : tones.emerald} label={`Últimas ${runs.length || ""} ejecuciones`}>{runs.length ? <><p className="text-sm font-semibold tabular-nums"><span className="text-emerald-600 dark:text-emerald-400">{runs.length - failures.length} ok</span> · <span className={failures.length ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{failures.length} con error</span></p><p className="mt-1 flex gap-0.5" aria-label="Estado de cada ejecución, de la más antigua a la más reciente">{[...runs].reverse().map(r => <span key={r.id} title={`${date(r.startedAt)} · ${executionLabels[r.status]}`} className={cn("h-2.5 w-1.5 rounded-sm", runTone[r.status].dot)} />)}</p></> : <p className="text-sm font-semibold">Sin historial</p>}</Stat>
          <Stat icon={CircleDollarSign} color={tones.amber} label="Costo · USD"><p className="text-sm font-semibold tabular-nums">{latest ? `${costMoney(latest.amount)}${latest.unknown ? " + pendiente" : ""}` : "—"}</p><p className="truncate text-[11px] tabular-nums text-muted-foreground">{runs.length ? `${costMoney(runs.reduce((sum, r) => sum + r.amount, 0))} en las últimas ${runs.length}` : "Última ejecución"}</p></Stat>
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[150px_minmax(0,1fr)] md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-1">
          <div className="min-h-0 overflow-y-auto overscroll-contain border-b border-border p-2 md:border-b-0 md:border-r" aria-label="Historial de ejecuciones">
            <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground"><History className="size-3.5" />Historial{busy?.id === selected.id ? <span role="status" className="ml-auto tabular-nums text-primary">Ejecutando · {Math.round((Date.now() - busy.since) / 1000)} s</span> : null}</p>{historyError ? <div role="alert" className="text-sm text-destructive">{historyError}<Button size="sm" variant="outline" className="mt-2" onClick={() => setRevision(v => v + 1)}>Reintentar</Button></div> : history?.id !== selectedId ? <p role="status" className="text-sm text-muted-foreground">Cargando historial…</p> : runs.length ? <ul className="space-y-0.5">{runs.map(r => <li key={r.id}><button type="button" aria-pressed={execution?.id === r.id} onClick={() => setExecutionId(r.id)} className={cn("w-full rounded-md border-l-2 px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", runTone[r.status].border, execution?.id === r.id ? "bg-accent" : "hover:bg-accent/60")}><span className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><StatusDot status={r.status} /><time dateTime={r.startedAt} className="tabular-nums font-medium">{date(r.startedAt)}</time></span><span className="tabular-nums text-muted-foreground">{costMoney(r.amount)}{r.unknown ? "+" : ""}</span></span><span className="mt-0.5 flex items-center justify-between gap-2 pl-3.5"><span className={runTone[r.status].text}>{executionLabels[r.status]}</span><span className="text-[11px] text-muted-foreground">{r.automatic ? "Prog." : "Manual"}</span></span>{r.error ? <span className="mt-0.5 line-clamp-1 block break-words pl-3.5 text-[11px] text-red-600/90 dark:text-red-400/90" title={r.error}>{r.error}</span> : null}</button></li>)}</ul> : <p className="text-sm text-muted-foreground">Sin ejecuciones registradas.</p>}
          </div>
          <div className="grid min-h-0 content-start gap-4 overflow-y-auto overscroll-contain p-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]" aria-label="Resultado de ejecución">
            <section className="min-w-0 space-y-2.5"><h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">{execution ? (execution.id === latest?.id ? "Última ejecución" : `Ejecución del ${date(execution.startedAt)}`) : "Ejecuciones"}{execution ? <RunStatusBadge status={execution.status} /> : null}</h3><ExecutionDetails execution={execution} /></section>
            <section className="min-w-0 space-y-2.5 rounded-lg border border-border bg-muted/20 p-3 xl:self-start"><div><h3 className="text-sm font-semibold">Pasos</h3><p className="text-[11px] text-muted-foreground">{execution ? "Qué hizo cada paso en esta ejecución." : "Cómo está configurada; aún no se ha ejecutado."}</p></div><AutomationSteps steps={buildAutomationSteps(selected.config, execution, budget)} /></section>
          </div>
        </div>
      </section> : <section className="flex min-h-0 items-center justify-center overflow-y-auto rounded-lg border border-border p-6"><div className="max-w-sm text-center"><History className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="text-base font-semibold">Todo lo que hacen tus automatizaciones</h2><p className="mt-2 text-sm text-muted-foreground">Programa búsquedas o prepara carruseles. Aquí verás cuándo corrieron, qué produjeron, cuánto costaron y cualquier error.</p></div></section>}
    </div>
    <Sheet open={Boolean(editor)} onOpenChange={open => { if (!open) setEditor(null); }}><SheetContent side="right" contentClassName="w-full sm:max-w-md" className="h-full min-h-0 gap-0 overflow-hidden p-0">
      {editor?.type === "budget" ? <><div className="shrink-0 border-b border-border p-5 pr-12"><SheetTitle>Presupuesto del estudio</SheetTitle></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"><BudgetPanel onSaved={setBudget} /></div></> : editor?.type === "radar" ? <RadarAutomationForm key={editor.row?.id ?? "new-radar"} editing={editor.row} verticals={verticals} onSubmit={save} onCancel={() => setEditor(null)} /> : editor?.type === "carousel" ? <AutomationForm key={editor.row?.id ?? "new-carousel"} editing={editor.row} rules={rules} campaigns={campaigns} brands={brands} verticals={verticals} onSubmit={save} onCancel={() => setEditor(null)} /> : null}
    </SheetContent></Sheet>
  </PageShell>;
}
