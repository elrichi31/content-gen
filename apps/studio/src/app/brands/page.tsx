"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Business = { sector: string; offering: string; audience: string; valueProposition: string; voice: string; avoid: string };
type Brand = { id: string; name: string; primaryColor: string; business?: Business };

const DEFAULT_COLOR = "#2f7d40";
const EMPTY_BUSINESS: Business = { sector: "", offering: "", audience: "", valueProposition: "", voice: "", avoid: "" };

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<Brand | null>(null);
  const [name, setName] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [business, setBusiness] = useState<Business>(EMPTY_BUSINESS);
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/brand-kits");
    setBrands(await response.json());
  }
  useEffect(() => { void refresh(); }, []);

  function reset() { setSelected(null); setName(""); setPrimaryColor(DEFAULT_COLOR); setBusiness(EMPTY_BUSINESS); setError(""); }
  function choose(brand: Brand) { setSelected(brand); setName(brand.name); setPrimaryColor(brand.primaryColor); setBusiness({ ...EMPTY_BUSINESS, ...brand.business }); setError(""); }

  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(selected ? `/api/brand-kits/${selected.id}` : "/api/brand-kits", {
      method: selected ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, primaryColor, business }),
    });
    if (!response.ok) return setError("Revisa el nombre y el color de la marca.");
    const brand = await response.json() as Brand;
    await refresh();
    choose(brand);
  }

  async function archive() {
    if (!selected) return;
    await fetch(`/api/brand-kits/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archivedAt: new Date().toISOString() }) });
    reset();
    await refresh();
  }

  return (
    <PageShell className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-2">
        <Button className="w-full justify-start" variant="outline" onClick={reset}>
          <Plus className="h-4 w-4" /> Nueva marca
        </Button>
        <nav className="mt-2 flex flex-col gap-1">
          {brands.map((brand) => (
            <button
              key={brand.id}
              onClick={() => choose(brand)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                selected?.id === brand.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: brand.primaryColor }} />
              <span className="truncate">{brand.name}</span>
            </button>
          ))}
          {!brands.length ? <p className="px-3 py-2 text-sm text-muted-foreground">Sin marcas todavía.</p> : null}
        </nav>
      </aside>

      <Card>
        <CardContent>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Biblioteca / Marcas</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{selected ? selected.name : "Nueva marca"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Un bloque simple para mantener los colores y la identidad que comparten tus piezas.</p>

          <form className="mt-6 max-w-xl space-y-5" onSubmit={save}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Mi marca" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Color principal</Label>
              <div className="flex items-center gap-3">
                <input
                  id="color"
                  type="color"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
                />
                <code className="rounded-md bg-muted px-2 py-1 text-sm text-foreground">{primaryColor}</code>
              </div>
            </div>
            <div className="space-y-4 border-t border-border/40 pt-5">
              <div>
                <h2 className="text-sm font-semibold">El negocio</h2>
                <p className="text-xs text-muted-foreground">
                  Para qué sirve: el radar busca temas que conecten con lo que vendes, y los generadores dejan de escribir en abstracto.
                  Todo es opcional.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sector">Giro del negocio</Label>
                <Input id="sector" value={business.sector} onChange={(event) => setBusiness({ ...business, sector: event.target.value })} placeholder="Ej. Consultora de ciberseguridad y automatización" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offering">Qué vende</Label>
                <Textarea id="offering" rows={2} value={business.offering} onChange={(event) => setBusiness({ ...business, offering: event.target.value })} placeholder="Ej. auditorías de seguridad, flujos de n8n y tiendas online" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audience">A quién</Label>
                <Input id="audience" value={business.audience} onChange={(event) => setBusiness({ ...business, audience: event.target.value })} placeholder="Ej. PyMEs de Latinoamérica" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">Qué lo diferencia</Label>
                <Textarea id="value" rows={2} value={business.valueProposition} onChange={(event) => setBusiness({ ...business, valueProposition: event.target.value })} placeholder="Ej. implementamos y damos soporte, no solo diagnosticamos" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="voice">Cómo habla</Label>
                <Textarea id="voice" rows={2} value={business.voice} onChange={(event) => setBusiness({ ...business, voice: event.target.value })} placeholder="Ej. cercano y directo, tutea, sin tecnicismos ni anglicismos" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avoid">Qué nunca dice</Label>
                <Textarea id="avoid" rows={2} value={business.avoid} onChange={(event) => setBusiness({ ...business, avoid: event.target.value })} placeholder="Ej. no promete «100% seguro», no usa miedo como gancho" />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="submit">{selected ? "Guardar cambios" : "Crear marca"}</Button>
              {selected ? <Button type="button" variant="ghost" className="text-muted-foreground" onClick={archive}>Archivar</Button> : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
