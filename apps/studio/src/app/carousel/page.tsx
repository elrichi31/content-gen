"use client";

import { useEffect, useState } from "react";
import { Plus, Undo2, Redo2, Save, ArrowLeft, ArrowRight, Copy, Trash2, Hash, Image as ImageIcon, FileArchive, RefreshCw, Wand2, Link2, Pencil, PencilOff, Check } from "lucide-react";
import type { CarouselDocument } from "@content-gen/domain/carousel";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspacePanel } from "@/components/workspace-panel";
import { CarouselGenerator } from "@/components/carousel-generator";
import { CarouselImagePanel } from "@/components/carousel-image-panel";
import { CarouselFrame, carouselFixture, type CarouselBackground, type CarouselFont, type CarouselPlatform, type CarouselTheme } from "@/components/carousel-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useRequestedContentId } from "@/lib/use-requested-content-id";

type Slide = typeof carouselFixture.slides[number];
type Campaign = { id: string; name: string; brief: string | { topic: string; audience: string; tone: string }; brandKitId: string | null };
type Brand = { id: string; name: string; primaryColor: string };
type Stored = { id: string; revision: number; campaignId: string; document: { data: unknown } };
const layouts = ["cover", "content", "list", "bigNumber", "quote", "split", "imageOverlay", "timeline", "statGrid", "cta"] as const;
const NEW = "new";
const NONE = "none";

// Mismas pestañas de plataforma que `carousel-ai/app/workspace/carousel/page.tsx`.
const PLATFORM_TABS = [
  {
    id: "instagram" as const,
    label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    id: "tiktok" as const,
    label: "TikTok",
    icon: (
      <svg viewBox="0 0 48 48" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M38.4 21.68V16c-3.4 0-5.98-1.2-7.8-3.58a11.6 11.6 0 01-2.2-5.02h-5.8v25.4a5.2 5.2 0 01-5.2 5.2 5.2 5.2 0 01-5.2-5.2 5.2 5.2 0 015.2-5.2c.56 0 1.1.08 1.6.24v-5.88c-.52-.06-1.06-.1-1.6-.1A11.08 11.08 0 006.32 33.74 11.08 11.08 0 0017.4 44.82a11.08 11.08 0 0011.08-11.08V21.08A17.2 17.2 0 0038.4 25v-3.32z" />
      </svg>
    ),
  },
];

