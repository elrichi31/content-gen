"use client";

import { useEffect, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import type { AdDocument } from "@content-gen/domain/ad";
import { PageShell } from "@/components/page-shell";
import { adFixture } from "@/components/ads/ad-renderer";
import { AdPlatformFrame } from "@/components/ads/ad-platform-frame";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CampaignAssetSelect } from "@/components/campaign-asset-select";
import { useRequestedContentId } from "@/lib/use-requested-content-id";

type AdLayout = AdDocument["layout"];
type AdFormat = AdDocument["format"];
type Platform = "instagram" | "tiktok";
type Campaign = { id: string; name: string; brief: string | { topic: string; audience: string; tone: string }; brandKitId: string | null };
type Brand = { id: string; name: string; primaryColor: string };
type Stored = { id: string; revision: number; campaignId: string; document: { data: unknown } };

const NEW = "new";
const NONE = "none";

const LAYOUTS: { value: AdLayout; label: string }[] = [
  { value: "promo", label: "Promo" },
  { value: "testimonial", label: "Testimonial" },
  { value: "comparison", label: "Comparación" },
  { value: "feature", label: "Features" },
  { value: "painSolution", label: "Dolor / Solución" },
];

type FieldDef = { field: keyof AdDocument; label: string; multiline?: boolean };
const TEXT_FIELDS: Record<AdLayout, FieldDef[]> = {
  promo: [
    { field: "offerBadge", label: "Badge de oferta" },
    { field: "headline", label: "Titular" },
    { field: "body", label: "Cuerpo", multiline: true },
    { field: "originalPrice", label: "Precio original" },
    { field: "newPrice", label: "Precio nuevo" },
    { field: "urgency", label: "Urgencia" },
    { field: "cta", label: "CTA" },
  ],
  testimonial: [
    { field: "quote", label: "Cita", multiline: true },
    { field: "authorName", label: "Autor" },
    { field: "authorRole", label: "Rol" },
    { field: "cta", label: "CTA" },
  ],
  comparison: [
    { field: "compHeadline", label: "Titular" },
    { field: "leftLabel", label: "Columna izquierda" },
    { field: "rightLabel", label: "Columna derecha" },
    { field: "cta", label: "CTA" },
  ],
  feature: [
    { field: "featHeadline", label: "Titular" },
    { field: "featBody", label: "Subtítulo", multiline: true },
    { field: "cta", label: "CTA" },
  ],
  painSolution: [
    { field: "painEmoji", label: "Emoji dolor" },
    { field: "painHeadline", label: "Titular dolor" },
    { field: "painDesc", label: "Descripción dolor", multiline: true },
    { field: "solutionEmoji", label: "Emoji solución" },
    { field: "solutionHeadline", label: "Titular solución" },
    { field: "solutionDesc", label: "Descripción solución", multiline: true },
    { field: "cta", label: "CTA" },
  ],
};

