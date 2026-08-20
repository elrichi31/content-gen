"use client";

import type { RadarRun, RadarTopic, RadarTopicStatus, RadarWatchlistEntry } from "@content-gen/domain/radar";
import { AlertTriangle, ExternalLink, RefreshCw, RotateCcw, Wand2, Radar as RadarIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadarWatchlist } from "@/components/radar-watchlist";

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

const STATUS_TABS: { value: RadarTopicStatus; label: string }[] = [
  { value: "nuevo", label: "Por revisar" },
  { value: "guardado", label: "Guardados" },
  { value: "usado", label: "Usados" },
  { value: "descartado", label: "Descartados" },
];

const FORMAT_LABEL: Record<string, string> = { carousel: "Carrusel", video: "Video", article: "Artículo" };

/** Dónde se produce cada formato. El tema viaja como `?topic=` y el generador lo resuelve. */
const FORMAT_ROUTE: Record<string, string> = { carousel: "/carousel", video: "/video", article: "/articles" };

/** Acciones disponibles según el estado actual, en el mismo orden que la máquina de estados. */
const ACTIONS: Record<RadarTopicStatus, { to: RadarTopicStatus; label: string; variant?: "outline" | "ghost" }[]> = {
  nuevo: [{ to: "guardado", label: "Guardar" }, { to: "descartado", label: "Descartar", variant: "ghost" }],
  guardado: [{ to: "usado", label: "Marcar usado" }, { to: "descartado", label: "Descartar", variant: "ghost" }],
  descartado: [{ to: "guardado", label: "Rescatar", variant: "outline" }],
  usado: [{ to: "guardado", label: "Volver a guardados", variant: "outline" }],
};

/** Resumen de la corrida: lo guardado y, sobre todo, por qué se cayó el resto. */
function summaryText(summary: RunSummary, cost?: { amount: number | null; currency: string } | null) {
  return [
    `Corrida terminada: ${summary.kept} temas nuevos de ${summary.found} propuestos.`,
    `Descartados: ${summary.repeated} repetidos, ${summary.insufficientSources} sin corroborar, ${summary.rejected} mal formados.`,
    // Se dice aparte: significa que el modelo escribió fuentes que no salieron de la búsqueda, y
    // eso no es un tema flojo, es un tema inventado.
    summary.unverified ? `${summary.unverified} con fuentes que no aparecen en la investigación.` : "",
    summary.failedVerticals?.length ? `Verticales fallidos: ${summary.failedVerticals.length}.` : "",
    // El tope de búsquedas es una petición al modelo, no un límite de la API: cuando se lo salta
    // conviene saberlo, porque es donde se va la factura.
    summary.searches && summary.searches.performed > summary.searches.requested
      ? `Se pidieron ${summary.searches.requested} búsquedas y se hicieron ${summary.searches.performed}.`
      : "",
    cost?.amount != null ? `Costo: ${cost.amount} ${cost.currency}.` : "",
    summary.overBudget ? "Aviso: el gasto del mes ya superó el presupuesto." : "",
  ].filter(Boolean).join(" ");
}

type Progress = { label: string; detail: string; step: number; steps: number };

type ScanEvent =
  | { type: "start"; verticals: string[]; steps: number }
  | { type: "research"; vertical: string; step: number; steps: number }
  | { type: "research-done"; vertical: string; searches: number; step: number; steps: number }
  | { type: "research-failed"; vertical: string; reason: string; step: number; steps: number }
  | { type: "structure"; step: number; steps: number }
  | { type: "saving"; step: number; steps: number }
  | { type: "done"; summary: RunSummary; run?: { cost?: { amount: number | null; currency: string } | null } }
  | { type: "error"; error: string };

type RunSummary = {
  found: number;
  kept: number;
  repeated: number;
  rejected: number;
  insufficientSources: number;
  unverified?: number;
  overBudget?: boolean;
  failedVerticals?: string[];
  searches?: { requested: number; performed: number };
};

