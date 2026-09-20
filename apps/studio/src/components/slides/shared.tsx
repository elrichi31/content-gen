"use client"

import type { CSSProperties, ReactNode } from "react"
import { ImageIcon } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import { fitSize } from "@/components/ads/ad-style"
import { alpha, onColor, readableOn } from "@/lib/color"
import type { BrandSettings, Slide } from "@/lib/slide-types"
import type { BgStyleId, FontThemeId } from "@/lib/themes"
import { buildBgStyle } from "@/lib/themes"

/*
 * Lenguaje de los slides: superficies planas que alternan tinta y color de marca, titulares de cartel
 * y tamaños en `cqw` (1% del ancho del slide), así el mismo diseño escala en la vista previa, en el
 * selector de variantes y en una exportación a cualquier tamaño.
 */

export { alpha, onColor }

export type BgBuilder = typeof buildBgStyle

export type LayoutProps = {
  slide: Slide
  primary: string
  bgStyle: BgStyleId
  bgBuilder: BgBuilder
  fontTheme: FontThemeId
  brand?: BrandSettings | null
  /** Formato 3:5 (TikTok): la app tapa el pie y el lateral, así que el contenido sube. */
  tall?: boolean
  /** Toca un slide de color de marca: rompe las rachas de tinta a lo largo del carrusel. */
  alt?: boolean
  editable?: boolean
  onUpdateField?: (field: keyof Slide, value: string) => void
  onUpdateListItem?: (index: number, text: string) => void
}

export const INK = "#0f0f0e"
export const PAPER = "#f4f2ec"

export type Tone = "ink" | "primary"

/** Layouts sin tono propio: siguen el ritmo del carrusel (tinta, tinta, color…). */
export const flexTone = (p: LayoutProps): Tone => (p.alt ? "primary" : "ink")

/**
 * Colores de una superficie. `flip` es el par de contraste para bloques y botones sobre ella, y
 * `text` el color de marca apto para texto pequeño: el verde de un tema da 4.1:1 sobre tinta, así
 * que el texto se aclara hasta 4.5:1 mientras que bloques y filetes conservan el color puro.
 * `vars` alimenta el énfasis: sobre tinta se colorea la palabra; sobre color, va en un bloque.
 */
export function palette(p: LayoutProps, tone: Tone) {
  const onPrimary = onColor(p.primary)
  if (tone === "primary") {
    const flip = { bg: onPrimary, fg: p.primary }
    return { fg: onPrimary, muted: alpha(onPrimary, 0.76), rule: alpha(onPrimary, 0.3), panel: alpha(onPrimary, 0.1), accent: onPrimary, text: onPrimary, flip, vars: { "--em-fg": flip.fg, "--em-bg": flip.bg } as CSSProperties, style: { ...p.bgBuilder(onPrimary, p.bgStyle, 0, 0), backgroundColor: p.primary } as CSSProperties }
  }
  const text = readableOn(p.primary, INK)
  return { fg: PAPER, muted: alpha(PAPER, 0.7), rule: alpha(PAPER, 0.22), panel: alpha(PAPER, 0.07), accent: p.primary, text, flip: { bg: p.primary, fg: onPrimary }, vars: { "--em-fg": text, "--em-bg": "transparent" } as CSSProperties, style: { ...p.bgBuilder(p.primary, p.bgStyle, 9, 0), backgroundColor: INK } as CSSProperties }
}

/** Lienzo de un slide: la superficie, con el margen que deja sitio a la marca y a la flecha de deslizar. */
export function Slab({ p, tone, children, style }: { p: LayoutProps; tone: Tone; children: ReactNode; style?: CSSProperties }) {
  const c = palette(p, tone)
  return (
    <div style={{ ...c.style, ...c.vars, color: c.fg, position: "relative", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: p.tall ? "14cqw 12cqw 34cqw 8cqw" : "8cqw 8cqw 13cqw", ...style }}>
      {children}
    </div>
  )
}

const TITLE_SCALE = { compact: 0.8, regular: 1, large: 1.12, display: 1.25 } as const

/** Tamaño del titular en cqw: el más grande que cabe en `w` × `h`, limitado por el `titleSize` que puso la IA. */
export function fitTitle(p: LayoutProps, text: string | undefined, { w = 84, h, max, min }: { w?: number; h: number; max: number; min?: number }) {
  const poster = p.fontTheme === "poster"
  return fitSize((text ?? "").replace(/\*/g, ""), w, h, { max: max * TITLE_SCALE[p.slide.titleSize ?? "regular"], min: min ?? max * 0.4, charWidth: poster ? 0.5 : 0.62, leading: poster ? 0.92 : 1.06 })
}

