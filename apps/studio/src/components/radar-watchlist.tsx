"use client";

import type { RadarWatchlistEntry } from "@content-gen/domain/radar";
import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice, noticeError, type NoticeState } from "@/components/ui/notice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Brand = { id: string; name: string };
const AGENCY = "__agency";

/**
 * Editor de la lista de vigilancia, en un panel. Vive en la app y no en un fichero de configuración
 * porque cuando la agencia añade un servicio hay que poder añadir una fila, no editar código (D-08).
 */
export function RadarWatchlist({ open, onOpenChange, entries, brands, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: RadarWatchlistEntry[];
  brands: Brand[];
  onChanged: () => Promise<void> | void;
}) {
  const [adding, setAdding] = useState(false);
  const [vertical, setVertical] = useState("");
  const [offering, setOffering] = useState("");
  const [audience, setAudience] = useState("");
  const [brandKitId, setBrandKitId] = useState(AGENCY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  /** Sin capturar el rechazo de `fetch`, quedarse sin servidor parece un fallo de la aplicación. */
  async function call(request: () => Promise<Response>, fallback: string) {
    try {
      const response = await request();
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setNotice(noticeError(result?.error ?? fallback));
        return false;
      }
      await onChanged();
      return true;
    } catch {
      setNotice(noticeError("No se pudo contactar con el servidor. Comprueba que sigue en marcha."));
      return false;
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await call(() => fetch("/api/radar/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical, offering, ...(audience ? { audience } : {}), brandKitId: brandKitId === AGENCY ? null : brandKitId }),
    }), "No se pudo añadir el vertical.");
    setSaving(false);
    if (ok) { setVertical(""); setOffering(""); setAudience(""); setBrandKitId(AGENCY); setAdding(false); }
  }

  const toggle = (entry: RadarWatchlistEntry) => call(() => fetch(`/api/radar/watchlist/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !entry.active }) }), "No se pudo cambiar el vertical.");
  const remove = (entry: RadarWatchlistEntry) => {
    if (!window.confirm(`¿Quitar «${entry.vertical}» del radar? Sus temas ya encontrados se conservan.`)) return;
    void call(() => fetch(`/api/radar/watchlist/${entry.id}`, { method: "DELETE" }), "No se pudo quitar el vertical.");
  };
  const brandName = (id: string | null) => id ? brands.find((brand) => brand.id === id)?.name ?? "marca archivada" : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" contentClassName="w-full sm:max-w-md" className="h-full gap-0 overflow-y-auto p-0">
        <Notice notice={notice} onDismiss={() => setNotice(null)} />
        <div className="border-b border-border px-5 pb-5 pt-6 pr-12">
          <SheetTitle className="text-base">Qué vigila el radar</SheetTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">Cada vertical activo es una búsqueda en cada pasada. Pausar uno lo deja fuera sin perder sus temas.</p>
        </div>

        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
              <button type="button" role="switch" aria-checked={entry.active} aria-label={entry.active ? `Pausar ${entry.vertical}` : `Activar ${entry.vertical}`} onClick={() => void toggle(entry)}
                className={cn("relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150", entry.active ? "bg-primary" : "bg-input")}>
                <span className={cn("size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]", entry.active ? "translate-x-[18px]" : "translate-x-0.5")} />
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[13px] font-medium", !entry.active && "text-muted-foreground")}>
                  {entry.vertical}
                  {brandName(entry.brandKitId) ? <span className="ml-2 text-xs font-normal text-muted-foreground">{brandName(entry.brandKitId)}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{entry.offering}</p>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={() => remove(entry)} aria-label={`Quitar ${entry.vertical}`}><Trash2 className="size-4" /></Button>
            </li>
          ))}
          {!entries.length ? <li className="px-5 py-6 text-[13px] text-muted-foreground">Todavía no vigilas nada. Añade el primer vertical para poder buscar temas.</li> : null}
        </ul>

        <div className="border-t border-border px-5 py-4">
          {adding ? (
            <form className="space-y-3" onSubmit={add}>
              <div className="space-y-1.5">
                <Label htmlFor="vertical">Vertical</Label>
                <Input id="vertical" value={vertical} onChange={(event) => setVertical(event.target.value)} placeholder="Ej. Ciberseguridad" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offering">Qué vende la agencia aquí</Label>
                <Textarea id="offering" value={offering} onChange={(event) => setOffering(event.target.value)} placeholder="Ej. auditorías de seguridad y hardening de servidores" required rows={2} />
                <p className="text-xs text-muted-foreground">Cuanto más concreto, mejor: ancla los temas a algo vendible y no a tendencias sueltas.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="audience">A quién (opcional)</Label>
                  <Input id="audience" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="PyMEs de Latinoamérica" />
                </div>
                <div className="space-y-1.5">
                  <Label>Marca (opcional)</Label>
                  <Select value={brandKitId} onValueChange={setBrandKitId}>
                    <SelectTrigger aria-label="Marca"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AGENCY}>Sin marca (agencia)</SelectItem>
                      {brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setAdding(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={saving}>{saving ? "Añadiendo…" : "Añadir vertical"}</Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setAdding(true)}><Plus className="size-4" />Añadir vertical</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
