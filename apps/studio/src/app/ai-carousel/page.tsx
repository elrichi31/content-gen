"use client";

import { useEffect, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Notice, noticeError, type NoticeState } from "@/components/ui/notice";
import { AiProgress } from "@/components/ai-progress";
import { CAROUSEL_MODES, ModeSwitch } from "@/components/mode-switch";
import { BRAND_FROM_CAMPAIGN, BrandSelect, type BrandOption } from "@/components/brand-select";

type Slide = { headline: string; body: string; url: string | null; error: string | null };
type Provider = "gemini" | "openai";
/** Igual que AI_CAROUSEL_PRICE en lib/ai-carousel: esta página es cliente y no importa código de servidor. */
const PROVIDERS: Record<Provider, { label: string; hint: string; price: number; ratio: string }> = {
  gemini: { label: "Nano Banana 2", hint: "Más barato y rápido", price: 0.067, ratio: "aspect-[4/5]" },
  openai: { label: "GPT Image 2 (high)", hint: "Mejor texto y tipografía", price: 0.165, ratio: "aspect-[2/3]" },
};

export default function AiCarouselPage() {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandChoice, setBrandChoice] = useState(BRAND_FROM_CAMPAIGN);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(6);
  const [provider, setProvider] = useState<Provider>("gemini");
  const [shownProvider, setShownProvider] = useState<Provider>("gemini");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [notice, setNotice] = useState<NoticeState>(null);

  useEffect(() => { void fetch("/api/brand-kits").then((response) => response.json()).then(setBrands); }, []);

  async function generate() {
    setBusy(true); setNotice(null); setPercent(0);
    try {
      const response = await fetch("/api/ai-carousel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, slides: count, provider, ...(brandChoice === BRAND_FROM_CAMPAIGN ? {} : { brandKitId: brandChoice }) }) });
      if (!response.ok || !response.body) { const body = await response.json().catch(() => ({})); return setNotice(noticeError(body.error ?? "No se pudo crear el carrusel.")); }
      // La ruta responde en NDJSON: una línea por paso terminado y la última con el resultado.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        buffer += chunk.value;
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === "progress") setPercent(Math.round(100 * event.done / event.total));
          if (event.type === "error") setNotice(noticeError(event.error));
          if (event.type === "done") {
            setSlides(event.slides); setShownProvider(provider);
            const failed = event.slides.filter((slide: Slide) => slide.error).length;
            if (failed) setNotice(noticeError(`${failed} slide(s) no se pudieron dibujar. Vuelve a generar si las necesitas.`));
          }
        }
      }
    }
    catch { setNotice(noticeError("Se cortó la conexión mientras se generaba el carrusel.")); }
    finally { setBusy(false); }
  }

  return (
    <PageShell>
      <div className="mb-6">
        <ModeSwitch modes={CAROUSEL_MODES} current="/ai-carousel" className="mb-3" />
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Crear / Carrusel</p>
        <h1 className="text-2xl font-semibold">Carrusel con imágenes IA</h1>
        <p className="text-sm text-muted-foreground">La IA dibuja cada slide completa, con el texto, el color y el logo de la marca. Costo aprox. ${(count * PROVIDERS[provider].price).toFixed(2)} USD por carrusel.</p>
      </div>
      <Card className="mb-6">
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Tema</Label>
            <Textarea id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="5 errores al lanzar una tienda online" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Modelo</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as Provider)}>
              <SelectTrigger aria-label="Modelo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDERS) as Provider[]).map((key) => <SelectItem key={key} value={key}>{PROVIDERS[key].label} · {PROVIDERS[key].hint} · ${PROVIDERS[key].price}/slide</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <BrandSelect brands={brands} choice={brandChoice} active={brands.find((brand) => brand.id === brandChoice)} onChange={setBrandChoice} />
            <div className="space-y-1.5">
              <Label htmlFor="count" className="text-xs uppercase tracking-wider text-muted-foreground">Slides</Label>
              <Input id="count" type="number" min={2} max={10} value={count} onChange={(event) => setCount(Math.min(10, Math.max(2, Number(event.target.value) || 6)))} />
            </div>
          </div>
          <Button onClick={generate} disabled={busy || topic.trim().length < 3}>{busy ? <AiProgress label={percent ? "Dibujando slides" : "Escribiendo el guion"} percent={percent} state={percent ? "shaping" : "composing"} /> : <><Sparkles className="size-4" />Generar carrusel</>}</Button>
          <Notice notice={notice} onDismiss={() => setNotice(null)} />
        </CardContent>
      </Card>
      {slides.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {slides.map((slide, index) => (
            <figure key={slide.url ?? index} className="space-y-2">
              {slide.url ? <img src={slide.url} alt={slide.headline} className={`${PROVIDERS[shownProvider].ratio} w-full rounded-lg border object-cover`} /> : <div className={`${PROVIDERS[shownProvider].ratio} flex w-full items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground`}>No se pudo dibujar: {slide.headline}</div>}
              {slide.url ? <a href={slide.url} download={`slide-${index + 1}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"><Download className="size-3" />Slide {index + 1}</a> : null}
            </figure>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
