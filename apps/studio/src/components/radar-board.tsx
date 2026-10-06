"use client";

import type { RadarRun, RadarTopic, RadarTopicStatus, RadarWatchlistEntry } from "@content-gen/domain/radar";
import { Check, Inbox, Radar as RadarIcon, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeading } from "@/components/page-shell";
import { RadarWatchlist } from "@/components/radar-watchlist";
import { ScanSheet, type ScanSettings } from "@/components/radar/scan-sheet";
import { ACTIONS, formatGenerated, FORMAT_LABEL, scoreTone, TopicDetail } from "@/components/radar/topic-detail";
import { Button } from "@/components/ui/button";
import { Notice, noticeError, type NoticeState } from "@/components/ui/notice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Brand = { id: string; name: string };
type Payload = {
  topics: RadarTopic[];
  counts: Record<RadarTopicStatus, number>;
  verticals: string[];
  watchlist: RadarWatchlistEntry[];
  runs: RadarRun[];
  models?: { available: { id: string; inputPerMillion: number; outputPerMillion: number }[]; research: string | null; structuring: string | null };
  spend?: { month: string; amount: number; budget: number | null } | null;
  truncated?: boolean;
  error?: string;
};
type Sort = "score" | "recent" | "oldest";

const STATUS_TABS: { value: RadarTopicStatus; label: string }[] = [
  { value: "nuevo", label: "Por revisar" },
  { value: "guardado", label: "Guardados" },
  { value: "usado", label: "Usados" },
  { value: "descartado", label: "Descartados" },
];
const DONE_TEXT: Record<RadarTopicStatus, string> = { guardado: "Tema guardado", descartado: "Tema descartado", usado: "Tema marcado como usado", nuevo: "Tema devuelto a revisión" };
const EMPTY_TEXT: Record<RadarTopicStatus, string> = {
  nuevo: "No hay temas por revisar. Busca novedades y el radar traerá temas con fuentes.",
  guardado: "Nada guardado todavía. Guarda los temas que quieras producir.",
  usado: "Aún no se ha producido nada a partir del radar.",
  descartado: "No hay temas descartados.",
};
const ALL = "__all";

type RunSummary = { found: number; kept: number; repeated: number; rejected: number; insufficientSources: number; unverified?: number; overBudget?: boolean; failedVerticals?: string[]; searches?: { requested: number; performed: number } };
type Cost = { amount: number | null; currency: string } | null | undefined;
type Progress = { label: string; detail: string; step: number; steps: number };
type ScanEvent =
  | { type: "start"; verticals: string[]; steps: number }
  | { type: "research"; vertical: string; step: number; steps: number }
  | { type: "research-done"; vertical: string; searches: number; step: number; steps: number }
  | { type: "research-failed"; vertical: string; reason: string; step: number; steps: number }
  | { type: "structure"; step: number; steps: number }
  | { type: "saving"; step: number; steps: number }
  | { type: "done"; summary: RunSummary; run?: { cost?: Cost } }
  | { type: "error"; error: string };

/** Resultado de la búsqueda: lo que entró y, sobre todo, por qué se cayó el resto. */
function announce(summary: RunSummary, cost: Cost) {
  const detail = [
    `${summary.found} propuestos: ${summary.repeated} repetidos, ${summary.insufficientSources} sin corroborar, ${summary.rejected} mal formados.`,
    // Fuentes que no salieron de la búsqueda no son un tema flojo: son un tema inventado.
    summary.unverified ? `${summary.unverified} con fuentes que no aparecen en la investigación.` : "",
    summary.failedVerticals?.length ? `Fallaron: ${summary.failedVerticals.join(", ")}.` : "",
    summary.searches && summary.searches.performed > summary.searches.requested ? `Se pidieron ${summary.searches.requested} búsquedas y se hicieron ${summary.searches.performed}.` : "",
    cost?.amount != null ? `Costo: ${cost.amount} ${cost.currency}.` : "",
    summary.overBudget ? "El gasto del mes ya superó el presupuesto." : "",
  ].filter(Boolean).join(" ");
  const title = summary.kept ? `${summary.kept} ${summary.kept === 1 ? "tema nuevo" : "temas nuevos"} por revisar` : "La búsqueda no trajo temas nuevos";
  (summary.kept ? toast.success : toast)(title, { description: detail, duration: 12_000 });
}

