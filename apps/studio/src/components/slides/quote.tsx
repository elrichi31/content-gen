"use client"

import type { CSSProperties } from "react"
import { QuoteMark } from "@/components/ads/kit"
import { Slab, Txt, bodyStyle, fitTitle, palette, type LayoutProps } from "./shared"

export const quoteVariants = [
  { id: 'default', label: 'Centrado'  },
  { id: 'left',    label: 'Izquierda' },
  { id: 'card',    label: 'Card'      },
]

/** Cita: es el titular del slide, en frase y no en mayúsculas para que se lea de corrido. */
export function QuoteLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'default'
  const poster = p.fontTheme === "poster"
  // La cita va en la misma fuente pero sin el condensado extremo del titular.
  const quoteText = (fg: string, h: number, max: number, w = 82): CSSProperties => ({ margin: 0, fontSize: `${fitTitle(p, slide.quote, { w, h, max })}cqw`, fontWeight: poster ? 800 : 700, fontStretch: poster ? "80%" : undefined, fontVariationSettings: poster ? "'wdth' 80" : undefined, lineHeight: 1.12, letterSpacing: "-0.015em", textWrap: "balance", color: fg })
  const author = (fg: string, extra?: CSSProperties) => <Txt p={p} field="quoteAuthor" lines={2} style={{ ...bodyStyle(4.2, 800), textTransform: "uppercase", letterSpacing: "0.1em", color: fg, ...extra }} />

  if (variant === 'left') {
    const c = palette(p, 'ink')
    return (
      <Slab p={p} tone="ink" style={{ justifyContent: "center", gap: "5cqw" }}>
        <QuoteMark size="14cqw" color={c.accent} />
        <Txt p={p} field="quote" multiline style={quoteText(c.fg, 54, 11.5)} />
        {author(c.text)}
      </Slab>
    )
  }

  if (variant === 'card') {
    const card = palette(p, 'primary')
    return (
      <Slab p={p} tone="ink" style={{ justifyContent: "center", padding: p.tall ? "14cqw 12cqw 34cqw 8cqw" : "8cqw 7cqw 13cqw" }}>
        <div style={{ ...card.vars, background: p.primary, color: card.fg, borderRadius: "1.5cqw", padding: "8cqw 7cqw", display: "flex", flexDirection: "column", gap: "5cqw" }}>
          <QuoteMark size="11cqw" color={card.fg} />
          <Txt p={p} field="quote" multiline style={quoteText(card.fg, 48, 10, 70)} />
          {author(card.muted)}
        </div>
      </Slab>
    )
  }

  const c = palette(p, 'primary')
  return (
    <Slab p={p} tone="primary" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "5cqw" }}>
      <QuoteMark size="14cqw" color={c.fg} />
      <Txt p={p} field="quote" multiline style={quoteText(c.fg, 54, 11.5)} />
      {author(c.muted)}
    </Slab>
  )
}