export default function AdsPage() {
  const [ad, setAd] = useState<AdDocument>(adFixture);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stored, setStored] = useState<Stored[]>([]);
  const [campaignId, setCampaignId] = useState(NONE);
  const [contentId, setContentId] = useState("");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  // AI form
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);

  const set = <K extends keyof AdDocument>(field: K, value: AdDocument[K]) => setAd((current) => ({ ...current, [field]: value }));
  const record = ad as unknown as Record<string, string | undefined>;

  async function refresh() {
    const [campaignResponse, contentResponse, brandResponse] = await Promise.all([fetch("/api/campaigns"), fetch("/api/content-items?type=ad"), fetch("/api/brand-kits")]);
    setCampaigns(await campaignResponse.json());
    setStored(await contentResponse.json());
    setBrands(await brandResponse.json());
  }
  useEffect(() => { void refresh(); }, []);

  const requestedId = useRequestedContentId();
  useEffect(() => {
    if (!requestedId || contentId === requestedId) return;
    const item = stored.find((entry) => entry.id === requestedId);
    if (item) load(item);
    else if (stored.length) setNotice("Ese contenido no está disponible: puede estar archivado.");
  }, [requestedId, stored]);


  function chooseCampaign(value: string) {
    setCampaignId(value);
    const campaign = campaigns.find((item) => item.id === value);
    if (campaign && typeof campaign.brief === "object") { setTopic(campaign.brief.topic); setAudience(campaign.brief.audience); setTone(campaign.brief.tone); }
    const brand = campaign?.brandKitId ? brands.find((item) => item.id === campaign.brandKitId) : undefined;
    if (brand) { set("accentColor", brand.primaryColor); setNotice(`Color de marca aplicado (${brand.primaryColor}).`); }
  }

  function load(item: Stored) {
    const data = item.document.data as AdDocument;
    if (!data || typeof data !== "object" || !("layout" in data)) return setNotice("Este contenido no es un AdDocument v1.");
    setAd(data); setContentId(item.id); setRevision(item.revision); setCampaignId(item.campaignId); setNotice("Anuncio cargado desde la biblioteca.");
  }

  async function save() {
    if (campaignId === NONE) return setNotice("Selecciona una campaña antes de guardar.");
    const body = contentId ? { revision, campaignId, type: "ad", document: { schemaVersion: 1, data: ad } } : { campaignId, type: "ad", document: { schemaVersion: 1, data: ad } };
    const response = await fetch(contentId ? `/api/content-items/${contentId}` : "/api/content-items", { method: contentId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const saved = await response.json();
    if (!response.ok) return setNotice(typeof saved.error === "string" ? saved.error : "No se pudo guardar el anuncio.");
    setContentId(saved.id); setRevision(saved.revision); setCampaignId(saved.campaignId); setNotice("Guardado en la biblioteca central."); await refresh();
  }

  async function generate() {
    setGenerating(true);
    const body: Record<string, unknown> = { topic, layout: ad.layout, format: ad.format, ...(campaignId === NONE ? {} : { campaignId }) };
    if (audience.trim()) body.audience = audience.trim();
    if (tone.trim()) body.tone = tone.trim();
    const response = await fetch("/api/ads/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setGenerating(false);
    if (!response.ok) return setNotice(typeof payload.error === "string" ? payload.error : "No se pudo generar el anuncio.");
    setAd(payload.document); setContentId(""); setRevision(0); setNotice("Anuncio generado. Revísalo y guárdalo.");
  }

  return (
    <PageShell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Anuncios / Editor</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Cinco formas de vender una idea.</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Elige plantilla y formato, edita el texto y el estilo, previsualiza en Instagram o TikTok y guárdalo en tu biblioteca.</p>
      </div>

      {/* Top controls */}
      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-44 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Documento</Label>
              <Select value={contentId || NEW} onValueChange={(value) => { if (value === NEW) { setContentId(""); setRevision(0); return; } const item = stored.find((entry) => entry.id === value); if (item) load(item); }}>
                <SelectTrigger aria-label="Documento"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW}>Nuevo anuncio</SelectItem>
                  {stored.map((item) => <SelectItem key={item.id} value={item.id}>{item.id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-44 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Campaña</Label>
              <Select value={campaignId} onValueChange={chooseCampaign}>
                <SelectTrigger aria-label="Campaña"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void save()}><Save className="h-4 w-4" /> Guardar</Button>
          </div>

          <Separator />

          {/* AI generation */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1 space-y-1.5">
              <Label htmlFor="ad-topic" className="text-xs uppercase tracking-wider text-muted-foreground">Idea IA</Label>
              <Input id="ad-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Tema del anuncio" />
            </div>
            <div className="min-w-36 flex-1 space-y-1.5">
              <Label htmlFor="ad-audience" className="text-xs uppercase tracking-wider text-muted-foreground">Audiencia</Label>
              <Input id="ad-audience" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Audiencia general" />
            </div>
            <div className="min-w-36 flex-1 space-y-1.5">
              <Label htmlFor="ad-tone" className="text-xs uppercase tracking-wider text-muted-foreground">Tono</Label>
              <Input id="ad-tone" value={tone} onChange={(event) => setTone(event.target.value)} placeholder="Claro y directo" />
            </div>
            <Button variant="outline" disabled={generating || topic.trim().length < 3} onClick={() => void generate()}>
              <Sparkles className="h-4 w-4" /> {generating ? "Generando…" : "Generar IA"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice ? <p className="mb-4 text-sm text-primary">{notice}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Stage */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-[radial-gradient(circle_at_75%_20%,oklch(0.55_0.12_145/0.10),transparent_28rem)] p-6">
          <Tabs value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
            <TabsList>
              <TabsTrigger value="instagram">Instagram</TabsTrigger>
              <TabsTrigger value="tiktok">TikTok</TabsTrigger>
            </TabsList>
          </Tabs>
          <AdPlatformFrame ad={ad} platform={platform} />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{LAYOUTS.find((item) => item.value === ad.layout)?.label} · {ad.format}</p>
        </div>

        {/* Inspector */}
        <Card className="h-fit">
          <CardContent className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Plantilla y estilo</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Layout</Label>
                <Select value={ad.layout} onValueChange={(value) => set("layout", value as AdLayout)}>
                  <SelectTrigger aria-label="Layout"><SelectValue /></SelectTrigger>
                  <SelectContent>{LAYOUTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Formato</Label>
                <Select value={ad.format} onValueChange={(value) => set("format", value as AdFormat)}>
                  <SelectTrigger aria-label="Formato"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="story">Story</SelectItem>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-3 gap-2">
              {(["accentColor", "bgColor", "textColor"] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{field === "accentColor" ? "Acento" : field === "bgColor" ? "Fondo" : "Texto"}</Label>
                  <input aria-label={field === "accentColor" ? "Acento" : field === "bgColor" ? "Fondo" : "Texto"} type="color" value={record[field] ?? "#000000"} onChange={(event) => set(field, event.target.value)} className="h-9 w-full cursor-pointer rounded-md border border-input bg-transparent p-1" />
                </div>
              ))}
            </div>
            <CampaignAssetSelect campaignId={campaignId === NONE ? undefined : campaignId} value={ad.imageAssetId} onChange={(id) => set("imageAssetId", id)} />

            <Separator />

            {/* Layout text fields */}
            {TEXT_FIELDS[ad.layout].map(({ field, label, multiline }) => (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                {multiline
                  ? <Textarea aria-label={label} value={record[field] ?? ""} onChange={(event) => set(field, event.target.value as AdDocument[typeof field])} rows={2} />
                  : <Input aria-label={label} value={record[field] ?? ""} onChange={(event) => set(field, event.target.value as AdDocument[typeof field])} />}
              </div>
            ))}

            {/* Testimonial stars */}
            {ad.layout === "testimonial" ? (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Estrellas</Label>
                <Select value={String(ad.stars)} onValueChange={(value) => set("stars", Number(value))}>
                  <SelectTrigger aria-label="Estrellas"><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}

            {/* Comparison items */}
            {ad.layout === "comparison" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Items izquierda (uno por línea)</Label>
                  <Textarea aria-label="Items izquierda" value={ad.leftItems.join("\n")} onChange={(event) => set("leftItems", event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Items derecha (uno por línea)</Label>
                  <Textarea aria-label="Items derecha" value={ad.rightItems.join("\n")} onChange={(event) => set("rightItems", event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))} rows={3} />
                </div>
              </>
            ) : null}

            {/* Feature items */}
            {ad.layout === "feature" ? (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Features (emoji y texto por línea)</Label>
                <Textarea
                  aria-label="Features"
                  value={ad.features.map((feature) => `${feature.emoji} ${feature.label}`).join("\n")}
                  onChange={(event) => set("features", event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [emoji, ...rest] = line.split(" "); return { emoji, label: rest.join(" ") }; }))}
                  rows={4}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
