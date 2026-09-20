"use client"

import { INK, PAPER, Photo, Rule, Slab, Txt, alpha, bodyStyle, fitTitle, palette, titleStyle, type LayoutProps } from "./shared"

export const imageOverlayVariants = [
  { id: 'bottom',  label: 'Texto abajo'  },
  { id: 'center',  label: 'Texto centro' },
  { id: 'top',     label: 'Texto arriba' },
]

/** Foto a sangre con el titular encima. El velo va donde está el texto, no sobre toda la imagen. */
export function ImageOverlayLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'bottom'
  const c = palette(p, 'ink')
  const veil = variant === 'top' ? `linear-gradient(0deg, transparent 30%, ${alpha(INK, 0.9)} 100%)` : variant === 'center' ? alpha(INK, 0.6) : `linear-gradient(180deg, transparent 30%, ${alpha(INK, 0.92)} 100%)`
  const detail = slide.content ? "content" : "subtitle"
  const inset = p.tall ? "14cqw 12cqw 34cqw 8cqw" : undefined

  return (
    <Slab p={p} tone="ink" style={{ justifyContent: variant === 'top' ? "flex-start" : variant === 'center' ? "center" : "flex-end", padding: variant === 'top' ? (p.tall ? "20cqw 12cqw 8cqw 8cqw" : "13cqw 8cqw 8cqw") : inset }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}><Photo src={slide.imageUrl} /></div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: veil }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "3.5cqw", paddingBottom: variant === 'bottom' && !p.tall ? "4cqw" : undefined }}>
        <Rule color={c.accent} />
        <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { h: 34, max: 13 })), color: PAPER }} />
        <Txt p={p} field={detail} multiline lines={4} style={{ ...bodyStyle(4.4), color: alpha(PAPER, 0.9) }} />
      </div>
    </Slab>
  )
}
