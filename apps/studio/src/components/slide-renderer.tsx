"use client"

import { createContext, useContext } from "react"

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

/** Aspecto común a todo el carrusel. Lo pone el editor alrededor de la vista previa. */
export type SlideLook = { surface: "light" | "dark" | "brand"; decor: boolean }
export const SlideLookContext = createContext<SlideLook>({ surface: "dark", decor: false })

function renderLayout(slide: Slide, primary: string, bgStyle: BgStyleId, bgBuilder: typeof buildBgStyle, fontTheme: FontThemeId, extra: Pick<LayoutProps, "brand" | "tall" | "alt" | "surface" | "decor" | "seed">, editable?: boolean, onUpdateField?: (field: keyof Slide, value: string) => void, onUpdateListItem?: (index: number, text: string) => void) {
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
  // El cierre ya muestra la marca como botón; repetirla abajo sería ruido. La firma va fuera de la
  // superficie del slide, así que lleva su propio fondo: sin él heredaba el color de la app y no se veía.
  const look = useContext(SlideLookContext)
  const tall = platform === "tiktok"
  // Ritmo: cada tercer slide toma el color de marca, para que no haya rachas largas de tinta.
  const alt = index !== undefined && index % 3 === 2
  const primary = activePrimary ?? colorThemes.green.primary
  const fontFamily = fontThemes[fontTheme]?.family ?? fontThemes.poster.family

  return (
    // containerType: los layouts miden en cqw (1% del ancho de este contenedor) y así escalan solos.
    <div className="relative flex h-full flex-col" style={{ fontFamily, containerType: "inline-size" }}>
      <div className="flex-1 min-h-0">
        {renderLayout(slide, primary, bgStyle, bgBuilder, fontTheme, { brand, tall, alt, surface: look.surface, decor: look.decor, seed: index }, editable, onUpdateField, onUpdateListItem)}
      </div>
      {!tall && index !== undefined && total !== undefined && index < total - 1 && (
        <div aria-hidden className="pointer-events-none absolute flex items-center justify-center text-white" style={{ right: "4cqw", bottom: "3.5cqw", width: "7cqw", height: "7cqw", borderRadius: "1cqw", background: "rgba(0,0,0,0.38)" }}>
          <Arrow size="4cqw" />
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