/** Cada mensaje dice qué está pasando de verdad; ninguno se inventa para rellenar el silencio. */
function progressOf(event: ScanEvent): Progress {
  switch (event.type) {
    case "start":
      return { label: "Preparando la corrida", detail: `${event.verticals.length} vertical(es): ${event.verticals.join(", ")}`, step: 0, steps: event.steps };
    case "research":
      return { label: `Buscando en la web: ${event.vertical}`, detail: "Es el paso lento: puede tardar un par de minutos por vertical.", step: event.step - 1, steps: event.steps };
    case "research-done":
      return { label: `${event.vertical} listo`, detail: `${event.searches} búsqueda(s) realizadas.`, step: event.step, steps: event.steps };
    case "research-failed":
      return { label: `${event.vertical} falló`, detail: `${event.reason}. La corrida continúa con el resto.`, step: event.step, steps: event.steps };
    case "structure":
      return { label: "Ordenando los hallazgos en temas", detail: "Sin buscar nada más: solo se interpreta lo ya encontrado.", step: event.step - 1, steps: event.steps };
    case "saving":
      return { label: "Comprobando fuentes y descartando repetidos", detail: "Se guardan solo los temas corroborados y nuevos.", step: event.step - 1, steps: event.steps };
    default:
      return { label: "Trabajando", detail: "", step: 0, steps: 1 };
  }
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

function scoreTone(score: number) {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-500";
  if (score >= 40) return "text-amber-600 dark:text-amber-500";
  return "text-muted-foreground";
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

/**
 * Cuándo lo trajo el radar. Se prefiere lo relativo mientras es reciente —que es cuando importa si
 * un tema es de esta corrida o de la anterior— y la fecha exacta a partir de ahí.
 */
function formatGenerated(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) return `hace ${Math.floor(minutes / 60)} h`;
  if (minutes < 7 * 24 * 60) return `hace ${Math.floor(minutes / (24 * 60))} d`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

function relativeDate(value: string | null) {
  if (!value) return "sin fecha";
  const days = Math.floor((Date.now() - Date.parse(`${value}T00:00:00.000Z`)) / 86_400_000);
  if (!Number.isFinite(days)) return value;
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return value;
}

export function RadarBoard() {
  const [status, setStatus] = useState<RadarTopicStatus>("nuevo");
  const [vertical, setVertical] = useState<string>("");
  const [sort, setSort] = useState<"score" | "recent" | "oldest">("score");
  const [data, setData] = useState<Payload | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Los dos controles que deciden el gasto y la fiabilidad. Se exponen porque el usuario los va a
  // querer mover según lo que le cueste la semana, no una vez al configurar.
  const [maxSearches, setMaxSearches] = useState(8);
  const [minSources, setMinSources] = useState(2);
  const [contextSize, setContextSize] = useState<"low" | "medium" | "high">("low");
  // Encendida por defecto: una fuente inventada es peor que ninguna. Se puede apagar para ver qué
  // está tirando el filtro, que es la única forma de saber si se está pasando de estricto.
  const [verifySources, setVerifySources] = useState(true);
  // Nulo significa «el que venga configurado»; el usuario solo lo fija si quiere cambiarlo.
  const [researchModel, setResearchModel] = useState<string | null>(null);
  const [structuringModel, setStructuringModel] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [lastRunHasNotes, setLastRunHasNotes] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // El reloj corre aparte del progreso: entre dos pasos pueden pasar noventa segundos, y ver los
  // segundos avanzar es lo que distingue «trabajando» de «colgado» cuando la barra no se mueve.
  useEffect(() => {
    if (!scanning) { setElapsed(0); return; }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [scanning]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ status, sort });
      if (vertical) query.set("vertical", vertical);
      const response = await fetch(`/api/radar?${query}`, { cache: "no-store" });
      const payload = await response.json() as Payload;
      setData(payload);
      // Solo las corridas posteriores a la data cruda guardan notas; sin ellas no hay qué releer.
      const previous = payload.runs?.[0];
      setLastRunId(previous?.id ?? null);
      setLastRunHasNotes(Boolean(previous?.research?.length));
      // Las marcas son para el selector del editor; que fallen no debe impedir revisar temas.
      setBrands(await fetch("/api/brand-kits", { cache: "no-store" }).then((result) => result.json() as Promise<Brand[]>).catch(() => []));
    } catch {
      setData({ error: "No se pudo leer el radar." } as Payload);
    } finally {
      setLoading(false);
    }
  }, [status, vertical, sort]);

  useEffect(() => { void load(); }, [load]);

  const scan = useCallback(async () => {
    setScanning(true);
    setNotice(null);
    setProgress(null);
    try {
      const response = await fetch("/api/radar/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxSearches, minSources, searchContextSize: contextSize, verifySources, researchModel, structuringModel }) });
      if (!response.body) { setNotice("El servidor no devolvió progreso."); return; }

      // La respuesta llega como server-sent events: cada evento es una línea `data: {...}`.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        // El último trozo puede llegar a medias: se guarda para completarlo con lo que venga.
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const payload = part.replace(/^data: /, "").trim();
          if (!payload) continue;
          let event: ScanEvent;
          try { event = JSON.parse(payload) as ScanEvent; }
          catch { continue; }

          if (event.type === "error") { setNotice(event.error); finished = true; continue; }
          if (event.type === "done") {
            finished = true;
            // El costo llega con la corrida: verlo al terminar es lo que permite decidir si la
            // siguiente se lanza igual, y no tener que ir a buscarlo a la pantalla de costos.
            setNotice(summaryText(event.summary, event.run?.cost));
            continue;
          }
          setProgress(progressOf(event));
        }
      }
      // Si el flujo se corta sin `done`, la corrida puede seguir viva en el servidor: decirlo
      // es más útil que dar por fallido algo que quizá terminó bien.
      if (!finished) setNotice("La conexión se cortó antes de terminar. La corrida puede haber seguido en el servidor: actualiza para comprobarlo.");
      setStatus("nuevo");
      await load();
    } catch {
      setNotice("No se pudo completar la corrida.");
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [load, maxSearches, minSources, contextSize, verifySources, researchModel, structuringModel]);

  /**
   * Vuelve a interpretar las notas de la última corrida con los ajustes actuales. Buscar es el
   * ~80% del gasto y ya está pagado, así que rescatar una corrida que no dio temas cuesta
   * céntimos en vez de repetirla entera.
   */
  const restructure = useCallback(async () => {
    if (!lastRunId) return;
    setScanning(true);
    setNotice(null);
    setProgress({ label: "Reinterpretando lo ya encontrado", detail: "Sin buscar de nuevo: solo se vuelven a leer las notas guardadas.", step: 0, steps: 1 });
    try {
      const response = await fetch(`/api/radar/runs/${lastRunId}/restructure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minSources, verifySources, structuringModel }),
      });
      const result = await response.json() as { summary?: RunSummary; cost?: { amount: number | null; currency: string } | null; error?: string };
      if (!response.ok || !result.summary) { setNotice(result.error ?? "No se pudo reinterpretar la corrida."); return; }
      setNotice(summaryText(result.summary, result.cost));
      setStatus("nuevo");
      await load();
    } catch {
      setNotice("No se pudo contactar con el servidor.");
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [lastRunId, minSources, verifySources, structuringModel, load]);

  const changeStatus = useCallback(async (id: string, next: RadarTopicStatus) => {
    try {
      const response = await fetch(`/api/radar/topics/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setNotice(result?.error ?? "No se pudo actualizar el tema.");
        return;
      }
      await load();
    } catch {
      // `fetch` rechaza cuando no hay servidor al otro lado. Sin capturarlo, el fallo sube hasta
      // el overlay de Next y parece un error de la aplicación en vez de una caída de conexión.
      setNotice("No se pudo contactar con el servidor. Comprueba que sigue en marcha y vuelve a intentarlo.");
    }
  }, [load]);

  if (loading && !data) return <p className="text-sm text-muted-foreground">Cargando radar…</p>;
  if (!data || data.error) return <p className="text-sm text-destructive">{data?.error ?? "No se pudo leer el radar."}</p>;

  const activeVerticals = data.watchlist.filter((entry) => entry.active);
  const lastRun = data.runs[0];
  const overBudget = Boolean(data.spend?.budget && data.spend.amount >= data.spend.budget);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void scan()} disabled={scanning || !activeVerticals.length}>
          <RadarIcon className="h-4 w-4" /> {scanning ? "Buscando…" : "Correr ahora"}
        </Button>
        {lastRunHasNotes ? (
          <Button variant="outline" onClick={() => void restructure()} disabled={scanning} title="Relee las notas de la última corrida con los ajustes actuales. No vuelve a buscar, así que cuesta céntimos.">
            <RotateCcw className="h-4 w-4" /> Reinterpretar la última
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Búsquedas máx.
          <select
            className="rounded-md border border-border/60 bg-background px-1.5 py-1 text-xs"
            value={maxSearches}
            aria-label="Búsquedas máximas por vertical"
            onChange={(event) => setMaxSearches(Number(event.target.value))}
            title="Lo que más encarece la corrida son los tokens del contenido buscado, no las búsquedas en sí."
          >
            {[4, 6, 8, 12, 20].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Fuentes mín.
          <select
            className="rounded-md border border-border/60 bg-background px-1.5 py-1 text-xs"
            value={minSources}
            aria-label="Fuentes independientes mínimas por tema"
            onChange={(event) => setMinSources(Number(event.target.value))}
            title="Medios distintos que deben confirmar un tema para que llegue a la revisión."
          >
            {[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Texto por fuente
          <select
            className="rounded-md border border-border/60 bg-background px-1.5 py-1 text-xs"
            value={contextSize}
            aria-label="Cuánto texto se lee de cada fuente encontrada"
            onChange={(event) => setContextSize(event.target.value as "low" | "medium" | "high")}
            title="No cambia cuántas fuentes se consultan, sino cuánto se lee de cada una. Es el único control duro del gasto: ese texto es el 62% de la factura."
          >
            <option value="low">Resumen (barato)</option>
            <option value="medium">Medio</option>
            <option value="high">Completo (caro)</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="El paso que escribe las fuentes no busca nada: si cita un dominio que no aparece en la investigación, se lo inventó. Apagarlo deja pasar esos temas.">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            aria-label="Comprobar que las fuentes citadas aparecen en la investigación"
            checked={verifySources}
            onChange={(event) => setVerifySources(event.target.checked)}
          />
          Comprobar fuentes
        </label>
        {lastRun ? (
          <span className="text-xs text-muted-foreground">
            Última corrida: {new Date(lastRun.startedAt).toLocaleString("es")} · {lastRun.topicsKept} temas
            {lastRun.cost?.amount !== null && lastRun.cost !== null ? ` · ${lastRun.cost.amount} ${lastRun.cost.currency}` : ""}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">Búsquedas máx.</strong> cuántas busca ·{" "}
        <strong className="font-medium text-foreground">Texto por fuente</strong> cuánto lee de cada una ·{" "}
        <strong className="font-medium text-foreground">Fuentes mín.</strong> cuántos medios distintos deben confirmar un tema para guardarlo
      </p>

      {/* El gasto se dice antes de gastar. Avisar al terminar la corrida es informar de un hecho
          consumado, que es justo lo que el tope de presupuesto existe para evitar. */}
      {data.spend?.budget ? (
        <Card className={overBudget ? "border-amber-500/40" : undefined}>
          <CardContent className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-3 text-xs">
            <span className="text-muted-foreground">Gasto de {data.spend.month}:</span>
            <span className="font-medium tabular-nums">{data.spend.amount} de {data.spend.budget}</span>
            {overBudget ? (
              <span className="text-amber-600 dark:text-amber-500">
                Ya se pasó del presupuesto. Una corrida manual sigue arrancando —el tope no bloquea el trabajo deliberado—, pero esta gastará por encima.
              </span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!activeVerticals.length ? (
        <Card className="border-amber-500/40">
          <CardContent className="flex gap-3 py-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="font-medium">No hay verticales que vigilar.</p>
              <p className="text-muted-foreground">
                El radar necesita saber qué buscar y qué vende la agencia en cada área. Añádelo abajo: sin verticales activos la
                corrida no arranca, en vez de gastar en una búsqueda sin destino.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data.models?.available.length ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div>
              <h2 className="text-sm font-semibold">Modelos de la corrida</h2>
              <p className="text-xs text-muted-foreground">
                Investigar es lo caro: decide qué buscar y qué creerse. Estructurar solo ordena notas ya escritas, así que ahí
                el modelo barato rinde igual.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { label: "Investigar", value: researchModel, set: setResearchModel, fallback: data.models.research },
                { label: "Estructurar", value: structuringModel, set: setStructuringModel, fallback: data.models.structuring },
              ] as const).map((field) => (
                <label key={field.label} className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{field.label}</span>
                  <select
                    className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs"
                    value={field.value ?? ""}
                    aria-label={`Modelo para ${field.label.toLowerCase()}`}
                    onChange={(event) => field.set(event.target.value || null)}
                  >
                    <option value="">Configurado ({field.fallback ?? "sin definir"})</option>
                    {data.models!.available.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id} · ${model.inputPerMillion}/M entrada
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <RadarWatchlist entries={data.watchlist} brands={brands} onChanged={load} />

      {scanning ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{progress?.label ?? "Preparando la corrida"}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {progress ? `paso ${progress.step} de ${progress.steps} · ` : ""}{formatElapsed(elapsed)}
              </p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-500"
                style={{ width: `${progress ? Math.round((progress.step / progress.steps) * 100) : 4}%` }}
              />
            </div>
            {progress?.detail ? <p className="text-xs text-muted-foreground">{progress.detail}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {notice ? <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={status === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
            <span className="ml-1 tabular-nums opacity-70">{data.counts?.[tab.value] ?? 0}</span>
          </Button>
        ))}
        <select
          className="ml-auto rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
          value={sort}
          onChange={(event) => setSort(event.target.value as "score" | "recent" | "oldest")}
          aria-label="Ordenar los temas"
        >
          <option value="score">Mejor puntuación</option>
          <option value="recent">Más recientes</option>
          <option value="oldest">Más antiguos</option>
        </select>
        {data.verticals.length > 1 ? (
          <select
            className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
            value={vertical}
            onChange={(event) => setVertical(event.target.value)}
            aria-label="Filtrar por vertical"
          >
            <option value="">Todos los verticales</option>
            {data.verticals.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        ) : null}
      </div>

      {data.topics.length ? (
        <div className="space-y-4">
          {data.topics.map((topic) => (
            <Card key={topic.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">{topic.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {topic.vertical} · {topic.shelfLife === "evergreen" ? "no caduca" : "perecedero"} ·{" "}
                      <time dateTime={topic.createdAt} title={new Date(topic.createdAt).toLocaleString("es")}>
                        {formatGenerated(topic.createdAt)}
                      </time>
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${scoreTone(topic.score)}`} title="Puntuación de revisión">
                    {topic.score}
                  </span>
                </div>

                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Por qué ahora: </span>{topic.whyNow}</p>
                  <p><span className="text-muted-foreground">Para la agencia: </span>{topic.angleForAgency}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {topic.formats.map((format) => (
                    <Badge key={format.type} variant="outline" title={format.reason}>
                      {FORMAT_LABEL[format.type] ?? format.type}
                      {format.keyword ? ` · ${format.keyword}` : ""}
                    </Badge>
                  ))}
                </div>

                {topic.formats.some((format) => format.hook) ? (
                  <p className="border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
                    {topic.formats.find((format) => format.hook)?.hook}
                  </p>
                ) : null}

                {topic.evidence.length ? (
                  <ul className="space-y-1 text-xs">
                    {topic.evidence.map((source) => (
                      <li key={source.url} className="flex items-baseline gap-1.5">
                        <a href={source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-baseline gap-1 text-primary hover:underline">
                          {source.title}
                          <ExternalLink className="h-3 w-3 shrink-0 self-center" aria-hidden />
                        </a>
                        <span className="text-muted-foreground">· {hostOf(source.url)} · {relativeDate(source.publishedAt)}</span>
                        {/* Se queda a la vista en vez de desaparecer: quien revisa tiene que poder
                            juzgar la fuente, pero sabiendo que no salió de la búsqueda. */}
                        {source.verified === false ? (
                          <span className="text-amber-600 dark:text-amber-500" title="Este dominio no aparece en las notas de la investigación: puede ser una cita inventada.">
                            · sin comprobar
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-500">Sin fuentes verificadas: comprobar antes de usarlo.</p>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  <span className="text-xs text-muted-foreground">Producir:</span>
                  {topic.formats.map((format) => (
                    <Button key={format.type} size="sm" variant="secondary" asChild>
                      {/* El generador recibe solo el identificador; el encargo lo arma él con el
                          tema completo, que no cabría cómodamente en la URL. */}
                      <a href={`${FORMAT_ROUTE[format.type]}?topic=${topic.id}`}>
                        <Wand2 className="h-3.5 w-3.5" /> {FORMAT_LABEL[format.type] ?? format.type}
                      </a>
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {ACTIONS[topic.status].map((action) => (
                    <Button key={action.to} size="sm" variant={action.variant ?? "outline"} onClick={() => void changeStatus(topic.id, action.to)}>
                      {action.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {data.truncated ? <p className="text-xs text-muted-foreground">Hay más temas de los que caben en esta vista.</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {status === "nuevo" ? "No hay temas por revisar. Lanza una corrida para buscar novedades." : "No hay temas en este estado."}
        </p>
      )}
    </div>
  );
}