/**
 * Titular: en la fuente «Cartel» va condensado y en mayúsculas; en las demás conserva su carácter.
 * El tracking depende del tamaño —más cerrado cuanto más grande, un poco abierto en lo pequeño—
 * y el interlineado se abre en los titulares chicos, donde la caja apretada de un grande se ve rota.
 */
export function titleStyle(p: LayoutProps, size: number): CSSProperties {
  const poster = p.fontTheme === "poster"
  const tracking = size >= 14 ? "-0.02em" : size >= 8 ? "-0.01em" : "0.01em"
  return { margin: 0, fontSize: `${size}cqw`, fontWeight: poster ? 900 : 800, lineHeight: poster ? (size >= 8 ? 0.92 : 0.98) : 1.08, letterSpacing: poster ? tracking : "-0.02em", textTransform: poster ? "uppercase" : "none", fontStretch: poster ? "62%" : undefined, fontVariationSettings: poster ? "'wdth' 62" : undefined, textWrap: "balance" }
}

/** Texto de lectura sobre tinta: interlineado y tracking un poco más abiertos, porque la luz sobre oscuro se ve más apretada. */
export const bodyStyle = (size: number, weight = 500): CSSProperties => ({ margin: 0, fontSize: `${size}cqw`, fontWeight: weight, lineHeight: 1.4, letterSpacing: "0.005em", textWrap: "pretty" })

/** Cifras que se alinean: en estadísticas y numeración, «1» no debe ocupar menos que «8». */
export const tabular: CSSProperties = { fontVariantNumeric: "tabular-nums" }

export const clamp = (lines: number): CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" })

/** Énfasis opt-in: lo que va entre *asteriscos* se resalta; nada se resalta por su cuenta. */
export function Marked({ text }: { text: string }) {
  const parts = text.split(/\*([^*\n]+)\*/)
  return <>{parts.map((part, i) => i % 2 ? <mark key={i} style={{ background: "var(--em-bg, transparent)", color: "var(--em-fg, inherit)", padding: "0 0.14em", margin: "0 -0.14em", borderRadius: "0.1em" }}>{part}</mark> : part)}</>
}

type TextField = "title" | "subtitle" | "content" | "quote" | "quoteAuthor" | "ctaText" | "ctaSubtext" | "bigNumber" | "bigNumberLabel"

/**
 * Texto de un campo del slide: editable en el editor (con sus asteriscos a la vista), estático en la
 * vista previa. `lines` recorta el cuerpo; un titular nunca se recorta: si no cabe, se encoge.
 */
export function Txt({ p, field, as: Tag = "p", style, lines, multiline }: { p: LayoutProps; field: TextField; as?: "h1" | "h2" | "p" | "span"; style?: CSSProperties; lines?: number; multiline?: boolean }) {
  const text = p.slide[field]
  if (typeof text !== "string" || !text) return null
  const s = lines ? { ...style, ...clamp(lines) } : style
  if (p.editable && p.onUpdateField) return <EditableText value={text} field={field} onUpdate={p.onUpdateField} style={s} multiline={multiline} />
  return <Tag style={s}><Marked text={text} /></Tag>
}

/** Texto de un elemento de lista: la edición cambia solo el texto, no el emoji o el valor. */
export function ItemText({ p, index, text, style }: { p: LayoutProps; index: number; text: string; style?: CSSProperties }) {
  if (p.editable && p.onUpdateListItem) return <EditableText value={text} field="listItems" onUpdate={(_, value) => p.onUpdateListItem?.(index, value)} style={style} />
  return <p style={{ margin: 0, ...style }}>{text}</p>
}

/** Barra corta de acento que abre un titular. */
export const Rule = ({ color, width = 12 }: { color: string; width?: number }) => <div style={{ width: `${width}cqw`, height: "1.5cqw", background: color, flexShrink: 0 }} />

/** Estilo de etiqueta pequeña en mayúsculas, como las de un cartel. */
export const tagStyle = (bg: string, fg: string): CSSProperties => ({ alignSelf: "flex-start", margin: 0, background: bg, color: fg, fontSize: "3.7cqw", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "1.3cqw 2.8cqw", borderRadius: "0.8cqw" })

/** Foto a sangre. Sin imagen deja un hueco liso con un icono, sin texto que pueda acabar en el entregable. */
export function Photo({ src, style }: { src?: string; style?: CSSProperties }) {
  if (src) return <img src={src} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", ...style }} />
  return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: alpha(PAPER, 0.06), ...style }}><ImagePlaceholder large /></div>
}

export function ImagePlaceholder({ large = false }: { large?: boolean }) {
  return <ImageIcon aria-hidden className={large ? "h-10 w-10 opacity-30" : "h-8 w-8 opacity-30"} />
}
