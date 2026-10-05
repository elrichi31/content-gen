"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Undo2, Redo2, Save, ArrowLeft, ArrowRight, Copy, Trash2, Image as ImageIcon, FileArchive, RefreshCw, Wand2, Link2, Pencil, PencilOff, Check, SlidersHorizontal, X } from "lucide-react";
import type { CarouselDocument } from "@content-gen/domain/carousel";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspacePanel } from "@/components/workspace-panel";
import { CarouselGenerator } from "@/components/carousel-generator";
import { BRAND_FROM_CAMPAIGN, BrandSelect, type BrandOption } from "@/components/brand-select";
import { CarouselImagePanel } from "@/components/carousel-image-panel";
import { LayoutVariantPicker } from "@/components/editor/layout-picker";
import { CarouselExportSheet, CarouselFrame, carouselFixture, type CarouselBackground, type CarouselFont, type CarouselPlatform, type CarouselTheme } from "@/components/carousel-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "thinking-orbs";
import { colorThemes } from "@/lib/themes";
import { useRadarTopic } from "@/lib/use-radar-topic";
import { useRequestedContentId } from "@/lib/use-requested-content-id";
import { CAROUSEL_MODES, ModeSwitch } from "@/components/mode-switch";

type Slide = typeof carouselFixture.slides[number];
type Campaign = { id: string; name: string; brief: string | { topic: string; audience: string; tone: string }; brandKitId: string | null };
type Brand = BrandOption;
type Stored = { id: string; revision: number; campaignId: string; campaignName?: string; updatedAt?: string; document: { data: unknown } };
const layouts = ["cover", "content", "list", "bigNumber", "quote", "split", "imageOverlay", "timeline", "statGrid", "cta"] as const;

/** El nombre interno del layout no es el nombre del layout: la pantalla está en español. */
const LAYOUT_LABEL: Record<(typeof layouts)[number], string> = {
  cover: "Portada", content: "Contenido", list: "Lista", bigNumber: "Número grande", quote: "Cita",
  split: "Dividido", imageOverlay: "Imagen de fondo", timeline: "Línea de tiempo", statGrid: "Rejilla de datos", cta: "Cierre (CTA)",
};

/**
 * Los campos que dibuja cada layout, con su nombre para quien edita. Antes eran «texto principal» y
 * «secundario» para todos, y en la portada el secundario editaba un campo que la portada no pinta.
 */
const FIELDS: Record<string, { primary: string; primaryLabel: string; secondary?: string; secondaryLabel?: string }> = {
  cover: { primary: "title", primaryLabel: "Título", secondary: "subtitle", secondaryLabel: "Subtítulo" },
  content: { primary: "title", primaryLabel: "Título", secondary: "content", secondaryLabel: "Texto" },
  list: { primary: "title", primaryLabel: "Título" },
  bigNumber: { primary: "bigNumber", primaryLabel: "Cifra", secondary: "bigNumberLabel", secondaryLabel: "Qué significa" },
  quote: { primary: "quote", primaryLabel: "Cita", secondary: "quoteAuthor", secondaryLabel: "Autor" },
  split: { primary: "title", primaryLabel: "Título", secondary: "content", secondaryLabel: "Texto" },
  imageOverlay: { primary: "title", primaryLabel: "Título", secondary: "subtitle", secondaryLabel: "Subtítulo" },
  timeline: { primary: "title", primaryLabel: "Título" },
  statGrid: { primary: "title", primaryLabel: "Título" },
  cta: { primary: "ctaText", primaryLabel: "Llamado a la acción", secondary: "ctaSubtext", secondaryLabel: "Texto de apoyo" },
};

const THEME_LABEL: Record<CarouselTheme, string> = { green: "Verde", blue: "Azul", purple: "Morado", orange: "Naranja", red: "Rojo", pink: "Rosa", teal: "Turquesa", yellow: "Amarillo" };
/** Instagram corta el caption a la vista en ~125 caracteres; pasados 300 ya casi nadie lo lee. */
const CAPTION_LIMIT = 300;

/** Si el layout dibuja una foto. En los demás la foto no se ve aunque exista. */
const slideUsesPhoto = (slide: Slide) => slide.layout === "split" || slide.layout === "imageOverlay" || slide.imagePosition === "background" || (slide.layout === "content" && /image-(left|right)/.test(slide.layoutVariant ?? ""));

