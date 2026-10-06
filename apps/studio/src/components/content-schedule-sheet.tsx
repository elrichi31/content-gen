"use client";

import Link from "next/link";
import { PUBLISH_PLATFORMS, type CalendarDay, type PublishPlatform, type ScheduledPost } from "@content-gen/domain/schedule";
import { CalendarDays, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPostDate, nextMonth, nowInZone, PLATFORM_LABEL, STATUS_LABEL, useStudioTimezone } from "@/components/schedule-shared";

type FreeSlot = { date: string; time: string; platform: PublishPlatform; ruleName: string };
export type SchedulableItem = { id: string; title: string };

/**
 * Programa una pieza de la biblioteca en el calendario y lista dónde está ya programada.
 * Quitarla del calendario no toca la pieza: solo borra la publicación planificada.
 */
export function ContentScheduleSheet({ item, onClose, onChanged }: { item: SchedulableItem | null; onClose: () => void; onChanged?: () => void }) {
  const zone = useStudioTimezone();
  // Se conserva la última pieza para que el panel no se vacíe mientras se cierra (ver SlotEditor).
  const [shown, setShown] = useState<SchedulableItem | null>(null);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [draft, setDraft] = useState({ date: "", time: "19:00", platform: "instagram" as PublishPlatform });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPosts = useCallback(async (id: string) => {
    const response = await fetch(`/api/schedule/posts?contentItemId=${encodeURIComponent(id)}`).catch(() => null);
    setPosts(response?.ok ? await response.json() as ScheduledPost[] : []);
  }, []);

  const loadFreeSlots = useCallback(async () => {
    const now = nowInZone(zone);
    const month = now.date.slice(0, 7);
    const calendars = await Promise.all([month, nextMonth(month)].map(async (value) => {
      const response = await fetch(`/api/schedule?month=${value}`).catch(() => null);
      return response?.ok ? (await response.json() as { days: CalendarDay[] }).days : [];
    }));
    const seen = new Set<string>();
    const slots: FreeSlot[] = [];
    for (const day of calendars.flat()) {
      for (const slot of day.slots) {
        const key = `${slot.platform}|${slot.date}|${slot.time}`;
        if (slot.post || !slot.ruleId || seen.has(key)) continue;
        if (slot.date < now.date || (slot.date === now.date && slot.time <= now.time)) continue;
        seen.add(key);
        slots.push({ date: slot.date, time: slot.time, platform: slot.platform, ruleName: slot.ruleName });
      }
    }
    slots.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    setFreeSlots(slots.slice(0, 6));
  }, [zone]);

  useEffect(() => {
    if (!item) return;
    setShown(item);
    setNotice(null);
    setDraft((current) => ({ ...current, date: nowInZone(zone).date }));
    void loadPosts(item.id);
    void loadFreeSlots();
  }, [item, zone, loadPosts, loadFreeSlots]);

  async function request(url: string, init: RequestInit) {
    const response = await fetch(url, init).catch(() => null);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => null) as { error?: string } | null;
      setNotice(payload?.error ?? "La operación no se pudo completar.");
      return false;
    }
    setNotice(null);
    if (shown) await loadPosts(shown.id);
    await loadFreeSlots();
    onChanged?.();
    return true;
  }

  async function schedule() {
    if (!shown) return;
    setSaving(true);
    await request("/api/schedule/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, contentItemId: shown.id }) });
    setSaving(false);
  }

  async function unschedule(post: ScheduledPost) {
    setSaving(true);
    await request(`/api/schedule/posts/${post.id}`, { method: "DELETE" });
    setSaving(false);
  }

  return (
    <Sheet open={Boolean(item)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Programar en calendario</SheetTitle>
          <SheetDescription className="line-clamp-2">{shown?.title}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          {notice ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{notice}</p> : null}

          <section className="space-y-2">
            <p className="text-sm font-medium">Programada en</p>
            {posts.length ? posts.map((post) => (
              <div key={post.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm capitalize">{formatPostDate(post.date)} · {post.time}</p>
                  <p className="text-xs text-muted-foreground">{PLATFORM_LABEL[post.platform]} · {STATUS_LABEL[post.status]}</p>
                </div>
                <Button asChild variant="ghost" size="icon" aria-label="Ver en el calendario">
                  <Link href={`/schedule?month=${post.date.slice(0, 7)}`}><CalendarDays className="h-4 w-4" /></Link>
                </Button>
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => void unschedule(post)}>
                  <Trash2 className="h-4 w-4" /> Quitar
                </Button>
              </div>
            )) : <p className="text-sm text-muted-foreground">Todavía no está en el calendario.</p>}
          </section>

          {freeSlots.length ? (
            <section className="space-y-2">
              <p className="text-sm font-medium">Huecos libres de tu cadencia</p>
              <div className="flex flex-wrap gap-1.5">
                {freeSlots.map((slot) => (
                  <Button
                    key={`${slot.platform}-${slot.date}-${slot.time}`}
                    type="button"
                    size="sm"
                    variant={draft.date === slot.date && draft.time === slot.time && draft.platform === slot.platform ? "default" : "outline"}
                    title={slot.ruleName}
                    onClick={() => setDraft({ date: slot.date, time: slot.time, platform: slot.platform })}
                  >
                    <span className="capitalize">{formatPostDate(slot.date)}</span> {slot.time} · {PLATFORM_LABEL[slot.platform]}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-md border border-border/60 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="schedule-date">Día</Label>
                <Input id="schedule-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule-time">Hora</Label>
                <Input id="schedule-time" type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Hora de {zone}.</p>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-platform">Plataforma</Label>
              <select id="schedule-platform" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value as PublishPlatform })}>
                {PUBLISH_PLATFORMS.map((platform) => <option key={platform} value={platform}>{PLATFORM_LABEL[platform]}</option>)}
              </select>
            </div>
            <Button onClick={() => void schedule()} disabled={saving || !draft.date || !draft.time}>
              <CalendarDays className="h-4 w-4" /> Programar
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ScheduledBadge({ posts }: { posts: ScheduledPost[] }) {
  const next = posts[0];
  if (!next) return null;
  return (
    <Badge variant="outline" className="capitalize" title={posts.map((post) => `${post.date} ${post.time} ${PLATFORM_LABEL[post.platform]}`).join("\n")}>
      <CalendarDays className="h-3 w-3" /> {formatPostDate(next.date)} {next.time}{posts.length > 1 ? ` +${posts.length - 1}` : ""}
    </Badge>
  );
}
