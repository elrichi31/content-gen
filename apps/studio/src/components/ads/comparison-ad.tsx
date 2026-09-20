"use client"

import type { AdState } from "./types"
import { alpha, fitSize, geometry, onColor } from "./ad-style"
import { Check, Cross, Cta, copy, display, fill } from "./kit"

/** Antes contra ahora: un panel apagado y otro de acento con el botón. Apilados o en columnas según el formato. */
export function ComparisonAd({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const { u, tall, wide, pad, top, bottom } = geometry(w, h)
  const cols = !tall // el square también va en columnas: apilado no cabe el botón
  const ink = ad.textColor
  const accent = ad.accentColor
  const onAccent = onColor(accent)
  const headSize = fitSize(ad.compHeadline, w - pad * 2, h * (wide ? 0.3 : tall ? 0.17 : 0.2), { max: u * (wide ? 11 : 13), min: u * 5 })
  const panelH = cols ? h * 0.5 : h * 0.3
  const rowSize = (count: number) => Math.min(u * (tall ? 4.6 : wide ? 3.8 : 3.9), Math.max(u * 2.8, (panelH - u * 16) / (Math.max(1, count) * 1.9)))
  const chip = u * 10

  const rows = (items: string[], icon: "cross" | "check") => {
    const size = rowSize(items.length)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: size * 0.55 }}>
        {items.slice(0, 5).map((item) => (
          <div key={item} style={{ ...copy(size, icon === "check" ? 800 : 500), display: "flex", alignItems: "center", gap: size * 0.6, color: icon === "check" ? onAccent : alpha(ink, 0.72) }}>
            {icon === "check" ? <Check size={size * 1.15} /> : <Cross size={size * 1.15} color={alpha(ink, 0.5)} />}
            <span>{item}</span>
          </div>
        ))}
      </div>
    )
  }
  const label = (text: string, color: string) => <p style={{ ...copy(u * 3.2, 800), textTransform: "uppercase", letterSpacing: "0.12em", color }}>{text}</p>
  const cta = ad.cta ? <Cta label={ad.cta} background={ink} color={ad.bgColor} u={u} /> : null

  // La proporción 1 : 1.35 fija dónde cae la costura, y ahí va el "VS".
  const seam = `${(100 / 2.35).toFixed(2)}%`
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: `${top}px ${pad}px ${u * 4}px` }}>
        <p style={{ ...display(headSize), color: ink, textWrap: "balance" }}>{ad.compHeadline}</p>
      </div>
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: cols ? "row" : "column" }}>
        <div style={{ flex: 1, background: alpha(ink, 0.08), display: "flex", flexDirection: "column", gap: u * 3, padding: `${u * 6}px ${pad}px` }}>
          {label(ad.leftLabel, alpha(ink, 0.65))}
          {rows(ad.leftItems, "cross")}
        </div>
        <div style={{ flex: 1.35, background: accent, color: onAccent, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: u * 3, padding: `${cols ? u * 6 : u * 9}px ${pad}px ${cols ? pad : bottom}px` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: u * 3 }}>
            {label(ad.rightLabel, onAccent)}
            {rows(ad.rightItems, "check")}
          </div>
          {cta}
        </div>
        <div style={{ ...display(u * 4), position: "absolute", width: chip, height: chip, borderRadius: chip, background: ink, color: ad.bgColor, display: "flex", alignItems: "center", justifyContent: "center", ...(cols ? { left: seam, top: "50%", marginLeft: -chip / 2, marginTop: -chip / 2 } : { top: seam, right: pad, marginTop: -chip / 2 }) }}>VS</div>
      </div>
    </div>
  )
}
