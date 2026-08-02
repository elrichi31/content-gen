"use client";

import { useRef, useState } from "react";
import { ImagePlus, Sparkles, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignAssetSelect } from "@/components/campaign-asset-select";

type Source = "openai" | "unsplash" | "upload";
type DomainSource = "dalle" | "unsplash" | "upload";

const domainSource: Record<Source, DomainSource> = { openai: "dalle", unsplash: "unsplash", upload: "upload" };

export function CarouselImagePanel({
  imageUrl,
  campaignId,
  onApply,
}: {
  imageUrl?: string;
  campaignId?: string;
  onApply: (url: string, source: DomainSource) => void;
}) {
  const [source, setSource] = useState<Source>("unsplash");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function generate() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/carousels/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, prompt, ...(campaignId ? { campaignId } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo obtener la imagen.");
      onApply(payload.url, domainSource[source]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo obtener la imagen.");
    } finally {
      setLoading(false);
    }
  }

  async function upload(file: File) {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": file.type, "X-Asset-Filename": encodeURIComponent(file.name), ...(campaignId ? { "X-Campaign-Id": campaignId } : {}) }, body: file });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo subir la imagen.");
      onApply(payload.url, "upload");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir la imagen.");
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <ImagePlus className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Imagen del slide</p>
      </div>

      {imageUrl ? (
        <div className="relative overflow-hidden rounded-md border border-border/60">
          <img src={imageUrl} alt="Imagen del slide" className="h-24 w-full object-cover" />
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute right-1.5 top-1.5"
            aria-label="Quitar imagen"
            onClick={() => onApply("", "upload")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuente</Label>
        <Select value={source} onValueChange={(value) => { setSource(value as Source); setError(""); }}>
          <SelectTrigger aria-label="Fuente de imagen" className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unsplash">Buscar (Unsplash)</SelectItem>
            <SelectItem value="openai">Generar (OpenAI)</SelectItem>
            <SelectItem value="upload">Subir archivo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CampaignAssetSelect campaignId={campaignId} value={imageUrl?.startsWith("/api/assets/") ? imageUrl.slice("/api/assets/".length) : null} onChange={(id) => onApply(id ? `/api/assets/${id}` : "", "upload")} />

      {source === "upload" ? (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
          />
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={loading} onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> {loading ? "Subiendo…" : "Elegir archivo"}
          </Button>
        </>
      ) : (
        <>
          <Input
            aria-label={source === "openai" ? "Descripción de imagen" : "Búsqueda de imagen"}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={source === "openai" ? "Describe la imagen a generar" : "Busca una foto…"}
            className="h-8"
          />
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={loading || prompt.trim().length < 3} onClick={() => void generate()}>
            {source === "openai" ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {loading ? (source === "openai" ? "Generando…" : "Buscando…") : source === "openai" ? "Generar" : "Buscar"}
          </Button>
        </>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[10px] leading-relaxed text-muted-foreground">Se aplica a los layouts <b>split</b> e <b>imageOverlay</b>.</p>
    </div>
  );
}
