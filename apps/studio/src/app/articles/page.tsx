"use client";

import { articleDraftSchema, COVER_EXTENSIONS, draftArticle, estimateReadTime, slugify, type ArticleDraft } from "@content-gen/domain/article";
import { todayLocal } from "@content-gen/domain/schedule";
import { ExternalLink, FileText, Loader2, Plus, Search, Send, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRadarTopic } from "@/lib/use-radar-topic";
import { useRequestedContentId } from "@/lib/use-requested-content-id";
import { cn } from "@/lib/utils";

type Campaign = { id: string; name: string };
type Item = { id: string; type: string; revision: number; campaignId: string; campaignName?: string; document?: { data?: ArticleDraft } };
type Preview = { ready: boolean; problems: string[]; exists?: boolean; path?: string; url?: string; site?: { slugs: string[]; categories: string[]; authors: string[] }; error?: string };
const EXPORT_HINT = "Exportar escribe el .md en el repositorio del sitio. No publica: el commit y el push los haces tú.";
async function readResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "No se pudo completar la acción. Inténtalo de nuevo.");
  return body;
}

export default function ArticlesPage() {
  const requestedId = useRequestedContentId();
  const [items, setItems] = useState<Item[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [current, setCurrent] = useState<Item | null>(null);
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const radar = useRadarTopic("article");
  const [campaignId, setCampaignId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("content");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const lock = useRef(false);
  const previewSequence = useRef(0);
  const openedRequest = useRef("");
  const dirty = !!draft && (!current || JSON.stringify(draft) !== JSON.stringify(current.document?.data) || campaignId !== current.campaignId);
  const visible = items.filter(item => `${item.document?.data?.title ?? ""} ${item.campaignName ?? ""}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  const words = draft?.body.trim() ? draft.body.trim().split(/\s+/).length : 0;

  const loadItems = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setListError("");
    try {
      const [list, campaignList] = await Promise.all([fetch("/api/content-items?type=article&status=active", { signal }).then(readResponse), fetch("/api/campaigns", { signal }).then(readResponse)]);
      if (!Array.isArray(list) || !Array.isArray(campaignList)) throw new Error("No se pudieron leer los artículos y campañas.");
      if (!signal?.aborted) { setItems(list); setCampaigns(campaignList); setCampaignId(previous => previous || campaignList[0]?.id || ""); }
    } catch (cause) { if (!signal?.aborted) setListError(cause instanceof Error ? cause.message : "No se pudieron cargar los artículos."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void loadItems(controller.signal); return () => controller.abort(); }, [loadItems]);

  const loadPreview = useCallback(async (id: string) => {
    const sequence = ++previewSequence.current; setPreview(null); setPreviewLoading(true);
    try {
      const response = await fetch(`/api/content-items/${id}/blog-export`);
      const result = await response.json() as Preview;
      if (sequence === previewSequence.current) setPreview(response.ok ? result : { ...result, ready: false, problems: result.problems ?? [], error: result.error ?? "No se pudo comprobar la exportación." });
    } catch { if (sequence === previewSequence.current) setPreview({ ready: false, problems: [], error: "No se pudo comprobar la exportación. Reintenta la consulta." }); }
    finally { if (sequence === previewSequence.current) setPreviewLoading(false); }
  }, []);
  useEffect(() => {
    if (!requestedId || openedRequest.current === requestedId) return;
    const requested = items.find(item => item.id === requestedId);
    if (!requested) return;
    openedRequest.current = requestedId;
    if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres abrir el artículo solicitado?")) return;
    setCurrent(requested); setDraft(requested.document?.data ?? null); setCampaignId(requested.campaignId); setNotice(""); setError(""); setSection("content"); void loadPreview(requested.id);
  }, [requestedId, items, dirty, loadPreview]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function mayDiscard() { return !lock.current && (!dirty || window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?")); }
  function select(item: Item) {
    if (!mayDiscard()) return;
    setCurrent(item); setDraft(item.document?.data ?? null); setCampaignId(item.campaignId);
    setNotice(""); setError(""); setSection("content"); void loadPreview(item.id);
  }
  function startNew() {
    if (!mayDiscard()) return;
    previewSequence.current++; setPreviewLoading(false); setCurrent(null);
    setDraft(draftArticle({ title: "Artículo sin título", date: todayLocal() })); setPreview(null); setNotice(""); setError(""); setSection("content");
  }
  async function generate(input: { prompt: string; webSearch: boolean; words: number }) {
    if (!mayDiscard()) return;
    lock.current = true; setBusy("generate"); setError("");
    setNotice(input.webSearch ? "Buscando fuentes y redactando… puede tardar unos minutos." : "Redactando el borrador…");
    try {
      const payload = await fetch("/api/articles/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, category: draft?.category || "" }) }).then(readResponse) as { article?: ArticleDraft; sources?: unknown[] };
      const parsed = articleDraftSchema.safeParse(payload?.article);
      if (!parsed.success) throw new Error("No se recibió un artículo válido. Tu borrador anterior se conserva.");
      previewSequence.current++; setPreviewLoading(false); setCurrent(null); setDraft(parsed.data); setPreview(null); setSection("content");
      setNotice(`Borrador generado${payload.sources?.length ? ` con ${payload.sources.length} ${payload.sources.length === 1 ? "fuente" : "fuentes"}` : ""}. Revísalo y guárdalo.`);
    } catch (cause) { setNotice(""); setError(cause instanceof Error ? cause.message : "No se pudo generar el artículo."); }
    finally { lock.current = false; setBusy(null); }
  }
  function patch(changes: Partial<ArticleDraft>) { setDraft(previous => previous ? { ...previous, ...changes } : previous); setNotice(""); }
  function changeTitle(title: string) {
    setDraft(previous => {
      if (!previous) return previous;
      const followsTitle = previous.slug === slugify(previous.title);
      const slug = followsTitle ? slugify(title) || previous.slug : previous.slug;
      return { ...previous, title, slug, image: `/blog/${slug}.${previous.image.split(".").pop() ?? "png"}` };
    }); setNotice("");
  }
  function changeSlug(raw: string) { const slug = slugify(raw) || raw; patch({ slug, image: `/blog/${slug}.${draft?.image.split(".").pop() ?? "png"}` }); }

  async function save() {
    if (!draft || lock.current) return;
    const parsed = articleDraftSchema.safeParse(draft);
    if (!parsed.success) { setError(`No se puede guardar: ${parsed.error.issues[0]?.message}`); return; }
    if (!campaignId) { setError("Elige una campaña en Publicación para guardar el artículo."); setSection("publication"); return; }
    lock.current = true; setBusy("save"); setError(""); setNotice("");
    try {
      const document = { schemaVersion: 1 as const, data: parsed.data };
      const payload = await fetch(current ? `/api/content-items/${current.id}` : "/api/content-items", { method: current ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current ? { revision: current.revision, document, campaignId } : { campaignId, type: "article", document }) }).then(readResponse) as Item;
      if (!payload?.id) throw new Error("No se pudo confirmar el guardado. Revisa la biblioteca antes de reintentar.");
      setCurrent(payload); setDraft(payload.document?.data ?? parsed.data);
      setItems(previous => [payload, ...previous.filter(item => item.id !== payload.id)]);
      setNotice("Artículo guardado."); await radar.link(payload.id); await loadPreview(payload.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el artículo."); }
    finally { lock.current = false; setBusy(null); }
  }
  async function exportToSite(overwrite: boolean) {
    if (!current || dirty || lock.current || !preview?.ready) return;
    if (overwrite && !window.confirm("Ya existe un artículo con este slug. ¿Quieres reemplazar los archivos del sitio?")) return;
    lock.current = true; setBusy("export"); setError(""); setNotice("");
    try {
      const payload = await fetch(`/api/content-items/${current.id}/blog-export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overwrite }) }).then(readResponse) as { path?: string; replaced?: boolean };
      setNotice(`${payload.replaced ? "Reemplazado" : "Exportado"} en ${payload.path}. Revisa el diff antes del commit.`); await loadPreview(current.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo exportar el artículo."); }
    finally { lock.current = false; setBusy(null); }
  }
  const collision = Boolean(draft && preview?.site?.slugs.includes(draft.slug) && preview?.exists);

  return <PageShell>
    <PageHeading title="Artículos" description="Redacta, revisa y prepara contenido para tu blog. Exportar no publica el artículo." actions={<Button onClick={startNew} disabled={!!busy}><Plus className="size-4" />Nuevo artículo</Button>} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3" aria-label="Tus artículos">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar artículos" placeholder="Buscar artículos" className="pl-9" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="flex justify-between px-1 text-xs text-muted-foreground"><span>Tus artículos</span><span>{items.length}</span></div>
        {loading ? <div role="status" className="space-y-2"><span className="sr-only">Cargando artículos</span>{[0, 1, 2].map(index => <div key={index} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div> : null}
        {listError ? <div role="alert" className="space-y-2 rounded-lg border p-3 text-sm"><p className="text-destructive">{listError}</p><Button size="sm" variant="outline" disabled={loading} onClick={() => void loadItems()}>Reintentar</Button></div> : null}
        <nav aria-label="Seleccionar artículo" className="flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-[65vh]">{visible.map(item => <button key={item.id} type="button" disabled={!!busy} onClick={() => select(item)} aria-current={current?.id === item.id ? "true" : undefined} className={cn("flex min-h-16 items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", current?.id === item.id ? "border-border bg-muted" : "border-transparent hover:bg-muted/60")}><FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.document?.data?.title ?? "Sin título"}</span><span className="block truncate text-xs text-muted-foreground">{item.document?.data?.date} · {item.campaignName ?? campaigns.find(campaign => campaign.id === item.campaignId)?.name}</span></span></button>)}</nav>
        {!loading && !listError && !visible.length ? <p className="px-1 text-sm text-muted-foreground">{query ? "No hay artículos con esa búsqueda." : "Crea un artículo o genera un primer borrador con IA."}</p> : null}
      </aside>
      <div className="min-w-0 space-y-4">
        <GeneratorPanel key={radar.topic?.id ?? "manual"} onGenerate={generate} busy={!!busy} initialPrompt={radar.brief?.prompt ?? ""} editing={!!draft} />
        {error ? <p role="alert" className="rounded-lg border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        {notice ? <p role="status" className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">{notice}</p> : null}
        {draft ? <section className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Editor de artículo">
          <div className="border-b px-4 py-5 sm:px-6"><h2 className="break-words text-lg font-semibold">{draft.title || "Artículo sin título"}</h2><p className="mt-1 text-xs text-muted-foreground">{dirty ? "Cambios sin guardar" : "Artículo guardado"} · {words.toLocaleString("es")} palabras</p></div>
          <fieldset disabled={!!busy} className="min-w-0"><Tabs value={section} onValueChange={setSection} className="gap-0">
            <div className="px-4 pt-4 sm:px-6"><TabsList className="h-11" aria-label="Secciones del artículo"><TabsTrigger value="content" className="min-h-9">Contenido</TabsTrigger><TabsTrigger value="publication" className="min-h-9">Publicación</TabsTrigger></TabsList></div>
            <TabsContent value="content" className="space-y-5 p-4 sm:p-6">
              <div className="space-y-2"><Label htmlFor="art-title">Título</Label><Input id="art-title" value={draft.title} onChange={event => changeTitle(event.target.value)} /></div>
              <div className="space-y-2"><div className="flex justify-between gap-2"><Label htmlFor="art-excerpt">Resumen</Label><span className="text-xs text-muted-foreground">{draft.excerpt.length}/300</span></div><Textarea id="art-excerpt" rows={3} maxLength={300} value={draft.excerpt} onChange={event => patch({ excerpt: event.target.value })} /><p className="text-xs text-muted-foreground">Se usa como descripción del artículo en el sitio.</p></div>
              <div className="space-y-2"><Label htmlFor="art-body">Contenido en Markdown</Label><Textarea id="art-body" rows={18} className="min-h-80 font-mono text-sm leading-relaxed" value={draft.body} onChange={event => patch({ body: event.target.value })} /></div>
            </TabsContent>
            <TabsContent value="publication" className="space-y-5 p-4 sm:p-6">
              <div><h3 className="text-sm font-semibold">Datos de publicación</h3><p className="mt-1 text-xs text-muted-foreground">URL, clasificación y campaña del artículo.</p></div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="art-slug">Slug (URL y archivo)</Label><Input id="art-slug" value={draft.slug} onChange={event => changeSlug(event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="art-date">Fecha</Label><Input id="art-date" type="date" value={draft.date} onChange={event => patch({ date: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="art-category">Categoría</Label><Input id="art-category" list="art-categories" value={draft.category} onChange={event => patch({ category: event.target.value })} /><datalist id="art-categories">{(preview?.site?.categories ?? []).map(category => <option key={category} value={category} />)}</datalist></div>
                <div className="space-y-2"><Label htmlFor="art-author">Autor</Label><Input id="art-author" list="art-authors" value={draft.author} onChange={event => patch({ author: event.target.value })} /><datalist id="art-authors">{(preview?.site?.authors ?? []).map(author => <option key={author} value={author} />)}</datalist></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="art-tags">Etiquetas separadas por comas</Label><Input id="art-tags" value={draft.tags.join(", ")} onChange={event => patch({ tags: event.target.value.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 12) })} /></div>
                <div className="space-y-2"><Label htmlFor="art-cover">Formato de portada</Label><select id="art-cover" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.image.split(".").pop()} onChange={event => patch({ image: `/blog/${draft.slug}.${event.target.value}` })}>{COVER_EXTENSIONS.map(extension => <option key={extension} value={extension}>{extension}</option>)}</select><p className="break-all text-xs text-muted-foreground">{draft.image}</p></div>
                <div className="space-y-2"><Label htmlFor="art-readtime">Tiempo de lectura</Label><div className="flex gap-2"><Input id="art-readtime" value={draft.readTime} onChange={event => patch({ readTime: event.target.value })} /><Button type="button" variant="outline" size="icon" aria-label="Recalcular tiempo de lectura" onClick={() => patch({ readTime: estimateReadTime(draft.body) })}><Wand2 className="size-4" /></Button></div></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="art-campaign">Campaña</Label><select id="art-campaign" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={campaignId} onChange={event => { setCampaignId(event.target.value); setNotice(""); }}><option value="">Elige una campaña</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>{!campaigns.length ? <a href="/campaigns" className="text-xs text-primary underline underline-offset-4">Crear una campaña</a> : null}</div>
              </div>
            </TabsContent>
          </Tabs></fieldset>
          <div className="space-y-3 border-t bg-muted/20 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2"><Button onClick={() => void save()} disabled={!!busy || !dirty}>{busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null}{busy === "save" ? "Guardando…" : "Guardar artículo"}</Button><Button variant="outline" onClick={() => void exportToSite(collision)} disabled={!!busy || !current || dirty || previewLoading || !preview?.ready}>{busy === "export" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{busy === "export" ? "Exportando…" : collision ? "Reemplazar en el sitio" : "Exportar al sitio"}</Button>{preview?.ready && !dirty ? <Badge variant="outline">Listo para exportar</Badge> : null}</div>
            <p className="text-xs text-muted-foreground">{dirty ? "Guarda los cambios antes de exportar. " : ""}{EXPORT_HINT}</p>
            {previewLoading ? <p role="status" className="text-xs text-muted-foreground">Comprobando exportación…</p> : null}
            {collision ? <p className="text-sm text-amber-700 dark:text-amber-400">Ya existe un artículo con este slug. Reemplazar requiere confirmación.</p> : null}
            {preview?.error ? <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-destructive">{preview.error}</p><Button variant="outline" size="sm" disabled={!!busy || previewLoading} onClick={() => current && void loadPreview(current.id)}>Reintentar</Button></div> : null}
            {preview && !preview.ready && preview.problems?.length ? <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Requisitos de exportación ({preview.problems.length})</summary><ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">{preview.problems.map(problem => <li key={problem}>{problem}</li>)}</ul></details> : null}
            {preview?.url ? <a href={preview.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-1 text-xs text-muted-foreground hover:text-foreground"><ExternalLink className="mt-0.5 size-3.5 shrink-0" /><span className="break-all">{preview.url}</span></a> : null}
          </div>
        </section> : <div className="space-y-3 rounded-xl border px-6 py-10 text-center"><FileText className="mx-auto size-7 text-muted-foreground" /><h2 className="text-base font-semibold">Tu próximo artículo empieza aquí</h2><p className="text-sm text-muted-foreground">Elige uno de la lista, crea uno en blanco o redacta un borrador con IA.</p><Button variant="outline" onClick={startNew} disabled={!!busy}>Escribir desde cero</Button></div>}
      </div>
    </div>
  </PageShell>;
}

function GeneratorPanel({ onGenerate, busy, initialPrompt = "", editing }: { onGenerate: (input: { prompt: string; webSearch: boolean; words: number }) => Promise<void>; busy: boolean; initialPrompt?: string; editing: boolean }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [webSearch, setWebSearch] = useState(true);
  const [words, setWords] = useState(1200);
  return <details open={!editing} className="rounded-xl border bg-card">
    <summary className="cursor-pointer px-4 py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:px-6"><span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-primary" />Redactar con IA</span></summary>
    <fieldset disabled={busy} className="min-w-0 space-y-4 border-t p-4 sm:p-6">
      <div className="space-y-2"><Label htmlFor="art-prompt">Tema y enfoque del artículo</Label><Textarea id="art-prompt" rows={3} maxLength={4000} placeholder="Qué quieres explicar, a quién y qué debe responder al lector…" value={prompt} onChange={event => setPrompt(event.target.value)} /></div>
      <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Buscar en la web y citar fuentes" className="size-4 accent-primary" checked={webSearch} onChange={event => setWebSearch(event.target.checked)} />Buscar fuentes en la web</label><label className="flex items-center gap-2 text-sm">Extensión<select aria-label="Extensión del artículo" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={words} onChange={event => setWords(Number(event.target.value))}><option value={600}>Corto (~600)</option><option value={1200}>Medio (~1200)</option><option value={2000}>Largo (~2000)</option></select></label></div>
      <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void onGenerate({ prompt, webSearch, words })} disabled={busy || prompt.trim().length < 10}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Generar borrador</Button><span className="text-xs text-muted-foreground">Consume créditos de IA.</span></div>
      <p className="text-xs text-muted-foreground">Genera un artículo nuevo, no modifica el actual. Revisa el resultado antes de guardarlo.</p>
    </fieldset>
  </details>;
}