export default function CarouselPage() {
  const [slides, setSlides] = useState<Slide[]>(carouselFixture.slides);
  const [active, setActive] = useState(0);
  const [past, setPast] = useState<Slide[][]>([]);
  const [future, setFuture] = useState<Slide[][]>([]);
  const [platform, setPlatform] = useState<CarouselPlatform>("instagram");
  const [theme, setTheme] = useState<CarouselTheme>("green");
  const [font, setFont] = useState<CarouselFont>("playfair");
  const [background, setBackground] = useState<CarouselBackground>("grid");
  const [themeTouched, setThemeTouched] = useState(false);
  const [caption, setCaption] = useState(carouselFixture.caption);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stored, setStored] = useState<Stored[]>([]);
  const [campaignId, setCampaignId] = useState(NONE);
  const [contentId, setContentId] = useState("");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [remixUrl, setRemixUrl] = useState("");
  const [remixCount, setRemixCount] = useState(6);
  const [editMode, setEditMode] = useState(false);
  const current = slides[active];
  const document = { ...carouselFixture, slides, platform, caption };
  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const brandColor = selectedCampaign?.brandKitId ? brands.find((brand) => brand.id === selectedCampaign.brandKitId)?.primaryColor : undefined;
  const accentColor = brandColor && !themeTouched ? brandColor : undefined;

  async function refresh() {
    const [campaignResponse, contentResponse, brandResponse] = await Promise.all([fetch("/api/campaigns"), fetch("/api/content-items?type=carousel"), fetch("/api/brand-kits")]);
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

  // Atajos del original: Ctrl+Z deshacer, Ctrl+Y o Ctrl+Shift+Z rehacer.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || tag === "input" || tag === "textarea") return;
      if (event.key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (event.key === "y" || (event.key === "z" && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function commit(next: Slide[]) { setPast((value) => [...value.slice(-24), slides]); setSlides(next); setFuture([]); }
  function update(field: string, value: string) { commit(slides.map((slide, index) => index === active ? { ...slide, [field]: value } : slide)); }
  function duplicate() { const next = { ...current, id: crypto.randomUUID(), title: current.title ? `${current.title} (copia)` : current.title }; commit([...slides.slice(0, active + 1), next, ...slides.slice(active + 1)]); setActive(active + 1); }
  function create() { const next = { ...current, id: crypto.randomUUID(), title: "Nueva idea", content: "Escribe una idea clara.", layout: "content" as const }; commit([...slides, next]); setActive(slides.length); }
  function remove() { if (slides.length < 2) return; commit(slides.filter((_, index) => index !== active)); setActive(Math.max(0, active - 1)); }
  function move(offset: number) { const target = active + offset; if (target < 0 || target >= slides.length) return; const next = [...slides]; [next[active], next[target]] = [next[target], next[active]]; commit(next); setActive(target); }
  function applyImage(url: string, source: "dalle" | "unsplash" | "upload") { commit(slides.map((slide, index) => index === active ? { ...slide, imageUrl: url || undefined, imageSource: url ? source : undefined } : slide)); }
  function setCaptionText(text: string) { setCaption((value) => ({ ...value, text })); }
  function setHashtags(value: string) { setCaption((current) => ({ ...current, hashtags: value.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)) })); }
  async function exportCarousel(format: "png" | "zip") {
    setBusy(format);
    try {
      const response = await fetch("/api/carousels/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, format }) });
      if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error ?? "No se pudo exportar."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = `carousel.${format}`;
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(format === "png" ? "Portada exportada como PNG." : "Carrusel exportado como ZIP (incluye caption.txt).");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo exportar."); }
    finally { setBusy(""); }
  }
  async function slideAction(action: "regenerate" | "add") {
    setBusy(action);
    try {
      const response = await fetch("/api/carousels/slides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, document, index: active }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo modificar la slide.");
      const next = payload.document as CarouselDocument;
      commit(next.slides); setCaption(next.caption);
      setActive(action === "add" ? Math.max(0, next.slides.length - 2) : active);
      setNotice(action === "regenerate" ? "Slide regenerada con IA." : "Slide añadida antes del CTA.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo modificar la slide."); }
    finally { setBusy(""); }
  }
  async function remix() {
    setBusy("remix");
    try {
      const response = await fetch("/api/carousels/remix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: remixUrl, slideCount: remixCount }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear el remix.");
      applyGenerated(payload.document);
      setNotice("Remix generado desde la URL. Revísalo y guárdalo.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo crear el remix."); }
    finally { setBusy(""); }
  }
  function undo() { const previous = past.at(-1); if (!previous) return; setPast((value) => value.slice(0, -1)); setFuture((value) => [slides, ...value].slice(0, 25)); setSlides(previous); setActive(Math.min(active, previous.length - 1)); }
  function redo() { const next = future[0]; if (!next) return; setFuture((value) => value.slice(1)); setPast((value) => [...value.slice(-24), slides]); setSlides(next); setActive(Math.min(active, next.length - 1)); }
  function load(item: Stored) {
    const data = item.document.data as { slides?: Slide[]; platform?: CarouselPlatform; caption?: CarouselDocument["caption"] };
    if (!Array.isArray(data.slides)) return setNotice("Este contenido todavía no usa CarouselDocument v1.");
    setSlides(data.slides); setPlatform(data.platform ?? "instagram"); setCaption(data.caption ?? carouselFixture.caption); setContentId(item.id); setRevision(item.revision); setCampaignId(item.campaignId); setThemeTouched(false); setActive(0); setPast([]); setFuture([]); setNotice("Documento cargado desde la biblioteca.");
  }
  function applyGenerated(generated: CarouselDocument) {
    setSlides(generated.slides); setPlatform(generated.platform); setCaption(generated.caption); setContentId(""); setRevision(0); setActive(0); setPast([]); setFuture([]);
  }
  async function save() {
    if (campaignId === NONE) return setNotice("Selecciona una campaña antes de guardar.");
    const body = contentId ? { revision, campaignId, type: "carousel", document: { schemaVersion: 1, data: document } } : { campaignId, type: "carousel", document: { schemaVersion: 1, data: document } };
    const response = await fetch(contentId ? `/api/content-items/${contentId}` : "/api/content-items", { method: contentId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const saved = await response.json();
    if (!response.ok) return setNotice(saved.error ?? "No se pudo guardar.");
    setContentId(saved.id); setRevision(saved.revision); setCampaignId(saved.campaignId); setNotice("Guardado en la biblioteca central."); await refresh();
  }
  const primaryField = current.layout === "cta" ? "ctaText" : current.layout === "quote" ? "quote" : current.layout === "bigNumber" ? "bigNumberLabel" : "title";
  const secondaryField = current.layout === "cta" ? "ctaSubtext" : current.layout === "quote" ? "quoteAuthor" : "content";
  const record = current as unknown as Record<string, string | undefined>;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="overflow-hidden pt-14 md:pl-64 md:pt-0">
        <main className="mx-auto h-[calc(100vh-3.5rem)] w-full max-w-[1800px] px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 md:h-screen">
          <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_300px] 2xl:grid-cols-[340px_minmax(720px,1fr)_320px]">

            <WorkspacePanel className="hidden lg:block">
              <div className="flex h-full flex-col overflow-y-auto p-5">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">Carrusel</p>
                  <h1 className="text-base font-semibold text-foreground">Una idea, diez formas.</h1>
                  <p className="text-xs leading-relaxed text-muted-foreground">Genera con IA, edita sobre la pieza y guarda en la biblioteca central.</p>
                </div>

                <Separator className="my-5" />

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Documento</Label>
                    <Select
                      value={contentId || NEW}
                      onValueChange={(value) => {
                        if (value === NEW) { setContentId(""); setRevision(0); return; }
                        const item = stored.find((entry) => entry.id === value);
                        if (item) load(item);
                      }}
                    >
                      <SelectTrigger aria-label="Documento" className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW}>Nuevo documento</SelectItem>
                        {stored.map((item) => <SelectItem key={item.id} value={item.id}>{item.id.slice(0, 8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Campaña</Label>
                    <Select value={campaignId} onValueChange={(value) => { setCampaignId(value); setThemeTouched(false); }}>
                      <SelectTrigger aria-label="Campaña" className="h-9"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                      <SelectContent>
                        {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={() => void save()}><Save className="h-4 w-4" /> Guardar</Button>
                </div>

                <Separator className="my-5" />

                <CarouselGenerator campaignId={campaignId === NONE ? undefined : campaignId} brief={selectedCampaign && typeof selectedCampaign.brief === "object" ? selectedCampaign.brief : undefined} onGenerated={applyGenerated} onNotice={setNotice} />

                <Separator className="my-5" />

                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remix desde URL</p>
                  <Input id="remix-url" aria-label="URL para remix" className="h-9" value={remixUrl} onChange={(event) => setRemixUrl(event.target.value)} placeholder="https://articulo-a-remixear.com" />
                  <div className="flex items-end gap-2">
                    <div className="w-20 space-y-1.5">
                      <Label htmlFor="remix-slides" className="text-[10px] uppercase tracking-wider text-muted-foreground">Slides</Label>
                      <Input id="remix-slides" className="h-9" type="number" min={3} max={20} value={remixCount} onChange={(event) => setRemixCount(Number(event.target.value))} />
                    </div>
                    <Button variant="outline" className="flex-1" disabled={busy === "remix" || remixUrl.trim().length < 8} onClick={() => void remix()}>
                      <Link2 className="h-4 w-4" /> {busy === "remix" ? "Remixeando…" : "Remix"}
                    </Button>
                  </div>
                </div>

                {notice ? <p className="mt-5 text-xs text-primary">{notice}</p> : null}
              </div>
            </WorkspacePanel>

            <section className="min-h-0 overflow-hidden rounded-[28px] border border-border/60 bg-muted/20">
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-1 border-b border-border/30 px-3 py-2">
                  <div className="flex items-center gap-0.5">
                    {PLATFORM_TABS.map(({ id, label, icon }) => (
                      <button
                        key={id}
                        onClick={() => setPlatform(id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                          platform === id ? "border border-primary/40 bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                        )}
                      >
                        {icon}
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mx-2 h-4 w-px bg-border/40" />

                  <button
                    onClick={() => setEditMode((value) => !value)}
                    title={editMode ? "Salir del modo edición" : "Editar texto directamente"}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                      editMode ? "border border-primary/40 bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                    )}
                  >
                    {editMode ? <PencilOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{editMode ? "Salir" : "Editar"}</span>
                  </button>

                  <div className="ml-auto flex items-center gap-1">
                    {contentId ? (
                      <span className="mr-1 hidden items-center gap-1 text-[10px] text-muted-foreground/50 sm:flex">
                        <Check className="h-3 w-3 text-green-500/70" /> Guardado
                      </span>
                    ) : null}
                    <button
                      onClick={undo}
                      disabled={!past.length}
                      title="Deshacer (Ctrl+Z)"
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={redo}
                      disabled={!future.length}
                      title="Rehacer (Ctrl+Y)"
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Redo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto flex min-h-full w-full flex-col items-center justify-start gap-3 p-4 sm:p-6 xl:p-8">
                    <CarouselFrame document={document} activeSlide={active} onSlideChange={setActive} platform={platform} theme={theme} font={font} background={background} accentColor={accentColor} onUpdate={editMode ? update : undefined} />
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{current.layout} · slide {active + 1} de {slides.length}{editMode ? " · edición directa activa" : ""}</p>
                  </div>
                </div>
              </div>
            </section>

            <WorkspacePanel className="hidden xl:block">
              <div className="flex h-full flex-col overflow-y-auto p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Ficha de slide</p>

                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Layout</Label>
                    <Select value={current.layout} onValueChange={(value) => commit(slides.map((slide, index) => index === active ? { ...slide, layout: value as Slide["layout"] } : slide))}>
                      <SelectTrigger aria-label="Layout" className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {layouts.map((layout) => <SelectItem key={layout} value={layout}>{layout}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Texto principal</Label>
                    <Textarea aria-label="Texto principal" value={record[primaryField] ?? ""} onChange={(event) => update(primaryField, event.target.value)} rows={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Texto secundario</Label>
                    <Textarea aria-label="Texto secundario" value={record[secondaryField] ?? ""} onChange={(event) => update(secondaryField, event.target.value)} rows={3} />
                  </div>

                  <CarouselImagePanel imageUrl={current.imageUrl} campaignId={campaignId === NONE ? undefined : campaignId} onApply={applyImage} />

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => move(-1)} disabled={!active}><ArrowLeft className="h-4 w-4" /> Mover</Button>
                    <Button variant="outline" size="sm" onClick={() => move(1)} disabled={active === slides.length - 1}>Mover <ArrowRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={duplicate}><Copy className="h-4 w-4" /> Duplicar</Button>
                    <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={remove} disabled={slides.length < 2}><Trash2 className="h-4 w-4" /> Eliminar</Button>
                    <Button variant="outline" size="sm" onClick={create}><Plus className="h-4 w-4" /> Nueva</Button>
                    <Button variant="outline" size="sm" disabled={busy === "add"} onClick={() => void slideAction("add")}><Wand2 className="h-4 w-4" /> {busy === "add" ? "Añadiendo…" : "IA"}</Button>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" disabled={busy === "regenerate"} onClick={() => void slideAction("regenerate")}>
                    <RefreshCw className="h-4 w-4" /> {busy === "regenerate" ? "Regenerando…" : "Regenerar slide (IA)"}
                  </Button>
                </div>

                <Separator className="my-5" />

                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Estilo</p>
                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Tema
                      {accentColor ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-foreground"><span className="h-2 w-2 rounded-full" style={{ background: accentColor }} />marca</span> : null}
                    </Label>
                    <Select value={theme} onValueChange={(value) => { setTheme(value as CarouselTheme); setThemeTouched(true); }}>
                      <SelectTrigger aria-label="Tema" className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="green">Verde</SelectItem>
                        <SelectItem value="blue">Azul</SelectItem>
                        <SelectItem value="purple">Morado</SelectItem>
                        <SelectItem value="orange">Naranja</SelectItem>
                        <SelectItem value="red">Rojo</SelectItem>
                        <SelectItem value="pink">Rosa</SelectItem>
                        <SelectItem value="teal">Turquesa</SelectItem>
                        <SelectItem value="yellow">Amarillo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuente</Label>
                    <Select value={font} onValueChange={(value) => setFont(value as CarouselFont)}>
                      <SelectTrigger aria-label="Fuente" className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geist">Geist</SelectItem>
                        <SelectItem value="playfair">Playfair</SelectItem>
                        <SelectItem value="space">Space Grotesk</SelectItem>
                        <SelectItem value="sora">Sora</SelectItem>
                        <SelectItem value="mono">Monospace</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fondo</Label>
                    <Select value={background} onValueChange={(value) => setBackground(value as CarouselBackground)}>
                      <SelectTrigger aria-label="Fondo" className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gradient">Gradiente</SelectItem>
                        <SelectItem value="lines">Líneas</SelectItem>
                        <SelectItem value="dots">Puntos</SelectItem>
                        <SelectItem value="grid">Retícula</SelectItem>
                        <SelectItem value="noise">Ruido</SelectItem>
                        <SelectItem value="radial">Radial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="my-5" />

                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">Caption</p>
                </div>
                <div className="mt-4 space-y-3">
                  <Textarea aria-label="Caption" value={caption.text} onChange={(event) => setCaptionText(event.target.value)} rows={4} placeholder="Escribe el texto que acompaña a la publicación…" />
                  <Input aria-label="Hashtags" className="h-9" value={caption.hashtags.join(" ")} onChange={(event) => setHashtags(event.target.value)} placeholder="#contenido #diseño" />
                  {caption.hashtags.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {caption.hashtags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>)}
                    </div>
                  ) : null}
                </div>

                <Separator className="my-5" />

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled={busy === "png"} onClick={() => void exportCarousel("png")}>
                    <ImageIcon className="h-4 w-4" /> {busy === "png" ? "…" : "PNG"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy === "zip"} onClick={() => void exportCarousel("zip")}>
                    <FileArchive className="h-4 w-4" /> {busy === "zip" ? "…" : "ZIP"}
                  </Button>
                </div>
              </div>
            </WorkspacePanel>
          </div>
        </main>
      </div>
    </div>
  );
}
