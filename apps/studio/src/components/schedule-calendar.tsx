"use client";

import {
  currentMonth,
  POST_STATUSES,
  PUBLISH_PLATFORMS,
  todayLocal,
  WEEKDAY_LABELS,
  type CalendarDay,
  type PostStatus,
  type PublishPlatform,
  type PublishingRule,
  type ScheduledPost,
} from "@content-gen/domain/schedule";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Repeat, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_TYPE_LABEL, contentTitle } from "@/lib/content-title";
import { cn } from "@/lib/utils";

type Slot = { date: string; time: string; platform: PublishPlatform; ruleId: string | null; ruleName: string; post: ScheduledPost | null };
type Calendar = {
  month: string;
  startDate: string;
  endDate: string;
  weeks: string[][];
  days: CalendarDay[];
  rules: PublishingRule[];
  summary: { slots: number; empty: number; unassigned: number; ready: number; published: number };
  error?: string;
};
type ContentItem = { id: string; type: string; campaignName?: string; document?: { data?: { title?: unknown; headline?: unknown } } };

const PLATFORM_LABEL: Record<PublishPlatform, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", blog: "Blog",
};
const STATUS_LABEL: Record<PostStatus, string> = {
  planificada: "Planificada", lista: "Lista", publicada: "Publicada", omitida: "Omitida",
};
const STATUS_STYLE: Record<PostStatus, string> = {
  planificada: "border-border bg-muted/60 text-foreground",
  lista: "border-primary/40 bg-primary/12 text-foreground",
  publicada: "border-emerald-500/40 bg-emerald-500/12 text-foreground",
  omitida: "border-border bg-transparent text-muted-foreground line-through",
};
/** La rejilla empieza en lunes; WEEKDAY_LABELS empieza en domingo. */
const HEADERS = [1, 2, 3, 4, 5, 6, 0].map((day) => WEEKDAY_LABELS[day].slice(0, 3));
const MONTH_LABEL = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("es", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (month: string, delta: number) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};
const emptyDay = (date: string): CalendarDay => ({ date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), slots: [] });

