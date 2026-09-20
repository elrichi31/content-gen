"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Save, Sparkles } from "lucide-react";
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
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { StepIndicator, type WizardStep } from "@/components/video/step-indicator";
import { BRAND_FROM_CAMPAIGN, BrandSelect, type BrandOption } from "@/components/brand-select";
import { CampaignAssetSelect } from "@/components/campaign-asset-select";
import { useRequestedContentId } from "@/lib/use-requested-content-id";
import { cn } from "@/lib/utils";

type AdLayout = AdDocument["layout"];
type AdFormat = AdDocument["format"];
type Platform = "instagram" | "tiktok";
type Campaign = { id: string; name: string; brief: string | { topic: string; audience: string; tone: string }; brandKitId: string | null };
type Brand = BrandOption;
type Stored = { id: string; revision: number; campaignId: string; document: { data: unknown } };

const NEW = "new";
const NONE = "none";
const STEPS = ["Plantilla", "Idea", "Contenido", "Vista previa", "Guardar"] as const;

const LAYOUTS: { value: AdLayout; label: string; hint: string }[] = [
  { value: "promo", label: "Promo", hint: "Oferta con precio" },
  { value: "testimonial", label: "Testimonial", hint: "Cita de un cliente" },
  { value: "comparison", label: "Comparación", hint: "Antes vs. ahora" },
  { value: "feature", label: "Features", hint: "Lista de beneficios" },
  { value: "painSolution", label: "Dolor / Solución", hint: "Problema y respuesta" },
];

const FORMATS: { value: AdFormat; label: string; hint: string }[] = [
  { value: "story", label: "Story", hint: "9:16 vertical" },
  { value: "square", label: "Square", hint: "1:1 feed" },
  { value: "landscape", label: "Landscape", hint: "16:9 horizontal" },
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
    { field: "painHeadline", label: "Titular dolor" },
    { field: "painDesc", label: "Descripción dolor", multiline: true },
    { field: "solutionHeadline", label: "Titular solución" },
    { field: "solutionDesc", label: "Descripción solución", multiline: true },
    { field: "cta", label: "CTA" },
  ],
};

