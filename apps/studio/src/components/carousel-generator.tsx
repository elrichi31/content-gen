"use client";

import { useEffect, useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import type { CarouselDocument } from "@content-gen/domain/carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { Label } from "@/components/ui/label";
import { AiProgress } from "@/components/ai-progress";

type ImageSource = "none" | "unsplash" | "openai" | "illustration";
const IMAGE_SOURCES: { value: ImageSource; label: string; hint: string }[] = [
  { value: "unsplash", label: "Unsplash", hint: "Fotos reales gratis, puestas en 1 o 2 slides." },
  { value: "illustration", label: "Ilustración", hint: "Ilustraciones planas en el color de la marca, con fondo transparente (~$0.005 c/u)." },
  { value: "openai", label: "IA", hint: "Imágenes generadas con OpenAI (~$0.005 c/u)." },
  { value: "none", label: "Sin fotos", hint: "Solo texto y diseño, sin layouts con foto." },
];

export function CarouselGenerator({
  campaignId,
  brandKitId,
  brief,
  onGenerated,
  onNotice,
}: {
  campaignId?: string;
  brandKitId?: string;
  brief?: { topic: string; audience: string; tone: string; context?: string };
  onGenerated: (document: CarouselDocument) => void;
  onNotice: (notice: NoticeState) => void;
}) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [imageSource, setImageSource] = useState<ImageSource>("unsplash");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState("");
  useEffect(() => {
    if (!brief) return;
    setTopic(brief.topic);
    setAudience(brief.audience);
    setTone(brief.tone);
    // El contexto trae los hechos y las fuentes cuando el encargo viene del radar.
    setContext(brief.context ?? "");
  }, [brief]);

  async function generate() {
    setLoading(true);
    const body: Record<string, unknown> = { topic, slideCount, imageSource };
    if (audience.trim()) body.audience = audience.trim();
    if (tone.trim()) body.tone = tone.trim();
    if (context.trim()) body.context = context.trim();
    if (campaignId) body.campaignId = campaignId;
    if (brandKitId) body.brandKitId = brandKitId;
    try {
      const response = await fetch("/api/carousels/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) return onNotice(noticeError(typeof payload.error === "string" ? payload.error : "No se pudo generar el carrusel."));
      onGenerated(payload.document);
      const missing = Number(payload.missingPhotos) > 0;
      onNotice(noticeOk(missing ? `Carrusel generado, pero ${payload.missingPhotos} foto(s) no llegaron: esos slides pasaron a solo texto.` : brandKitId || campaignId ? "Carrusel generado con la marca. Revísalo y guárdalo." : "Carrusel generado. Revísalo y guárdalo en la biblioteca."));
    } catch {
      // Sin esto, una caída de red dejaba el botón en «Generando…» para siempre: el `finally`
      // es lo que garantiza que el formulario vuelve a estar disponible pase lo que pase.
      onNotice(noticeError("No se pudo contactar con el servidor. Comprueba que sigue en marcha y vuelve a intentarlo."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label htmlFor="ai-topic" className="text-xs uppercase tracking-wider text-muted-foreground">Idea IA</Label>
          <Input id="ai-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Tema del carrusel" />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="ai-slides" className="text-xs uppercase tracking-wider text-muted-foreground">Slides</Label>
          <Input id="ai-slides" type="number" min={3} max={20} value={slideCount} onChange={(event) => setSlideCount(Number(event.target.value))} />
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs uppercase tracking-wider text-muted-foreground">Fotos</legend>
        <div role="radiogroup" aria-label="Fuente de las fotos" className="grid grid-cols-4 rounded-lg border border-border p-0.5">
          {IMAGE_SOURCES.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={imageSource === option.value} title={option.hint} onClick={() => setImageSource(option.value)}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${imageSource === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{IMAGE_SOURCES.find((option) => option.value === imageSource)?.hint}</p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="flex-1" disabled={loading || topic.trim().length < 3} onClick={() => void generate()}>
          {loading ? <AiProgress label={imageSource === "none" ? "Generando" : "Generando y buscando fotos"} estimateMs={imageSource === "openai" || imageSource === "illustration" ? 70_000 : 35_000} state="composing" /> : <><Sparkles className="h-4 w-4" /> Generar con IA</>}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAdvanced((value) => !value)}>
          Avanzado <ChevronDown className={`h-4 w-4 transition-transform ${advanced ? "rotate-180" : ""}`} />
        </Button>
      </div>
      {advanced ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1 space-y-1.5">
            <Label htmlFor="ai-audience" className="text-xs uppercase tracking-wider text-muted-foreground">Audiencia</Label>
            <Input id="ai-audience" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Audiencia general" />
          </div>
          <div className="min-w-44 flex-1 space-y-1.5">
            <Label htmlFor="ai-tone" className="text-xs uppercase tracking-wider text-muted-foreground">Tono</Label>
            <Input id="ai-tone" value={tone} onChange={(event) => setTone(event.target.value)} placeholder="Claro y editorial" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
