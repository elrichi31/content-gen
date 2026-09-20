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
import { Arrow }              from "./ads/kit"

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

function renderLayout(slide: Slide, primary: string, bgStyle: BgStyleId, bgBuilder: typeof buildBgStyle, fontTheme: FontThemeId, extra: Pick<LayoutProps, "brand" | "tall" | "alt">, editable?: boolean, onUpdateField?: (field: keyof Slide, value: string) => void, onUpdateListItem?: (index: number, text: string) => void) {
  // Per-slide bgStyle override — AI can set this for variety within a carousel
  const effectiveBgStyle = (slide.bgStyleOverride as BgStyleId | undefined) ?? bgStyle
  const p: LayoutProps = { slide, primary, bgStyle: effectiveBgStyle, bgBuilder, fontTheme, ...extra, editable, onUpdateField, onUpdateListItem }
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
  /** Posición del slide en el carrusel; con ella se dibuja la flecha de «desliza». */
  index?: number
  total?: number
  /** TikTok es 3:5 y su interfaz tapa el pie y el lateral: el contenido sube y la flecha de deslizar no se dibuja. */
  platform?: "instagram" | "tiktok"
  editable?: boolean
  onUpdateField?: (field: keyof Slide, value: string) => void
  onUpdateListItem?: (index: number, text: string) => void
}

export function SlideRenderer({
  slide,
  brand,
  activePrimary,
  fontTheme = 'poster',
  bgStyle = 'gradient',
  bgBuilder = buildBgStyle,
  index,
  total,
  platform = "instagram",
  editable,
  onUpdateField,
  onUpdateListItem,
}: SlideRendererProps) {
  // El cierre ya muestra la marca como botón; repetirla abajo sería ruido.
  const hasBrand = brand && (brand.logoUrl || brand.name) && slide.layout !== "cta"
  const tall = platform === "tiktok"
  // Ritmo: cada tercer slide toma el color de marca, para que no haya rachas largas de tinta.
  const alt = index !== undefined && index % 3 === 2
  const primary = activePrimary ?? colorThemes.green.primary
  const fontFamily = fontThemes[fontTheme]?.family ?? fontThemes.poster.family
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

  if (isBgMode || tall) {
    brandContainerStyle = { top: tall ? "5cqw" : "7%" }
    brandContainerClass = "absolute left-0 right-0 flex items-center justify-center pointer-events-none"
  } else if (isImageSplit) {
    // Pin inside the image half so the text column stays unobstructed
    if (imageOnLeft) {
      brandContainerStyle = { bottom: "2cqw", left: 0, right: "50%" }
    } else {
      brandContainerStyle = { bottom: "2cqw", left: "50%", right: 0 }
    }
    brandContainerClass = "absolute flex items-center justify-center pointer-events-none"
  } else {
    // All other slides: very bottom edge, centered
    brandContainerStyle = { bottom: "2cqw" }
    brandContainerClass = "absolute left-0 right-0 flex items-center justify-center pointer-events-none"
  }

  return (
    // containerType: los layouts miden en cqw (1% del ancho de este contenedor) y así escalan solos.
    <div className="relative flex h-full flex-col" style={{ fontFamily, containerType: "inline-size" }}>
      <div className="flex-1 min-h-0">
        {renderLayout(slide, primary, bgStyle, bgBuilder, fontTheme, { brand, tall, alt }, editable, onUpdateField, onUpdateListItem)}
      </div>
      {!tall && index !== undefined && total !== undefined && index < total - 1 && (
        <div aria-hidden className="pointer-events-none absolute flex items-center justify-center text-white" style={{ right: "4cqw", bottom: "3.5cqw", width: "7cqw", height: "7cqw", borderRadius: "1cqw", background: "rgba(0,0,0,0.38)" }}>
          <Arrow size="4cqw" />
        </div>
      )}
      {hasBrand && (
        <div className={brandContainerClass} style={brandContainerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5cqw", borderRadius: "999px", padding: "1.2cqw 3cqw", ...(hasImage ? { backgroundColor: "rgba(0,0,0,0.5)" } : null) }}>
            {brand.logoUrl && (
              <img src={brand.logoUrl} alt="" style={{ width: "5cqw", height: "5cqw", objectFit: "contain", opacity: 0.8 }} />
            )}
            {brand.name && (
              <span style={{ fontSize: "3.4cqw", fontWeight: 600, opacity: 0.8 }}>{brand.name}</span>
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
