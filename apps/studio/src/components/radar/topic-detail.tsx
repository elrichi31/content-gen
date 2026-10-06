"use client";

import type { RadarTopic, RadarTopicStatus } from "@content-gen/domain/radar";
import { Check, ExternalLink, FileText, GalleryHorizontal, Clapperboard, RotateCcw, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const FORMAT_LABEL: Record<string, string> = { carousel: "Carrusel", video: "Video", article: "Artículo" };
const FORMAT_ICON: Record<string, LucideIcon> = { carousel: GalleryHorizontal, video: Clapperboard, article: FileText };
/** Dónde se produce cada formato. El tema viaja como `?topic=` y el generador arma el encargo. */
const FORMAT_ROUTE: Record<string, string> = { carousel: "/carousel", video: "/video", article: "/articles" };

/** Acciones según el estado, en el orden de la máquina de estados. La primera es la principal. */
export const ACTIONS: Record<RadarTopicStatus, { to: RadarTopicStatus; label: string; icon: LucideIcon; key?: string }[]> = {
  nuevo: [{ to: "guardado", label: "Guardar", icon: Check, key: "G" }, { to: "descartado", label: "Descartar", icon: X, key: "D" }],
  guardado: [{ to: "usado", label: "Marcar usado", icon: Check }, { to: "descartado", label: "Descartar", icon: X, key: "D" }],
  descartado: [{ to: "guardado", label: "Rescatar", icon: RotateCcw, key: "G" }],
  usado: [{ to: "guardado", label: "Volver a guardados", icon: RotateCcw, key: "G" }],
};

export function scoreTone(score: number) {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

/** Cuándo lo trajo el radar: relativo mientras es reciente, fecha exacta después. */
export function formatGenerated(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) return `hace ${Math.floor(minutes / 60)} h`;
  if (minutes < 7 * 24 * 60) return `hace ${Math.floor(minutes / (24 * 60))} d`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
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

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Todo lo que hace falta para decidir un tema y producirlo, en un solo bloque. */
export function TopicDetail({ topic, onStatus }: { topic: RadarTopic; onStatus: (topic: RadarTopic, to: RadarTopicStatus) => void }) {
  const hook = topic.formats.find((format) => format.hook)?.hook;
  const [primary, ...rest] = ACTIONS[topic.status];
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-balance">{topic.title}</h2>
          <span className={cn("shrink-0 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-sm font-semibold tabular-nums", scoreTone(topic.score))} title="Puntuación del radar: frescura, fuentes y encaje con lo que vende la agencia">
            {topic.score}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {topic.vertical} · {topic.shelfLife === "evergreen" ? "no caduca" : "perecedero"} · <time dateTime={topic.createdAt} title={new Date(topic.createdAt).toLocaleString("es")}>encontrado {formatGenerated(topic.createdAt)}</time>
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" onClick={() => onStatus(topic, primary.to)}>
            <primary.icon className="size-4" />{primary.label}
            {primary.key ? <kbd className="ml-1 hidden rounded border border-white/30 px-1 text-[10px] font-medium leading-4 opacity-80 sm:inline">{primary.key}</kbd> : null}
          </Button>
          {rest.map((action) => (
            <Button key={action.to} size="sm" variant="outline" onClick={() => onStatus(topic, action.to)}>
              <action.icon className="size-4" />{action.label}
              {action.key ? <kbd className="ml-1 hidden rounded border border-border px-1 text-[10px] font-medium leading-4 text-muted-foreground sm:inline">{action.key}</kbd> : null}
            </Button>
          ))}
        </div>
      </header>

      <Block title="Por qué ahora"><p className="text-[13px] leading-relaxed">{topic.whyNow}</p></Block>
      <Block title="Para la agencia"><p className="text-[13px] leading-relaxed">{topic.angleForAgency}</p></Block>
      {hook ? (
        <Block title="Gancho sugerido">
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px] italic leading-relaxed">{hook}</p>
        </Block>
      ) : null}

      <Block title="Producir">
        <div className="grid gap-2 sm:grid-cols-3">
          {topic.formats.map((format) => {
            const Icon = FORMAT_ICON[format.type] ?? FileText;
            return (
              // El generador recibe solo el identificador; el encargo lo arma él con el tema completo.
              <a key={format.type} href={`${FORMAT_ROUTE[format.type]}?topic=${topic.id}`} title={format.reason}
                className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-xs transition-[border-color,background-color,scale] duration-150 ease-out hover:border-primary/40 hover:bg-accent active:scale-[0.98]">
                <span className="flex items-center gap-2 text-[13px] font-medium"><Icon className="size-4 text-primary" strokeWidth={1.75} />{FORMAT_LABEL[format.type] ?? format.type}</span>
                {format.keyword ? <span className="truncate text-xs text-muted-foreground">{format.keyword}</span> : null}
              </a>
            );
          })}
        </div>
      </Block>

      <Block title={`Fuentes (${topic.evidence.length})`}>
        {topic.evidence.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {topic.evidence.map((source) => (
              <li key={source.url} className="px-3 py-2.5">
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="flex items-start gap-1.5 text-[13px] font-medium hover:text-primary">
                  <span className="min-w-0 flex-1">{source.title}</span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 opacity-60" aria-hidden />
                </a>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {hostOf(source.url)} · {relativeDate(source.publishedAt)}
                  {/* A la vista en vez de oculto: quien revisa juzga la fuente sabiendo que no salió de la búsqueda. */}
                  {source.verified === false ? <span className="text-amber-600 dark:text-amber-400" title="Este dominio no aparece en la investigación: puede ser una cita inventada."> · sin comprobar</span> : null}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-amber-600 dark:text-amber-400">Sin fuentes verificadas: compruébalo antes de usarlo.</p>
        )}
      </Block>
    </article>
  );
}