/** Cada mensaje dice qué está pasando de verdad; ninguno se inventa para rellenar el silencio. */
function progressOf(event: ScanEvent): Progress {
  switch (event.type) {
    case "start": return { label: "Preparando la búsqueda", detail: `${event.verticals.length} vertical(es): ${event.verticals.join(", ")}`, step: 0, steps: event.steps };
    case "research": return { label: `Buscando en la web: ${event.vertical}`, detail: "Es el paso lento: puede tardar un par de minutos por vertical.", step: event.step - 1, steps: event.steps };
    case "research-done": return { label: `${event.vertical} listo`, detail: `${event.searches} búsqueda(s) realizadas.`, step: event.step, steps: event.steps };
    case "research-failed": return { label: `${event.vertical} falló`, detail: `${event.reason}. Sigue con el resto.`, step: event.step, steps: event.steps };
    case "structure": return { label: "Ordenando los hallazgos en temas", detail: "Sin buscar nada más: solo se interpreta lo encontrado.", step: event.step - 1, steps: event.steps };
    case "saving": return { label: "Comprobando fuentes y descartando repetidos", detail: "Se guardan solo los temas corroborados y nuevos.", step: event.step - 1, steps: event.steps };
    default: return { label: "Trabajando", detail: "", step: 0, steps: 1 };
  }
}

