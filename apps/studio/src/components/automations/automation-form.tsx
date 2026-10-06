"use client";

import Link from "next/link";
import { useState } from "react";
import { WEEKDAY_LABELS, type PublishingRule } from "@content-gen/domain/schedule";
import type { Automation } from "@/lib/carousel-automation-rules";
import { AI_CAROUSEL_PRICE } from "@/lib/ai-carousel";
import { BRAND_FROM_CAMPAIGN, BrandSelect, type BrandOption } from "@/components/brand-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Campaign = { id: string; name: string };
type Kind = Automation["kind"];
type ImageSource = Automation["imageSource"];
type Provider = Automation["provider"];

const NO_RADAR = "none";
const IMAGE_SOURCES: Record<ImageSource, { label: string; cost: number }> = {
  none: { label: "Sin fotos", cost: 0 },
  unsplash: { label: "Fotos de Unsplash", cost: 0 },
  illustration: { label: "Ilustraciones", cost: 0.01 },
  openai: { label: "Imágenes IA (OpenAI)", cost: 0.01 },
};
const PROVIDERS: Record<Provider, string> = { gemini: "Nano Banana 2 · más barato y rápido", openai: "GPT Image 2 · mejor tipografía" };
/** Guion del carrusel editable: una llamada de texto. Aproximado, para orientar, no para facturar. */
const SCRIPT_COST = 0.02;
const label = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export const ruleDays = (rule: PublishingRule) => rule.weekdays.map((day) => WEEKDAY_LABELS[day].slice(0, 3)).join(", ");
export const describeRule = (rule: PublishingRule) => `${ruleDays(rule)} · ${rule.times.join(", ")}`;

export function carouselCost(kind: Kind, slides: number, imageSource: ImageSource, provider: Provider) {
  return kind === "images" ? slides * AI_CAROUSEL_PRICE[provider] : SCRIPT_COST + IMAGE_SOURCES[imageSource].cost;
}
export const money = (value: number) => `$${value < 1 ? value.toFixed(2) : value.toFixed(1)}`;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border px-5 py-5 last:border-b-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Alta y edición de una automatización. Se agrupa por las preguntas que se hace quien la configura
 * (cuándo, qué, para quién, sobre qué) y cierra con lo que va a costar, antes de guardar.
 */
