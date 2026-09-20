"use client";

import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type BrandOption = { id: string; name: string; primaryColor: string; business?: { sector?: string; offering?: string; audience?: string; voice?: string } };

/** Valor de «sin elección»: la marca sale de la campaña, si esta tiene una. */
export const BRAND_FROM_CAMPAIGN = "none";

/**
 * Marca con la que la IA escribe. Muestra qué sabe de ella: una marca sin perfil produce el mismo
 * contenido genérico que ninguna, y avisarlo aquí es más útil que descubrirlo al leer el resultado.
 */
export function BrandSelect({ brands, choice, active, onChange, className }: { brands: BrandOption[]; choice: string; active?: BrandOption; onChange: (value: string) => void; className?: string }) {
  const profile = active ? [active.business?.sector, active.business?.audience].filter(Boolean).join(" · ") : "";
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Marca</Label>
      <Select value={choice} onValueChange={onChange}>
        <SelectTrigger aria-label="Marca"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={BRAND_FROM_CAMPAIGN}>Según la campaña</SelectItem>
          {brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {active ? (
        profile
          ? <p className="text-xs text-muted-foreground">La IA escribe como {active.name}: {profile}.</p>
          : <p className="text-xs text-muted-foreground">{active.name} no tiene perfil: <Link href="/brands" className="underline underline-offset-2">complétalo en Marcas</Link> para que la IA sea más precisa.</p>
      ) : null}
    </div>
  );
}
