"use client";

import { TikTokPreview } from "./social-preview";
import { SlideLoadingOverlay } from "./loading-overlay";
import type { CarouselPlatformProps } from "./instagram-frame";
import { SlideRenderer } from "@/components/slide-renderer";

export function TikTokFrame({ slides, activeSlide, onSlideChange, brand, caption, onCaptionChange, activePrimary, fontTheme, bgStyle, isLoading = false, editable, onUpdateField, onUpdateListItem }: CarouselPlatformProps) {
  const index = Math.max(0, Math.min(activeSlide, slides.length - 1));
  return <TikTokPreview profileName={brand?.name} logoUrl={brand?.logoUrl} caption={caption} onCaptionChange={onCaptionChange} activeSlide={index} totalSlides={slides.length || 1} onSlideChange={onSlideChange}>
    {slides[index] ? <SlideRenderer slide={slides[index]} platform="tiktok" index={index} total={slides.length} brand={brand} activePrimary={activePrimary} fontTheme={fontTheme} bgStyle={bgStyle} editable={editable} onUpdateField={onUpdateField} onUpdateListItem={onUpdateListItem} /> : <div className="flex h-full items-center justify-center bg-[#151515] text-sm text-white/70">Añade tu primera imagen</div>}
    {isLoading && <SlideLoadingOverlay />}
  </TikTokPreview>;
}
