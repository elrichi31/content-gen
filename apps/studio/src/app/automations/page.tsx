"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, FileStack, ListOrdered, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { PublishingRule } from "@content-gen/domain/schedule";
import type { Automation } from "@/lib/carousel-automation-rules";
import { AutomationForm, carouselCost, describeRule, money, type Campaign } from "@/components/automations/automation-form";
import type { BrandOption } from "@/components/brand-select";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Row = Automation & { nextSlot: { date: string; time: string } | null; horizonEnd: string };

const relative = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  return Math.abs(hours) < 24 ? relative.format(hours, "hour") : relative.format(Math.round(hours / 24), "day");
}
/** Fecha civil "2026-10-09" como "vie 9 oct", sin que la zona horaria la mueva de día. */
const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

/** Interruptor activa/pausada. El pulgar se desliza con la misma curva que el resto de la app. */
function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", on ? "bg-primary" : "bg-border")}>
      <span className={cn("size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]", on ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export default function AutomationsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rules, setRules] = useState<PublishingRule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [verticals, setVerticals] = useState<string[]>([]);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [sheet, setSheet] = useState<{ open: boolean; editing: Row | null; key: number }>({ open: false, editing: null, key: 0 });
  const [running, setRunning] = useState<{ id: string; since: number } | null>(null);
  const [, tick] = useState(0);

  const refresh = useCallback(async () => setRows(await (await fetch("/api/automations")).json()), []);
  useEffect(() => {
    void refresh();
    void fetch("/api/schedule/rules").then((response) => response.json()).then(setRules);
    void fetch("/api/campaigns").then((response) => response.json()).then(setCampaigns);
    void fetch("/api/brand-kits").then((response) => response.json()).then(setBrands);
    void fetch("/api/radar?limit=1").then((response) => response.json()).then((data) => setVerticals(data.verticals ?? [])).catch(() => setVerticals([]));
  }, [refresh]);
  // Mientras genera, el contador de segundos avanza: una espera de un minuto sin señales parece colgada.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function send(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo completar la acción.");
    return payload;
  }
  const attempt = async (work: () => Promise<void>) => {
    setNotice(null);
    try { await work(); } catch (error) { setNotice(noticeError(error instanceof Error ? error.message : "Algo falló.")); }
  };

  const openSheet = (editing: Row | null) => setSheet((current) => ({ open: true, editing, key: current.key + 1 }));
  const closeSheet = () => setSheet((current) => ({ ...current, open: false }));

  async function save(body: Record<string, unknown>) {
    const editing = sheet.editing;
    try {
      await send(editing ? `/api/automations/${editing.id}` : "/api/automations", editing ? "PATCH" : "POST", body);
      closeSheet();
      setNotice(noticeOk(editing ? "Cambios guardados." : "Automatización creada. Rellenará los huecos libres en su próxima pasada, o pulsa «Ejecutar ahora»."));
      await refresh();
    } catch (error) { setNotice(noticeError(error instanceof Error ? error.message : "No se pudo guardar.")); }
  }

  const run = (row: Row) => attempt(async () => {
    setRunning({ id: row.id, since: Date.now() });
    try {
      const outcome = await send(`/api/automations/${row.id}/run`, "POST");
      setNotice(outcome.status === "created" ? noticeOk(`${outcome.message} Está en el Cronograma como borrador.`) : noticeError(outcome.message));
    } finally { setRunning(null); await refresh(); }
  });
  const toggle = (row: Row) => attempt(async () => {
    setRows((current) => current?.map((item) => item.id === row.id ? { ...item, active: !item.active } : item) ?? null);
    try { await send(`/api/automations/${row.id}`, "PATCH", { active: !row.active }); }
    finally { await refresh(); }
  });
  const remove = (row: Row) => attempt(async () => {
    if (!window.confirm(`¿Borrar «${row.name}»? Los carruseles que ya generó se quedan en la biblioteca y en el Cronograma.`)) return;
    await send(`/api/automations/${row.id}`, "DELETE"); await refresh();
  });

  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const campaignName = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));

  return (
    <PageShell>
      <PageHeading
        title="Automatizaciones"
        description="Carruseles en borrador para los huecos del Cronograma, sin que tengas que pedirlos uno a uno. Nada se publica solo."
        actions={rows?.length ? <Button onClick={() => openSheet(null)}><Plus className="size-4" strokeWidth={1.75} />Nueva automatización</Button> : null}
      />
      {notice ? <Notice className="mb-4 max-w-3xl" notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {rows === null ? (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-surface-secondary/50" aria-label="Cargando" />
      ) : rows.length === 0 ? (
        <div className="max-w-2xl rounded-lg border border-border px-6 py-8">
          <h2 className="text-base font-semibold text-foreground">Que los carruseles lleguen solos</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Una automatización mira tu Cronograma, toma el siguiente tema y deja el carrusel listo para revisar en cada hueco libre.</p>
          <ul className="mt-6 space-y-4">
            {([
              [CalendarDays, "Una pauta del Cronograma", "Dice cuándo publicas: por ejemplo, Instagram lunes, miércoles y viernes a las 19:00."],
              [ListOrdered, "Temas para escribir", "Una lista tuya, en orden. Cuando se acaba puede seguir con los temas del radar."],
              [FileStack, "Borradores para revisar", "Cada carrusel queda en la biblioteca y en su hueco. Tú decides qué se publica."],
            ] as const).map(([Icon, title, text]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-tertiary text-muted-foreground"><Icon className="size-[18px]" strokeWidth={1.5} /></span>
                <span><span className="block text-sm font-medium text-foreground">{title}</span><span className="block text-sm text-muted-foreground">{text}</span></span>
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-2">
            <Button onClick={() => openSheet(null)}><Plus className="size-4" strokeWidth={1.75} />Crear automatización</Button>
            {rules.length === 0 ? <Button variant="outline" asChild><Link href="/schedule">Crear una pauta primero</Link></Button> : null}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[minmax(220px,1fr)_160px_140px_minmax(0,200px)_auto] gap-6 border-b border-border bg-surface-secondary px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground xl:grid">
            <span>Automatización</span><span>Próximo hueco</span><span>Temas</span><span>Última ejecución</span><span />
          </div>
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const rule = ruleById.get(row.ruleId);
              const pending = row.topics.filter((item) => !row.usedTopics.includes(item)).length;
              const isRunning = running?.id === row.id;
              const starved = pending === 0 && !row.radarVertical;
              return (
                <li key={row.id} className={cn("grid gap-x-6 gap-y-3 px-4 py-4 transition-colors duration-150 xl:grid-cols-[minmax(220px,1fr)_160px_140px_minmax(0,200px)_auto] xl:items-center", isRunning && "bg-primary/[0.03]")}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5"><Toggle on={row.active} label={row.active ? `Pausar ${row.name}` : `Activar ${row.name}`} onChange={() => toggle(row)} /></span>
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm font-medium", row.active ? "text-foreground" : "text-muted-foreground")}>{row.name}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {row.kind === "editable" ? "Editable" : "Imágenes IA"} · {row.slides} slides · {campaignName.get(row.campaignId) ?? "Campaña"}
                        <span className="whitespace-nowrap"> · ≈ {money(carouselCost(row.kind, row.slides, row.imageSource, row.provider))} c/u</span>
                      </p>
                    </div>
                  </div>

                  <div className="pl-12 text-sm xl:pl-0">
                    <span className="mr-1.5 text-xs text-muted-foreground xl:hidden">Próximo hueco:</span>
                    {!row.active ? <span className="text-muted-foreground">En pausa</span>
                      : row.nextSlot ? <span className="tabular-nums text-foreground">{day(row.nextSlot.date)} · {row.nextSlot.time}</span>
                        : <span className="text-muted-foreground">Cubierto hasta el {day(row.horizonEnd)}</span>}
                    {rule ? <span className="block truncate text-xs text-muted-foreground" title={`${rule.name} · ${describeRule(rule)}`}>{rule.name} · {describeRule(rule)}</span>
                      : <span className="block text-xs text-destructive">La pauta ya no existe</span>}
                  </div>

                  <div className="pl-12 text-sm xl:pl-0">
                    <span className="mr-1.5 text-xs text-muted-foreground xl:hidden">Temas:</span>
                    {starved ? <span className="text-destructive">Sin temas</span> : (
                      <span className="text-foreground"><span className="tabular-nums">{pending}</span> en la lista</span>
                    )}
                    {row.radarVertical ? <span className="block truncate text-xs text-muted-foreground">luego radar · {row.radarVertical}</span> : null}
                  </div>

                  <div className="min-w-0 pl-12 text-sm xl:pl-0">
                    {isRunning ? (
                      <span className="inline-flex items-center gap-1.5 text-primary">
                        <Loader2 className="size-3.5 animate-spin [animation-duration:700ms]" strokeWidth={2} />
                        Generando · <span className="tabular-nums">{Math.round((Date.now() - running.since) / 1000)} s</span>
                      </span>
                    ) : row.lastRunAt ? (
                      <>
                        <span className={cn("block text-xs", row.lastFailed ? "text-destructive" : "text-muted-foreground")}>{ago(row.lastRunAt)}</span>
                        <span className={cn("line-clamp-2 text-xs leading-relaxed", row.lastFailed ? "text-destructive" : "text-foreground")} title={row.lastResult ?? undefined}>{row.lastResult}</span>
                      </>
                    ) : <span className="text-xs text-muted-foreground">Aún no se ha ejecutado</span>}
                  </div>

                  <div className="flex items-center gap-1 pl-12 xl:pl-0">
                    <Button size="sm" variant="outline" onClick={() => run(row)} disabled={Boolean(running) || !rule} className="shrink-0">
                      {isRunning ? <Loader2 className="size-3.5 animate-spin [animation-duration:700ms]" /> : <Play className="size-3.5" strokeWidth={1.75} />}
                      {isRunning ? "Generando" : "Ejecutar ahora"}
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${row.name}`} onClick={() => openSheet(row)}><Pencil className="size-4" strokeWidth={1.5} /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Borrar ${row.name}`} onClick={() => remove(row)} disabled={isRunning}><Trash2 className="size-4" strokeWidth={1.5} /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Sheet open={sheet.open} onOpenChange={(open) => (open ? null : closeSheet())}>
        <SheetContent side="right" contentClassName="w-full sm:max-w-md" className="h-full w-full max-w-none gap-0 overflow-y-auto p-0">
          <AutomationForm key={sheet.key} editing={sheet.editing} rules={rules} campaigns={campaigns} brands={brands} verticals={verticals} onSubmit={save} onCancel={closeSheet} />
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