export function AutomationForm({ editing, rules, campaigns, brands, verticals, onSubmit, onCancel }: {
  editing: Automation | null;
  rules: PublishingRule[];
  campaigns: Campaign[];
  brands: BrandOption[];
  verticals: string[];
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [ruleId, setRuleId] = useState(editing?.ruleId ?? rules[0]?.id ?? "");

  const [campaignId, setCampaignId] = useState(editing?.campaignId ?? campaigns[0]?.id ?? "");
  const [brandChoice, setBrandChoice] = useState(editing?.brandKitId ?? BRAND_FROM_CAMPAIGN);
  const [kind, setKind] = useState<Kind>(editing?.kind ?? "editable");
  const [slides, setSlides] = useState(editing?.slides ?? 6);
  const [imageSource, setImageSource] = useState<ImageSource>(editing?.imageSource ?? "unsplash");
  const [provider, setProvider] = useState<Provider>(editing?.provider ?? "gemini");
  const [topics, setTopics] = useState(editing?.topics.join("\n") ?? "");
  const [radarVertical, setRadarVertical] = useState(editing?.radarVertical ?? NO_RADAR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const topicList = [...new Set(topics.split("\n").map((line) => line.trim()).filter(Boolean))];
  const used = editing ? topicList.filter((item) => editing.usedTopics.includes(item)).length : 0;
  const rule = rules.find((item) => item.id === ruleId);
  const perCarousel = carouselCost(kind, slides, imageSource, provider);
  const perMonth = rule ? perCarousel * rule.weekdays.length * rule.times.length * 4.3 : 0;
  const shortTopic = topicList.some((item) => item.length < 3);
  const missing = !name.trim() ? "Ponle un nombre." : !ruleId ? "Elige una pauta." : !campaignId ? "Elige una campaña." : !topicList.length && radarVertical === NO_RADAR ? "Agrega temas o elige un vertical del radar." : shortTopic ? "Cada tema necesita al menos 3 letras." : "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (missing) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        name: name.trim(), ruleId, campaignId, kind, slides, imageSource, provider, daysAhead: 1,
        brandKitId: brandChoice === BRAND_FROM_CAMPAIGN ? null : brandChoice,
        topics: topicList,
        radarVertical: radarVertical === NO_RADAR ? null : radarVertical,
      });
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo guardar la automatización."); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-5 pb-5 pt-6 pr-12">
        <SheetTitle className="text-base">{editing ? "Editar automatización" : "Nueva automatización"}</SheetTitle>
        <p className="mt-1 text-sm text-muted-foreground">Rellena los huecos libres de una pauta con carruseles en borrador. Nunca publica.</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Section title="Nombre">
          <Input aria-label="Nombre" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tips semanales de Instagram" autoFocus={!editing} />
        </Section>

        <Section title="Cuándo" hint="Se genera el mismo día de publicación, antes de la hora de la pauta. Los huecos que ya tienen pieza no se tocan.">
          {rules.length === 0 ? (
            <p className="rounded-md bg-surface-secondary px-3 py-2.5 text-sm text-muted-foreground">
              Aún no hay pautas. <Link href="/schedule" className="font-medium text-primary underline-offset-4 hover:underline">Crea una en el Cronograma</Link> (por ejemplo, Instagram lunes, miércoles y viernes a las 19:00).
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label className={label}>Pauta</Label>
              <Select value={ruleId} onValueChange={setRuleId}>
                <SelectTrigger aria-label="Pauta"><SelectValue placeholder="Elige una pauta" /></SelectTrigger>
                <SelectContent>{rules.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {describeRule(item)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">El servidor revisa cada 15 minutos. No prepara publicaciones de días futuros.</p>
        </Section>

        <Section title="Qué carrusel">
          <div role="radiogroup" aria-label="Tipo de carrusel" className="grid grid-cols-2 gap-2">
            {([
              ["editable", "Editable", "Layouts con texto real. Lo retocas en el editor."],
              ["images", "Imágenes IA", "Cada slide dibujada entera por IA, con la marca."],
            ] as const).map(([value, title, description]) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]",
                  kind === value ? "border-primary bg-primary/5" : "border-border hover:bg-surface-secondary",
                )}>
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">{description}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
            {kind === "editable" ? (
              <div className="space-y-1.5">
                <Label className={label}>Fotos</Label>
                <Select value={imageSource} onValueChange={(value) => setImageSource(value as ImageSource)}>
                  <SelectTrigger aria-label="Fotos"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(IMAGE_SOURCES) as ImageSource[]).map((key) => <SelectItem key={key} value={key}>{IMAGE_SOURCES[key].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className={label}>Modelo</Label>
                <Select value={provider} onValueChange={(value) => setProvider(value as Provider)}>
                  <SelectTrigger aria-label="Modelo"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(PROVIDERS) as Provider[]).map((key) => <SelectItem key={key} value={key}>{PROVIDERS[key]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="automation-slides" className={label}>Slides</Label>
              <Input id="automation-slides" type="number" min={3} max={10} value={slides} onChange={(event) => setSlides(Math.min(10, Math.max(3, Number(event.target.value) || 6)))} className="tabular-nums" />
            </div>
          </div>
        </Section>

        <Section title="Para quién" hint="El carrusel se guarda en la campaña y se escribe con la voz de la marca.">
          <div className="space-y-1.5">
            <Label className={label}>Campaña</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger aria-label="Campaña"><SelectValue placeholder="Elige una campaña" /></SelectTrigger>
              <SelectContent>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <BrandSelect brands={brands} choice={brandChoice} active={brands.find((brand) => brand.id === brandChoice)} onChange={setBrandChoice} />
        </Section>

        <Section title="Sobre qué" hint="Se usan en orden, uno por carrusel. Cuando se acaban, sigue con el radar o se detiene.">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="automation-topics" className={label}>Temas, uno por línea</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{topicList.length} {topicList.length === 1 ? "tema" : "temas"}{used ? ` · ${used} ya ${used === 1 ? "usado" : "usados"}` : ""}</span>
            </div>
            <Textarea id="automation-topics" rows={6} value={topics} onChange={(event) => setTopics(event.target.value)} placeholder={"5 errores al lanzar una tienda online\nCómo elegir tu primer CRM\nQué es el SEO local y por qué importa"} className="leading-relaxed" />
          </div>
          <div className="space-y-1.5">
            <Label className={label}>Cuando se acaben</Label>
            <Select value={radarVertical} onValueChange={setRadarVertical}>
              <SelectTrigger aria-label="Cuando se acaben los temas"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RADAR}>Detenerse</SelectItem>
                {verticals.map((vertical) => <SelectItem key={vertical} value={vertical}>Seguir con el radar · {vertical}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Section>
      </div>

      <div className="shrink-0 space-y-3 border-t border-border bg-background px-5 py-4">
        <p className="text-xs text-muted-foreground">
          ≈ <span className="font-medium tabular-nums text-foreground">{money(perCarousel)}</span> por carrusel
          {rule ? <> · ≈ <span className="font-medium tabular-nums text-foreground">{money(perMonth)}</span> al mes con esta pauta</> : null}
        </p>
        {missing ? <p className="text-xs text-muted-foreground">{missing}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" className="flex-1" disabled={Boolean(missing) || saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear automatización"}</Button>
        </div>
      </div>
    </form>
  );
}
