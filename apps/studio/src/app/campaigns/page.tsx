"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Plus, FolderKanban } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Brand = { id: string; name: string };
type CampaignBrief = { topic: string; audience: string; tone: string; language: string; context: string };
type Campaign = { id: string; name: string; brief: string | CampaignBrief; brandKitId: string | null };
type Piece = { id: string; type: "carousel" | "ad" | "video"; status: "draft" | "ready" | "rendering" | "exported" };

const NONE = "none";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState<CampaignBrief>({ topic: "", audience: "", tone: "", language: "es", context: "" });
  const [brandKitId, setBrandKitId] = useState(NONE);
  const [error, setError] = useState("");
  const [pieces, setPieces] = useState<Piece[]>([]);

  async function refresh() {
    const [campaignResponse, brandResponse] = await Promise.all([fetch("/api/campaigns"), fetch("/api/brand-kits")]);
    setCampaigns(await campaignResponse.json());
    setBrands(await brandResponse.json());
  }
  useEffect(() => { void refresh(); }, []);

  function reset() { setSelected(null); setName(""); setBrief({ topic: "", audience: "", tone: "", language: "es", context: "" }); setBrandKitId(NONE); setError(""); setPieces([]); }
  function choose(campaign: Campaign) {
    setSelected(campaign); setName(campaign.name);
    setBrief(typeof campaign.brief === "string"
      ? { topic: campaign.name, audience: "Audiencia general", tone: "Claro y directo", language: "es", context: campaign.brief }
      : campaign.brief);
    setBrandKitId(campaign.brandKitId ?? NONE); setError("");
    void fetch(`/api/campaigns/${campaign.id}`).then((response) => response.json()).then((detail) => setPieces(detail.pieces ?? []));
  }
  function changeBrief(field: keyof CampaignBrief, value: string) { setBrief((current) => ({ ...current, [field]: value })); }

  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(selected ? `/api/campaigns/${selected.id}` : "/api/campaigns", {
      method: selected ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, brief, brandKitId: brandKitId === NONE ? null : brandKitId }),
    });
    if (!response.ok) return setError("Revisa los datos de la campaña.");
    const campaign = await response.json() as Campaign;
    await refresh();
    choose(campaign);
  }

  async function archive() {
    if (!selected) return;
    await fetch(`/api/campaigns/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archivedAt: new Date().toISOString() }) });
    reset();
    await refresh();
  }

  async function duplicate() {
    if (!selected) return;
    const response = await fetch(`/api/campaigns/${selected.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepBrand: true }) });
    if (!response.ok) return setError("No se pudo duplicar la campaña.");
    const campaign = await response.json() as Campaign; await refresh(); choose(campaign);
  }

  async function exportPackage() {
    if (!selected) return;
    const response = await fetch(`/api/campaigns/${selected.id}/export`);
    if (!response.ok) return setError("No se pudo exportar la campaña.");
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${selected.name}.zip`; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <PageShell className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-2">
        <Button className="w-full justify-start" variant="outline" onClick={reset}>
          <Plus className="h-4 w-4" /> Nueva campaña
        </Button>
        <nav className="mt-2 flex flex-col gap-1">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => choose(campaign)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                selected?.id === campaign.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <FolderKanban className="h-4 w-4 shrink-0" />
              <span className="truncate">{campaign.name}</span>
            </button>
          ))}
          {!campaigns.length ? <p className="px-3 py-2 text-sm text-muted-foreground">Sin campañas todavía.</p> : null}
        </nav>
      </aside>

      <Card>
        <CardContent>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Biblioteca / Campañas</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{selected ? selected.name : "Nueva campaña"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">El brief y la marca que luego compartirán carruseles, anuncios y videos.</p>

          <form className="mt-6 max-w-xl space-y-5" onSubmit={save}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Lanzamiento Q3" required />
            </div>
            <div className="grid gap-4 rounded-lg border border-border/70 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="topic">Tema</Label>
                <Input id="topic" value={brief.topic} onChange={(event) => changeBrief("topic", event.target.value)} placeholder="Ej. Seguridad digital cotidiana" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audience">Audiencia</Label>
                <Input id="audience" value={brief.audience} onChange={(event) => changeBrief("audience", event.target.value)} placeholder="Jóvenes adultos" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tone">Tono</Label>
                <Input id="tone" value={brief.tone} onChange={(event) => changeBrief("tone", event.target.value)} placeholder="Claro y directo" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="language">Idioma</Label>
                <Input id="language" value={brief.language} onChange={(event) => changeBrief("language", event.target.value)} placeholder="es" required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="context">Contexto</Label>
                <Textarea id="context" value={brief.context} onChange={(event) => changeBrief("context", event.target.value)} placeholder="Objetivo, restricciones y mensaje clave…" rows={4} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Select value={brandKitId} onValueChange={setBrandKitId}>
                <SelectTrigger aria-label="Marca"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin marca</SelectItem>
                  {brands.map((brand) => <SelectItem value={brand.id} key={brand.id}>{brand.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="submit">{selected ? "Guardar cambios" : "Crear campaña"}</Button>
              {selected ? <Button type="button" variant="outline" onClick={() => void duplicate()}>Duplicar</Button> : null}
              {selected ? <Button type="button" variant="outline" onClick={() => void exportPackage()}>Exportar ZIP</Button> : null}
              {selected ? <Button type="button" variant="ghost" className="text-muted-foreground" onClick={archive}>Archivar</Button> : null}
            </div>
            {selected ? (
              <div className="space-y-2 border-t border-border/60 pt-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Piezas de campaña</p>
                {pieces.map((piece) => (
                  <Link key={piece.id} href={`/content/${piece.id}`} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:border-border hover:text-primary">
                    <span className="capitalize">{piece.type === "ad" ? "anuncio" : piece.type}</span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">{({ draft: "Borrador", ready: "Listo", rendering: "Renderizando", exported: "Exportado" } as const)[piece.status]}</span>
                  </Link>
                ))}
                {!pieces.length ? <p className="text-sm text-muted-foreground">Todavía no hay piezas en esta campaña.</p> : null}
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
