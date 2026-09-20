"use client"

import { Arrow } from "@/components/ads/kit"
import { Rule, Slab, Txt, bodyStyle, fitTitle, palette, tagStyle, titleStyle, type LayoutProps } from "./shared"

export const coverVariants = [
  { id: 'centered', label: 'Centrado' },
  { id: 'bold',     label: 'Bold'     },
  { id: 'minimal',  label: 'Minimal'  },
  { id: 'split',    label: 'Split'    },
  { id: 'badge',    label: 'Badge'    },
  { id: 'hero',     label: 'Hero'     },
]

/** Portada: la primera imagen que ve quien desliza, así que es la más grande y la que menos dice. */
export function CoverLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'centered'
  const tone = variant === 'minimal' || variant === 'hero' ? 'ink' : 'primary'
  const c = palette(p, tone)
  const title = (max: number, h: number, w = 84, extra?: object) => <Txt p={p} field="title" as="h1" style={{ ...titleStyle(p, fitTitle(p, slide.title, { w, h, max })), color: c.fg, ...extra }} />
  const subtitle = (size: number, extra?: object) => <Txt p={p} field="subtitle" lines={4} style={{ ...bodyStyle(size), color: c.muted, ...extra }} />

  if (variant === 'bold') {
    return (
      <Slab p={p} tone="primary" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Rule color={c.accent} width={16} />
        <div style={{ display: "flex", flexDirection: "column", gap: "3.5cqw" }}>{title(20, 62)}{subtitle(4.6)}</div>
      </Slab>
    )
  }

  if (variant === 'minimal') {
    return (
      <Slab p={p} tone="ink" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "5cqw", padding: p.tall ? "14cqw 12cqw 34cqw 10cqw" : "10cqw 10cqw 14cqw" }}>
        <div style={{ width: "14cqw", height: "0.5cqw", background: c.accent }} />
        {title(10, 40, 80, { textTransform: "uppercase", letterSpacing: "0.08em" })}
        {subtitle(4.2, { maxWidth: "66cqw" })}
        <div style={{ width: "14cqw", height: "0.5cqw", background: c.accent }} />
      </Slab>
    )
  }

  if (variant === 'split') {
    const side = palette(p, 'ink')
    return (
      <Slab p={p} tone="primary" style={{ flexDirection: "row", padding: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3.5cqw", padding: p.tall ? "14cqw 6cqw 34cqw 8cqw" : "8cqw 6cqw 13cqw 8cqw" }}>
          <Rule color={c.accent} width={10} />
          {title(14, 58, 56)}
          {subtitle(4.2)}
        </div>
        <div style={{ ...side.style, width: "34%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22cqw", lineHeight: 1 }}>
          {slide.emoji ?? <Arrow size="18cqw" color={side.accent} />}
        </div>
      </Slab>
    )
  }

  if (variant === 'badge') {
    return (
      <Slab p={p} tone="primary" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "5cqw" }}>
        <Txt p={p} field="subtitle" lines={4} style={{ ...tagStyle(c.flip.bg, c.flip.fg), alignSelf: "center", maxWidth: "76cqw", textAlign: "center", transform: "rotate(-2deg)" }} />
        {title(17, 52)}
      </Slab>
    )
  }

  if (variant === 'hero') {
    return (
      <Slab p={p} tone="ink" style={{ justifyContent: "center", gap: "4cqw", paddingTop: p.tall ? "24cqw" : "16cqw" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "7cqw", background: c.accent }} />
        {title(19, 58)}
        {subtitle(4.6)}
      </Slab>
    )
  }

  return (
    <Slab p={p} tone="primary" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "4cqw" }}>
      <Rule color={c.accent} width={14} />
      {title(17, 56)}
      {subtitle(4.6, { maxWidth: "72cqw" })}
    </Slab>
  )
}
