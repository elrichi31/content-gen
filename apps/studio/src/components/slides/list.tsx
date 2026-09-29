"use client"

import { Check } from "@/components/ads/kit"
import { ItemText, Rule, Slab, Txt, bodyStyle, density, fitTitle, flexTone, palette, tabular, titleStyle, type LayoutProps } from "./shared"

export const listVariants = [
  { id: 'default',  label: 'Emoji'    },
  { id: 'numbered', label: 'Numerado' },
  { id: 'cards',    label: 'Cards'    },
  { id: 'bento',    label: 'Bento'    },
]

/** Lista: cada punto en su fila, separados por filetes. Los emoji solo viven en la variante «Emoji». */
export function ListLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'default'
  const cards = variant === 'cards'
  const tone = cards ? 'primary' : flexTone(p)
  const c = palette(p, tone)
  const items = (slide.listItems ?? []).slice(0, 6)
  const fit = density(items)
  const size = 5.4 * fit.scale, rowPad = fit.rowPad

  // Bento: mosaico de tarjetas en dos columnas; la primera ocupa todo el ancho en color de marca.
  if (variant === 'bento') {
    return (
      <Slab p={p} tone={tone} fit style={{ justifyContent: "center", gap: fit.gap }}>
        <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, fit.title)), color: c.fg }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.4cqw" }}>
          {items.map((item, i) => {
            const first = i === 0
            return (
              <div key={i} style={{ gridColumn: first || (i === items.length - 1 && items.length % 2 === 0) ? "1 / -1" : undefined, display: "flex", flexDirection: "column", gap: "2cqw", padding: "4cqw", borderRadius: "2.4cqw", background: first ? c.flip.bg : c.panel, color: first ? c.flip.fg : c.fg, border: first ? undefined : `1px solid ${c.rule}` }}>
                <span style={{ ...titleStyle(p, 6), ...tabular, color: first ? c.flip.fg : c.text }}>{String(i + 1).padStart(2, "0")}</span>
                <ItemText p={p} index={i} text={item.text} style={{ ...bodyStyle(size * 0.86, 600) }} />
              </div>
            )
          })}
        </div>
      </Slab>
    )
  }

  return (
    <Slab p={p} tone={tone} fit style={{ justifyContent: "center", gap: fit.gap }}>
      {fit.dense ? null : <Rule color={c.accent} />}
      <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, fit.title)), color: c.fg }} />
      <div style={{ display: "flex", flexDirection: "column", gap: cards ? "2cqw" : 0 }}>
        {items.map((item, i) => {
          const first = cards && i === 0
          const lead = variant === 'numbered'
            ? <span style={{ ...titleStyle(p, 9), ...tabular, color: c.text, minWidth: "13cqw" }}>{String(i + 1).padStart(2, "0")}</span>
            : cards
              ? <Check size="5.5cqw" color={first ? c.flip.fg : c.fg} />
              : <span style={{ fontSize: "6.5cqw", lineHeight: 1, minWidth: "9cqw", textAlign: "center" }}>{item.emoji}</span>
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "3.5cqw", padding: cards ? `${rowPad} 4cqw` : `${rowPad} 0`, borderTop: cards ? undefined : `1px solid ${c.rule}`, borderRadius: cards ? "1cqw" : undefined, background: cards ? (first ? c.flip.bg : c.panel) : undefined, color: first ? c.flip.fg : c.fg }}>
              {lead}
              <ItemText p={p} index={i} text={item.text} style={{ ...bodyStyle(size, 600), flex: 1 }} />
            </div>
          )
        })}
      </div>
    </Slab>
  )
}
