"use client"

import type { AdState } from "./types"
import { alpha, fitSize, geometry, onColor } from "./ad-style"
import { Arrow, Check, Cross, Cta, copy, display, fill } from "./kit"

/** Problema y respuesta: la mitad del problema queda apagada y la de la solución, en acento y más grande. */
export function PainSolutionAd({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const { u, tall, pad, top, bottom } = geometry(w, h)
  const cols = !tall // el square también va en columnas: apilado no cabe el botón
  const ink = ad.textColor
  const accent = ad.accentColor
  const onAccent = onColor(accent)
  const textW = cols ? w / 2 - pad * 2 : w - pad * 2
  const painSize = fitSize(ad.painHeadline, textW, h * (cols ? 0.34 : 0.15), { max: u * (cols ? 9 : 11), min: u * 4.5 })
  const solutionSize = fitSize(ad.solutionHeadline, textW, h * (cols ? 0.4 : 0.19), { max: u * (cols ? 12 : 14), min: u * 5.5 })
  const chip = u * 11

  const tile = (background: string, color: string, icon: "cross" | "check") => (
    <div style={{ width: u * 9, height: u * 9, background, color, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: u * 0.8 }}>
      {icon === "cross" ? <Cross size={u * 5.4} /> : <Check size={u * 5.4} />}
    </div>
  )
  const desc = (text: string, color: string) => text ? (
    <p style={{ ...copy(u * 3.7), color, maxWidth: textW, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</p>
  ) : null
  const cta = ad.cta ? <Cta label={ad.cta} background={ink} color={ad.bgColor} u={u} /> : null

  const pain = (
    <div style={{ flex: 1, background: alpha(ink, 0.07), display: "flex", flexDirection: "column", justifyContent: cols ? "center" : "flex-start", gap: u * 3, padding: cols ? pad : `${top}px ${pad}px ${u * 8}px` }}>
      {tile(alpha(ink, 0.16), ink, "cross")}
      <p style={{ ...display(painSize), color: alpha(ink, 0.92), textWrap: "balance" }}>{ad.painHeadline}</p>
      {desc(ad.painDesc, alpha(ink, 0.7))}
    </div>
  )
  const solution = (
    <div style={{ flex: 1, background: accent, color: onAccent, display: "flex", flexDirection: "column", justifyContent: cols ? "center" : "space-between", gap: u * 3, padding: cols ? pad : `${u * 9}px ${pad}px ${bottom}px` }}>
      <div style={{ display: "flex", flexDirection: "column", gap: u * 3 }}>
        {tile(onAccent, accent, "check")}
        <p style={{ ...display(solutionSize), textWrap: "balance" }}>{ad.solutionHeadline}</p>
        {desc(ad.solutionDesc, alpha(onAccent, 0.82))}
      </div>
      {cta}
    </div>
  )
  return (
    <div style={{ ...fill, display: "flex", flexDirection: cols ? "row" : "column" }}>
      {pain}
      {solution}
      <div style={{ position: "absolute", width: chip, height: chip, borderRadius: chip, background: ink, color: ad.bgColor, display: "flex", alignItems: "center", justifyContent: "center", ...(cols ? { left: "50%", top: "50%", marginLeft: -chip / 2, marginTop: -chip / 2 } : { right: pad, top: "50%", marginTop: -chip / 2 }) }}>
        <Arrow size={chip * 0.5} down={!cols} />
      </div>
    </div>
  )
}
