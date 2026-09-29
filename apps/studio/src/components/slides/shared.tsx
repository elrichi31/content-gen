"use client"

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { ImageIcon } from "lucide-react"
import { EditableText, shrinkToFit } from "@/components/editable-text"
import { fitSize } from "@/components/ads/ad-style"
import { alpha, onColor, readableOn } from "@/lib/color"
import type { BrandSettings, Slide } from "@/lib/slide-types"
import type { BgStyleId, FontThemeId } from "@/lib/themes"
import { buildBgStyle } from "@/lib/themes"
import { Decor } from "./decor"

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
  /**
   * Fondo de los slides. `light` (papel) y `dark` (tinta) valen para todos: el color de marca queda en
   * acentos, resaltados y formas. `brand` alterna tinta con slides enteros del color de marca.
   */
  surface?: Surface
  /** Formas de adorno en los bordes. */
  decor?: boolean
  /** Posición del slide: elige la composición de formas, para que no se repita al deslizar. */
  seed?: number
  editable?: boolean
  onUpdateField?: (field: keyof Slide, value: string) => void
  onUpdateListItem?: (index: number, text: string) => void
}

export const INK = "#0f0f0e"
export const PAPER = "#f4f2ec"

export type Tone = "ink" | "primary"
export type Surface = "light" | "dark" | "brand"

/** Con fondo claro u oscuro, ningún slide se pinta entero del color de marca: todos siguen ese fondo. */
const effectiveTone = (p: LayoutProps, tone: Tone): Tone => (p.surface === "brand" ? tone : "ink")

/** Layouts sin tono propio: siguen el ritmo del carrusel (tinta, tinta, color…). */
export const flexTone = (p: LayoutProps): Tone => (p.alt ? "primary" : "ink")

/**
 * Colores de una superficie. `flip` es el par de contraste para bloques y botones sobre ella, y
 * `text` el color de marca apto para texto pequeño: el verde de un tema da 4.1:1 sobre tinta, así
 * que el texto se aclara hasta 4.5:1 mientras que bloques y filetes conservan el color puro.
 * `vars` alimenta el énfasis: sobre tinta se colorea la palabra; sobre color, va en un bloque.
 */
export function palette(p: LayoutProps, requested: Tone) {
  const tone = effectiveTone(p, requested)
  const onPrimary = onColor(p.primary)
  if (tone === "primary") {
    const flip = { bg: onPrimary, fg: p.primary }
    return { fg: onPrimary, muted: alpha(onPrimary, 0.76), rule: alpha(onPrimary, 0.3), panel: alpha(onPrimary, 0.1), accent: onPrimary, text: onPrimary, flip, vars: { "--em-fg": flip.fg, "--em-bg": flip.bg } as CSSProperties, style: { ...p.bgBuilder(onPrimary, p.bgStyle, 0, 0), backgroundColor: p.primary } as CSSProperties }
  }
  // Énfasis: la palabra marcada va en un bloque del color de marca, como un subrayado de rotulador.
  const vars = { "--em-fg": onPrimary, "--em-bg": p.primary } as CSSProperties
  if (p.surface === "light") {
    const text = readableOn(p.primary, PAPER)
    // Sobre papel no van los patrones oscuros: solo una luz suave del color de marca en la esquina.
    const glow = `radial-gradient(120% 80% at 92% 0%, color-mix(in srgb, ${p.primary} 16%, transparent) 0%, transparent 62%)`
    return { fg: INK, muted: alpha(INK, 0.72), rule: alpha(INK, 0.16), panel: alpha(INK, 0.06), accent: p.primary, text, flip: { bg: p.primary, fg: onPrimary }, vars, style: { backgroundColor: PAPER, backgroundImage: glow } as CSSProperties }
  }
  const text = readableOn(p.primary, INK)
  return { fg: PAPER, muted: alpha(PAPER, 0.7), rule: alpha(PAPER, 0.22), panel: alpha(PAPER, 0.07), accent: p.primary, text, flip: { bg: p.primary, fg: onPrimary }, vars, style: { ...p.bgBuilder(p.primary, p.bgStyle, 9, 0), backgroundColor: INK } as CSSProperties }
}

/** Lienzo de un slide: la superficie, con el margen que deja sitio a la marca y a la flecha de deslizar. */
export function Slab({ p, tone, children, style, fit }: { p: LayoutProps; tone: Tone; children: ReactNode; style?: CSSProperties; fit?: boolean }) {
  const c = palette(p, tone)
  const effective = effectiveTone(p, tone)
  // Sin formas donde hay foto: la foto ya es el adorno, y encima de ella las formas estorban.
  const decor = p.decor && !p.slide.imageUrl && p.slide.layout !== "imageOverlay" && p.slide.layout !== "split"
  const colors = effective === "primary"
    ? { solid: alpha(c.fg, 0.22), line: alpha(c.fg, 0.22), soft: alpha(c.fg, 0.08) }
    : { solid: `color-mix(in srgb, ${p.primary} 45%, transparent)`, line: alpha(c.fg, 0.16), soft: `color-mix(in srgb, ${p.primary} ${p.surface === "light" ? 14 : 18}%, transparent)` }
  return (
    // `isolation` hace que las formas (z-index -1) queden sobre el fondo y bajo el texto.
    <div style={{ ...c.style, ...c.vars, color: c.fg, position: "relative", isolation: "isolate", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: p.tall ? "14cqw 12cqw 34cqw 8cqw" : "8cqw 8cqw 13cqw", ...style }}>
      {decor ? <Decor seed={p.seed ?? 0} colors={colors} /> : null}
      {fit ? <FitBox gap={style?.gap}>{children}</FitBox> : children}
    </div>
  )
}

