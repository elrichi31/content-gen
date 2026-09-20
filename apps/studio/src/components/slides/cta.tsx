"use client"

import type { CSSProperties } from "react"
import { Arrow } from "@/components/ads/kit"
import { Slab, Txt, bodyStyle, fitTitle, palette, titleStyle, type LayoutProps } from "./shared"

export const ctaVariants = [
  { id: 'centered', label: 'Centrado' },
  { id: 'card',     label: 'Card'     },
  { id: 'minimal',  label: 'Minimal'  },
]

/** La cuenta a seguir, con forma de botón: logo y nombre de la marca. Sin marca no se inventa un perfil. */
function Handle({ p, bg, fg }: { p: LayoutProps; bg: string; fg: string }) {
  const name = p.brand?.name
  if (!name) return null
  const logo = p.brand?.logoUrl
  return (
    <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: "3.5cqw", background: bg, color: fg, borderRadius: "1.2cqw", padding: "3.2cqw 4.5cqw" }}>
      {logo ? <img src={logo} alt="" style={{ width: "9cqw", height: "9cqw", objectFit: "contain", flexShrink: 0 }} /> : null}
      <span style={{ ...titleStyle(p, 5.8), flex: 1, minWidth: 0, textAlign: "left", textWrap: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      <Arrow size="6cqw" />
    </div>
  )
}

/** Cierre: la acción en grande y la cuenta como botón. El último slide es el que más se recuerda. */
export function CtaLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'centered'
  const tone = variant === 'centered' ? 'primary' : 'ink'
  const c = palette(p, tone)
  const cta = (max: number, h: number, w = 84, color = c.fg) => <Txt p={p} field="ctaText" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.ctaText, { w, h, max })), color }} />
  const sub = (size: number, color: string, extra?: CSSProperties) => <Txt p={p} field="ctaSubtext" lines={3} style={{ ...bodyStyle(size, 500), color, ...extra }} />

  if (variant === 'card') {
    const card = palette(p, 'primary')
    return (
      <Slab p={p} tone="ink" style={{ justifyContent: "center", padding: p.tall ? "14cqw 12cqw 34cqw 8cqw" : "8cqw 7cqw 13cqw" }}>
        <div style={{ ...card.vars, background: p.primary, color: card.fg, borderRadius: "1.5cqw", padding: "9cqw 7cqw", display: "flex", flexDirection: "column", gap: "5cqw" }}>
          {cta(13, 46, 70, card.fg)}
          {sub(4.6, card.muted)}
          <Handle p={p} bg={card.flip.bg} fg={card.flip.fg} />
        </div>
      </Slab>
    )
  }

  if (variant === 'minimal') {
    return (
      <Slab p={p} tone="ink" style={{ justifyContent: "flex-end", gap: "5cqw" }}>
        {cta(15, 56)}
        {sub(4.6, c.muted)}
        <Handle p={p} bg={c.flip.bg} fg={c.flip.fg} />
      </Slab>
    )
  }

  return (
    <Slab p={p} tone="primary" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "5cqw" }}>
      {cta(17, 50)}
      {sub(4.8, c.muted, { maxWidth: "72cqw" })}
      <Handle p={p} bg={c.flip.bg} fg={c.flip.fg} />
    </Slab>
  )
}
