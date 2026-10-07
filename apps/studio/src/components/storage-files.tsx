"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { formatStorageBytes as bytes, summarizeSelection, type StorageFilePage, type StorageGroup } from "@/lib/storage-file-model";
import { CONTENT_TYPE_LABEL } from "@/lib/content-title";
import type { StorageFileRow } from "@/lib/storage-videos";

type FilePage = StorageFilePage & { partial: boolean; groups: StorageGroup[] };
type Filter = { q: string; kind: string; project: string };

const TYPE_LABEL: Record<string, string> = { ...CONTENT_TYPE_LABEL, brand: "Marca" };
const KIND_LABEL: Record<string, string> = { video: "videos", image: "imágenes", audio: "audios", renders: "temporales", other: "otros" };
const groupKey = (group: StorageGroup) => group.project?.id ?? "none";

/** Cada pieza con lo que ocupa en disco; al tocarla, la lista de abajo muestra solo sus archivos. */
function StorageProjects({ groups, active, busy, onSelect }: { groups: StorageGroup[]; active: string; busy: boolean; onSelect: (project: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? groups : groups.slice(0, 12);
  return <section aria-labelledby="storage-projects" className="mt-7">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="storage-projects" className="text-sm font-semibold">Por proyecto</h2>
      <span className="text-xs text-muted-foreground">{groups.length} grupos · toca uno para ver sus archivos</span>
    </div>
    {groups.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(group => {
        const key = groupKey(group);
        const selected = active === key;
        return <button key={key} type="button" disabled={busy} onClick={() => onSelect(selected ? "" : key)} aria-pressed={selected}
          className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition ${selected ? "border-primary/70 bg-primary/10" : "border-border bg-card hover:bg-muted/40"}`}>
          <FolderOpen className={`mt-0.5 size-4 shrink-0 ${group.project ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px] font-semibold">{group.project?.title ?? "Sin proyecto"}</span><span className="shrink-0 text-[13px] font-semibold tabular-nums">{bytes(group.allocatedBytes)}</span></span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{group.project ? `${TYPE_LABEL[group.project.type] ?? group.project.type}${group.project.campaign ? ` · ${group.project.campaign}` : ""}` : "Archivos que ninguna pieza usa"}</span>
            <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{group.files} archivo{group.files === 1 ? "" : "s"} · {Object.entries(group.kinds).map(([kind, count]) => `${count} ${KIND_LABEL[kind] ?? kind}`).join(", ")}</span>
          </span>
        </button>;
      })}
    </div> : <p className="text-[13px] text-muted-foreground">Todavía no hay archivos.</p>}
    {groups.length > 12 ? <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAll(!showAll)}>{showAll ? "Ver menos" : `Ver los ${groups.length}`}</Button> : null}
  </section>;
}

export function StorageSelectionSummary({ files }: { files: StorageFileRow[] }) {
  const summary = summarizeSelection(files);
  return <div className="space-y-2 text-[13px]">
    <p><span className="font-semibold tabular-nums">{summary.count} archivo{summary.count === 1 ? "" : "s"}</span> · Liberaría aprox. <span className="font-semibold tabular-nums">{bytes(summary.estimatedBytes)}</span></p>
    <p className="text-muted-foreground">Se quitarán {summary.exports} exportaciones y sus enlaces de descarga. Se conservarán los proyectos, las escenas y el audio para volver a renderizar.</p>
    {summary.exports > summary.count ? <p className="text-destructive">Hay archivos compartidos por varias exportaciones. Se eliminarán todos los enlaces de esas copias.</p> : null}
  </div>;
}

