"use client"

import { ItemText, Rule, Slab, Txt, bodyStyle, fitTitle, flexTone, palette, tabular, titleStyle, type LayoutProps } from "./shared"

export const timelineVariants = [
  { id: 'default', label: 'Línea'    },
  { id: 'steps',   label: 'Pasos'   },
  { id: 'minimal', label: 'Minimal' },
]

/** Secuencia: un riel con una marca por paso, bloques numerados o filas con filetes. */
export function TimelineLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'default'
  const tone = variant === 'steps' ? 'primary' : flexTone(p)
  const c = palette(p, tone)
  const items = (slide.listItems ?? []).slice(0, 6)
  const size = items.length > 4 ? 4.6 : 5.2
  const label = (text: string, i: number) => text || String(i + 1).padStart(2, "0")

  return (
    <Slab p={p} tone={tone} style={{ justifyContent: "center", gap: "5cqw" }}>
      <Rule color={c.accent} />
      <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { h: 26, max: 13 })), color: c.fg }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
        {variant === 'default' ? <div style={{ position: "absolute", left: "1.2cqw", top: "3cqw", bottom: "3cqw", width: "0.6cqw", background: c.rule }} /> : null}
        {items.map((item, i) => (
          <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: "4cqw", padding: variant === 'minimal' ? "3cqw 0" : "2.4cqw 0", borderTop: variant === 'minimal' ? `1px solid ${c.rule}` : undefined }}>
            {variant === 'default' ? <div style={{ width: "3cqw", height: "3cqw", background: c.accent, flexShrink: 0 }} /> : null}
            {variant === 'steps' ? <div style={{ width: "11cqw", height: "11cqw", background: c.flip.bg, color: c.flip.fg, display: "flex", alignItems: "center", justifyContent: "center", ...titleStyle(p, 5.5), ...tabular, borderRadius: "1cqw", flexShrink: 0 }}>{label(item.emoji, i)}</div> : null}
            {variant === 'minimal' ? <span style={{ ...titleStyle(p, 6), ...tabular, color: c.text, minWidth: "13cqw" }}>{label(item.emoji, i)}</span> : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              {variant === 'default' ? <p style={{ margin: 0, fontSize: "3.7cqw", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: c.text, ...tabular }}>{label(item.emoji, i)}</p> : null}
              <ItemText p={p} index={i} text={item.text} style={{ ...bodyStyle(size, 700), color: c.fg }} />
            </div>
          </div>
        ))}
      </div>
    </Slab>
  )
}
