"use client"

import type { CSSProperties } from "react"
import { fitSize } from "@/components/ads/ad-style"
import { Slab, Txt, bodyStyle, flexTone, palette, tabular, titleStyle, type LayoutProps } from "./shared"

export const bigNumberVariants = [
  { id: 'default',    label: 'Centrado'   },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'full',       label: 'Full'       },
  { id: 'outline',    label: 'Contorno'   },
]

/** Una cifra que se lee antes que cualquier otra cosa. Se respeta el texto tal cual: «3s» no pasa a «3S». */
export function BigNumberLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'default'
  const tone = variant === 'full' ? 'primary' : flexTone(p)
  const c = palette(p, tone)
  const poster = p.fontTheme === "poster"
  const number = (w: number, h: number, max: number, extra?: CSSProperties) => {
    const size = fitSize(slide.bigNumber ?? "", w, h, { max, min: max * 0.3, charWidth: poster ? 0.52 : 0.64, leading: 0.9 })
    // Una cifra es texto grande: el color de marca puro se lee bien y es lo que da identidad.
    return <Txt p={p} field="bigNumber" as="h1" style={{ ...titleStyle(p, size), ...tabular, lineHeight: 0.9, textTransform: "none", color: tone === 'primary' ? c.fg : c.accent, ...extra }} />
  }
  const label = (size: number, extra?: CSSProperties) => <Txt p={p} field="bigNumberLabel" lines={5} style={{ ...bodyStyle(size, 600), color: c.fg, ...extra }} />

  if (variant === 'horizontal') {
    return (
      <Slab p={p} tone={tone} style={{ justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5cqw" }}>
          <div style={{ flex: "0 1 auto", minWidth: 0 }}>{number(46, 44, 44)}</div>
          <div style={{ width: "0.6cqw", alignSelf: "stretch", background: c.accent, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>{label(4.8)}</div>
        </div>
      </Slab>
    )
  }

  // Cifra gigante solo en contorno, a sangre, con la etiqueta abajo.
  if (variant === 'outline') {
    return (
      <Slab p={p} tone={tone} style={{ justifyContent: "space-between", gap: "5cqw" }}>
        {number(92, 62, 90, { color: "transparent", WebkitTextStroke: `0.7cqw ${c.accent}`, marginLeft: "-1cqw" })}
        <div style={{ borderTop: `0.6cqw solid ${c.accent}`, paddingTop: "4cqw" }}>{label(5.4, { maxWidth: "76cqw" })}</div>
      </Slab>
    )
  }

  if (variant === 'full') {
    return (
      <Slab p={p} tone="primary" style={{ justifyContent: "flex-end", gap: "5cqw" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>{number(84, 70, 78)}</div>
        {label(5.4, { maxWidth: "72cqw" })}
      </Slab>
    )
  }

  return (
    <Slab p={p} tone={tone} style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: "4cqw" }}>
      {number(84, 62, 70)}
      {label(5.2, { maxWidth: "74cqw" })}
    </Slab>
  )
}