export function StorageFiles({ initial }: { initial: FilePage }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<Map<string, StorageFileRow>>(new Map());
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [applied, setApplied] = useState<Filter>({ q: "", kind: "all", project: "" });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const files = [...selected.values()];
  const summary = summarizeSelection(files);
  const selectable = data.files.filter(file => file.deletable);
  const allPage = selectable.length > 0 && selectable.every(file => selected.has(file.key));
  const activeGroup = data.groups.find(group => groupKey(group) === applied.project);
  async function load(page: number, filter: Filter = applied) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/storage/files?${new URLSearchParams({ ...filter, page: String(page) })}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar la lista.");
      setData(result); setApplied(filter);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo actualizar la lista."); }
    finally { setBusy(false); }
  }
  function toggle(file: StorageFileRow) {
    setSelected(current => {
      const next = new Map(current);
      if (next.has(file.key)) next.delete(file.key);
      else if (file.deletable && next.size < 100) next.set(file.key, file);
      return next;
    });
  }
  function togglePage() {
    setSelected(current => {
      const next = new Map(current);
      for (const file of selectable) {
        if (allPage) next.delete(file.key);
        else if (next.size < 100) next.set(file.key, file);
      }
      return next;
    });
  }
  async function remove() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/storage/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, files: files.map(({ key, version }) => ({ key, version })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setConfirming(false); setSelected(new Map());
      const refresh = await fetch(`/api/storage/files?${new URLSearchParams({ ...applied, page: String(data.page) })}`, { cache: "no-store" });
      if (refresh.ok) setData(await refresh.json());
      else setError("El borrado terminó, pero no se pudo releer la lista. Pulsa Actualizar.");
      setMessage(`${result.deleted} archivo(s) eliminados · ${bytes(result.estimatedFreedBytes)} estimados liberados.${result.pending ? ` ${result.pending} archivo(s) pendientes de limpieza; vuelve a actualizar.` : ""}`);
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo completar el borrado."); }
    finally { setBusy(false); }
  }
  return <>
  <StorageProjects groups={data.groups} active={applied.project} busy={busy} onSelect={project => void load(0, { ...applied, project })} />
  <section aria-labelledby="storage-file-list" className="mt-7">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id="storage-file-list" className="text-sm font-semibold">Detalle de archivos</h2>
      <span className="text-xs tabular-nums text-muted-foreground">{data.total.toLocaleString("es")} archivos{data.partial ? " medidos · lista parcial" : ""}</span>
    </div>
    <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void load(0, { q: query.trim(), kind, project: applied.project }); }}>
      <div className="min-w-0 flex-1 basis-48"><label htmlFor="storage-search" className="mb-1 block text-xs text-muted-foreground">Buscar archivo o proyecto</label><Input id="storage-search" maxLength={200} value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="Nombre del archivo…" /></div>
      <div><label htmlFor="storage-kind" className="mb-1 block text-xs text-muted-foreground">Mostrar</label><select id="storage-kind" value={kind} disabled={busy} onChange={event => setKind(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="all">Todos los archivos</option><option value="deletable">Se pueden borrar</option><option value="video">Videos</option><option value="image">Imágenes</option><option value="audio">Audio</option><option value="renders">Renders temporales</option><option value="other">Otros</option></select></div>
      <Button type="submit" variant="outline" disabled={busy}>{busy ? "Cargando…" : "Filtrar"}</Button>
    </form>
    {applied.project ? <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]"><span className="text-muted-foreground">Mostrando:</span><span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-medium">{activeGroup?.project?.title ?? (applied.project === "none" ? "Sin proyecto" : "Proyecto")}<button type="button" aria-label="Quitar filtro de proyecto" disabled={busy} onClick={() => void load(0, { ...applied, project: "" })} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button></span></div> : null}
    {summary.count > 0 ? <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"><p className="text-[13px] tabular-nums">{summary.count} seleccionado{summary.count === 1 ? "" : "s"} · Liberaría aprox. <span className="font-semibold">{bytes(summary.estimatedBytes)}</span></p><div className="flex gap-2"><Button variant="ghost" disabled={busy} onClick={() => setSelected(new Map())}>Limpiar selección</Button><Button variant="destructive" disabled={busy} onClick={() => { setError(""); setConfirming(true); }}><Trash2 className="size-4" aria-hidden="true" />Borrar selección</Button></div></div> : null}
    {error ? <p role="alert" className="mb-3 text-[13px] text-destructive">{error}</p> : null}
    <Notice notice={message ? { tone: "success", message } : null} onDismiss={() => setMessage("")} />
    <div className="overflow-x-auto rounded-xl border border-border" aria-busy={busy}>
      <table className="w-full text-[13px]">
        <caption className="sr-only">Archivos físicos, tamaños y disponibilidad para borrar</caption>
        <thead className="border-b border-border bg-muted/40 text-muted-foreground"><tr><th scope="col" className="w-10 px-3 py-3"><input type="checkbox" aria-label="Seleccionar esta página" checked={allPage} disabled={busy || !selectable.length} onChange={togglePage} className="size-4 accent-primary" /></th><th scope="col" className="px-3 py-3 text-left font-medium">Archivo</th><th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-medium">Tamaño</th><th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-medium">En disco</th></tr></thead>
        <tbody className="divide-y divide-border">
          {data.files.map(file => <tr key={file.key} className={selected.has(file.key) ? "bg-primary/5" : ""}><td className="px-3 py-3"><input type="checkbox" aria-label={`Seleccionar ${file.name}`} checked={selected.has(file.key)} disabled={busy || !file.deletable || selected.size >= 100 && !selected.has(file.key)} onChange={() => toggle(file)} className="size-4 accent-primary" /></td><th scope="row" className="max-w-80 px-3 py-3 text-left font-normal"><span className="block break-all font-medium">{file.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{file.projects?.length ? `${file.projects.map(project => `${TYPE_LABEL[project.type] ?? project.type}: ${project.title}`).join(", ")} · ` : file.pieceTitles.length ? `${file.pieceTitles.join(", ")} · ` : ""}{file.reason}{file.exportCount > 1 ? ` · ${file.exportCount} exportaciones comparten este archivo` : ""}</span></th><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted-foreground">{bytes(file.sizeBytes)}</td><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{bytes(file.allocatedBytes)}</td></tr>)}
          {!data.files.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No hay archivos para este filtro.</td></tr> : null}
        </tbody>
      </table>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Máximo 100 por selección. Los archivos fuente y los temporales activos están protegidos.</p><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={busy || data.page === 0} onClick={() => void load(data.page - 1)}>Anterior</Button><span className="text-xs tabular-nums text-muted-foreground">{data.page + 1} / {data.pages}</span><Button size="sm" variant="outline" disabled={busy || data.page + 1 >= data.pages} onClick={() => void load(data.page + 1)}>Siguiente</Button></div></div>
    <Sheet open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}>
      <SheetContent className="overflow-y-auto" contentClassName="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Borrar videos finales</SheetTitle><SheetDescription>El borrado es definitivo. Para descargar estos videos otra vez tendrás que renderizarlos.</SheetDescription></SheetHeader>
        <div className="px-4"><StorageSelectionSummary files={files} /><ul className="mt-4 max-h-60 space-y-2 overflow-y-auto text-[13px]">{files.map(file => <li key={file.key} className="flex justify-between gap-3"><span className="min-w-0 break-all">{file.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{bytes(file.allocatedBytes)}</span></li>)}</ul><p className="mt-4 text-xs text-muted-foreground">La liberación es estimada: las reservas, snapshots o la actividad del servidor pueden afectar el espacio disponible.</p>{error ? <p role="alert" className="mt-3 text-[13px] text-destructive">{error}</p> : null}</div>
        <SheetFooter><Button variant="destructive" disabled={busy || !summary.count} onClick={() => void remove()}>{busy ? "Borrando…" : "Borrar definitivamente"}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  </section>
  </>;
}
