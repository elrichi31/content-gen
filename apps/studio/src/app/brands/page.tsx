"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, Loader2, Palette, Plus, Search, Upload } from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Business = { sector: string; offering: string; audience: string; valueProposition: string; voice: string; avoid: string };
type Brand = { id: string; name: string; primaryColor: string; logoAssetId?: string | null; business?: Partial<Business> };
const DEFAULT_COLOR = "#2f7d40";
const EMPTY_BUSINESS: Business = { sector: "", offering: "", audience: "", valueProposition: "", voice: "", avoid: "" };
const validColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

async function responseData(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.");
  return body;
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<Brand | null>(null);
  const [name, setName] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [business, setBusiness] = useState<Business>(EMPTY_BUSINESS);
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("identity");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"save" | "upload" | "archive" | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const actionLock = useRef(false);
  const draft = JSON.stringify({ name, primaryColor, business, logoAssetId });
  const baseline = JSON.stringify({ name: selected?.name ?? "", primaryColor: selected?.primaryColor ?? DEFAULT_COLOR, business: { ...EMPTY_BUSINESS, ...selected?.business }, logoAssetId: selected?.logoAssetId ?? null });
  const dirty = draft !== baseline;
  const visible = brands.filter(brand => `${brand.name} ${brand.business?.sector ?? ""}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  const previewColor = validColor(primaryColor) ? primaryColor : DEFAULT_COLOR;

  async function refresh(signal?: AbortSignal) {
    setLoading(true); setListError("");
    try {
      const result = await responseData(await fetch("/api/brand-kits", { signal }));
      if (!Array.isArray(result)) throw new Error("No se pudo leer la lista de marcas.");
      if (!signal?.aborted) setBrands(result);
    } catch (cause) {
      if (!signal?.aborted) setListError(cause instanceof Error ? cause.message : "No se pudieron cargar las marcas.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function choose(brand: Brand | null, force = false) {
    if (actionLock.current || (!force && dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?"))) return;
    setSelected(brand); setName(brand?.name ?? ""); setPrimaryColor(brand?.primaryColor ?? DEFAULT_COLOR);
    setBusiness({ ...EMPTY_BUSINESS, ...brand?.business }); setLogoAssetId(brand?.logoAssetId ?? null);
    setError(""); setNotice(""); setConfirmArchive(false); setSection("identity");
    if (fileInput.current) fileInput.current.value = "";
  }
  function changeBusiness(field: keyof Business, value: string) { setBusiness(current => ({ ...current, [field]: value })); setNotice(""); }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (actionLock.current) return;
    if (!name.trim() || !validColor(primaryColor)) { setError("Escribe un nombre y un color válido en formato #RRGGBB."); setSection("identity"); return; }
    actionLock.current = true; setBusy("save"); setError(""); setNotice("");
    try {
      const brand = await responseData(await fetch(selected ? `/api/brand-kits/${selected.id}` : "/api/brand-kits", {
        method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), primaryColor, business, logoAssetId }),
      })) as Brand;
      if (!brand?.id) throw new Error("La respuesta no confirmó el guardado. Revisa la lista antes de reintentar.");
      setBrands(current => [brand, ...current.filter(item => item.id !== brand.id)]);
      setSelected(brand); setName(brand.name); setPrimaryColor(brand.primaryColor);
      setBusiness({ ...EMPTY_BUSINESS, ...brand.business }); setLogoAssetId(brand.logoAssetId ?? null);
      setConfirmArchive(false); setNotice("Marca guardada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la marca."); }
    finally { actionLock.current = false; setBusy(null); }
  }
  async function uploadLogo(file: File | undefined) {
    if (!file || actionLock.current) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Usa un logo PNG, JPG o WebP."); return; }
    actionLock.current = true; setBusy("upload"); setError(""); setNotice("");
    try {
      const body = await responseData(await fetch("/api/assets", { method: "POST", headers: { "Content-Type": file.type, "x-asset-filename": encodeURIComponent(file.name) }, body: file }));
      if (typeof body?.id !== "string") throw new Error("No se pudo confirmar la subida del logo.");
      setLogoAssetId(body.id); setNotice("Logo subido. Guarda la marca para aplicarlo.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo subir el logo."); }
    finally { actionLock.current = false; setBusy(null); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function archive() {
    if (!selected || actionLock.current) return;
    actionLock.current = true; setBusy("archive"); setError(""); setNotice("");
    try {
      await responseData(await fetch(`/api/brand-kits/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archivedAt: new Date().toISOString() }) }));
      setBrands(current => current.filter(brand => brand.id !== selected.id));
      actionLock.current = false; choose(null, true); setNotice("Marca archivada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo archivar la marca."); }
    finally { actionLock.current = false; setBusy(null); }
  }

  return (
    <PageShell>
      <PageHeading title="Marcas" description="Identidad y contexto que comparten tus campañas y contenidos." actions={<Button onClick={() => choose(null)} disabled={!!busy}><Plus className="size-4" />Nueva marca</Button>} />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3" aria-label="Tus marcas">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar marcas" placeholder="Buscar marcas" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" /></div>
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground"><span>Tus marcas</span><span>{brands.length}</span></div>
          {loading ? <div role="status" className="space-y-2"><span className="sr-only">Cargando marcas</span>{[0, 1, 2].map(index => <div key={index} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div> : null}
          {listError ? <div role="alert" className="space-y-2 rounded-lg border p-3 text-sm"><p className="text-destructive">{listError}</p><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>Reintentar</Button></div> : null}
          <nav aria-label="Seleccionar marca" className="flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-[65vh]">
            {visible.map(brand => <button key={brand.id} disabled={!!busy} onClick={() => choose(brand)} aria-current={selected?.id === brand.id ? "true" : undefined} className={cn("flex min-h-16 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", selected?.id === brand.id ? "border-border bg-muted" : "border-transparent hover:bg-muted/60")}>
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card" aria-hidden="true">{brand.logoAssetId ? <img src={`/api/assets/${brand.logoAssetId}`} alt="" className="size-full object-contain p-1" /> : <span className="size-4 rounded-full border" style={{ background: brand.primaryColor }} />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{brand.name}</span><span className="block truncate text-xs text-muted-foreground">{brand.business?.sector || "Sin sector definido"}</span></span>
            </button>)}
          </nav>
          {!loading && !listError && !visible.length ? <p className="px-1 text-sm text-muted-foreground">{query ? "No hay marcas con esa búsqueda." : "Crea tu primera marca para reutilizar su identidad en cada pieza."}</p> : null}
        </aside>

        <form onSubmit={save} className="min-w-0 overflow-hidden rounded-xl border bg-card">
          <fieldset disabled={!!busy} className="min-w-0">
            <div className="flex items-center gap-4 border-b px-4 py-5 sm:px-6">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background">{logoAssetId ? <img src={`/api/assets/${logoAssetId}`} alt="Logo de la marca" className="size-full object-contain p-2" /> : <Palette className="size-6 text-muted-foreground" />}</div>
              <div className="min-w-0 flex-1"><h2 className="break-words text-lg font-semibold">{name.trim() || "Nueva marca"}</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="size-3 rounded-full border" style={{ background: previewColor }} /><span>{primaryColor}</span><span>·</span><span>{selected ? dirty ? "Cambios sin guardar" : "Marca guardada" : "Borrador de marca"}</span></div></div>
            </div>
            <Tabs value={section} onValueChange={setSection} className="gap-0">
              <div className="px-4 pt-4 sm:px-6"><TabsList aria-label="Secciones de la marca" className="h-11 w-full justify-start sm:w-auto"><TabsTrigger value="identity" className="min-h-9 flex-1">Identidad</TabsTrigger><TabsTrigger value="business" className="min-h-9 flex-1">Negocio</TabsTrigger><TabsTrigger value="voice" className="min-h-9 flex-1">Voz</TabsTrigger></TabsList></div>
              <TabsContent value="identity" className="space-y-6 p-4 sm:p-6">
                <div><h3 className="text-sm font-semibold">Identidad visual</h3><p className="mt-1 text-xs text-muted-foreground">Nombre, color y logo para reconocer tu marca.</p></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="name">Nombre de la marca</Label><Input id="name" value={name} maxLength={120} onChange={event => { setName(event.target.value); setNotice(""); }} placeholder="Ej. BethaLabs" /></div>
                  <div className="space-y-2"><Label htmlFor="color-hex">Color principal</Label><div className="flex gap-2"><input type="color" aria-label="Elegir color principal" value={previewColor} onChange={event => { setPrimaryColor(event.target.value); setNotice(""); }} className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1" /><Input id="color-hex" value={primaryColor} maxLength={7} onChange={event => { setPrimaryColor(event.target.value); setNotice(""); }} aria-invalid={!validColor(primaryColor)} placeholder="#2f7d40" className="font-mono" /></div></div>
                </div>
                <div className="space-y-3"><div><Label htmlFor="logo">Logo de la marca</Label><p id="logo-help" className="mt-1 text-xs text-muted-foreground">PNG, JPG o WebP. Mejor con fondo transparente.</p></div>
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4"><div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-background">{logoAssetId ? <img src={`/api/assets/${logoAssetId}`} alt="Vista previa del logo" className="size-full object-contain p-2" /> : <Upload className="size-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1 space-y-2"><Input ref={fileInput} id="logo" aria-describedby="logo-help" type="file" accept="image/png,image/jpeg,image/webp" className="w-full min-w-0" onChange={event => void uploadLogo(event.target.files?.[0])} />{logoAssetId ? <Button type="button" variant="ghost" size="sm" onClick={() => { setLogoAssetId(null); setNotice(""); }}>Quitar logo</Button> : null}</div></div>
                  <p className="text-xs text-muted-foreground">Se usa en las vistas previas y carruseles. Guarda la marca después de cambiarlo.</p>
                </div>
              </TabsContent>
              <TabsContent value="business" className="space-y-5 p-4 sm:p-6">
                <div><h3 className="text-sm font-semibold">Perfil del negocio</h3><p className="mt-1 text-xs text-muted-foreground">Ayuda al radar y a la IA a conectar el contenido con lo que vendes. Todo es opcional.</p></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="sector">Sector</Label><Input id="sector" value={business.sector} onChange={event => changeBusiness("sector", event.target.value)} placeholder="Ej. Tecnología y automatización" /></div><div className="space-y-2"><Label htmlFor="audience">Audiencia</Label><Input id="audience" value={business.audience} onChange={event => changeBusiness("audience", event.target.value)} placeholder="Ej. PyMEs de Latinoamérica" /></div></div>
                <div className="space-y-2"><Label htmlFor="offering">Qué vendes</Label><Textarea id="offering" rows={3} value={business.offering} onChange={event => changeBusiness("offering", event.target.value)} placeholder="Productos y servicios principales" /></div>
                <div className="space-y-2"><Label htmlFor="value">Qué te diferencia</Label><Textarea id="value" rows={3} value={business.valueProposition} onChange={event => changeBusiness("valueProposition", event.target.value)} placeholder="Por qué te eligen frente a otras opciones" /></div>
              </TabsContent>
              <TabsContent value="voice" className="space-y-5 p-4 sm:p-6">
                <div><h3 className="text-sm font-semibold">Voz de marca</h3><p className="mt-1 text-xs text-muted-foreground">Define cómo escribe la IA y qué debe evitar. Todo es opcional.</p></div>
                <div className="space-y-2"><Label htmlFor="voice">Cómo habla tu marca</Label><Textarea id="voice" rows={4} value={business.voice} onChange={event => changeBusiness("voice", event.target.value)} placeholder="Ej. Cercana y directa, tutea y explica sin tecnicismos" /></div>
                <div className="space-y-2"><Label htmlFor="avoid">Qué debe evitar</Label><Textarea id="avoid" rows={4} value={business.avoid} onChange={event => changeBusiness("avoid", event.target.value)} placeholder="Ej. No promete resultados garantizados ni usa miedo como gancho" /></div>
              </TabsContent>
            </Tabs>
          </fieldset>
          <div className="space-y-3 border-t bg-muted/20 px-4 py-4 sm:px-6">
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {notice ? <p role="status" className="flex items-center gap-2 text-sm"><Check className="size-4 shrink-0 text-primary" />{notice}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3"><Button type="submit" disabled={!!busy || (selected !== null && !dirty)}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy === "save" ? "Guardando…" : busy === "upload" ? "Subiendo logo…" : busy === "archive" ? "Archivando…" : selected ? "Guardar cambios" : "Crear marca"}</Button>{selected ? <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setConfirmArchive(value => !value)}>Archivar marca</Button> : null}</div>
            {confirmArchive ? <div className="space-y-3 rounded-lg border p-3 text-sm"><p>La marca dejará de aparecer en la lista. {dirty ? "Los cambios sin guardar se descartarán. " : ""}Si tiene campañas activas, debes desvincularlas o archivarlas primero.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" size="sm" disabled={!!busy} onClick={() => void archive()}>Confirmar archivo</Button><Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirmArchive(false)}>Cancelar</Button></div></div> : null}
          </div>
        </form>
      </div>
    </PageShell>
  );
}
