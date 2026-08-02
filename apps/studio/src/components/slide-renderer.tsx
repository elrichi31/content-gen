"use client"

import type { Slide, BrandSettings } from "@/lib/slide-types"
import { colorThemes, fontThemes, buildBgStyle, type FontThemeId, type BgStyleId } from "@/lib/themes"
import { CoverLayout }        from "./slides/cover"
import { CtaLayout }          from "./slides/cta"
import { ContentLayout }      from "./slides/content"
import { ListLayout }         from "./slides/list"
import { BigNumberLayout }    from "./slides/big-number"
import { QuoteLayout }        from "./slides/quote"
import { SplitLayout }        from "./slides/split"
import { ImageOverlayLayout } from "./slides/image-overlay"
import { TimelineLayout }     from "./slides/timeline"
import { StatGridLayout }     from "./slides/stat-grid"
import type { LayoutProps }   from "./slides/shared"

// Re-export variant metadata so editor can import from one place
export { coverVariants }        from "./slides/cover"
export { ctaVariants }          from "./slides/cta"
export { contentVariants }      from "./slides/content"
export { listVariants }         from "./slides/list"
export { bigNumberVariants }    from "./slides/big-number"
export { quoteVariants }        from "./slides/quote"
export { splitVariants }        from "./slides/split"
export { imageOverlayVariants } from "./slides/image-overlay"
export { timelineVariants }     from "./slides/timeline"
export { statGridVariants }     from "./slides/stat-grid"

const IMAGE_LAYOUTS = new Set<string>(["imageOverlay"])

function slideHasImage(slide: Slide) {
  return (
    !!slide.imageUrl &&
    (IMAGE_LAYOUTS.has(slide.layout) ||
      slide.layout === "split" ||
      slide.imagePosition === "background" ||
      (slide.layout === "content" &&
        (slide.layoutVariant === "image-right" || slide.layoutVariant === "image-left")))
  )
}

function renderLayout(slide: Slide, primary: string, bgStyle: BgStyleId, bgBuilder: typeof buildBgStyle, editable?: boolean, onUpdateField?: (field: keyof Slide, value: string) => void, onUpdateListItem?: (index: number, text: string) => void) {
  // Per-slide bgStyle override — AI can set this for variety within a carousel
  const effectiveBgStyle = (slide.bgStyleOverride as BgStyleId | undefined) ?? bgStyle
  const p: LayoutProps = { slide, primary, bgStyle: effectiveBgStyle, bgBuilder, editable, onUpdateField, onUpdateListItem }
  switch (slide.layout) {
    case "cover":        return <CoverLayout        {...p} />
    case "content":      return <ContentLayout      {...p} />
    case "list":         return <ListLayout         {...p} />
    case "bigNumber":    return <BigNumberLayout    {...p} />
    case "quote":        return <QuoteLayout        {...p} />
    case "split":        return <SplitLayout        {...p} />
    case "imageOverlay": return <ImageOverlayLayout {...p} />
    case "timeline":     return <TimelineLayout     {...p} />
    case "statGrid":     return <StatGridLayout     {...p} />
    case "cta":          return <CtaLayout          {...p} />
    default:             return <ContentLayout      {...p} />
  }
}

interface SlideRendererProps {
  slide: Slide
  brand?: BrandSettings | null
  activePrimary?: string
  fontTheme?: FontThemeId
  bgStyle?: BgStyleId
  bgBuilder?: typeof buildBgStyle
  editable?: boolean
  onUpdateField?: (field: keyof Slide, value: string) => void
  onUpdateListItem?: (index: number, text: string) => void
}

export function SlideRenderer({
  slide,
  brand,
  activePrimary,
  fontTheme = 'geist',
  bgStyle = 'gradient',
  bgBuilder = buildBgStyle,
  editable,
  onUpdateField,
  onUpdateListItem,
}: SlideRendererProps) {
  const hasBrand = brand && (brand.logoUrl || brand.name)
  const primary = activePrimary ?? colorThemes.green.primary
  const fontFamily = fontThemes[fontTheme]?.family ?? fontThemes.geist.family
  const hasImage = slideHasImage(slide)
  const isBgMode = slide.imagePosition === "background"

  // Compute brand badge position so it never overlaps text content.
  // For split/content-with-image: pin to the image half so text side stays clean.
  // For everything else: sit at the very bottom edge of the slide.
  const isImageSplit =
    hasImage &&
    !isBgMode &&
    (slide.layout === "split" ||
      (slide.layout === "content" &&
        (slide.layoutVariant === "image-right" || slide.layoutVariant === "image-left")))

  const imageOnLeft =
    slide.layoutVariant === "image-left" || slide.imagePosition === "left"

  let brandContainerStyle: React.CSSProperties
  let brandContainerClass: string

  if (isBgMode) {
    brandContainerStyle = { top: "7%" }
    brandContainerClass = "absolute left-0 right-0 flex items-center justify-center pointer-events-none"
  } else if (isImageSplit) {
    // Pin inside the image half so the text column stays unobstructed
    if (imageOnLeft) {
      brandContainerStyle = { bottom: 6, left: 0, right: "50%" }
    } else {
      brandContainerStyle = { bottom: 6, left: "50%", right: 0 }
    }
    brandContainerClass = "absolute flex items-center justify-center pointer-events-none"
  } else {
    // All other slides: very bottom edge, centered
    brandContainerStyle = { bottom: 6 }
    brandContainerClass = "absolute left-0 right-0 flex items-center justify-center pointer-events-none"
  }

  return (
    <div className="relative flex h-full flex-col" style={{ fontFamily }}>
      <div className="flex-1 min-h-0">
        {renderLayout(slide, primary, bgStyle, bgBuilder, editable, onUpdateField, onUpdateListItem)}
      </div>
      {hasBrand && (
        <div className={brandContainerClass} style={brandContainerStyle}>
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={hasImage ? { backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" } : undefined}
          >
            {brand.logoUrl && (
              <img src={brand.logoUrl} alt="" className="h-5 w-5 rounded-sm object-contain opacity-70" />
            )}
            {brand.name && (
              <span className="text-[10px] font-medium opacity-70">{brand.name}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Tiny slide preview for variant pickers (renders at 40% scale). */
export function SlideVariantPreview({
  slide,
  primary,
  bgStyle = 'gradient',
}: {
  slide: Slide
  primary: string
  bgStyle?: BgStyleId
}) {
  return (
    <div className="h-full w-full overflow-hidden" style={{ fontSize: '40%', lineHeight: 1.2, pointerEvents: 'none' }}>
      <SlideRenderer slide={slide} activePrimary={primary} bgStyle={bgStyle} />
    </div>
  )
}