function PanelSection({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function IconAction({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cn("flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4", danger && "ml-auto hover:bg-destructive/10 hover:text-destructive")}>
      {children}
    </button>
  );
}

function Swatch({ color, label, selected, onClick, brand }: { color: string; label: string; selected: boolean; onClick: () => void; brand?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} title={label} onClick={onClick}
      className={cn("relative h-7 w-7 rounded-full border border-black/10 transition-transform hover:scale-110", selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: color }}>
      {brand ? <span aria-hidden className="absolute -right-1 -top-1 rounded-full bg-foreground px-1 text-[8px] font-bold leading-3 text-background">M</span> : null}
    </button>
  );
}

/** Layouts cuyo contenido real son sus elementos, no un párrafo. */
const LIST_LAYOUTS = new Set(["list", "timeline", "statGrid"]);

/**
 * Lo que se compara para saber si hay cambios sin guardar. Es exactamente lo que se persiste:
 * si entrara algo más —el tema visual, por ejemplo— la pieza aparecería sucia sin haberla tocado.
 */
const snapshotOf = (slides: Slide[], platform: CarouselPlatform, caption: CarouselDocument["caption"], style: CarouselStyle = DEFAULT_STYLE, topic = carouselFixture.topic) =>
  JSON.stringify({ slides, platform, caption, style, topic });

/** El aspecto del carrusel se guarda con el documento, para que al volver a abrirlo se vea igual. */
type CarouselStyle = { theme: CarouselTheme; themeTouched: boolean; customColor?: string; font: CarouselFont; background: CarouselBackground; surface: "light" | "dark" | "brand"; decor: boolean };
const DEFAULT_STYLE: CarouselStyle = { theme: "green", themeTouched: false, font: "poster", background: "aura", surface: "light", decor: true };

