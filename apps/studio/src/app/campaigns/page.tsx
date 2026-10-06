"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, FolderKanban, Loader2, Plus, Search } from "lucide-react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Brand = { id: string; name: string };
type CampaignBrief = { topic: string; audience: string; tone: string; language: string; context: string };
type Campaign = { id: string; name: string; brief: string | CampaignBrief; brandKitId: string | null };
type Piece = { id: string; type: "carousel" | "ad" | "video" | "article"; status: "draft" | "ready" | "rendering" | "exported" };
const NONE = "none";
const EMPTY_BRIEF: CampaignBrief = { topic: "", audience: "", tone: "", language: "es", context: "" };
const normalizeBrief = (campaign: Campaign | null) => !campaign ? EMPTY_BRIEF : typeof campaign.brief === "string" ? { topic: campaign.name, audience: "Audiencia general", tone: "Claro y directo", language: "es", context: campaign.brief } : { ...EMPTY_BRIEF, ...campaign.brief };
async function readResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.");
  return body;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState<CampaignBrief>(EMPTY_BRIEF);
  const [brandKitId, setBrandKitId] = useState(NONE);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("brief");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [piecesLoading, setPiecesLoading] = useState(false);
  const [piecesError, setPiecesError] = useState("");
  const [piecesRetry, setPiecesRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const lock = useRef(false);
  const dirty = JSON.stringify({ name, brief, brandKitId }) !== JSON.stringify({ name: selected?.name ?? "", brief: normalizeBrief(selected), brandKitId: selected?.brandKitId ?? NONE });
  const visible = campaigns.filter(campaign => campaign.name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));

  async function refresh(signal?: AbortSignal) {
    setLoading(true); setListError("");
    try {
      const [list, brandList] = await Promise.all([fetch("/api/campaigns", { signal }).then(readResponse), fetch("/api/brand-kits", { signal }).then(readResponse)]);
      if (!Array.isArray(list) || !Array.isArray(brandList)) throw new Error("No se pudieron cargar las listas de campañas y marcas.");
      if (!signal?.aborted) { setCampaigns(list); setBrands(brandList); }
    } catch (cause) { if (!signal?.aborted) setListError(cause instanceof Error ? cause.message : "No se pudieron cargar las campañas."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, []);
  useEffect(() => {
    setPieces([]); setPiecesError("");
    if (!selected?.id) { setPiecesLoading(false); return; }
    const controller = new AbortController(); setPiecesLoading(true);
    void fetch(`/api/campaigns/${selected.id}`, { signal: controller.signal }).then(readResponse).then(detail => {
      if (!controller.signal.aborted) setPieces(detail.pieces ?? []);
    }).catch(cause => { if (!controller.signal.aborted) setPiecesError(cause instanceof Error ? cause.message : "No se pudieron cargar las piezas."); }).finally(() => { if (!controller.signal.aborted) setPiecesLoading(false); });
    return () => controller.abort();
  }, [selected?.id, piecesRetry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function choose(campaign: Campaign | null, force = false) {
    if (!force && (lock.current || (dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?")))) return;
    setSelected(campaign); setName(campaign?.name ?? ""); setBrief(normalizeBrief(campaign));
    setBrandKitId(campaign?.brandKitId ?? NONE); setError(""); setNotice(""); setSection("brief"); setConfirmArchive(false);
  }
  function changeBrief(field: keyof CampaignBrief, value: string) { setBrief(current => ({ ...current, [field]: value })); setNotice(""); }
  async function runAction(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la acción."); }
    finally { lock.current = false; setBusy(null); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (![name, brief.topic, brief.audience, brief.tone, brief.language].every(value => value.trim())) { setError("Completa el nombre, tema, audiencia, tono e idioma."); setSection("brief"); return; }
    await runAction("Guardando…", async () => {
      const campaign = await fetch(selected ? `/api/campaigns/${selected.id}` : "/api/campaigns", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), brief, brandKitId: brandKitId === NONE ? null : brandKitId }) }).then(readResponse) as Campaign;
      if (!campaign?.id) throw new Error("No se pudo confirmar el guardado. Revisa la lista antes de reintentar.");
      setCampaigns(current => [campaign, ...current.filter(item => item.id !== campaign.id)]); choose(campaign, true); setNotice("Campaña guardada.");
    });
  }
  async function archive() {
    if (!selected) return;
    await runAction("Archivando…", async () => {
      await fetch(`/api/campaigns/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archivedAt: new Date().toISOString() }) }).then(readResponse);
      setCampaigns(current => current.filter(item => item.id !== selected.id)); choose(null, true); setNotice("Campaña archivada.");
    });
  }
  async function duplicate() {
    if (!selected || (dirty && !window.confirm("Se duplicará la versión guardada y se descartarán tus cambios pendientes. ¿Continuar?"))) return;
    await runAction("Duplicando…", async () => {
      const campaign = await fetch(`/api/campaigns/${selected.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepBrand: true }) }).then(readResponse) as Campaign;
      if (!campaign?.id) throw new Error("No se pudo confirmar la copia.");
      setCampaigns(current => [campaign, ...current]); choose(campaign, true); setNotice("Campaña duplicada.");
    });
  }
  async function exportPackage() {
    if (!selected) return;
    await runAction("Exportando…", async () => {
      const response = await fetch(`/api/campaigns/${selected.id}/export`);
      if (!response.ok) { await readResponse(response); return; }
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${selected.name}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("ZIP preparado con la versión guardada de la campaña.");
    });
  }

  return <PageShell>
    <PageHeading title="Campañas" description="Un brief y una marca para coordinar tus piezas de contenido." actions={<Button onClick={() => choose(null)} disabled={!!busy}><Plus className="size-4" />Nueva campaña</Button>} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3" aria-label="Tus campañas">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar campañas" placeholder="Buscar campañas" className="pl-9" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="flex justify-between px-1 text-xs text-muted-foreground"><span>Tus campañas</span><span>{campaigns.length}</span></div>
        {loading ? <div role="status" className="space-y-2"><span className="sr-only">Cargando campañas</span>{[0, 1, 2].map(index => <div key={index} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div> : null}
        {listError ? <div role="alert" className="space-y-2 rounded-lg border p-3 text-sm"><p className="text-destructive">{listError}</p><Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>Reintentar</Button></div> : null}
        <nav aria-label="Seleccionar campaña" className="flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-[65vh]">{visible.map(campaign => <button key={campaign.id} disabled={!!busy} onClick={() => choose(campaign)} aria-current={selected?.id === campaign.id ? "true" : undefined} className={cn("flex min-h-16 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", selected?.id === campaign.id ? "border-border bg-muted" : "border-transparent hover:bg-muted/60")}><FolderKanban className="size-5 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{campaign.name}</span><span className="block truncate text-xs text-muted-foreground">{brands.find(brand => brand.id === campaign.brandKitId)?.name ?? "Sin marca"}</span></span></button>)}</nav>
        {!loading && !listError && !visible.length ? <p className="px-1 text-sm text-muted-foreground">{query ? "No hay campañas con esa búsqueda." : "Crea una campaña para organizar tus artículos, carruseles, anuncios y videos."}</p> : null}
      </aside>
      <form onSubmit={save} className="min-w-0 overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-5 sm:px-6"><h2 className="break-words text-lg font-semibold">{name.trim() || "Nueva campaña"}</h2><p className="mt-1 text-xs text-muted-foreground">{selected ? dirty ? "Cambios sin guardar" : "Campaña guardada" : "Define el encargo que compartirán tus piezas."}</p></div>
        <fieldset disabled={!!busy} className="min-w-0"><Tabs value={section} onValueChange={setSection} className="gap-0">
          <div className="px-4 pt-4 sm:px-6"><TabsList className="h-11" aria-label="Secciones de la campaña"><TabsTrigger value="brief" className="min-h-9">Brief y marca</TabsTrigger><TabsTrigger value="pieces" className="min-h-9" disabled={!selected}>Piezas{selected && !piecesLoading ? ` (${pieces.length})` : ""}</TabsTrigger></TabsList></div>
          <TabsContent value="brief" className="space-y-5 p-4 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Nombre de la campaña</Label><Input id="name" maxLength={160} value={name} onChange={event => { setName(event.target.value); setNotice(""); }} placeholder="Ej. Lanzamiento Q3" /></div><div className="space-y-2"><Label htmlFor="campaign-brand">Marca</Label><Select value={brandKitId} onValueChange={value => { setBrandKitId(value); setNotice(""); }}><SelectTrigger id="campaign-brand" aria-label="Marca"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Sin marca</SelectItem>{brands.map(brand => <SelectItem value={brand.id} key={brand.id}>{brand.name}</SelectItem>)}</SelectContent></Select>{!brands.length && !loading ? <Link href="/brands" className="text-xs text-primary underline underline-offset-4">Crear una marca</Link> : null}</div></div>
            <div className="border-t pt-5"><h3 className="text-sm font-semibold">El encargo</h3><p className="mt-1 text-xs text-muted-foreground">Tema, audiencia y tono que usarás al crear contenido.</p></div>
            <div className="space-y-2"><Label htmlFor="topic">Tema</Label><Input id="topic" value={brief.topic} onChange={event => changeBrief("topic", event.target.value)} placeholder="Ej. Seguridad digital cotidiana" /></div>
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="audience">Audiencia</Label><Input id="audience" value={brief.audience} onChange={event => changeBrief("audience", event.target.value)} placeholder="Ej. Jóvenes adultos" /></div><div className="space-y-2"><Label htmlFor="tone">Tono</Label><Input id="tone" value={brief.tone} onChange={event => changeBrief("tone", event.target.value)} placeholder="Ej. Claro y directo" /></div></div>
            <div className="space-y-2"><Label htmlFor="language">Idioma</Label><Input id="language" value={brief.language} onChange={event => changeBrief("language", event.target.value)} placeholder="es" className="sm:max-w-48" /></div>
            <div className="space-y-2"><Label htmlFor="context">Contexto y objetivo <span className="text-muted-foreground">(opcional)</span></Label><Textarea id="context" rows={4} value={brief.context} onChange={event => changeBrief("context", event.target.value)} placeholder="Mensaje clave, objetivo y restricciones…" /></div>
          </TabsContent>
          <TabsContent value="pieces" className="space-y-4 p-4 sm:p-6"><div><h3 className="text-sm font-semibold">Contenido de la campaña</h3><p className="mt-1 text-xs text-muted-foreground">Abre cada pieza para continuar trabajando en ella.</p></div>{piecesLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando piezas…</p> : piecesError ? <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{piecesError}</p><Button type="button" size="sm" variant="outline" onClick={() => setPiecesRetry(value => value + 1)}>Reintentar</Button></div> : pieces.length ? <div className="divide-y rounded-lg border">{pieces.map(piece => <Link key={piece.id} href={piece.type === "article" ? `/articles?id=${piece.id}` : `/content/${piece.id}`} className="flex items-center justify-between gap-3 px-3 py-3 text-sm hover:bg-muted/50"><span>{({ ad: "Anuncio", carousel: "Carrusel", video: "Video", article: "Artículo" })[piece.type]}</span><span className="text-xs text-muted-foreground">{({ draft: "Borrador", ready: "Listo", rendering: "Renderizando", exported: "Exportado" })[piece.status]}</span></Link>)}</div> : <div className="space-y-3 py-4"><p className="text-sm text-muted-foreground">Todavía no hay piezas en esta campaña.</p><Link href="/library" className="text-sm text-primary underline underline-offset-4">Ir a la biblioteca</Link></div>}</TabsContent>
        </Tabs></fieldset>
        <div className="space-y-3 border-t bg-muted/20 px-4 py-4 sm:px-6">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}{notice ? <p role="status" className="flex items-center gap-2 text-sm"><Check className="size-4 text-primary" />{notice}</p> : null}
          <div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={!!busy || (!!selected && !dirty)}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy ?? (selected ? "Guardar cambios" : "Crear campaña")}</Button>{selected ? <><Button type="button" variant="outline" disabled={!!busy} onClick={() => void duplicate()}>Duplicar</Button><Button type="button" variant="outline" disabled={!!busy} onClick={() => void exportPackage()}>Exportar ZIP</Button><Button type="button" variant="ghost" disabled={!!busy} onClick={() => setConfirmArchive(value => !value)}>Archivar</Button></> : null}</div>
          {confirmArchive ? <div className="space-y-3 rounded-lg border p-3 text-sm"><p>La campaña dejará de aparecer en la lista. Archiva o mueve primero sus piezas activas.{dirty ? " Tus cambios pendientes se descartarán." : ""}</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="destructive" disabled={!!busy} onClick={() => void archive()}>Confirmar archivo</Button><Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => setConfirmArchive(false)}>Cancelar</Button></div></div> : null}
        </div>
      </form>
    </div>
  </PageShell>;
}