const elapsedText = (seconds: number) => seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function RadarBoard() {
  const [status, setStatus] = useState<RadarTopicStatus>("nuevo");
  const [vertical, setVertical] = useState("");
  const [sort, setSort] = useState<Sort>("score");
  const [data, setData] = useState<Payload | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<NoticeState>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  // El reloj corre aparte del progreso: entre dos pasos pasan minutos, y ver los segundos avanzar
  // es lo que distingue «trabajando» de «colgado».
  useEffect(() => {
    if (!scanning) { setElapsed(0); return; }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [scanning]);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ status, sort });
      if (vertical) query.set("vertical", vertical);
      const payload = await (await fetch(`/api/radar?${query}`, { cache: "no-store" })).json() as Payload;
      setData(payload);
      setSelectedId((current) => payload.topics?.some((topic) => topic.id === current) ? current : payload.topics?.[0]?.id ?? null);
    } catch {
      setData((current) => current ?? ({ error: "No se pudo leer el radar." } as Payload));
    }
  }, [status, vertical, sort]);
  useEffect(() => { void load(); }, [load]);
  // Las marcas solo sirven al editor de verticales: se piden una vez y que fallen no bloquea nada.
  useEffect(() => { void fetch("/api/brand-kits", { cache: "no-store" }).then((result) => result.json() as Promise<Brand[]>).then(setBrands).catch(() => setBrands([])); }, []);

  const topics = useMemo(() => data?.topics ?? [], [data]);
  const selected = topics.find((topic) => topic.id === selectedId) ?? null;
  const activeVerticals = data?.watchlist.filter((entry) => entry.active) ?? [];
  const lastRun = data?.runs[0];
  const canRestructure = Boolean(lastRun?.research?.length);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
  }, []);

  /** Cambio de estado al instante: el tema sale de la lista, se pasa al siguiente y queda «Deshacer». */
  const changeStatus = useCallback(async (topic: RadarTopic, to: RadarTopicStatus) => {
    const from = topic.status;
    const index = topics.findIndex((item) => item.id === topic.id);
    const remaining = topics.filter((item) => item.id !== topic.id);
    setData((current) => current && { ...current, topics: remaining, counts: { ...current.counts, [from]: Math.max(0, (current.counts[from] ?? 1) - 1), [to]: (current.counts[to] ?? 0) + 1 } });
    setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
    setMobileDetail(false);
    const patch = (next: RadarTopicStatus) => fetch(`/api/radar/topics/${topic.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    try {
      const response = await patch(to);
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setNotice(noticeError(result?.error ?? "No se pudo actualizar el tema."));
        return void load();
      }
      toast.success(DONE_TEXT[to], {
        description: topic.title,
        // Tiempo de sobra para arrepentirse: con los 4 s por defecto, «Deshacer» se va antes de leerlo.
        duration: 8000,
        action: { label: "Deshacer", onClick: () => void patch(from).then(() => { setSelectedId(topic.id); return load(); }) },
      });
    } catch {
      setNotice(noticeError("No se pudo contactar con el servidor. Comprueba que sigue en marcha."));
      void load();
    }
  }, [topics, load]);

  // Triaje con teclado: ↑/↓ (o J/K) mueve, y la letra de cada acción la ejecuta. Sin animación:
  // es lo que se repite decenas de veces seguidas.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || scanOpen || watchOpen || mobileDetail) return;
      const index = topics.findIndex((topic) => topic.id === selectedId);
      const key = event.key.toLowerCase();
      if (key === "arrowdown" || key === "j") { event.preventDefault(); select(topics[Math.min(index + 1, topics.length - 1)]?.id ?? null); }
      else if (key === "arrowup" || key === "k") { event.preventDefault(); select(topics[Math.max(index - 1, 0)]?.id ?? null); }
      else if (selected) {
        const action = ACTIONS[selected.status].find((item) => item.key?.toLowerCase() === key);
        if (action) { event.preventDefault(); void changeStatus(selected, action.to); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [topics, selectedId, selected, scanOpen, watchOpen, mobileDetail, select, changeStatus]);

  const scan = useCallback(async (settings: ScanSettings) => {
    setScanOpen(false);
    setScanning(true);
    setProgress(null);
    try {
      const response = await fetch("/api/radar/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxSearches: settings.maxSearches, minSources: settings.minSources, searchContextSize: settings.contextSize, verifySources: settings.verifySources, researchModel: settings.researchModel, structuringModel: settings.structuringModel, windowDays: settings.windowDays, focus: settings.focus.trim() || null, verticals: settings.vertical ? [settings.vertical] : [] }),
      });
      if (!response.body) { setNotice(noticeError("El servidor no devolvió progreso.")); return; }
      // La respuesta llega como server-sent events: cada evento es una línea `data: {...}`.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const payload = part.replace(/^data: /, "").trim();
          if (!payload) continue;
          let event: ScanEvent;
          try { event = JSON.parse(payload) as ScanEvent; } catch { continue; }
          if (event.type === "error") { setNotice(noticeError(event.error)); finished = true; continue; }
          if (event.type === "done") { finished = true; announce(event.summary, event.run?.cost); continue; }
          setProgress(progressOf(event));
        }
      }
      // Cortado sin `done`, la búsqueda puede seguir viva en el servidor: decirlo es más útil que darla por fallida.
      if (!finished) setNotice(noticeError("La conexión se cortó antes de terminar. La búsqueda puede haber seguido en el servidor: recarga en un rato."));
      // La revisión se lleva a donde cayeron los temas: buscar en un vertical y mirar otro es no ver lo que se pagó.
      setStatus("nuevo");
      setVertical(settings.vertical);
      await load();
    } catch {
      setNotice(noticeError("No se pudo completar la búsqueda."));
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [load]);

  /** Relee las notas de la última búsqueda con otros ajustes: buscar es lo caro y ya está pagado. */
  const restructure = useCallback(async (settings: ScanSettings) => {
    if (!lastRun) return;
    setScanOpen(false);
    setScanning(true);
    setProgress({ label: "Reinterpretando la última búsqueda", detail: "Sin buscar de nuevo: solo se releen las notas guardadas.", step: 0, steps: 1 });
    try {
      const response = await fetch(`/api/radar/runs/${lastRun.id}/restructure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minSources: settings.minSources, verifySources: settings.verifySources, structuringModel: settings.structuringModel }) });
      const result = await response.json() as { summary?: RunSummary; cost?: Cost; error?: string };
      if (!response.ok || !result.summary) return setNotice(noticeError(result.error ?? "No se pudo reinterpretar la búsqueda."));
      announce(result.summary, result.cost);
      setStatus("nuevo");
      await load();
    } catch {
      setNotice(noticeError("No se pudo contactar con el servidor."));
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [lastRun, load]);

  const overBudget = Boolean(data?.spend?.budget && data.spend.amount >= data.spend.budget);

  const header = (
    <PageHeading
      title="Radar"
      description="Busca en la web novedades de tus verticales y te propone temas con fuentes. Tú decides cuáles se producen."
      actions={(
        <>
          <Button variant="outline" onClick={() => setWatchOpen(true)}><SlidersHorizontal className="size-4" />Verticales<span className="tabular-nums text-muted-foreground">{activeVerticals.length}</span></Button>
          <Button onClick={() => setScanOpen(true)} disabled={scanning}><RadarIcon className="size-4" />{scanning ? "Buscando…" : "Buscar temas"}</Button>
        </>
      )}
    />
  );

  if (!data) return <>{header}<div className="h-96 animate-pulse rounded-xl border border-border bg-muted/30" aria-label="Cargando radar" /></>;
  if (data.error) return <>{header}<p className="text-[13px] text-destructive">{data.error}</p></>;

  return (
    <>
      {header}
      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      {/* Contexto de un vistazo: qué se buscó la última vez y cuánto se lleva gastado antes de gastar más. */}
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {lastRun ? (
          <span>
            Última búsqueda {formatGenerated(lastRun.startedAt)} · {lastRun.topicsKept} {lastRun.topicsKept === 1 ? "tema" : "temas"}
            {lastRun.focus ? ` · «${lastRun.focus}»` : ""}
            {lastRun.cost?.amount != null ? ` · ${lastRun.cost.amount} ${lastRun.cost.currency}` : ""}
          </span>
        ) : <span>Todavía no has buscado.</span>}
        {data.spend?.budget ? (
          <span className={cn(overBudget && "text-amber-600 dark:text-amber-400")}>
            Gasto de {data.spend.month}: <span className="tabular-nums">{data.spend.amount} de {data.spend.budget}</span>{overBudget ? " · sobre el presupuesto" : ""}
          </span>
        ) : null}
      </div>

      {!activeVerticals.length ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-[13px]"><span className="font-medium">No hay verticales activos.</span> <span className="text-muted-foreground">El radar necesita saber qué vigilar y qué vende la agencia en cada área.</span></p>
          <Button size="sm" variant="outline" onClick={() => setWatchOpen(true)}>Configurar verticales</Button>
        </div>
      ) : null}

      {scanning ? (
        <div className="mb-4 space-y-2 rounded-xl border border-border bg-card px-4 py-3 shadow-xs" role="status">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium">{progress?.label ?? "Preparando la búsqueda"}</p>
            <p className="text-xs tabular-nums text-muted-foreground">{progress ? `paso ${progress.step} de ${progress.steps} · ` : ""}{elapsedText(elapsed)}</p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${progress ? Math.max(4, Math.round((progress.step / progress.steps) * 100)) : 4}%` }} />
          </div>
          {progress?.detail ? <p className="text-xs text-muted-foreground">{progress.detail}</p> : null}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* En móvil las cuatro pestañas no caben: se desplazan en vez de cortarse. */}
        <Tabs value={status} onValueChange={(value) => setStatus(value as RadarTopicStatus)} className="max-w-full overflow-x-auto">
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}<span className="tabular-nums text-muted-foreground">{data.counts?.[tab.value] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          {data.verticals.length > 1 ? (
            <Select value={vertical || ALL} onValueChange={(value) => setVertical(value === ALL ? "" : value)}>
              <SelectTrigger aria-label="Filtrar por vertical" className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los verticales</SelectItem>
                {data.verticals.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
            <SelectTrigger aria-label="Ordenar" className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Mejor puntuación</SelectItem>
              <SelectItem value="recent">Más recientes</SelectItem>
              <SelectItem value="oldest">Más antiguos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {topics.length ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs lg:max-h-[calc(100dvh-15rem)] lg:overflow-y-auto" aria-label="Temas">
            {topics.map((topic) => {
              const active = topic.id === selectedId;
              const [primary, secondary] = ACTIONS[topic.status];
              return (
                <li key={topic.id} className="group relative">
                  <button
                    type="button"
                    ref={(node) => { if (node) rowRefs.current.set(topic.id, node); else rowRefs.current.delete(topic.id); }}
                    onClick={() => { setSelectedId(topic.id); if (window.matchMedia("(max-width: 1023px)").matches) setMobileDetail(true); }}
                    aria-current={active ? "true" : undefined}
                    className={cn("flex w-full gap-3 px-4 py-3 pr-20 text-left transition-colors duration-150", active ? "bg-accent" : "hover:bg-accent/50")}
                  >
                    <span className={cn("w-7 shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums", scoreTone(topic.score))}>{topic.score}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] font-medium leading-snug">{topic.title}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {topic.vertical} · {formatGenerated(topic.createdAt)} · {topic.formats.map((format) => FORMAT_LABEL[format.type] ?? format.type).join(", ")}
                      </span>
                    </span>
                  </button>
                  {/* Triaje sin abrir el detalle: aparecen al pasar por encima o en el tema seleccionado. */}
                  <span className={cn("absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100", active && "opacity-100")}>
                    <Button size="icon-sm" variant="outline" aria-label={`${primary.label}: ${topic.title}`} title={primary.label} onClick={() => void changeStatus(topic, primary.to)}><Check className="size-4" /></Button>
                    {secondary ? <Button size="icon-sm" variant="outline" aria-label={`${secondary.label}: ${topic.title}`} title={secondary.label} onClick={() => void changeStatus(topic, secondary.to)}><X className="size-4" /></Button> : null}
                  </span>
                </li>
              );
            })}
            {data.truncated ? <li className="px-4 py-3 text-xs text-muted-foreground">Hay más temas de los que caben aquí: filtra por vertical para ver el resto.</li> : null}
          </ul>

          <div className="hidden rounded-xl border border-border bg-card p-6 shadow-xs lg:block lg:max-h-[calc(100dvh-15rem)] lg:overflow-y-auto">
            {selected ? <TopicDetail topic={selected} onStatus={(topic, to) => void changeStatus(topic, to)} /> : null}
            <p className="mt-8 border-t border-border pt-3 text-xs text-muted-foreground">
              Atajos: <kbd className="font-sans">↑</kbd>/<kbd className="font-sans">↓</kbd> para moverte{selected && ACTIONS[selected.status].some((action) => action.key) ? `, ${ACTIONS[selected.status].filter((action) => action.key).map((action) => `${action.key} ${action.label.toLowerCase()}`).join(", ")}` : ""}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><Inbox className="size-5" strokeWidth={1.5} /></span>
          <p className="max-w-sm text-[13px] text-muted-foreground">{EMPTY_TEXT[status]}</p>
          {status === "nuevo" && activeVerticals.length ? <Button size="sm" onClick={() => setScanOpen(true)} disabled={scanning}><RadarIcon className="size-4" />Buscar temas</Button> : null}
        </div>
      )}

      {/* En móvil el detalle se abre encima de la lista. */}
      <Sheet open={mobileDetail && Boolean(selected)} onOpenChange={setMobileDetail}>
        <SheetContent side="right" contentClassName="w-full sm:max-w-lg" className="h-full overflow-y-auto p-5 pt-12">
          <SheetTitle className="sr-only">{selected?.title ?? "Tema"}</SheetTitle>
          {selected ? <TopicDetail topic={selected} onStatus={(topic, to) => void changeStatus(topic, to)} /> : null}
        </SheetContent>
      </Sheet>

      <ScanSheet open={scanOpen} onOpenChange={setScanOpen} verticals={activeVerticals} models={data.models} canRestructure={canRestructure} onScan={(settings) => void scan(settings)} onRestructure={(settings) => void restructure(settings)} onManageVerticals={() => { setScanOpen(false); setWatchOpen(true); }} />
      <RadarWatchlist open={watchOpen} onOpenChange={setWatchOpen} entries={data.watchlist} brands={brands} onChanged={load} />
    </>
  );
}
