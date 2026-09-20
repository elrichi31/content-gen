"use client"

import type { AdState } from "./types"
import { alpha, fitSize, geometry, onColor } from "./ad-style"
import { Clock, Cta, copy, display, fill } from "./kit"

/** Oferta: titular enorme arriba y un bloque de acento abajo con el precio y el botón. */
export function PromoAd({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const { u, tall, wide, pad, top, bottom } = geometry(w, h)
  const ink = ad.textColor
  const accent = ad.accentColor
  const onAccent = onColor(accent)
  const textW = wide ? w * 0.58 - pad * 1.6 : w - pad * 2
  const panelW = wide ? w * 0.42 - pad * 2 : w - pad * 2
  const headSize = fitSize(ad.headline, textW, wide ? h * 0.5 : h * (tall ? 0.28 : 0.2), { max: u * (wide ? 13 : tall ? 17 : 12.5), min: u * 6 })
  const priceSize = fitSize(ad.newPrice, panelW, u * 21, { max: u * (wide ? 17 : tall ? 21 : 12.5), min: u * 7, charWidth: 0.56 })

  const badge = ad.offerBadge ? (
    <div style={{ ...display(u * 6), alignSelf: "flex-start", background: accent, color: onAccent, padding: `${u * 1.6}px ${u * 3}px`, borderRadius: u * 0.8, transform: "rotate(-3deg)" }}>{ad.offerBadge}</div>
  ) : null
  const headline = <p style={{ ...display(headSize), color: ink, textWrap: "balance" }}>{ad.headline}</p>
  const body = ad.body ? (
    <p style={{ ...copy(u * 3.9), color: alpha(ink, 0.82), maxWidth: textW, display: "-webkit-box", WebkitLineClamp: tall ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.body}</p>
  ) : null
  const oldPrice = ad.originalPrice ? <p style={{ ...copy(u * 4.2, 700), textDecoration: "line-through", opacity: 0.7 }}>{ad.originalPrice}</p> : null
  const newPrice = ad.newPrice ? <p style={{ ...display(priceSize), lineHeight: 0.9 }}>{ad.newPrice}</p> : null
  const urgency = ad.urgency ? (
    <div style={{ ...copy(u * 3.4, 800), display: "flex", alignItems: "center", gap: u * 1.6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      <Clock size={u * 4} />
      <span>{ad.urgency}</span>
    </div>
  ) : null
  const cta = ad.cta ? <Cta label={ad.cta} background={ink} color={ad.bgColor} u={u} /> : null

  if (wide) {
    return (
      <div style={{ ...fill, display: "flex" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: u * 3, padding: `${top}px ${pad}px` }}>{badge}{headline}{body}</div>
        <div style={{ width: "42%", background: accent, color: onAccent, display: "flex", flexDirection: "column", justifyContent: "center", gap: u * 3.5, padding: pad }}>{oldPrice}{newPrice}{urgency}{cta}</div>
      </div>
    )
  }
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: u * 3, padding: `${top}px ${pad}px ${u * 5}px`, overflow: "hidden" }}>{badge}{headline}{body}</div>
      <div style={{ background: accent, color: onAccent, display: "flex", flexDirection: "column", gap: tall ? u * 3.5 : u * 2.6, padding: `${tall ? u * 5 : u * 4}px ${pad}px ${tall ? bottom : u * 4.5}px` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: u * 3 }}>{oldPrice}{urgency}</div>
        {newPrice}
        {cta}
      </div>
    </div>
  )
}
