"use client";

import { useEffect, useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import type { CarouselDocument } from "@content-gen/domain/carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CarouselGenerator({
  campaignId,
  brief,
  onGenerated,
  onNotice,
}: {
  campaignId?: string;
  brief?: { topic: string; audience: string; tone: string; context?: string };
  onGenerated: (document: CarouselDocument) => void;
  onNotice: (notice: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [advanced, setAdvanced] = useState(false);
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
    const body: Record<string, unknown> = { topic, slideCount };
    if (audience.trim()) body.audience = audience.trim();
    if (tone.trim()) body.tone = tone.trim();
    if (context.trim()) body.context = context.trim();
    if (campaignId) body.campaignId = campaignId;
    const response = await fetch("/api/carousels/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) return onNotice(payload.error ?? "No se pudo generar el carrusel.");
    onGenerated(payload.document);
    onNotice(campaignId ? "Carrusel generado con la marca de la campaña. Revísalo y guárdalo." : "Carrusel generado. Revísalo y guárdalo en la biblioteca.");
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
        <Button disabled={loading || topic.trim().length < 3} onClick={() => void generate()}>
          <Sparkles className="h-4 w-4" />
          {loading ? "Generando…" : "Generar IA"}
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