function Choice({ active, title, hint, onClick }: { active: boolean; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("rounded-lg border px-3 py-2 text-left transition", active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
      <span className="block text-sm font-medium text-foreground">{title}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

export default function AdsPage() {
  const [ad, setAd] = useState<AdDocument>(adFixture);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stored, setStored] = useState<Stored[]>([]);
  const [campaignId, setCampaignId] = useState(NONE);
  const [brandChoice, setBrandChoice] = useState(BRAND_FROM_CAMPAIGN);
  const [contentId, setContentId] = useState("");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [reached, setReached] = useState<WizardStep>(1);
  // AI form
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);
  // Nano Banana: `nanoFor` guarda el anuncio con el que se dibujó, para avisar si luego se edita.
  const [nanoBusy, setNanoBusy] = useState(false);
  const [nanoUrl, setNanoUrl] = useState("");
  const [nanoFor, setNanoFor] = useState("");
  // Fondo del anuncio: lo dibuja OpenAI o Nano Banana y queda como `imageAssetId`.
  const [bgProvider, setBgProvider] = useState<"openai" | "gemini">("gemini");
  const [bgIdea, setBgIdea] = useState("");
  const [bgBusy, setBgBusy] = useState(false);

  const set = <K extends keyof AdDocument>(field: K, value: AdDocument[K]) => setAd((current) => ({ ...current, [field]: value }));
  const record = ad as unknown as Record<string, string | undefined>;
  const go = (next: WizardStep) => { setStep(next); setReached((current) => Math.max(current, next) as WizardStep); };
  const nanoStale = Boolean(nanoUrl) && nanoFor !== JSON.stringify(ad);
  // La marca elegida a mano manda; si no, la de la campaña. Es la que la IA usa.
  const brandId = brandChoice !== BRAND_FROM_CAMPAIGN ? brandChoice : campaigns.find((campaign) => campaign.id === campaignId)?.brandKitId ?? undefined;
  const activeBrand = brands.find((brand) => brand.id === brandId);

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
    else if (stored.length) setNotice(noticeError("Ese contenido no está disponible: puede estar archivado."));
  }, [requestedId, stored]);

  function chooseCampaign(value: string) {
    setCampaignId(value);
    const campaign = campaigns.find((item) => item.id === value);
    if (campaign && typeof campaign.brief === "object") { setTopic(campaign.brief.topic); setAudience(campaign.brief.audience); setTone(campaign.brief.tone); }
    const brand = brandChoice === BRAND_FROM_CAMPAIGN && campaign?.brandKitId ? brands.find((item) => item.id === campaign.brandKitId) : undefined;
    if (brand) { set("accentColor", brand.primaryColor); setNotice(noticeOk(`Color de marca aplicado (${brand.primaryColor}).`)); }
  }

  function load(item: Stored) {
    const data = item.document.data as AdDocument;
    if (!data || typeof data !== "object" || !("layout" in data)) return setNotice(noticeError("Este contenido no es un AdDocument v1."));
    setAd(data); setContentId(item.id); setRevision(item.revision); setCampaignId(item.campaignId); setNanoUrl("");
    setReached(5); setStep(3); setNotice(noticeOk("Anuncio cargado desde la biblioteca."));
  }

  function restart() {
    setAd(adFixture); setContentId(""); setRevision(0); setNanoUrl(""); setTopic(""); setStep(1); setReached(1); setNotice(null);
  }

  async function save() {
    if (campaignId === NONE) return setNotice(noticeError("Selecciona una campaña antes de guardar."));
    const body = contentId ? { revision, campaignId, type: "ad", document: { schemaVersion: 1, data: ad } } : { campaignId, type: "ad", document: { schemaVersion: 1, data: ad } };
    const response = await fetch(contentId ? `/api/content-items/${contentId}` : "/api/content-items", { method: contentId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const saved = await response.json();
    if (!response.ok) return setNotice(noticeError(typeof saved.error === "string" ? saved.error : "No se pudo guardar el anuncio."));
    setContentId(saved.id); setRevision(saved.revision); setCampaignId(saved.campaignId); setNotice(noticeOk("Guardado en la biblioteca central.")); await refresh();
  }

  function chooseBrand(value: string) {
    setBrandChoice(value);
    const brand = brands.find((item) => item.id === value);
    if (brand) { set("accentColor", brand.primaryColor); setNotice(noticeOk(`Color de ${brand.name} aplicado (${brand.primaryColor}).`)); }
  }

  async function generate() {
    setGenerating(true);
    const body: Record<string, unknown> = { topic, layout: ad.layout, format: ad.format, ...(campaignId === NONE ? {} : { campaignId }), ...(brandId ? { brandKitId: brandId } : {}) };
    if (audience.trim()) body.audience = audience.trim();
    if (tone.trim()) body.tone = tone.trim();
    const response = await fetch("/api/ads/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setGenerating(false);
    if (!response.ok) return setNotice(noticeError(typeof payload.error === "string" ? payload.error : "No se pudo generar el anuncio."));
    setAd(payload.document); setContentId(""); setRevision(0); setNanoUrl(""); setNotice(noticeOk("Anuncio generado. Revisa el contenido y ajústalo.")); go(3);
  }

  async function generateNanoBanana() {
    setNanoBusy(true);
    const response = await fetch("/api/ads/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: ad, ...(campaignId === NONE ? {} : { campaignId }) }) });
    const payload = await response.json().catch(() => ({}));
    setNanoBusy(false);
    if (!response.ok) return setNotice(noticeError(typeof payload.error === "string" ? payload.error : "No se pudo crear el anuncio con Nano Banana."));
    setNanoUrl(payload.url); setNanoFor(JSON.stringify(ad)); setNotice(noticeOk("Anuncio de Nano Banana listo. Compáralo con la plantilla."));
  }

  async function generateBackground() {
    setBgBusy(true);
    const response = await fetch("/api/ads/background", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: ad, provider: bgProvider, description: bgIdea, ...(campaignId === NONE ? {} : { campaignId }), ...(brandId ? { brandKitId: brandId } : {}) }) });
    const payload = await response.json().catch(() => ({}));
    setBgBusy(false);
    if (!response.ok) return setNotice(noticeError(typeof payload.error === "string" ? payload.error : "No se pudo crear el fondo."));
    set("imageAssetId", payload.asset.id); setNotice(noticeOk("Fondo listo. Si no te gusta, genera otro o quítalo."));
  }

  const layoutLabel = LAYOUTS.find((item) => item.value === ad.layout)?.label;

  const stage = (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-[radial-gradient(circle_at_75%_20%,oklch(0.55_0.12_145/0.10),transparent_28rem)] p-6">
      <Tabs value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
        <TabsList>
          <TabsTrigger value="instagram">Instagram</TabsTrigger>
          <TabsTrigger value="tiktok">TikTok</TabsTrigger>
        </TabsList>
      </Tabs>
      <AdPlatformFrame ad={ad} platform={platform} />
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{layoutLabel} · {ad.format}</p>
    </div>
  );

  return (
    <PageShell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Anuncios / Asistente</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Cinco formas de vender una idea.</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Sigue los pasos: elige plantilla, cuéntanos la idea, ajusta el contenido, compara el resultado y guárdalo.</p>
      </div>

      <StepIndicator current={step} reached={reached} onSelect={go} steps={STEPS} />
      <Notice notice={notice} onDismiss={() => setNotice(null)} className="mb-4" />

      {/* 1 · Plantilla y formato */}
      {step === 1 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {stage}
          <Card className="h-fit">
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Plantilla</Label>
                <div className="grid grid-cols-2 gap-2">
                  {LAYOUTS.map((item) => <Choice key={item.value} active={ad.layout === item.value} title={item.label} hint={item.hint} onClick={() => set("layout", item.value)} />)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Formato</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMATS.map((item) => <Choice key={item.value} active={ad.format === item.value} title={item.label} hint={item.hint} onClick={() => set("format", item.value)} />)}
                </div>
              </div>
              {stored.length ? (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">¿Prefieres editar uno guardado?</Label>
                    <Select value={contentId || NEW} onValueChange={(value) => { if (value === NEW) { setContentId(""); setRevision(0); return; } const item = stored.find((entry) => entry.id === value); if (item) load(item); }}>
                      <SelectTrigger aria-label="Documento"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW}>Nuevo anuncio</SelectItem>
                        {stored.map((item) => <SelectItem key={item.id} value={item.id}>{item.id.slice(0, 8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* 2 · Idea (campaña + brief + IA) */}
      {step === 2 ? (
        <Card className="max-w-2xl">
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Campaña</Label>
              <Select value={campaignId} onValueChange={chooseCampaign}>
                <SelectTrigger aria-label="Campaña"><SelectValue placeholder="Selecciona (opcional por ahora)" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Rellena la idea y aplica el color de la marca. La necesitarás para guardar.</p>
            </div>
            <BrandSelect brands={brands} choice={brandChoice} active={activeBrand} onChange={chooseBrand} />
            <div className="space-y-1.5">
              <Label htmlFor="ad-topic" className="text-xs uppercase tracking-wider text-muted-foreground">Idea</Label>
              <Input id="ad-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Tema del anuncio" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ad-audience" className="text-xs uppercase tracking-wider text-muted-foreground">Audiencia</Label>
                <Input id="ad-audience" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder={activeBrand?.business?.audience || "Audiencia general"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ad-tone" className="text-xs uppercase tracking-wider text-muted-foreground">Tono</Label>
                <Input id="ad-tone" value={tone} onChange={(event) => setTone(event.target.value)} placeholder={activeBrand?.business?.voice || "Claro y directo"} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={generating || topic.trim().length < 3} onClick={() => void generate()}>
                <Sparkles className="h-4 w-4" /> {generating ? "Generando…" : "Generar con IA"}
              </Button>
              <Button variant="outline" onClick={() => go(3)}>Escribirlo yo</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 3 · Contenido y estilo */}
      {step === 3 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {stage}
          <Card className="h-fit">
            <CardContent className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Contenido</p>
              {TEXT_FIELDS[ad.layout].map(({ field, label, multiline }) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                  {multiline
                    ? <Textarea aria-label={label} value={record[field] ?? ""} onChange={(event) => set(field, event.target.value as AdDocument[typeof field])} rows={2} />
                    : <Input aria-label={label} value={record[field] ?? ""} onChange={(event) => set(field, event.target.value as AdDocument[typeof field])} />}
                </div>
              ))}

              {ad.layout === "testimonial" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Estrellas</Label>
                  <Select value={String(ad.stars)} onValueChange={(value) => set("stars", Number(value))}>
                    <SelectTrigger aria-label="Estrellas"><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}

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

              {ad.layout === "feature" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Beneficios (uno por línea)</Label>
                  <Textarea
                    aria-label="Beneficios"
                    value={ad.features.map((feature) => feature.label).join("\n")}
                    onChange={(event) => set("features", event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).map((label, index) => ({ emoji: ad.features[index]?.emoji ?? "", label })))}
                    rows={4}
                  />
                </div>
              ) : null}

              <Separator />
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Estilo</p>
              <div className="grid grid-cols-3 gap-2">
                {(["accentColor", "bgColor", "textColor"] as const).map((field) => (
                  <div key={field} className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{field === "accentColor" ? "Acento" : field === "bgColor" ? "Fondo" : "Texto"}</Label>
                    <input aria-label={field === "accentColor" ? "Acento" : field === "bgColor" ? "Fondo" : "Texto"} type="color" value={record[field] ?? "#000000"} onChange={(event) => set(field, event.target.value)} className="h-9 w-full cursor-pointer rounded-md border border-input bg-transparent p-1" />
                  </div>
                ))}
              </div>
              <Separator />
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Fondo</p>
              <div className="space-y-1.5">
                <Label htmlFor="ad-bg-idea" className="text-xs uppercase tracking-wider text-muted-foreground">Cómo lo imaginas (opcional)</Label>
                <Textarea id="ad-bg-idea" value={bgIdea} onChange={(event) => setBgIdea(event.target.value)} rows={2} placeholder="Ej.: taller de cerámica con luz de tarde, tonos cálidos" />
              </div>
              <div className="flex items-center gap-2">
                <Select value={bgProvider} onValueChange={(value) => setBgProvider(value as "openai" | "gemini")}>
                  <SelectTrigger aria-label="Proveedor del fondo" className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Nano Banana · $0.07</SelectItem>
                    <SelectItem value="openai">OpenAI · $0.005</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" disabled={bgBusy} onClick={() => void generateBackground()}>
                  <Sparkles className="h-4 w-4" /> {bgBusy ? "Dibujando…" : ad.imageAssetId ? "Otro fondo" : "Generar fondo"}
                </Button>
              </div>
              {ad.imageAssetId ? <Button variant="ghost" size="sm" onClick={() => set("imageAssetId", null)}>Quitar fondo</Button> : null}
              <CampaignAssetSelect campaignId={campaignId === NONE ? undefined : campaignId} value={ad.imageAssetId} onChange={(id) => set("imageAssetId", id)} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* 4 · Vista previa: plantilla frente a Nano Banana */}
      {step === 4 ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Plantilla</p>
            {stage}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Nano Banana</p>
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 p-6">
              <p className="max-w-sm text-center text-sm text-muted-foreground">Dibuja el anuncio completo como una imagen con IA. Cuesta unos $0.07 por intento.</p>
              <Button variant="outline" disabled={nanoBusy} onClick={() => void generateNanoBanana()}>
                <Sparkles className="h-4 w-4" /> {nanoBusy ? "Dibujando…" : nanoUrl ? "Dibujar de nuevo" : "Dibujar con Nano Banana"}
              </Button>
              {nanoUrl ? (
                <figure className="w-full max-w-md space-y-2 text-center">
                  <img src={nanoUrl} alt="Anuncio generado por Nano Banana" className="w-full rounded-lg border border-border/60" />
                  <figcaption className="text-xs uppercase tracking-wider text-muted-foreground">
                    {nanoStale ? "Desactualizado: cambiaste el anuncio · " : ""}<a className="underline" href={nanoUrl} download>Descargar</a>
                  </figcaption>
                </figure>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 5 · Guardar */}
      {step === 5 ? (
        <Card className="max-w-2xl">
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Resumen</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{ad.headline || ad.compHeadline || ad.featHeadline || ad.quote || ad.painHeadline}</p>
              <p className="text-sm text-muted-foreground">{layoutLabel} · {ad.format}{contentId ? " · ya guardado, se actualiza" : ""}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Campaña</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger aria-label="Campaña para guardar"><SelectValue placeholder="Selecciona una campaña" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void save()}><Save className="h-4 w-4" /> Guardar</Button>
              <Button variant="outline" onClick={restart}><Plus className="h-4 w-4" /> Crear otro anuncio</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="outline" disabled={step === 1} onClick={() => go((step - 1) as WizardStep)}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
        {step < 5 ? <Button onClick={() => go((step + 1) as WizardStep)}>Siguiente <ArrowRight className="h-4 w-4" /></Button> : null}
      </div>
    </PageShell>
  );
}
