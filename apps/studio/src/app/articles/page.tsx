"use client";

import { articleDraftSchema, COVER_EXTENSIONS, draftArticle, estimateReadTime, slugify, type ArticleDraft } from "@content-gen/domain/article";
import { todayLocal } from "@content-gen/domain/schedule";
import { ExternalLink, FileText, Plus, Send, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRequestedContentId } from "@/lib/use-requested-content-id";
import { cn } from "@/lib/utils";

type Campaign = { id: string; name: string };
type Item = { id: string; type: string; revision: number; campaignId: string; campaignName?: string; document?: { data?: ArticleDraft } };
type Preview = {
  ready: boolean;
  problems: string[];
  exists?: boolean;
  path?: string;
  url?: string;
  site?: { slugs: string[]; categories: string[]; authors: string[] };
  error?: string;
};

const EXPORT_HINT = "Se escribe el .md en el repositorio del sitio. El commit y el push los haces tú.";

export default function ArticlesPage() {
  const requestedId = useRequestedContentId();
  const [items, setItems] = useState<Item[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [current, setCurrent] = useState<Item | null>(null);
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    const response = await fetch("/api/content-items?type=article&status=active");
    setItems(response.ok ? await response.json() as Item[] : []);
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => {
    void fetch("/api/campaigns").then((response) => response.ok ? response.json() as Promise<Campaign[]> : []).then((list) => {
      setCampaigns(list);
      setCampaignId((previous) => previous || list[0]?.id || "");
    });
  }, []);
  // Enlace profundo desde la biblioteca: /articles?id=<contentItemId>.
  useEffect(() => {
    const requested = requestedId && items.find((item) => item.id === requestedId);
    if (requested) select(requested);
  }, [requestedId, items]);

  const loadPreview = useCallback(async (id: string) => {
    const response = await fetch(`/api/content-items/${id}/blog-export`);
    setPreview(await response.json() as Preview);
  }, []);

  function select(item: Item) {
    setCurrent(item);
    setDraft(item.document?.data ?? null);
    setCampaignId(item.campaignId);
    setNotice(null);
    void loadPreview(item.id);
  }

  function startNew() {
    const title = "Artículo sin título";
    setCurrent(null);
    setDraft(draftArticle({ title, date: todayLocal() }));
    setPreview(null);
    setNotice(null);
  }

  /** Redacta con IA y deja el resultado como borrador nuevo, sin guardar nada todavía. */
  async function generate(input: { prompt: string; webSearch: boolean; words: number }) {
    setBusy(true);
    setNotice(input.webSearch ? "Buscando en la web y redactando… puede tardar un par de minutos." : "Redactando…");
    try {
      const response = await fetch("/api/articles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, category: draft?.category || "" }),
      });
      const payload = await response.json() as { article?: ArticleDraft; sources?: { url: string; title: string }[]; error?: string };
      if (!response.ok || !payload.article) { setNotice(payload.error ?? "No se pudo generar el artículo."); return; }
      setCurrent(null);
      setDraft(payload.article);
      setPreview(null);
      setNotice(`Borrador generado${payload.sources?.length ? ` con ${payload.sources.length} fuente(s) citada(s)` : ""}. Revísalo antes de guardar.`);
    } catch {
      setNotice("No se pudo contactar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  function patch(changes: Partial<ArticleDraft>) {
    setDraft((previous) => previous ? { ...previous, ...changes } : previous);
  }

  /** El slug sigue al título mientras no se toque a mano: es el nombre del fichero y la URL. */
  function changeTitle(title: string) {
    setDraft((previous) => {
      if (!previous) return previous;
      const followsTitle = previous.slug === slugify(previous.title);
      const slug = followsTitle ? slugify(title) || previous.slug : previous.slug;
      const extension = previous.image.split(".").pop() ?? "png";
      return { ...previous, title, slug, image: `/blog/${slug}.${extension}` };
    });
  }

  function changeSlug(raw: string) {
    const slug = slugify(raw) || raw;
    patch({ slug, image: `/blog/${slug}.${draft?.image.split(".").pop() ?? "png"}` });
  }

  async function save() {
    if (!draft) return;
    const parsed = articleDraftSchema.safeParse(draft);
    if (!parsed.success) { setNotice(`No se puede guardar: ${parsed.error.issues[0]?.message}`); return; }
    if (!campaignId) { setNotice("Elige una campaña para el artículo."); return; }
    setBusy(true);
    try {
      const document = { schemaVersion: 1 as const, data: parsed.data };
      const response = current
        ? await fetch(`/api/content-items/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: current.revision, document, campaignId }) })
        : await fetch("/api/content-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, type: "article", document }) });
      const payload = await response.json() as Item & { error?: unknown };
      if (!response.ok) { setNotice(typeof payload.error === "string" ? payload.error : "No se pudo guardar el artículo."); return; }
      setCurrent(payload);
      setNotice("Guardado.");
      await loadItems();
      await loadPreview(payload.id);
    } finally {
      setBusy(false);
    }
  }

  async function exportToSite(overwrite: boolean) {
    if (!current) { setNotice("Guarda el artículo antes de exportarlo."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/content-items/${current.id}/blog-export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overwrite }) });
      const payload = await response.json() as { path?: string; replaced?: boolean; error?: string };
      setNotice(response.ok ? `${payload.replaced ? "Reemplazado" : "Escrito"} en ${payload.path}. Revisa el diff y haz commit.` : payload.error ?? "No se pudo exportar.");
      await loadPreview(current.id);
    } finally {
      setBusy(false);
    }
  }

  const collision = Boolean(draft && preview?.site?.slugs.includes(draft.slug) && preview?.exists);

  return (
    <PageShell>
      <PageHeading
        eyebrow="Blog"
        title="Artículos"
        description="Escribe el artículo aquí y expórtalo como markdown al repositorio del sitio. Publicar sigue siendo un commit tuyo."
        actions={<Button onClick={startNew}><Plus className="h-4 w-4" /> Nuevo artículo</Button>}
      />

      {notice ? <p className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{notice}</p> : null}

      <GeneratorPanel onGenerate={generate} busy={busy} />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          {items.length ? items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => select(item)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md border p-3 text-left text-sm transition-colors",
                current?.id === item.id ? "border-primary/50 bg-primary/10" : "border-border/60 hover:bg-muted/60",
              )}
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">
                <span className="block truncate font-medium">{item.document?.data?.title ?? "Sin título"}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.document?.data?.date} · {item.campaignName}</span>
              </span>
            </button>
          )) : <p className="text-sm text-muted-foreground">Todavía no hay artículos.</p>}
        </div>

        {draft ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="art-title">Título</Label>
                <Input id="art-title" value={draft.title} onChange={(event) => changeTitle(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-slug">Slug (fichero y URL)</Label>
                <Input id="art-slug" value={draft.slug} onChange={(event) => changeSlug(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-date">Fecha</Label>
                <Input id="art-date" type="date" value={draft.date} onChange={(event) => patch({ date: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-category">Categoría</Label>
                <Input id="art-category" list="art-categories" value={draft.category} onChange={(event) => patch({ category: event.target.value })} />
                <datalist id="art-categories">
                  {(preview?.site?.categories ?? []).map((category) => <option key={category} value={category} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-author">Autor</Label>
                <Input id="art-author" list="art-authors" value={draft.author} onChange={(event) => patch({ author: event.target.value })} />
                <datalist id="art-authors">
                  {(preview?.site?.authors ?? []).map((author) => <option key={author} value={author} />)}
                </datalist>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="art-tags">Etiquetas (separadas por comas)</Label>
                <Input
                  id="art-tags"
                  value={draft.tags.join(", ")}
                  onChange={(event) => patch({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-cover">Formato de portada</Label>
                <select
                  id="art-cover"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={draft.image.split(".").pop()}
                  onChange={(event) => patch({ image: `/blog/${draft.slug}.${event.target.value}` })}
                >
                  {COVER_EXTENSIONS.map((extension) => <option key={extension} value={extension}>{extension}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">La imagen va en {draft.image}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-readtime">Tiempo de lectura</Label>
                <div className="flex gap-2">
                  <Input id="art-readtime" value={draft.readTime} onChange={(event) => patch({ readTime: event.target.value })} />
                  <Button variant="outline" size="icon" aria-label="Recalcular tiempo de lectura" onClick={() => patch({ readTime: estimateReadTime(draft.body) })}>
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="art-campaign">Campaña</Label>
                <select id="art-campaign" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
                  {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="art-excerpt">Resumen (meta description)</Label>
                <Textarea id="art-excerpt" rows={2} maxLength={300} value={draft.excerpt} onChange={(event) => patch({ excerpt: event.target.value })} />
                <p className="text-xs text-muted-foreground">{draft.excerpt.length}/300</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="art-body">Cuerpo (markdown)</Label>
                <Textarea id="art-body" rows={18} className="font-mono text-xs" value={draft.body} onChange={(event) => patch({ body: event.target.value })} />
              </div>
            </div>

            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void save()} disabled={busy}>Guardar</Button>
                  <Button variant="outline" onClick={() => void exportToSite(collision)} disabled={busy || !current}>
                    <Send className="h-4 w-4" /> {collision ? "Reemplazar en el sitio" : "Exportar al sitio"}
                  </Button>
                  {preview?.url ? (
                    <a href={preview.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3.5 w-3.5" /> {preview.url}
                    </a>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{EXPORT_HINT}</p>
                {collision ? <p className="text-sm text-amber-600 dark:text-amber-500">Ya hay un artículo publicado con este slug. Exportar lo reemplaza.</p> : null}
                {preview && !preview.ready && preview.problems?.length ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Falta para poder publicarlo:</p>
                    <ul className="list-inside list-disc text-sm text-muted-foreground">
                      {preview.problems.map((problem) => <li key={problem}>{problem}</li>)}
                    </ul>
                  </div>
                ) : null}
                {preview?.error ? <p className="text-sm text-destructive">{preview.error}</p> : null}
                {preview?.ready ? <Badge variant="outline">Listo para publicar</Badge> : null}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Elige un artículo de la lista o crea uno nuevo.
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

/**
 * Encargo para la IA. La búsqueda web va activada por defecto: sin ella el modelo puede
 * inventar precios y fechas, que es justo lo que no queremos publicar en el blog.
 */
function GeneratorPanel({ onGenerate, busy }: { onGenerate: (input: { prompt: string; webSearch: boolean; words: number }) => Promise<void>; busy: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [words, setWords] = useState(1200);

  return (
    <Card className="mb-6">
      <CardContent className="space-y-3 py-4">
        <Label htmlFor="art-prompt" className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4" /> Redactar con IA
        </Label>
        <Textarea
          id="art-prompt"
          rows={3}
          placeholder="Qué artículo quieres: tema, ángulo, qué debe responder al lector…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void onGenerate({ prompt, webSearch, words })} disabled={busy || prompt.trim().length < 10}>
            <Sparkles className="h-4 w-4" /> Generar borrador
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              aria-label="Buscar en la web y citar fuentes"
              className="h-4 w-4 accent-primary"
              checked={webSearch}
              onChange={(event) => setWebSearch(event.target.checked)}
            />
            Buscar en la web y citar fuentes
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Extensión
            <select
              aria-label="Extensión del artículo"
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={words}
              onChange={(event) => setWords(Number(event.target.value))}
            >
              <option value={600}>Corto (~600)</option>
              <option value={1200}>Medio (~1200)</option>
              <option value={2000}>Largo (~2000)</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Genera un borrador nuevo sin guardar nada. Revísalo, ajústalo y guárdalo tú.</p>
      </CardContent>
    </Card>
  );
}