/**
 * Encoge el contenido lo justo para que quepa. `density` adivina por el texto, pero un titular de dos
 * líneas o una fuente más ancha lo dejan corto y el slide se corta arriba y abajo. Aquí se mide de verdad:
 * si el contenido es más alto que el hueco, se aplica el mayor `zoom` con el que cabe.
 */
function FitBox({ gap, children }: { gap?: CSSProperties["gap"]; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = outer.current, content = inner.current
    if (!box || !content) return
    const measure = () => {
      const have = box.clientHeight
      const fits = (zoom: number) => { content.style.zoom = String(zoom); return content.getBoundingClientRect().height <= have }
      if (!have || fits(1)) return
      // Al encoger, el texto se reparte en menos líneas y ocupa menos de lo proporcional: se busca el
      // mayor zoom que cabe en vez de dividir alto entre alto, que se quedaba corto.
      let low = 0.5, high = 1
      for (let step = 0; step < 7; step++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid }
      content.style.zoom = String(low)
    }
    measure()
    // Las fuentes web llegan después del primer pintado y cambian el alto del texto.
    void document.fonts?.ready.then(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  })
  return (
    <div ref={outer} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div ref={inner} style={{ display: "flex", flexDirection: "column", gap }}>{children}</div>
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
  return <>{parts.map((part, i) => i % 2 ? <mark key={i} style={{ background: "var(--em-bg, transparent)", color: "var(--em-fg, inherit)", padding: "0 0.14em", margin: "0 0.08em", borderRadius: "0.1em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{part}</mark> : part)}</>
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
  if (lines) return <ShrinkText as={Tag} style={s} text={text} />
  return <Tag style={s}><Marked text={text} /></Tag>
}

/**
 * Texto con tope de líneas que no se corta: si no entra, se achica la letra (hasta 60%) hasta que
 * quepa entero. El recorte con «…» queda solo como último recurso.
 */
function ShrinkText({ as: Tag, style, text }: { as: "h1" | "h2" | "p" | "span"; style?: CSSProperties; text: string }) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => shrinkToFit(el, style?.fontSize)
    measure()
    void document.fonts?.ready.then(measure)
  })
  return <Tag ref={ref as never} style={style}><Marked text={text} /></Tag>
}

/** Texto de un elemento de lista: la edición cambia solo el texto, no el emoji o el valor. */
export function ItemText({ p, index, text, style }: { p: LayoutProps; index: number; text: string; style?: CSSProperties }) {
  if (p.editable && p.onUpdateListItem) return <EditableText value={text} field="listItems" onUpdate={(_, value) => p.onUpdateListItem?.(index, value)} style={style} />
  return <p style={{ margin: 0, ...style }}>{text}</p>
}

/**
 * Cuánto se aprieta un slide de elementos (lista, pasos, datos) según el texto que trae. Cuenta los
 * caracteres, no solo los elementos: cinco puntos largos desbordaban el slide aunque cinco cortos cupieran.
 * `scale` multiplica los tamaños de cuerpo; `dense` quita adornos y achica el titular para ganar alto.
 */
export function density(items: { text: string }[]) {
  const chars = items.reduce((total, item) => total + item.text.length, 0)
  // Solo un punto de partida: el ajuste exacto lo hace FitBox midiendo. Si esto encoge de más, se suma al zoom y la letra queda chica.
  const scale = chars > 240 || items.length > 4 ? 0.88 : 1
  const dense = scale < 0.85
  return { scale, dense, rowPad: dense ? "2.2cqw" : "3cqw", gap: dense ? "3.5cqw" : "5cqw", title: dense ? { h: 18, max: 9.5 } : { h: 26, max: 13 } }
}

/** Barra corta de acento que abre un titular. */
export const Rule = ({ color, width = 12 }: { color: string; width?: number }) => <div style={{ width: `${width}cqw`, height: "1.5cqw", background: color, flexShrink: 0 }} />

/** Estilo de etiqueta pequeña en mayúsculas, como las de un cartel. */
export const tagStyle = (bg: string, fg: string): CSSProperties => ({ alignSelf: "flex-start", margin: 0, background: bg, color: fg, fontSize: "3.7cqw", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "1.3cqw 2.8cqw", borderRadius: "0.8cqw" })

/** Foto a sangre. Sin imagen deja un hueco liso con un icono, sin texto que pueda acabar en el entregable. */
export function Photo({ src, style, illustration }: { src?: string; style?: CSSProperties; illustration?: boolean }) {
  if (src && illustration) return <img src={src} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", padding: "6cqw", boxSizing: "border-box", ...style }} />
  if (src) return <img src={src} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", ...style }} />
  return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: alpha(PAPER, 0.06), ...style }}><ImagePlaceholder large /></div>
}

export function ImagePlaceholder({ large = false }: { large?: boolean }) {
  return <ImageIcon aria-hidden className={large ? "h-10 w-10 opacity-30" : "h-8 w-8 opacity-30"} />
}
