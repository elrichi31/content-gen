"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Archive, PencilLine, RotateCcw, GalleryHorizontal, Megaphone, Clapperboard, FileText, type LucideIcon } from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { id: string; name: string };
type Item = { id: string; revision: number; type: string; campaignId: string; campaignName: string; brandKitId: string | null; archivedAt: string | null; exportCount: number; document?: { data?: { title?: unknown; headline?: unknown } } };

const typeIcon: Record<string, LucideIcon> = { carousel: GalleryHorizontal, ad: Megaphone, video: Clapperboard };
const typeLabel: Record<string, string> = { carousel: "Carrusel", ad: "Anuncio", video: "Video" };
const editorPath: Record<string, string> = { carousel: "/carousel", ad: "/ads", video: "/video" };

// El título vive dentro del documento y cambia por formato: carrusel y video usan `title`,
// el anuncio guarda su titular en `headline`.
function itemTitle(item: Item) {
  const data = item.document?.data;
  if (typeof data?.title === "string" && data.title.trim()) return data.title;
  if (typeof data?.headline === "string" && data.headline.trim()) return data.headline;
  return typeLabel[item.type] ?? item.type;
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
      <PageHeading eyebrow="Biblioteca" title="Todo el contenido" description="Filtra por tipo, campaña, marca y estado. Duplica, archiva o restaura sin perder el documento." />

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="q">Buscar</Label>
          <Input id="q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Texto o campaña" />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="carousel">Carrusel</SelectItem>
              <SelectItem value="ad">Anuncio</SelectItem>
              <SelectItem value="video">Video</SelectItem>
            </SelectContent>
          </Select>
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
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Estado"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="archived">Archivados</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {items.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = typeIcon[item.type] ?? FileText;
            return (
              <Card key={item.id} className="gap-4 py-5 transition-colors hover:border-border">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {item.exportCount ? <Badge className="border-transparent bg-primary/15 text-primary">{item.exportCount} export{item.exportCount > 1 ? "s" : ""}</Badge> : null}
                      <Badge variant="secondary">{typeLabel[item.type] ?? item.type}</Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Link href={`/content/${item.id}`} className="line-clamp-2 font-medium text-foreground hover:text-primary">
                      {itemTitle(item)}
                    </Link>
                    <p className="text-sm text-muted-foreground">{item.campaignName}</p>
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
    </PageShell>
  );
}
