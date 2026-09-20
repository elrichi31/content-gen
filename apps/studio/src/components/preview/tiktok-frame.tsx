"use client"

import { Heart, Bookmark, Music, Plus } from "lucide-react"
import { CaptionEditor } from "./caption-editor"
import { SlideLoadingOverlay } from "./loading-overlay"
import type { Slide, BrandSettings, PostCaption } from "@/lib/slide-types"
import type { FontThemeId, BgStyleId } from "@/lib/themes"
import { SlideRenderer } from "@/components/slide-renderer"

interface TikTokFrameProps {
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

export function TikTokFrame({
  slides, activeSlide, onSlideChange, brand, caption, onCaptionChange,
  activePrimary, fontTheme, bgStyle, isLoading = false, editable, onUpdateField, onUpdateListItem,
}: TikTokFrameProps) {
  const profileName = brand?.name || "your.account"

  return (
    <div className="w-full rounded-xl border border-border/60 bg-black shadow-xl overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-center gap-4 py-2 bg-black/80">
        <span className="text-[11px] text-white/50 font-medium">Siguiendo</span>
        <span className="text-[11px] text-white font-bold relative">
          Para ti
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-[2px] w-6 bg-white rounded-full" />
        </span>
      </div>

      <div className="relative">
        <div className="aspect-[3/5] w-full overflow-hidden relative">
          <div className="absolute inset-0">
            <SlideRenderer slide={slides[activeSlide]} platform="tiktok" index={activeSlide} total={slides.length} brand={brand} activePrimary={activePrimary} fontTheme={fontTheme} bgStyle={bgStyle} editable={editable} onUpdateField={onUpdateField} onUpdateListItem={onUpdateListItem} />
          </div>
          {isLoading && <SlideLoadingOverlay />}

          {/* Bottom gradient + content row */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black via-black/70 to-transparent pt-16">
            <div className="flex items-end px-3 pb-3">
              {/* Left: dots + username + caption + music */}
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex justify-center gap-1.5 mb-2.5">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => onSlideChange(i)}
                      className={`rounded-full transition-all h-1.5 w-1.5 ${i === activeSlide ? "bg-white" : "bg-white/40"}`}
                    >
                      <span className="sr-only">Slide {i + 1}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[12px] font-bold text-white">{profileName}</span>
                  <span className="text-[10px] text-white/50">· hace 10 h</span>
                </div>
                {caption?.text && (
                  <p className="text-[11px] text-white/90 line-clamp-1 mb-1">
                    {caption.text}
                    {caption?.hashtags && caption.hashtags.length > 0 && (
                      <> {caption.hashtags.slice(0, 3).map((h) => `#${h}`).join(" ")}</>
                    )}
                    <span className="text-white/50"> … más</span>
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  <Music className="h-3 w-3 text-white flex-shrink-0" />
                  <p className="text-[10px] text-white/80 truncate">Original sound - {profileName}</p>
                </div>
              </div>

              {/* Right: spinning disc */}
              <div className="flex-shrink-0 mb-0.5">
                <div className="h-8 w-8 rounded-full border-[3px] border-zinc-800 overflow-hidden animate-spin-slow">
                  <div className="h-full w-full rounded-full bg-black flex items-center justify-center">
                    {brand?.logoUrl ? (
                      <img src={brand.logoUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
                    ) : (
                      <div className="h-3 w-3 rounded-full bg-zinc-600" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side action buttons */}
          <div className="absolute right-2 bottom-[100px] z-20 flex flex-col items-center gap-3.5">
            <div className="relative mb-1">
              <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-white flex-shrink-0">
                {brand?.logoUrl ? (
                  <img src={brand.logoUrl} alt={profileName} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-zinc-700 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">{profileName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center">
                <Plus className="h-2.5 w-2.5 text-white" strokeWidth={3} />
              </div>
            </div>
            <button aria-label="18 me gusta" className="flex flex-col items-center">
              <Heart className="h-6 w-6" fill="#ff2d55" stroke="#ff2d55" />
              <span className="text-[10px] text-white font-medium mt-0.5">18</span>
            </button>
            <button aria-label="1.9 comentarios" className="flex flex-col items-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="white">
                <path d="M12 2C6.477 2 2 5.813 2 10.5c0 2.614 1.38 4.96 3.543 6.547L4.25 21.5l5.07-2.538c.87.182 1.77.288 2.68.288 5.523 0 10-3.813 10-8.75S17.523 2 12 2z" />
              </svg>
              <span className="text-[10px] text-white font-medium mt-0.5">1.9</span>
            </button>
            <button aria-label="5 guardados" className="flex flex-col items-center">
              <Bookmark className="h-6 w-6" fill="white" stroke="white" />
              <span className="text-[10px] text-white font-medium mt-0.5">5</span>
            </button>
            <button aria-label="2 compartidos" className="flex flex-col items-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="white">
                <path d="M13.5 3l6.5 7h-4.5c0 5.5-3 9.5-9.5 11 2.5-3.5 3-6.5 3-11H4.5L13.5 3z" />
              </svg>
              <span className="text-[10px] text-white font-medium mt-0.5">2</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card border-t border-border/40 rounded-b-xl">
        <CaptionEditor caption={caption} onCaptionChange={onCaptionChange} profileName={profileName} />
      </div>
    </div>
  )
}
