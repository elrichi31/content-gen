"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, FileText } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Campaign = { id: string; name: string };
type Item = { id: string; revision: number; type: string; campaignId: string; document: { schemaVersion: number; data: Record<string, unknown> } };
const blankDocument = '{\n  "schemaVersion": 1,\n  "data": {}\n}';
const NONE = "none";

export default function ContentPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [campaignId, setCampaignId] = useState(NONE);
  const [type, setType] = useState("carousel");
  const [json, setJson] = useState(blankDocument);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const [campaignResponse, itemResponse] = await Promise.all([fetch("/api/campaigns"), fetch("/api/content-items")]);
    setCampaigns(await campaignResponse.json());
    setItems(await itemResponse.json());
  }
  useEffect(() => { void refresh(); }, []);

  function choose(item: Item | null) {
    setSelected(item);
    setCampaignId(item?.campaignId ?? NONE);
    setType(item?.type ?? "carousel");
    setJson(item ? JSON.stringify(item.document, null, 2) : blankDocument);
    setDirty(false);
    setError("");
  }

  async function persist() {
    if (!selected) return;
    try {
      const document = JSON.parse(json);
      const response = await fetch(`/api/content-items/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: selected.revision, campaignId: campaignId === NONE ? "" : campaignId, type, document }) });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error);
      setSelected(saved);
      setDirty(false);
      setError("Guardado automáticamente.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
    }
  }
  useEffect(() => {
    if (!selected || !dirty) return;
    const timer = window.setTimeout(() => void persist(), 800);
    return () => window.clearTimeout(timer);
  }, [campaignId, type, json, dirty, selected]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (selected) return void persist();
    try {
      const document = JSON.parse(json);
      const response = await fetch("/api/content-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: campaignId === NONE ? "" : campaignId, type, document }) });
      const saved = await response.json();
      if (!response.ok) throw new Error();
      await refresh();
      choose(saved);
      setError("Documento creado.");
    } catch {
      setError("Selecciona una campaña y usa JSON válido.");
    }
  }
  const change = (value: string, setter: (value: string) => void) => { setter(value); setDirty(true); setError(""); };

  return (
    <PageShell className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-2">
        <Button className="w-full justify-start" variant="outline" onClick={() => choose(null)}>
          <Plus className="h-4 w-4" /> Nuevo contenido
        </Button>
        <nav className="mt-2 flex flex-col gap-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => choose(item)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                selected?.id === item.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.type}</span>
            </button>
          ))}
          {!items.length ? <p className="px-3 py-2 text-sm text-muted-foreground">Sin contenido todavía.</p> : null}
        </nav>
      </aside>

      <Card>
        <CardContent>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Biblioteca / Contenido</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{selected ? `Editar ${selected.type}` : "Nuevo contenido"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Documento versionado para carrusel, anuncio o video. Los cambios se guardan automáticamente.</p>

          <form className="mt-6 space-y-5" onSubmit={save}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Campaña</Label>
                <Select value={campaignId} onValueChange={(value) => change(value, setCampaignId)}>
                  <SelectTrigger aria-label="Campaña"><SelectValue placeholder="Selecciona una campaña" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(value) => change(value, setType)}>
                  <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carousel">Carrusel</SelectItem>
                    <SelectItem value="ad">Anuncio</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc">Documento JSON</Label>
              <Textarea id="doc" value={json} onChange={(event) => change(event.target.value, setJson)} className="min-h-72 font-mono text-xs" spellCheck={false} />
            </div>
            {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
            <Button type="submit">{selected ? "Guardar ahora" : "Crear documento"}</Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
