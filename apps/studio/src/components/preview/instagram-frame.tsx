"use client";

import { InstagramPreview } from "./social-preview";
import { SlideLoadingOverlay } from "./loading-overlay";
import type { Slide, BrandSettings, PostCaption } from "@/lib/slide-types";
import type { FontThemeId, BgStyleId } from "@/lib/themes";
import { SlideRenderer } from "@/components/slide-renderer";

export interface CarouselPlatformProps {
  slides: Slide[];
  activeSlide: number;
  onSlideChange: (index: number) => void;
  brand?: BrandSettings | null;
  caption?: PostCaption | null;
  onCaptionChange?: (caption: PostCaption) => void;
  isLoading?: boolean;
  activePrimary?: string;
  fontTheme?: FontThemeId;
  bgStyle?: BgStyleId;
  editable?: boolean;
  onUpdateField?: (field: keyof Slide, value: string) => void;
  onUpdateListItem?: (index: number, text: string) => void;
}

export function InstagramFrame({ slides, activeSlide, onSlideChange, brand, caption, onCaptionChange, activePrimary, fontTheme, bgStyle, isLoading = false, editable, onUpdateField, onUpdateListItem }: CarouselPlatformProps) {
  const index = Math.max(0, Math.min(activeSlide, slides.length - 1));
  return <InstagramPreview profileName={brand?.name} logoUrl={brand?.logoUrl} caption={caption} onCaptionChange={onCaptionChange} activeSlide={index} totalSlides={slides.length || 1} onSlideChange={onSlideChange}>
    {slides[index] ? <SlideRenderer slide={slides[index]} index={index} total={slides.length} brand={brand} activePrimary={activePrimary} fontTheme={fontTheme} bgStyle={bgStyle} editable={editable} onUpdateField={onUpdateField} onUpdateListItem={onUpdateListItem} /> : <div className="flex h-full items-center justify-center bg-[#f4f4f4] text-sm text-[#666]">Añade tu primera imagen</div>}
    {isLoading && <SlideLoadingOverlay />}
  </InstagramPreview>;
}
