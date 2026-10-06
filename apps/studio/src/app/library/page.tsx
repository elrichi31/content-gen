"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ScheduledPost } from "@content-gen/domain/schedule";
import { Copy, Archive, CalendarPlus, PencilLine, RotateCcw, GalleryHorizontal, Megaphone, Clapperboard, FileText, ArrowDownWideNarrow, ArrowUpNarrowWide, type LucideIcon } from "lucide-react";
import { ContentScheduleSheet, ScheduledBadge, type SchedulableItem } from "@/components/content-schedule-sheet";
import { nowInZone, useStudioTimezone } from "@/components/schedule-shared";
import { PageShell, PageHeading } from "@/components/page-shell";
import { CONTENT_TYPE_LABEL, contentTitle } from "@/lib/content-title";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { id: string; name: string };
type Item = { id: string; revision: number; type: string; createdAt: string; updatedAt: string; campaignId: string; campaignName: string; brandKitId: string | null; archivedAt: string | null; exportCount: number; document?: { data?: { title?: unknown; headline?: unknown } } };

const typeIcon: Record<string, LucideIcon> = { carousel: GalleryHorizontal, ad: Megaphone, video: Clapperboard };
const typeLabel = CONTENT_TYPE_LABEL;
const editorPath: Record<string, string> = { carousel: "/carousel", ad: "/ads", video: "/video", article: "/articles" };
const itemTitle = contentTitle;

type ChipOption = { value: string; label: string };
const typeChips: ChipOption[] = [{ value: "all", label: "Todos" }, ...Object.entries(typeLabel).map(([value, label]) => ({ value, label }))];
const statusChips: ChipOption[] = [{ value: "active", label: "Activos" }, { value: "archived", label: "Archivados" }, { value: "all", label: "Todos" }];
const agendaChips: ChipOption[] = [{ value: "all", label: "Todos" }, { value: "scheduled", label: "Programados" }, { value: "unscheduled", label: "Sin programar" }];
const sortChips: ChipOption[] = [{ value: "newest", label: "Más recientes" }, { value: "oldest", label: "Más antiguos" }, { value: "edited", label: "Última edición" }];
const createdFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });

