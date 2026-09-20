"use client"

import { fitSize } from "@/components/ads/ad-style"
import { ItemText, Rule, Slab, Txt, bodyStyle, fitTitle, flexTone, palette, tabular, titleStyle, type LayoutProps } from "./shared"

export const statGridVariants = [
  { id: 'default', label: 'Grid 2×2'  },
  { id: 'row',     label: 'Fila'      },
  { id: 'large',   label: 'Grande'    },
]

/** Cifras con su etiqueta. `emoji` guarda el valor («87%», «3x»), no un emoji, y no se edita desde aquí. */
export function StatGridLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'default'
  const tone = variant === 'large' ? 'primary' : flexTone(p)
  const c = palette(p, tone)
  const poster = p.fontTheme === "poster"
  const items = (slide.listItems ?? []).slice(0, 4)
  const value = (text: string, w: number, h: number, max: number, color: string) => <p style={{ ...titleStyle(p, fitSize(text, w, h, { max, min: max * 0.4, charWidth: poster ? 0.52 : 0.64, leading: 0.9 })), ...tabular, lineHeight: 0.9, textTransform: "none", color }}>{text}</p>
  const title = <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { h: 24, max: 13 })), color: c.fg }} />

  if (variant === 'row') {
    return (
      <Slab p={p} tone={tone} style={{ justifyContent: "center", gap: "6cqw" }}>
        <Rule color={c.accent} />
        {title}
        <div style={{ display: "flex", borderTop: `1px solid ${c.rule}`, borderBottom: `1px solid ${c.rule}` }}>
          {items.map((item, i) => (
            <div key={i} style={{ flex: 1, minWidth: 0, padding: "5cqw 2cqw", borderLeft: i ? `1px solid ${c.rule}` : undefined, display: "flex", flexDirection: "column", gap: "2cqw" }}>
              {value(item.emoji, 17, 9, 9, c.text)}
              <ItemText p={p} index={i} text={item.text} style={{ ...bodyStyle(4.2, 600), color: c.muted }} />
            </div>
          ))}
        </div>
      </Slab>
    )
  }

  if (variant === 'large') {
    return (
      <Slab p={p} tone="primary" style={{ justifyContent: "center", gap: "5cqw" }}>
        {title}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "5cqw", padding: "3cqw 0", borderTop: `1px solid ${c.rule}` }}>
              <div style={{ width: "38cqw", flexShrink: 0 }}>{value(item.emoji, 38, 14, 14, c.fg)}</div>
              <ItemText p={p} index={i} text={item.text} style={{ ...bodyStyle(5, 600), color: c.fg, flex: 1 }} />
            </div>
          ))}
        </div>
      </Slab>
    )
  }

  return (
    <Slab p={p} tone={tone} style={{ justifyContent: "center", gap: "5cqw" }}>
      {title}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5cqw" }}>
        {items.map((item, i) => {
          const solid = i === 0 || i === 3
          return (
            <div key={i} style={{ background: solid ? c.flip.bg : c.panel, color: solid ? c.flip.fg : c.fg, borderRadius: "1cqw", padding: "5cqw 4.5cqw", display: "flex", flexDirection: "column", gap: "2cqw", minHeight: "27cqw", justifyContent: "space-between" }}>
              {value(item.emoji, 34, 13, 13, solid ? c.flip.fg : c.text)}
              <ItemText p={p} index={i} text={item.text} style={{ ...bodyStyle(4.2, 600), color: solid ? c.flip.fg : c.muted }} />
            </div>
          )
        })}
      </div>
    </Slab>
  )
}
