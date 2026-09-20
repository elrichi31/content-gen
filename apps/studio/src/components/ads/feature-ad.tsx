"use client"

import type { AdState } from "./types"
import { alpha, fitSize, geometry, onColor } from "./ad-style"
import { Check, Cta, copy, display, fill } from "./kit"

/** Beneficios: titular y una lista de filas con marca de acento, separadas por filetes, sin tarjetas. */
export function FeatureAd({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const { u, tall, wide, pad, top, bottom } = geometry(w, h)
  const ink = ad.textColor
  const accent = ad.accentColor
  const onAccent = onColor(accent)
  const items = ad.features.filter((feature) => feature.label).slice(0, 5)
  const textW = wide ? w * 0.5 - pad * 1.5 : w - pad * 2
  const headSize = fitSize(ad.featHeadline, textW, h * (wide ? 0.4 : 0.22), { max: u * (wide ? 12 : 14), min: u * 5.5 })
  const listH = wide ? h * 0.7 : h * (tall ? 0.34 : 0.3)
  const rowSize = Math.min(u * 5.2, Math.max(u * 3, listH / (Math.max(1, items.length) * 2.4)))
  const tileSize = rowSize * 1.9

  const headline = <p style={{ ...display(headSize), color: onAccent, textWrap: "balance" }}>{ad.featHeadline}</p>
  const sub = ad.featBody ? <p style={{ ...copy(u * 3.8), color: alpha(onAccent, 0.82), maxWidth: textW, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.featBody}</p> : null
  const list = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((feature, index) => (
        <div key={`${feature.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: rowSize * 0.9, padding: `${rowSize * 0.55}px 0`, borderTop: `1px solid ${alpha(ink, 0.2)}` }}>
          <div style={{ width: tileSize, height: tileSize, flexShrink: 0, background: accent, color: onAccent, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: u * 0.8 }}>
            <Check size={rowSize * 1.1} />
          </div>
          <p style={{ ...copy(rowSize, 800), color: ink }}>{feature.label}</p>
        </div>
      ))}
    </div>
  )
  const cta = ad.cta ? <Cta label={ad.cta} background={ink} color={ad.bgColor} u={u} /> : null

  if (wide) {
    return (
      <div style={{ ...fill, display: "flex" }}>
        <div style={{ flex: 1, background: accent, display: "flex", flexDirection: "column", justifyContent: "center", gap: u * 3.5, padding: `${top}px ${pad}px` }}>{headline}{sub}{cta}</div>
        <div style={{ width: "44%", display: "flex", flexDirection: "column", justifyContent: "center", padding: `${top}px ${pad}px` }}>{list}</div>
      </div>
    )
  }
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column" }}>
      <div style={{ background: accent, display: "flex", flexDirection: "column", gap: u * 3, padding: `${top}px ${pad}px ${u * 6}px` }}>{headline}{sub}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: u * 3, padding: `${u * 3}px ${pad}px ${bottom}px` }}>
        {list}
        {cta}
      </div>
    </div>
  )
}