function ChipGroup({ label, options, value, onChange }: { label: string; options: ChipOption[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === option.value ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [campaigns, setCampaigns] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [type, setType] = useState("all");
  const [campaignId, setCampaignId] = useState("all");
  const [brandKitId, setBrandKitId] = useState("all");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [agenda, setAgenda] = useState("all");
  const [sort, setSort] = useState("newest");
  const zone = useStudioTimezone();
  const [scheduled, setScheduled] = useState<Map<string, ScheduledPost[]>>(new Map());
  const [scheduling, setScheduling] = useState<SchedulableItem | null>(null);

  // Próximas fechas de cada pieza: una sola lectura del calendario agrupada por pieza.
  async function refreshScheduled() {
    const response = await fetch(`/api/schedule/posts?startDate=${nowInZone(zone).date}`).catch(() => null);
    const posts = response?.ok ? await response.json() as ScheduledPost[] : [];
    const byItem = new Map<string, ScheduledPost[]>();
    for (const post of posts) if (post.contentItemId) byItem.set(post.contentItemId, [...(byItem.get(post.contentItemId) ?? []), post]);
    setScheduled(byItem);
  }
  useEffect(() => { void refreshScheduled(); }, [zone]);

  async function refresh() {
    const params = new URLSearchParams({ status });
    if (type !== "all") params.set("type", type);
    if (campaignId !== "all") params.set("campaignId", campaignId);
    if (brandKitId !== "all") params.set("brandKitId", brandKitId);
    if (q) params.set("q", q);
    const [itemResponse, campaignResponse, brandResponse] = await Promise.all([
      fetch(`/api/content-items?${params}`),
      fetch("/api/campaigns"),
      fetch("/api/brand-kits"),
    ]);
    setItems(await itemResponse.json());
    setCampaigns(await campaignResponse.json());
    setBrands(await brandResponse.json());
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timer);
  }, [type, campaignId, brandKitId, status, q]);

  // Agenda y orden se resuelven en el cliente: la agenda viene del calendario, no de content_items.
  const visible = useMemo(() => {
    const filtered = agenda === "all" ? items : items.filter((item) => scheduled.has(item.id) === (agenda === "scheduled"));
    const time = (item: Item) => Date.parse(sort === "edited" ? item.updatedAt : item.createdAt) || 0;
    return [...filtered].sort((a, b) => sort === "oldest" ? time(a) - time(b) : time(b) - time(a));
  }, [items, scheduled, agenda, sort]);

  async function duplicate(id: string) {
    await fetch(`/api/content-items/${id}/duplicate`, { method: "POST" });
    await refresh();
  }
  async function archive(item: Item) {
    await fetch(`/api/content-items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: item.revision, archivedAt: new Date().toISOString() }) });
    await refresh();
  }
  async function restore(item: Item) {
    await fetch(`/api/content-items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: item.revision, archivedAt: null }) });
    await refresh();
  }

  return (
    <PageShell>
      <PageHeading title="Todo el contenido" description="Filtra con los chips, ordena por fecha de creación y duplica, archiva o restaura sin perder el documento." />

      <div className="mb-6 space-y-4 rounded-xl border border-border/60 bg-card/50 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="q">Buscar</Label>
            <Input id="q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Texto o campaña" />
          </div>
          <div className="space-y-1.5">
            <Label>Campaña</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger aria-label="Campaña"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {campaigns.map((campaign) => <SelectItem value={campaign.id} key={campaign.id}>{campaign.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Marca</Label>
            <Select value={brandKitId} onValueChange={setBrandKitId}>
              <SelectTrigger aria-label="Marca"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {brands.map((brand) => <SelectItem value={brand.id} key={brand.id}>{brand.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
          <ChipGroup label="Tipo" options={typeChips} value={type} onChange={setType} />
          <ChipGroup label="Agenda" options={agendaChips} value={agenda} onChange={setAgenda} />
          <ChipGroup label="Estado" options={statusChips} value={status} onChange={setStatus} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
          <ChipGroup label="Ordenar" options={sortChips} value={sort} onChange={setSort} />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {sort === "oldest" ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
            {visible.length} pieza{visible.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {visible.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const Icon = typeIcon[item.type] ?? FileText;
            return (
              <Card key={item.id} className="gap-4 py-5 transition-colors hover:border-border">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <ScheduledBadge posts={scheduled.get(item.id) ?? []} />
                      {item.exportCount ? <Badge className="border-transparent bg-primary/15 text-primary">{item.exportCount} export{item.exportCount > 1 ? "s" : ""}</Badge> : null}
                      <Badge variant="secondary">{typeLabel[item.type] ?? item.type}</Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Link href={`/content/${item.id}`} className="line-clamp-2 font-medium text-foreground hover:text-primary">
                      {itemTitle(item)}
                    </Link>
                    <p className="text-sm text-muted-foreground">{item.campaignName}</p>
                    {Date.parse(item.createdAt) ? <p className="text-xs text-muted-foreground/80">Creado el {createdFormat.format(new Date(item.createdAt))}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.archivedAt ? (
                      <Button size="sm" variant="outline" onClick={() => void restore(item)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                      </Button>
                    ) : (
                      <>
                        {editorPath[item.type] ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`${editorPath[item.type]}?id=${item.id}`}><PencilLine className="h-3.5 w-3.5" /> Abrir</Link>
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={() => setScheduling({ id: item.id, title: itemTitle(item) })}>
                          <CalendarPlus className="h-3.5 w-3.5" /> Programar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void duplicate(item.id)}>
                          <Copy className="h-3.5 w-3.5" /> Duplicar
                        </Button>
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void archive(item)}>
                          <Archive className="h-3.5 w-3.5" /> Archivar
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 py-16 text-center text-sm text-muted-foreground">
          Sin resultados.
        </div>
      )}

      <ContentScheduleSheet item={scheduling} onClose={() => setScheduling(null)} onChanged={() => void refreshScheduled()} />
    </PageShell>
  );
}
