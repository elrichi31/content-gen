"use client"

import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react"
import { CaptionEditor } from "./caption-editor"
import { SlideLoadingOverlay } from "./loading-overlay"
import type { Slide, BrandSettings, PostCaption } from "@/lib/slide-types"
import type { FontThemeId, BgStyleId } from "@/lib/themes"
import { SlideRenderer } from "@/components/slide-renderer"

interface InstagramFrameProps {
  slides: Slide[]
  activeSlide: number
  onSlideChange: (index: number) => void
  brand?: BrandSettings | null
  caption?: PostCaption | null
  onCaptionChange?: (caption: PostCaption) => void
  isLoading?: boolean
  activePrimary?: string
  fontTheme?: FontThemeId
  bgStyle?: BgStyleId
  editable?: boolean
  onUpdateField?: (field: keyof Slide, value: string) => void
  onUpdateListItem?: (index: number, text: string) => void
}

export function InstagramFrame({
  slides, activeSlide, onSlideChange, brand, caption, onCaptionChange,
  activePrimary, fontTheme, bgStyle, isLoading = false, editable, onUpdateField, onUpdateListItem,
}: InstagramFrameProps) {
  const profileName = brand?.name || "your.account"

  return (
    <div className="w-full rounded-xl border border-border/60 bg-card shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px] flex-shrink-0">
            <div className="h-full w-full rounded-full bg-card flex items-center justify-center overflow-hidden p-[3px]">
              {brand?.logoUrl ? (
                <img src={brand.logoUrl} alt={profileName} className="h-full w-full object-contain rounded-full" />
              ) : (
                <span className="text-[10px] font-semibold text-foreground">
                  {profileName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs font-semibold text-foreground">{profileName}</span>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Slide area */}
      <div className="relative">
        <div className="absolute top-2 right-2 z-10 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {activeSlide + 1}/{slides.length}
        </div>
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          <SlideRenderer slide={slides[activeSlide]} index={activeSlide} total={slides.length} brand={brand} activePrimary={activePrimary} fontTheme={fontTheme} bgStyle={bgStyle} editable={editable} onUpdateField={onUpdateField} onUpdateListItem={onUpdateListItem} />
          {isLoading && <SlideLoadingOverlay />}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1 pt-2 pb-1">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => onSlideChange(i)}
            className={`rounded-full transition-all ${i === activeSlide ? "h-1.5 w-4 bg-blue-500" : "h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"}`}
          >
            <span className="sr-only">Slide {i + 1}</span>
          </button>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <button aria-label="Me gusta" className="text-foreground hover:text-red-500 transition-colors"><Heart className="h-5 w-5" /></button>
          <button aria-label="Comentar" className="text-foreground hover:text-foreground/70 transition-colors"><MessageCircle className="h-5 w-5" /></button>
          <button aria-label="Compartir" className="text-foreground hover:text-foreground/70 transition-colors"><Send className="h-5 w-5" /></button>
        </div>
        <button aria-label="Guardar publicación" className="text-foreground hover:text-foreground/70 transition-colors"><Bookmark className="h-5 w-5" /></button>
      </div>

      <CaptionEditor caption={caption} onCaptionChange={onCaptionChange} profileName={profileName} />
    </div>
  )
}
