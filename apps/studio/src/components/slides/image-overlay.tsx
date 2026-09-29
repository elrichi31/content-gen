"use client"

import { INK, PAPER, Photo, Rule, Slab, Txt, alpha, bodyStyle, fitTitle, palette, titleStyle, type LayoutProps } from "./shared"

export const imageOverlayVariants = [
  { id: 'bottom',  label: 'Texto abajo'  },
  { id: 'center',  label: 'Texto centro' },
  { id: 'top',     label: 'Texto arriba' },
  { id: 'polaroid', label: 'Polaroid'    },
  { id: 'band',    label: 'Banda'        },
  { id: 'window',  label: 'Ventana'      },
]

/** Foto a sangre con el titular encima. El velo va donde está el texto, no sobre toda la imagen. */
export function ImageOverlayLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'bottom'
  const c = palette(p, 'ink')
  const veil = variant === 'top' ? `linear-gradient(0deg, transparent 30%, ${alpha(INK, 0.9)} 100%)` : variant === 'center' ? alpha(INK, 0.6) : `linear-gradient(180deg, transparent 30%, ${alpha(INK, 0.92)} 100%)`
  const detail = slide.content ? "content" : "subtitle"
  const inset = p.tall ? "14cqw 12cqw 34cqw 8cqw" : undefined

  const photo = <Photo src={slide.imageUrl} illustration={slide.imageSource === "illustration"} />
  const title = (color: string, w: number, h: number, max: number) => <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { w, h, max })), color }} />
  const detailText = (color: string, lines: number) => <Txt p={p} field={detail} multiline lines={lines} style={{ ...bodyStyle(4.2), color }} />

  // Foto como polaroid, un poco girada, con el titular debajo.
  if (variant === 'polaroid') {
    return (
      <Slab p={p} tone="ink" fit style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "5cqw" }}>
        <div style={{ width: "54cqw", background: PAPER, padding: "2.6cqw 2.6cqw 8cqw", transform: "rotate(-3deg)", boxShadow: `0 3cqw 7cqw ${alpha(INK, 0.35)}`, flexShrink: 0 }}>
          {/* Fondo gris dentro del marco: sin foto se ve el hueco para subirla, no un bloque blanco. */}
          <div style={{ aspectRatio: "1", overflow: "hidden", background: alpha(INK, 0.12) }}>{photo}</div>
        </div>
        {title(c.fg, 80, 18, 10)}
        {detailText(c.muted, 2)}
      </Slab>
    )
  }

  // Foto arriba a sangre y bloque de texto sólido abajo, separados por una franja de marca.
  if (variant === 'band') {
    return (
      <Slab p={p} tone="ink" style={{ padding: 0 }}>
        <div style={{ height: "54%", flexShrink: 0, borderBottom: `1.4cqw solid ${c.accent}` }}>{photo}</div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3cqw", padding: p.tall ? "6cqw 12cqw 34cqw 8cqw" : "6cqw 8cqw 13cqw" }}>
          {title(c.fg, 84, 22, 11)}
          {detailText(c.muted, 3)}
        </div>
      </Slab>
    )
  }

  // Foto enmarcada con esquinas redondas y una tarjeta clara flotando encima.
  if (variant === 'window') {
    return (
      <Slab p={p} tone="ink" style={{ padding: p.tall ? "8cqw 8cqw 32cqw" : "6cqw 6cqw 13cqw" }}>
        <div style={{ position: "relative", flex: 1, borderRadius: "4cqw", overflow: "hidden" }}>
          {photo}
          <div style={{ position: "absolute", left: "4cqw", right: "4cqw", bottom: "4cqw", background: PAPER, color: INK, borderRadius: "3cqw", padding: "5cqw", display: "flex", flexDirection: "column", gap: "2cqw" }}>
            {title(INK, 70, 18, 9)}
            {detailText(alpha(INK, 0.75), 2)}
          </div>
        </div>
      </Slab>
    )
  }

  return (
    <Slab p={p} tone="ink" style={{ justifyContent: variant === 'top' ? "flex-start" : variant === 'center' ? "center" : "flex-end", padding: variant === 'top' ? (p.tall ? "20cqw 12cqw 8cqw 10cqw" : "14cqw 10cqw 10cqw") : inset ?? "10cqw 10cqw 16cqw" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}><Photo src={slide.imageUrl} illustration={slide.imageSource === "illustration"} /></div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: veil }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "3.5cqw", maxWidth: "74cqw" }}>
        <Rule color={c.accent} />
        <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { w: 74, h: 30, max: 12 })), color: PAPER }} />
        <Txt p={p} field={detail} multiline lines={4} style={{ ...bodyStyle(4.2), color: alpha(PAPER, 0.9) }} />
      </div>
    </Slab>
  )
}
