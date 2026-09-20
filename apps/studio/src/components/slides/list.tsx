"use client"

import { Check } from "@/components/ads/kit"
import { ItemText, Rule, Slab, Txt, bodyStyle, fitTitle, flexTone, palette, tabular, titleStyle, type LayoutProps } from "./shared"

export const listVariants = [
  { id: 'default',  label: 'Emoji'    },
  { id: 'numbered', label: 'Numerado' },
  { id: 'cards',    label: 'Cards'    },
]

/** Lista: cada punto en su fila, separados por filetes. Los emoji solo viven en la variante «Emoji». */
export function ListLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'default'
  const cards = variant === 'cards'
  const tone = cards ? 'primary' : flexTone(p)
  const c = palette(p, tone)
  const items = (slide.listItems ?? []).slice(0, 6)
  const size = items.length > 4 ? 4.6 : 5.4

  return (
    <Slab p={p} tone={tone} style={{ justifyContent: "center", gap: "5cqw" }}>
      <Rule color={c.accent} />
      <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { h: 26, max: 13 })), color: c.fg }} />
      <div style={{ display: "flex", flexDirection: "column", gap: cards ? "2cqw" : 0 }}>
        {items.map((item, i) => {
          const first = cards && i === 0
          const lead = variant === 'numbered'
            ? <span style={{ ...titleStyle(p, 9), ...tabular, color: c.text, minWidth: "13cqw" }}>{String(i + 1).padStart(2, "0")}</span>
            : cards
              ? <Check size="5.5cqw" color={first ? c.flip.fg : c.fg} />
              : <span style={{ fontSize: "6.5cqw", lineHeight: 1, minWidth: "9cqw", textAlign: "center" }}>{item.emoji}</span>
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "3.5cqw", padding: cards ? "3cqw 4cqw" : "3cqw 0", borderTop: cards ? undefined : `1px solid ${c.rule}`, borderRadius: cards ? "1cqw" : undefined, background: cards ? (first ? c.flip.bg : c.panel) : undefined, color: first ? c.flip.fg : c.fg }}>
              {lead}
              <ItemText p={p} index={i} text={item.text} style={{ ...bodyStyle(size, 600), flex: 1 }} />
            </div>
          )
        })}
      </div>
    </Slab>
  )
}