export function ScheduleCalendar() {
  const [month, setMonth] = useState(currentMonth);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const today = useMemo(() => todayLocal(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/schedule?month=${month}`);
      const payload = await response.json() as Calendar;
      if (!response.ok) { setNotice(payload.error ?? "No se pudo leer el cronograma."); return; }
      setCalendar(payload);
      setNotice(null);
    } catch {
      setNotice("No se pudo contactar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void fetch("/api/content-items?status=active")
      .then((response) => response.ok ? response.json() as Promise<ContentItem[]> : [])
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const byDate = useMemo(() => new Map((calendar?.days ?? []).map((day) => [day.date, day])), [calendar]);

  async function send(url: string, method: string, body?: unknown) {
    const response = await fetch(url, method === "DELETE" ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setNotice(payload?.error ?? "La operación no se pudo completar.");
      return false;
    }
    setNotice(null);
    await load();
    return true;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-44 text-center text-sm font-medium capitalize">{MONTH_LABEL(month)}</span>
        <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>Hoy</Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}><Repeat className="h-4 w-4" /> Cadencia</Button>
        </div>
      </div>

      {calendar ? (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{calendar.summary.slots} huecos</Badge>
          <Badge variant="outline">{calendar.summary.empty} libres</Badge>
          <Badge variant="outline">{calendar.summary.ready} listas</Badge>
          <Badge variant="outline">{calendar.summary.published} publicadas</Badge>
        </div>
      ) : null}

      {notice ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{notice}</p> : null}

      {calendar && !calendar.rules.length ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">Todavía no hay cadencia. Define en qué días y a qué hora publicas en cada plataforma y el calendario generará los huecos.</p>
            <Button size="sm" onClick={() => setRulesOpen(true)}><Plus className="h-4 w-4" /> Definir cadencia</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          <div className="grid grid-cols-7 gap-px text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {HEADERS.map((label) => <div key={label} className="py-2">{label}</div>)}
          </div>
          <div className={cn("grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60", loading && "opacity-60")}>
            {(calendar?.weeks ?? []).flat().map((date) => {
              const day = byDate.get(date) ?? emptyDay(date);
              const outside = !calendar || date < calendar.startDate || date > calendar.endDate;
              return (
                <div key={date} className={cn("min-h-28 space-y-1 bg-card p-2", outside && "bg-muted/30")}>
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-medium",
                      outside ? "text-muted-foreground/50" : "text-foreground",
                      date === today && "rounded bg-primary px-1.5 py-0.5 text-primary-foreground",
                    )}>
                      {Number(date.slice(-2))}
                    </span>
                    <button
                      type="button"
                      aria-label={`Añadir publicación el ${date}`}
                      className="text-muted-foreground/60 transition-colors hover:text-foreground"
                      onClick={() => setEditing({ date, time: "19:00", platform: "instagram", ruleId: null, ruleName: "", post: null })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {day.slots.map((slot) => (
                    <button
                      key={`${slot.platform}-${slot.time}`}
                      type="button"
                      onClick={() => setEditing(slot)}
                      className={cn(
                        "block w-full truncate rounded border px-1.5 py-1 text-left text-[11px] transition-colors hover:border-primary/60",
                        slot.post ? STATUS_STYLE[slot.post.status] : "border-dashed border-border text-muted-foreground",
                      )}
                    >
                      <span className="font-medium">{slot.time}</span> {PLATFORM_LABEL[slot.platform]}
                      {slot.post ? <span className="block truncate text-muted-foreground">{slot.post.title || "Sin título"}</span> : <span className="block text-muted-foreground/70">Libre</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SlotEditor slot={editing} items={items} onClose={() => setEditing(null)} onSend={send} />
      <RulesEditor open={rulesOpen} rules={calendar?.rules ?? []} onClose={() => setRulesOpen(false)} onSend={send} />
    </div>
  );
}

type Send = (url: string, method: string, body?: unknown) => Promise<boolean>;

function SlotEditor({ slot, items, onClose, onSend }: { slot: Slot | null; items: ContentItem[]; onClose: () => void; onSend: Send }) {
  const [draft, setDraft] = useState({ contentItemId: "", title: "", notes: "", status: "planificada" as PostStatus, date: "", time: "", platform: "instagram" as PublishPlatform });
  const [saving, setSaving] = useState(false);
  // El panel no se desmonta al cerrarse: quitar un Sheet abierto de golpe se salta la limpieza
  // de Radix y la página se queda con `pointer-events: none`. Se conserva el último hueco
  // para que el contenido siga visible mientras el panel se cierra.
  const [shown, setShown] = useState<Slot | null>(null);

  useEffect(() => {
    if (!slot) return;
    setShown(slot);
    setDraft({
      contentItemId: slot.post?.contentItemId ?? "",
      title: slot.post?.title ?? "",
      notes: slot.post?.notes ?? "",
      status: slot.post?.status ?? "planificada",
      date: slot.date,
      time: slot.time,
      platform: slot.platform,
    });
  }, [slot]);

  const post = shown?.post ?? null;

  async function save() {
    setSaving(true);
    const body = { ...draft, contentItemId: draft.contentItemId || null };
    const done = post
      ? await onSend(`/api/schedule/posts/${post.id}`, "PATCH", body)
      : await onSend("/api/schedule/posts", "POST", { ...body, ruleId: shown?.ruleId ?? null });
    setSaving(false);
    if (done) onClose();
  }

  async function clear() {
    if (!post) return;
    setSaving(true);
    const done = await onSend(`/api/schedule/posts/${post.id}`, "DELETE");
    setSaving(false);
    if (done) onClose();
  }

  return (
    <Sheet open={Boolean(slot)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{post ? "Publicación planificada" : "Nuevo hueco"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {shown?.ruleName ? <p className="text-xs text-muted-foreground">Hueco de la pauta «{shown.ruleName}».</p> : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="slot-date">Día</Label>
              <Input id="slot-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-time">Hora</Label>
              <Input id="slot-time" type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-platform">Plataforma</Label>
            <select id="slot-platform" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value as PublishPlatform })}>
              {PUBLISH_PLATFORMS.map((platform) => <option key={platform} value={platform}>{PLATFORM_LABEL[platform]}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-content">Contenido</Label>
            <select id="slot-content" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={draft.contentItemId} onChange={(event) => setDraft({ ...draft, contentItemId: event.target.value })}>
              <option value="">Sin asignar todavía</option>
              {items.map((item) => <option key={item.id} value={item.id}>{`${contentTitle(item)} · ${CONTENT_TYPE_LABEL[item.type] ?? item.type} · ${item.campaignName ?? "Sin campaña"}`}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-title">Título</Label>
            <Input id="slot-title" value={draft.title} placeholder="Se rellena solo al asignar contenido" onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-status">Estado</Label>
            <select id="slot-status" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PostStatus })}>
              {POST_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Marca «Publicada» a mano: el sistema planifica, no publica por ti.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-notes">Notas</Label>
            <Textarea id="slot-notes" rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving}>{post ? "Guardar" : "Planificar"}</Button>
            {post ? <Button variant="outline" onClick={() => void clear()} disabled={saving}><Trash2 className="h-4 w-4" /> Vaciar hueco</Button> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const NEW_RULE = () => ({ name: "", platform: "instagram" as PublishPlatform, weekdays: [] as number[], time: "19:00", startDate: todayLocal() });

function RulesEditor({ open, rules, onClose, onSend }: { open: boolean; rules: PublishingRule[]; onClose: () => void; onSend: Send }) {
  const [draft, setDraft] = useState(NEW_RULE);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    const done = await onSend("/api/schedule/rules", "POST", { ...draft, times: [draft.time] });
    setSaving(false);
    if (done) setDraft(NEW_RULE());
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Cadencia de publicación</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <div className="space-y-2">
            {rules.length ? rules.map((rule) => (
              <div key={rule.id} className={cn("flex items-start gap-2 rounded-md border border-border/60 p-3", !rule.active && "opacity-60")}>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORM_LABEL[rule.platform]} · {rule.weekdays.map((day) => WEEKDAY_LABELS[day].slice(0, 3)).join(", ")} · {rule.times.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">Desde {rule.startDate}{rule.endDate ? ` hasta ${rule.endDate}` : ""}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void onSend(`/api/schedule/rules/${rule.id}`, "PATCH", { active: !rule.active })}>
                  {rule.active ? "Pausar" : "Activar"}
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Borrar la pauta ${rule.name}`} onClick={() => void onSend(`/api/schedule/rules/${rule.id}`, "DELETE")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sin pautas todavía.</p>}
          </div>

          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <p className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="h-4 w-4" /> Nueva pauta</p>
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Nombre</Label>
              <Input id="rule-name" value={draft.name} placeholder="Instagram entre semana" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-platform">Plataforma</Label>
              <select id="rule-platform" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value as PublishPlatform })}>
                {PUBLISH_PLATFORMS.map((platform) => <option key={platform} value={platform}>{PLATFORM_LABEL[platform]}</option>)}
              </select>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Días</legend>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={draft.weekdays.includes(day) ? "default" : "outline"}
                    aria-pressed={draft.weekdays.includes(day)}
                    onClick={() => setDraft({ ...draft, weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((value) => value !== day) : [...draft.weekdays, day] })}
                  >
                    {WEEKDAY_LABELS[day].slice(0, 3)}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rule-time">Hora</Label>
                <Input id="rule-time" type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-start">Desde</Label>
                <Input id="rule-start" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
              </div>
            </div>
            <Button onClick={() => void create()} disabled={saving || !draft.name.trim() || !draft.weekdays.length}>
              <Plus className="h-4 w-4" /> Añadir pauta
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