/** Nombre con el que se reconoce un documento guardado. El identificador no es un nombre. */
function storedLabel(item: Stored) {
  const data = item.document.data as { topic?: unknown; slides?: { title?: unknown }[] } | null;
  const topic = typeof data?.topic === "string" ? data.topic.trim() : "";
  const first = typeof data?.slides?.[0]?.title === "string" ? (data.slides[0].title as string).trim() : "";
  // El tema de ejemplo no distingue nada: si es ese, manda el titular de la portada.
  const name = (topic && topic !== carouselFixture.topic ? topic : first || topic) || "Sin título";
  // Varias piezas pueden llamarse igual: la campaña y la fecha las separan.
  const date = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("es", { day: "numeric", month: "short" }) : "";
  return [name, item.campaignName, date].filter(Boolean).join(" · ");
}
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
  const [font, setFont] = useState<CarouselFont>("poster");
  const [background, setBackground] = useState<CarouselBackground>("aura");
  const [customColor, setCustomColor] = useState<string>();
  // Claro y con formas por defecto: el estilo editorial de las plantillas de referencia.
  const [surface, setSurface] = useState<"light" | "dark" | "brand">("light");
  const [decor, setDecor] = useState(true);
  const [themeTouched, setThemeTouched] = useState(false);
  const [caption, setCaption] = useState(carouselFixture.caption);
  // Nombre con el que aparece en la biblioteca: el tema generado, o lo que escribas.
  const [topic, setTopic] = useState(carouselFixture.topic);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stored, setStored] = useState<Stored[]>([]);
  const [campaignId, setCampaignId] = useState(NONE);
  const [brandChoice, setBrandChoice] = useState(BRAND_FROM_CAMPAIGN);
  const [contentId, setContentId] = useState("");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<NoticeState>(null);
  // Contra qué se compara «sin guardar». Arranca con la pieza de ejemplo: recién abierta no hay
  // nada que perder, y marcarla como sucia enseñaría a ignorar el aviso desde el primer segundo.
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf(carouselFixture.slides, "instagram", carouselFixture.caption));
  const [busy, setBusy] = useState("");
  const [remixUrl, setRemixUrl] = useState("");
  const [remixCount, setRemixCount] = useState(6);
  const [editMode, setEditMode] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const current = slides[active];
  const document = { ...carouselFixture, topic: topic.trim() || carouselFixture.topic, slides, platform, caption };
  const style: CarouselStyle = { theme, themeTouched, customColor, font, background, surface, decor };
  const dirty = snapshotOf(slides, platform, caption, style, topic) !== savedSnapshot;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  // La marca elegida a mano manda; si no, la de la campaña. Es la que la IA usa y la que tiñe los slides.
  const brandId = brandChoice !== BRAND_FROM_CAMPAIGN ? brandChoice : selectedCampaign?.brandKitId ?? undefined;
  const activeBrand = brands.find((brand) => brand.id === brandId);
  const brandColor = activeBrand?.primaryColor;
  // Manda el color que se eligió a mano: personalizado, luego un preset; si no se tocó, el de la marca.
  const accentColor = customColor ?? (brandColor && !themeTouched ? brandColor : undefined);
  const primaryColor = accentColor ?? colorThemes[theme].primary;
  const brandSettings = activeBrand ? { name: activeBrand.name, logoUrl: activeBrand.logoAssetId ? `/api/assets/${activeBrand.logoAssetId}` : null, colors: [activeBrand.primaryColor] } : null;

  async function refresh() {
    const [campaignResponse, contentResponse, brandResponse] = await Promise.all([fetch("/api/campaigns"), fetch("/api/content-items?type=carousel"), fetch("/api/brand-kits")]);
    setCampaigns(await campaignResponse.json());
    setStored(await contentResponse.json());
    setBrands(await brandResponse.json());
  }
  useEffect(() => { void refresh(); }, []);

  const requestedId = useRequestedContentId();
  // Llegada desde el radar: el encargo se arma con el tema y sus fuentes, no solo con el titular.
  const radar = useRadarTopic("carousel");
  useEffect(() => {
    if (!requestedId || contentId === requestedId) return;
    const item = stored.find((entry) => entry.id === requestedId);
    if (item) load(item);
    else if (stored.length) setNotice(noticeError("Ese contenido no está disponible: puede estar archivado."));
  }, [requestedId, stored]);

  // El trabajo vive en memoria hasta que se guarda, y el historial de deshacer también: una
  // recarga se lo lleva entero sin preguntar. El navegador solo deja avisar, así que se avisa.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Autoguardado: 2 s después del último cambio, si hay campaña. Sin campaña no hay dónde guardarlo.
  const saving = useRef(false);
  const autosave = useRef(save); autosave.current = save;
  useEffect(() => {
    if (!dirty || campaignId === NONE) return;
    const timer = setTimeout(() => void autosave.current(true), 2000);
    return () => clearTimeout(timer);
  }, [dirty, campaignId, slides, caption, topic, platform, theme, themeTouched, customColor, font, background, surface, decor]);

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
  useEffect(() => {
    if (!inspectorOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setInspectorOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [inspectorOpen]);

  function commit(next: Slide[]) { setPast((value) => [...value.slice(-24), slides]); setSlides(next); setFuture([]); }
  function update(field: string, value: string) { commit(slides.map((slide, index) => index === active ? { ...slide, [field]: value } : slide)); }
  function duplicate() { const next = { ...current, id: crypto.randomUUID(), title: current.title ? `${current.title} (copia)` : current.title }; commit([...slides.slice(0, active + 1), next, ...slides.slice(active + 1)]); setActive(active + 1); }
  function create() { const next = { ...current, id: crypto.randomUUID(), title: "Nueva idea", content: "Escribe una idea clara.", layout: "content" as const }; commit([...slides, next]); setActive(slides.length); }
  function remove() { if (slides.length < 2) return; commit(slides.filter((_, index) => index !== active)); setActive(Math.max(0, active - 1)); }
  function move(offset: number) { const target = active + offset; if (target < 0 || target >= slides.length) return; const next = [...slides]; [next[active], next[target]] = [next[target], next[active]]; commit(next); setActive(target); }
  /**
   * Los elementos de una slide de lista. El marco de preview aceptaba `onUpdateListItem` desde
   * el principio y nadie se lo pasaba, así que `list`, `timeline` y `statGrid` eran de solo
   * lectura: se generaban con IA y ya no había forma de tocarlos.
   */
  const patchList = (mutate: (items: { emoji: string; text: string }[]) => { emoji: string; text: string }[]) =>
    commit(slides.map((slide, index) => index === active ? { ...slide, listItems: mutate([...(slide.listItems ?? [])]) } : slide));
  const updateListItem = (index: number, text: string) => patchList((items) => items.map((item, position) => position === index ? { ...item, text } : item));
  const updateListEmoji = (index: number, emoji: string) => patchList((items) => items.map((item, position) => position === index ? { ...item, emoji } : item));
  const addListItem = () => patchList((items) => [...items, { emoji: String(items.length + 1).padStart(2, "0"), text: "" }]);
  const removeListItem = (index: number) => patchList((items) => items.filter((_, position) => position !== index));

  function applyImage(url: string, source: "dalle" | "unsplash" | "upload" | "illustration") { commit(slides.map((slide, index) => index === active ? { ...slide, imageUrl: url || undefined, imageSource: url ? source : undefined } : slide)); }
  function setCaptionText(text: string) { setCaption((value) => ({ ...value, text })); }
  function setHashtags(value: string) { setCaption((current) => ({ ...current, hashtags: value.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)) })); }
  async function exportCarousel(format: "png" | "zip") {
    setBusy(format);
    try {
      // Se capturan las slides reales (renderizadas fuera de pantalla), no un dibujo aparte del servidor.
      const { domToPng } = await import("modern-screenshot");
      await window.document.fonts.ready;
      const nodes = [...window.document.querySelectorAll<HTMLElement>("[data-export-slide]")].slice(0, format === "png" ? 1 : undefined);
      const images = [];
      // ponytail: el grano SVG (feTurbulence) del fondo Aura sale negro al capturar; se quita solo en la copia exportada.
      const dropGrain = (el: Node) => { if (el instanceof HTMLElement && el.style.backgroundImage.includes("feTurbulence")) { el.style.backgroundImage = el.style.backgroundImage.replace(/^url\(".*?"\),\s*/, ""); el.style.backgroundSize = "100% 100%"; } };
      for (const node of nodes) images.push(await domToPng(node, { scale: 3, onCloneEachNode: dropGrain }));
      const response = await fetch("/api/carousels/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, format, images }) });
      if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error ?? "No se pudo exportar."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = `carousel.${format}`;
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(noticeOk(format === "png" ? "Portada exportada como PNG." : "Carrusel exportado como ZIP (incluye caption.txt)."));
    } catch (error) { setNotice(noticeError(error instanceof Error ? error.message : "No se pudo exportar.")); }
    finally { setBusy(""); }
  }
  async function slideAction(action: "regenerate" | "add") {
    setBusy(action);
    try {
      const response = await fetch("/api/carousels/slides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, document, index: active, brandKitId: brandId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo modificar la slide.");
      const next = payload.document as CarouselDocument;
      commit(next.slides); setCaption(next.caption);
      setActive(action === "add" ? Math.max(0, next.slides.length - 2) : active);
      setNotice(noticeOk(action === "regenerate" ? "Slide regenerada con IA." : "Slide añadida antes del cierre."));
    } catch (error) { setNotice(noticeError(error instanceof Error ? error.message : "No se pudo modificar la slide.")); }
    finally { setBusy(""); }
  }
  async function remix() {
    setBusy("remix");
    try {
      const response = await fetch("/api/carousels/remix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: remixUrl, slideCount: remixCount }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear el remix.");
      applyGenerated(payload.document);
      setNotice(noticeOk("Remix generado desde la URL. Revísalo y guárdalo."));
    } catch (error) { setNotice(noticeError(error instanceof Error ? error.message : "No se pudo crear el remix.")); }
    finally { setBusy(""); }
  }
  function undo() { const previous = past.at(-1); if (!previous) return; setPast((value) => value.slice(0, -1)); setFuture((value) => [slides, ...value].slice(0, 25)); setSlides(previous); setActive(Math.min(active, previous.length - 1)); }
  function redo() { const next = future[0]; if (!next) return; setFuture((value) => value.slice(1)); setPast((value) => [...value.slice(-24), slides]); setSlides(next); setActive(Math.min(active, next.length - 1)); }
  function load(item: Stored) {
    const data = item.document.data as { slides?: Slide[]; platform?: CarouselPlatform; caption?: CarouselDocument["caption"]; style?: Partial<CarouselStyle>; topic?: string };
    if (!Array.isArray(data.slides)) return setNotice(noticeError("Este contenido todavía no usa CarouselDocument v1."));
    const platform = data.platform ?? "instagram";
    const caption = data.caption ?? carouselFixture.caption;
    setSlides(data.slides); setPlatform(platform); setCaption(caption); setContentId(item.id); setRevision(item.revision); setCampaignId(item.campaignId); setActive(0); setPast([]); setFuture([]);
    const loaded = { ...DEFAULT_STYLE, ...data.style };
    setTheme(loaded.theme); setThemeTouched(loaded.themeTouched); setCustomColor(loaded.customColor); setFont(loaded.font); setBackground(loaded.background); setSurface(loaded.surface); setDecor(loaded.decor);
    // Lo recién cargado es exactamente lo guardado: la pieza empieza limpia.
    const name = data.topic ?? carouselFixture.topic; setTopic(name);
    setSavedSnapshot(snapshotOf(data.slides, platform, caption, loaded, name));
    setNotice(noticeOk(`Cargado: ${storedLabel(item)}`));
  }
  function applyGenerated(generated: CarouselDocument) {
    setTopic(generated.topic);
    // Reemplaza el carrusel abierto (mismo documento, se autoguarda encima). Se puede deshacer con Ctrl+Z.
    commit(generated.slides); setPlatform(generated.platform); setCaption(generated.caption); setActive(0);
  }
  async function save(auto = false) {
    if (campaignId === NONE) return auto ? undefined : setNotice(noticeError("Selecciona una campaña antes de guardar."));
    if (saving.current) return;
    saving.current = true;
    try { await persist(auto); } finally { saving.current = false; }
  }
  async function persist(auto: boolean) {
    const snapshot = snapshotOf(slides, platform, caption, style, topic);
    const data = { ...document, style };
    const body = contentId ? { revision, campaignId, type: "carousel", document: { schemaVersion: 1, data } } : { campaignId, type: "carousel", document: { schemaVersion: 1, data } };
    const response = await fetch(contentId ? `/api/content-items/${contentId}` : "/api/content-items", { method: contentId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const saved = await response.json();
    if (!response.ok) return setNotice(noticeError(typeof saved.error === "string" ? saved.error : "No se pudo guardar."));
    const created = !contentId;
    setContentId(saved.id); setRevision(saved.revision); setCampaignId(saved.campaignId);
    setSavedSnapshot(snapshot);
    // La URL apunta a la pieza: recargar o compartir el enlace la vuelve a abrir.
    if (created) window.history.replaceState(null, "", `/carousel?id=${saved.id}`);
    // Trazabilidad con el tema del radar, si la pieza salió de uno. No bloquea el guardado.
    if (created) await radar.link(saved.id);
    if (!auto) setNotice(noticeOk("Guardado en la biblioteca central."));
    if (created || !auto) await refresh();
  }
  const fields = FIELDS[current.layout] ?? FIELDS.content;
  const record = current as unknown as Record<string, string | undefined>;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="overflow-hidden pt-14 md:pl-64 md:pt-0">
        <main className="mx-auto h-[calc(100vh-3.5rem)] w-full max-w-[1800px] px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 md:h-screen">
          <ModeSwitch modes={CAROUSEL_MODES} current="/carousel" className="mb-3 lg:hidden" />
          <div className="grid h-[calc(100%-2.5rem)] min-w-0 grid-cols-1 gap-3 lg:h-full lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_360px] 2xl:grid-cols-[400px_minmax(0,1fr)_400px]">

            <WorkspacePanel className="hidden lg:block">
              <div className="flex h-full flex-col overflow-y-auto p-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Carrusel</p><ModeSwitch modes={CAROUSEL_MODES} current="/carousel" /></div>
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
                        <SelectItem value={NEW}>Nuevo (se guarda como carrusel nuevo)</SelectItem>
                        {stored.map((item) => <SelectItem key={item.id} value={item.id}>{storedLabel(item)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="carousel-name" className="text-[10px] uppercase tracking-wider text-muted-foreground">Nombre</Label>
                    <Input id="carousel-name" className="h-9" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Cómo se llama en la biblioteca" />
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
                  <BrandSelect brands={brands} choice={brandChoice} active={activeBrand} onChange={(value) => { setBrandChoice(value); setThemeTouched(false); }} className="space-y-1.5" />
                  <Button className="w-full" onClick={() => void save()}><Save className="h-4 w-4" /> Guardar</Button>
                </div>

                <Separator className="my-5" />

                <CarouselGenerator
                  campaignId={campaignId === NONE ? undefined : campaignId}
                  brandKitId={brandId}
                  // El tema del radar manda sobre el brief de la campaña: si se vino desde un tema
                  // concreto, es de eso de lo que se quiere hablar.
                  brief={radar.brief
                    ? { topic: radar.brief.topic, audience: "", tone: "", context: radar.brief.context }
                    : selectedCampaign && typeof selectedCampaign.brief === "object" ? selectedCampaign.brief : undefined}
                  onGenerated={applyGenerated}
                  onNotice={setNotice}
                />

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

              </div>
            </WorkspacePanel>

            <section className="min-h-0 min-w-0 overflow-hidden rounded-[28px] border border-border/60 bg-muted/20">
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
                    {/* Antes decía «Guardado» con que el documento existiera, aunque llevaras diez
                        slides editadas encima. Ahora compara contra lo último que se persistió. */}
                    <span
                      className={cn("mr-1 hidden items-center gap-1 text-[10px] sm:flex", dirty ? "text-amber-500" : "text-muted-foreground/50")}
                      title={campaignId === NONE ? "Elige una campaña y se guarda solo en la biblioteca." : dirty ? "Guardando en unos segundos…" : "Guardado en la biblioteca."}
                    >
                      {dirty
                        ? <><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden /> {campaignId === NONE ? "Elige campaña para guardar" : "Guardando…"}</>
                        : <><Check className="h-3 w-3 text-green-500/70" aria-hidden /> Guardado</>}
                    </span>
                    <button
                      onClick={() => setInspectorOpen(true)}
                      title="Abrir ficha del slide"
                      aria-label="Abrir ficha del slide"
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground xl:hidden"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Ajustes</span>
                    </button>
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

                {/* El aviso vive junto a la pieza y no en el panel lateral: ahí abajo no lo veía
                    nadie, y por debajo de `lg` el panel entero está oculto. */}
                {notice ? <div className="px-3 pt-3"><Notice notice={notice} onDismiss={() => setNotice(null)} /></div> : null}

                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto flex min-h-full w-full flex-col items-center justify-start gap-3 p-4 sm:p-6 xl:p-8">
                    <CarouselFrame document={document} activeSlide={active} onSlideChange={setActive} platform={platform} theme={theme} font={font} background={background} accentColor={accentColor} surface={surface} decor={decor} brand={brandSettings} onUpdate={editMode ? update : undefined} onUpdateListItem={editMode ? updateListItem : undefined} />
                    <CarouselExportSheet document={document} platform={platform} theme={theme} font={font} background={background} accentColor={accentColor} surface={surface} decor={decor} brand={brandSettings} />
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{LAYOUT_LABEL[current.layout] ?? current.layout} · slide {active + 1} de {slides.length}{editMode ? " · edición directa activa" : ""}</p>
                  </div>
                </div>
              </div>
            </section>

            {inspectorOpen ? <button type="button" aria-label="Cerrar ficha del slide" className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] xl:hidden" onClick={() => setInspectorOpen(false)} /> : null}
            <WorkspacePanel
              className={cn(
                "xl:block",
                inspectorOpen
                  ? "fixed inset-y-3 right-3 z-50 block w-[min(24rem,calc(100vw-1.5rem))] xl:static xl:w-auto"
                  : "hidden",
              )}
            >
              <div className="flex h-full flex-col overflow-y-auto">
                {/* Cabecera fija: qué slide es y todo lo que se le puede hacer, en una sola fila. */}
                <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Slide {active + 1} <span className="font-normal text-muted-foreground">de {slides.length} · {LAYOUT_LABEL[current.layout] ?? current.layout}</span></p>
                    <button type="button" aria-label="Cerrar ficha del slide" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:hidden" onClick={() => setInspectorOpen(false)}><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2.5 flex items-center gap-0.5" role="toolbar" aria-label="Acciones del slide">
                    <IconAction label="Mover antes" onClick={() => move(-1)} disabled={!active}><ArrowLeft /></IconAction>
                    <IconAction label="Mover después" onClick={() => move(1)} disabled={active === slides.length - 1}><ArrowRight /></IconAction>
                    <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                    <IconAction label="Duplicar" onClick={duplicate}><Copy /></IconAction>
                    <IconAction label="Slide nueva en blanco" onClick={create}><Plus /></IconAction>
                    <IconAction label="Añadir slide escrita con IA (antes del cierre)" onClick={() => void slideAction("add")} disabled={Boolean(busy)}>{busy === "add" ? <ThinkingOrb state="composing" size={20} aria-label="Añadiendo" /> : <Wand2 />}</IconAction>
                    <IconAction label="Reescribir este slide con IA" onClick={() => void slideAction("regenerate")} disabled={Boolean(busy)}>{busy === "regenerate" ? <ThinkingOrb state="composing" size={20} aria-label="Reescribiendo" /> : <RefreshCw />}</IconAction>
                    <IconAction label="Eliminar slide" onClick={remove} disabled={slides.length < 2} danger><Trash2 /></IconAction>
                  </div>
                </div>

                <div className="space-y-6 px-4 py-5">
                  <PanelSection title="Texto">
                    <div className="space-y-1.5">
                      <Label htmlFor="slide-primary" className="text-xs text-muted-foreground">{fields.primaryLabel}</Label>
                      <Textarea id="slide-primary" value={record[fields.primary] ?? ""} onChange={(event) => update(fields.primary, event.target.value)} rows={2} />
                    </div>
                    {fields.secondary ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="slide-secondary" className="text-xs text-muted-foreground">{fields.secondaryLabel}</Label>
                        <Textarea id="slide-secondary" value={record[fields.secondary] ?? ""} onChange={(event) => update(fields.secondary!, event.target.value)} rows={3} />
                      </div>
                    ) : null}
                    {LIST_LAYOUTS.has(current.layout) ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{current.layout === "statGrid" ? "Datos (cifra + etiqueta)" : current.layout === "timeline" ? "Pasos" : "Puntos"}</Label>
                        {(current.listItems ?? []).map((item, index) => (
                          <div key={index} className="flex items-start gap-1.5">
                            <Input aria-label={`Viñeta del elemento ${index + 1}`} title="Número, cifra o emoji con el que empieza la línea." className="h-9 w-14 shrink-0 px-1 text-center" value={item.emoji} onChange={(event) => updateListEmoji(index, event.target.value)} />
                            <Textarea aria-label={`Texto del elemento ${index + 1}`} className="min-h-0 flex-1" rows={1} value={item.text} onChange={(event) => updateListItem(index, event.target.value)} />
                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Eliminar elemento ${index + 1}`} onClick={() => removeListItem(index)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={addListItem}><Plus className="h-4 w-4" /> Añadir</Button>
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">Envuelve una palabra en *asteriscos* para resaltarla.</p>
                  </PanelSection>

                  {/* La foto solo se ofrece donde el layout la dibuja: en el resto confundía más que ayudaba. */}
                  {slideUsesPhoto(current) ? (
                    <PanelSection title="Foto">
                      <CarouselImagePanel imageUrl={current.imageUrl} campaignId={campaignId === NONE ? undefined : campaignId} suggestion={current.imagePrompt ?? current.title ?? ""} color={accentColor ?? theme} onApply={applyImage} />
                    </PanelSection>
                  ) : null}

                  <PanelSection title="Diseño del slide">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Layout</Label>
                        <Select value={current.layout} onValueChange={(value) => commit(slides.map((slide, index) => index === active ? { ...slide, layout: value as Slide["layout"] } : slide))}>
                          <SelectTrigger aria-label="Layout" className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>{layouts.map((layout) => <SelectItem key={layout} value={layout}>{LAYOUT_LABEL[layout]}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Título</Label>
                        <Select value={current.titleSize ?? "regular"} onValueChange={(value) => update("titleSize", value)}>
                          <SelectTrigger aria-label="Tamaño del título" className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="compact">Compacto</SelectItem>
                            <SelectItem value="regular">Regular</SelectItem>
                            <SelectItem value="large">Grande</SelectItem>
                            <SelectItem value="display">Enorme</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <LayoutVariantPicker slide={current} activePrimary={primaryColor} selectedBgStyle={background} onChange={(variant) => update("layoutVariant", variant)} />
                  </PanelSection>

                  <PanelSection title="Estilo del carrusel">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Fondo base</Label>
                        <div role="radiogroup" aria-label="Fondo base" className="grid grid-cols-3 rounded-lg border border-border p-0.5">
                          {([["light", "Claro", "Todos los slides claros"], ["dark", "Oscuro", "Todos los slides oscuros"], ["brand", "Color", "Alterna oscuro con slides del color de marca"]] as const).map(([value, label, hint]) => (
                            <button key={value} type="button" role="radio" title={hint} aria-checked={surface === value} onClick={() => setSurface(value)}
                              className={cn("rounded-md px-1 py-1 text-xs font-medium transition-colors", surface === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{label}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Formas</Label>
                        <div role="radiogroup" aria-label="Formas de adorno" className="grid grid-cols-2 rounded-lg border border-border p-0.5">
                          {([[true, "Con"], [false, "Sin"]] as const).map(([value, label]) => (
                            <button key={label} type="button" role="radio" aria-checked={decor === value} onClick={() => setDecor(value)}
                              className={cn("rounded-md px-2 py-1 text-xs font-medium transition-colors", decor === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Color</Label>
                      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Color del carrusel">
                        {brandColor ? <Swatch color={brandColor} label={`Color de ${activeBrand?.name ?? "la marca"}`} selected={!customColor && !themeTouched} onClick={() => { setCustomColor(undefined); setThemeTouched(false); }} brand /> : null}
                        {(Object.keys(colorThemes) as CarouselTheme[]).map((key) => (
                          <Swatch key={key} color={colorThemes[key].primary} label={THEME_LABEL[key]} selected={!customColor && (themeTouched || !brandColor) && theme === key} onClick={() => { setTheme(key); setCustomColor(undefined); setThemeTouched(true); }} />
                        ))}
                        <label title="Color personalizado" className={cn("relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-black/10 transition-transform hover:scale-110", customColor && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ background: customColor ?? "conic-gradient(from 0deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e)" }}>
                          <span className="sr-only">Color personalizado</span>
                          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={customColor ?? "#2f7d40"} onChange={(event) => { setCustomColor(event.target.value); setThemeTouched(true); }} />
                        </label>
                        {customColor ? <code className="ml-1 text-xs text-muted-foreground">{customColor}</code> : null}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Fuente</Label>
                        <Select value={font} onValueChange={(value) => setFont(value as CarouselFont)}>
                          <SelectTrigger aria-label="Fuente" className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="poster">Cartel</SelectItem>
                            <SelectItem value="geist">Geist</SelectItem>
                            <SelectItem value="playfair">Playfair</SelectItem>
                            <SelectItem value="space">Space Grotesk</SelectItem>
                            <SelectItem value="sora">Sora</SelectItem>
                            <SelectItem value="mono">Monospace</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Fondo</Label>
                        <Select value={background} onValueChange={(value) => setBackground(value as CarouselBackground)}>
                          <SelectTrigger aria-label="Fondo" className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aura">Aura</SelectItem>
                            <SelectItem value="gradient">Gradiente</SelectItem>
                            <SelectItem value="radial">Radial</SelectItem>
                            <SelectItem value="grid">Retícula</SelectItem>
                            <SelectItem value="dots">Puntos</SelectItem>
                            <SelectItem value="lines">Líneas</SelectItem>
                            <SelectItem value="noise">Ruido</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </PanelSection>

                  <PanelSection title="Caption" aside={<span className={cn("text-xs tabular-nums", caption.text.length > CAPTION_LIMIT ? "text-amber-600" : "text-muted-foreground")}>{caption.text.length}/{CAPTION_LIMIT}</span>}>
                    <Textarea aria-label="Caption" value={caption.text} onChange={(event) => setCaptionText(event.target.value)} rows={4} placeholder="Texto corto que acompaña la publicación…" />
                    <Input aria-label="Hashtags" className="h-9" value={caption.hashtags.join(" ")} onChange={(event) => setHashtags(event.target.value)} placeholder="#contenido #diseño" />
                  </PanelSection>

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" title="Exporta solo la portada como imagen." disabled={busy === "png"} onClick={() => void exportCarousel("png")}>
                      <ImageIcon className="h-4 w-4" /> {busy === "png" ? "…" : "Portada"}
                    </Button>
                    <Button variant="outline" size="sm" title="Exporta todas las slides y el caption en un ZIP." disabled={busy === "zip"} onClick={() => void exportCarousel("zip")}>
                      <FileArchive className="h-4 w-4" /> {busy === "zip" ? "…" : "Todo (ZIP)"}
                    </Button>
                  </div>
                </div>
              </div>
            </WorkspacePanel>
          </div>
        </main>
      </div>
    </div>
  );
}
