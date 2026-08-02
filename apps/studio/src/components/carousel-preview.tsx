"use client";

import type { CarouselDocument } from "@content-gen/domain/carousel";
import { InstagramFrame } from "@/components/preview/instagram-frame";
import { TikTokFrame } from "@/components/preview/tiktok-frame";
import { colorThemes, type BgStyleId, type FontThemeId } from "@/lib/themes";
import type { BrandSettings, Slide } from "@/lib/slide-types";

export type CarouselTheme = keyof typeof colorThemes;
export type CarouselFont = FontThemeId;
export type CarouselBackground = BgStyleId;
export type CarouselPlatform = "instagram" | "tiktok";

export const carouselFixture: CarouselDocument = {
  schemaVersion: 1, topic: "Diseñar contenido que se queda", platform: "instagram", caption: { text: "Una nota para pensar antes de publicar.", hashtags: ["#contenido", "#diseño"] },
  slides: [
    { id: "cover", layout: "cover", title: "No necesitas publicar más.", subtitle: "Necesitas que una idea merezca quedarse.", emoji: "✳", backgroundColor: "bg-card", textColor: "text-foreground", accentColor: "text-primary" },
    { id: "content", layout: "content", title: "Primero: una tensión real.", content: "El contenido útil empieza donde una persona reconoce un problema que no sabía nombrar.", emoji: "01", backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "list", layout: "list", title: "La prueba rápida", listItems: [{ emoji: "—", text: "¿Se entiende sin contexto?" }, { emoji: "—", text: "¿Tiene una postura?" }, { emoji: "—", text: "¿Invita a guardarlo?" }], backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "number", layout: "bigNumber", bigNumber: "3s", bigNumberLabel: "es el tiempo que tienes para hacer que alguien se detenga", emoji: "03", backgroundColor: "bg-card", textColor: "text-foreground", accentColor: "text-primary" },
    { id: "quote", layout: "quote", quote: "La claridad no le quita alma a una idea. Le da una puerta de entrada.", quoteAuthor: "Nota de estudio", backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "split", layout: "split", title: "Diseña para el pulgar", content: "Jerarquía, aire y contraste: tres decisiones que hacen el trabajo pesado.", imagePosition: "right", backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "overlay", layout: "imageOverlay", title: "Deja una huella, no solo un post.", subtitle: "El fondo también puede contar la historia.", imagePosition: "background", backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "timeline", layout: "timeline", title: "Un ritmo simple", listItems: [{ emoji: "01", text: "Gancho" }, { emoji: "02", text: "Idea" }, { emoji: "03", text: "Acción" }], backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "stats", layout: "statGrid", title: "El sistema", listItems: [{ emoji: "01", text: "Tema" }, { emoji: "02", text: "Tono" }, { emoji: "03", text: "Formato" }, { emoji: "04", text: "CTA" }], backgroundColor: "bg-card", textColor: "text-foreground" },
    { id: "cta", layout: "cta", ctaText: "Haz que valga la pena guardar esto.", ctaSubtext: "Una idea clara es el comienzo.", emoji: "↗", backgroundColor: "bg-card", textColor: "text-foreground" },
  ],
};

// El marco delega en los componentes portados de `carousel-ai`: cada layout es un componente
// React propio (`components/slides/*`) dentro del chrome real de Instagram o TikTok.
export function CarouselFrame({
  document,
  activeSlide,
  onSlideChange,
  platform,
  theme,
  font,
  background,
  accentColor,
  brand,
  isLoading,
  onUpdate,
  onUpdateListItem,
  onCaptionChange,
}: {
  document: CarouselDocument;
  activeSlide: number;
  onSlideChange: (index: number) => void;
  platform: CarouselPlatform;
  theme: CarouselTheme;
  font: CarouselFont;
  background: CarouselBackground;
  accentColor?: string;
  brand?: BrandSettings | null;
  isLoading?: boolean;
  onUpdate?: (field: string, value: string) => void;
  onUpdateListItem?: (index: number, text: string) => void;
  onCaptionChange?: (caption: CarouselDocument["caption"]) => void;
}) {
  const primary = accentColor ?? colorThemes[theme].primary;
  const shared = {
    slides: document.slides as Slide[],
    activeSlide,
    onSlideChange,
    brand,
    caption: document.caption,
    onCaptionChange,
    activePrimary: primary,
    fontTheme: font,
    bgStyle: background,
    isLoading,
    editable: Boolean(onUpdate),
    onUpdateField: onUpdate ? (field: keyof Slide, value: string) => onUpdate(String(field), value) : undefined,
    onUpdateListItem,
  };

  return (
    <div className="w-full max-w-[360px]">
      {platform === "instagram" ? <InstagramFrame {...shared} /> : <TikTokFrame {...shared} />}
    </div>
  );
}
