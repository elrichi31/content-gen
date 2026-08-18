"use client";

import type { RadarWatchlistEntry } from "@content-gen/domain/radar";
import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Brand = { id: string; name: string };

/**
 * Editor de la lista de vigilancia. Vive aquí y no en un fichero de configuración porque cuando la
 * agencia añade un servicio hay que poder añadir una fila, no editar código (D-08 del plan).
 */
export function RadarWatchlist({ entries, brands, onChanged }: { entries: RadarWatchlistEntry[]; brands: Brand[]; onChanged: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [vertical, setVertical] = useState("");
  const [offering, setOffering] = useState("");
  const [audience, setAudience] = useState("");
  const [brandKitId, setBrandKitId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setVertical(""); setOffering(""); setAudience(""); setBrandKitId(""); setError("");
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/radar/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertical, offering, ...(audience ? { audience } : {}), brandKitId: brandKitId || null }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) { setError(result?.error ?? "No se pudo añadir el vertical."); return; }
      reset();
      setOpen(false);
      await onChanged();
    } catch {
      setError("No se pudo contactar con el servidor. Comprueba que sigue en marcha.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Toda llamada pasa por aquí: sin capturar el rechazo de `fetch`, quedarse sin servidor sube el
   * error hasta el overlay de Next y parece un fallo de la aplicación en vez de una desconexión.
   */
  async function call(request: () => Promise<Response>) {
    try {
      const response = await request();
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error ?? "No se pudo completar la operación.");
        return;
      }
      setError("");
      await onChanged();
    } catch {
      setError("No se pudo contactar con el servidor. Comprueba que sigue en marcha.");
    }
  }

  async function toggle(entry: RadarWatchlistEntry) {
    await call(() => fetch(`/api/radar/watchlist/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !entry.active }),
    }));
  }

  async function remove(entry: RadarWatchlistEntry) {
    await call(() => fetch(`/api/radar/watchlist/${entry.id}`, { method: "DELETE" }));
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Qué vigilar</h2>
            <p className="text-xs text-muted-foreground">
              Cada vertical activo es una búsqueda por corrida. Desactivar uno lo deja fuera sin perder sus temas.
            </p>
          </div>
          <Button size="sm" variant={open ? "ghost" : "outline"} onClick={() => setOpen(!open)}>
            <Plus className="h-4 w-4" /> {open ? "Cancelar" : "Añadir vertical"}
          </Button>
        </div>

        {error && !open ? <p className="text-sm text-destructive">{error}</p> : null}

        {entries.length ? (
          <ul className="divide-y divide-border/40">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={entry.active ? "text-sm font-medium" : "text-sm font-medium text-muted-foreground line-through"}>
                    {entry.vertical}
                    {entry.brandKitId ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {brands.find((brand) => brand.id === entry.brandKitId)?.name ?? "marca archivada"}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{entry.offering}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void toggle(entry)}>
                    {entry.active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(entry)} aria-label={`Eliminar ${entry.vertical}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no vigilas nada. Añade el primer vertical para poder lanzar una corrida.</p>
        )}

        {open ? (
          <form className="space-y-3 border-t border-border/40 pt-3" onSubmit={add}>
            <div className="space-y-1.5">
              <Label htmlFor="vertical">Vertical</Label>
              <Input id="vertical" value={vertical} onChange={(event) => setVertical(event.target.value)} placeholder="Ej. Ciberseguridad" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offering">Qué vende la agencia aquí</Label>
              <Textarea
                id="offering"
                value={offering}
                onChange={(event) => setOffering(event.target.value)}
                placeholder="Ej. auditorías de seguridad y hardening de servidores"
                required
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Cuanto más concreto, mejor: es lo que ancla los temas a algo vendible en vez de a tendencias sueltas.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="audience">A quién (opcional)</Label>
                <Input id="audience" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="PyMEs de Latinoamérica" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand">Marca (opcional)</Label>
                <select
                  id="brand"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={brandKitId}
                  onChange={(event) => setBrandKitId(event.target.value)}
                >
                  <option value="">Sin marca (agencia)</option>
                  {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Hereda el giro y la propuesta que tenga la marca.</p>
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Añadiendo…" : "Añadir"}</Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
