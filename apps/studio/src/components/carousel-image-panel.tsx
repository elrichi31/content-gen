"use client";

import { useRef, useState } from "react";
import { ImagePlus, Sparkles, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignAssetSelect } from "@/components/campaign-asset-select";
import { AiProgress } from "@/components/ai-progress";

type Source = "openai" | "unsplash" | "upload" | "illustration";
type DomainSource = "dalle" | "unsplash" | "upload" | "illustration";

const SOURCES: { value: Source; label: string }[] = [{ value: "unsplash", label: "Unsplash" }, { value: "illustration", label: "Ilustración" }, { value: "openai", label: "IA" }, { value: "upload", label: "Subir" }];
const domainSource: Record<Source, DomainSource> = { openai: "dalle", unsplash: "unsplash", upload: "upload", illustration: "illustration" };

export function CarouselImagePanel({
  imageUrl,
  campaignId,
  suggestion = "",
  color,
  onApply,
}: {
  /** Color del carrusel: las ilustraciones salen en esa paleta. */
  color?: string;
  imageUrl?: string;
  campaignId?: string;
  /** Búsqueda de partida: la que dejó la IA al generar, o el título del slide. */
  suggestion?: string;
  onApply: (url: string, source: DomainSource) => void;
}) {
  const [source, setSource] = useState<Source>("unsplash");
  const [prompt, setPrompt] = useState(suggestion);
  // Al cambiar de slide cambia la sugerencia; se adopta mientras no se haya escrito otra cosa.
  const [lastSuggestion, setLastSuggestion] = useState(suggestion);
  if (suggestion !== lastSuggestion) { setLastSuggestion(suggestion); setPrompt(suggestion); }
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
        body: JSON.stringify({ source, prompt, ...(color ? { color } : {}), ...(campaignId ? { campaignId } : {}) }),
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
    <div className="space-y-2.5">
      {imageUrl ? (
        <div className="relative overflow-hidden rounded-md border border-border">
          <img src={imageUrl} alt="Foto del slide" className="h-28 w-full object-cover" />
          <Button type="button" variant="secondary" size="icon-sm" className="absolute right-1.5 top-1.5" aria-label="Quitar foto" onClick={() => onApply("", "upload")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground">
          <ImagePlus className="h-4 w-4" /> Este slide aún no tiene foto
        </div>
      )}

      <div role="radiogroup" aria-label="Fuente de la foto" className="grid grid-cols-4 rounded-lg border border-border p-0.5">
        {SOURCES.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={source === option.value} onClick={() => { setSource(option.value); setError(""); }}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${source === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
            {option.label}
          </button>
        ))}
      </div>
      {campaignId ? <CampaignAssetSelect campaignId={campaignId} value={imageUrl?.startsWith("/api/assets/") ? imageUrl.slice("/api/assets/".length) : null} onChange={(id) => onApply(id ? `/api/assets/${id}` : "", "upload")} /> : null}

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
          <div className="flex gap-1.5">
            <Input
              aria-label={source !== "unsplash" ? "Descripción de la imagen" : "Búsqueda de la foto"}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && prompt.trim().length >= 3 && !loading) void generate(); }}
              placeholder={source === "unsplash" ? "Busca una foto…" : "Describe la escena"}
              className="h-8 flex-1"
            />
            <Button type="button" variant="outline" size="sm" aria-label={source === "unsplash" ? "Buscar foto" : "Generar imagen"} disabled={loading || prompt.trim().length < 3} onClick={() => void generate()}>
              {loading ? (source === "unsplash" ? "…" : <AiProgress label="" estimateMs={20_000} state="shaping" />) : source === "unsplash" ? <Search className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </Button>
          </div>
        </>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
