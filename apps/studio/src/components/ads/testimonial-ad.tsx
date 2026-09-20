"use client"

import type { AdState } from "./types"
import { alpha, fitSize, geometry, onColor } from "./ad-style"
import { Cta, QuoteMark, Star, copy, fill } from "./kit"

/** Reseña: la cita es el titular. Estrellas y autor debajo, y un botón de acento. */
export function TestimonialAd({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const { u, tall, wide, pad, top, bottom } = geometry(w, h)
  const ink = ad.textColor
  const accent = ad.accentColor
  const onAccent = onColor(accent)
  const stars = Math.min(5, Math.max(0, ad.stars))
  const textW = wide ? w * 0.62 - pad * 2 : w - pad * 2
  const quoteSize = fitSize(ad.quote, textW, wide ? h * 0.5 : h * (tall ? 0.34 : 0.36), { max: u * (wide ? 9.5 : tall ? 14 : 12), min: u * 4, charWidth: 0.46, leading: 1.08 })

  const starRow = (color: string) => (
    <div style={{ display: "flex", gap: u }}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={u * 5.4} color={color} filled={i < stars} />)}
    </div>
  )
  const quote = <p style={{ ...copy(quoteSize, 800, 78), lineHeight: 1.06, letterSpacing: "-0.015em", color: ink, textWrap: "balance" }}>{ad.quote}</p>
  const author = (
    <div style={{ display: "flex", flexDirection: "column", gap: u * 0.8 }}>
      <p style={{ ...copy(u * 4.6, 800), textTransform: "uppercase", letterSpacing: "0.04em" }}>{ad.authorName}</p>
      {ad.authorRole ? <p style={{ ...copy(u * 3.4), color: alpha(ink, 0.7) }}>{ad.authorRole}</p> : null}
    </div>
  )
  const tile = (background: string, color: string) => (
    <div style={{ width: u * 14, height: u * 14, background, color, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: u }}>
      <QuoteMark size={u * 8} />
    </div>
  )
  const cta = ad.cta ? <Cta label={ad.cta} background={accent} color={onAccent} u={u} /> : null

  if (wide) {
    return (
      <div style={{ ...fill, display: "flex" }}>
        <div style={{ width: "34%", background: accent, color: onAccent, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: u * 5, padding: pad }}>
          {tile(onAccent, accent)}
          {starRow(onAccent)}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: u * 4, padding: `${top}px ${pad}px` }}>{quote}{author}{cta}</div>
      </div>
    )
  }
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: u * 4, padding: `${top}px ${pad}px ${bottom}px` }}>
      {tile(accent, onAccent)}
      {quote}
      <div style={{ flex: 1 }} />
      {starRow(accent)}
      {author}
      {cta}
    </div>
  )
}
