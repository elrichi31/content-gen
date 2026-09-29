"use client"

import type { CSSProperties, ReactNode } from "react"

/*
 * Formas de adorno detrás del texto: círculos, aros, arcos, escaleras, ondas, puntos y destellos,
 * como en las plantillas editoriales de Instagram. Viven en los bordes y casi siempre medio fuera
 * del slide, así nunca tapan el texto, que ocupa el centro con su margen.
 *
 * Cada slide usa una composición distinta (según su posición en el carrusel) para que al deslizar
 * no se repita el mismo dibujo, pero siempre con las mismas piezas y colores: se lee como una serie.
 */

export type DecorColors = {
  /** Relleno fuerte: el color de marca, o su contraste sobre un slide de color. */
  solid: string
  /** Trazos finos (aros, ondas, puntos). */
  line: string
  /** Relleno suave para formas grandes que no deben pesar. */
  soft: string
}

type Box = { top?: string; right?: string; bottom?: string; left?: string; width: string; height?: string; rotate?: number }
const place = ({ rotate, width, height, ...edges }: Box): CSSProperties => ({ position: "absolute", width, height: height ?? width, transform: rotate ? `rotate(${rotate}deg)` : undefined, ...edges })

const Circle = ({ box, color }: { box: Box; color: string }) => <div style={{ ...place(box), borderRadius: "50%", background: color }} />
const Ring = ({ box, color }: { box: Box; color: string }) => <div style={{ ...place(box), borderRadius: "50%", border: `0.8cqw solid ${color}` }} />
/** Arco: rectángulo con la parte de arriba en medio punto, como una ventana. */
const Arch = ({ box, color }: { box: Box; color: string }) => <div style={{ ...place(box), borderRadius: "999px 999px 0 0", background: color }} />
const HalfCircle = ({ box, color }: { box: Box; color: string }) => <div style={{ ...place(box), borderRadius: "999px 999px 0 0", background: color, height: `calc(${box.width} / 2)` }} />

const Svg = ({ box, viewBox, children }: { box: Box; viewBox: string; children: ReactNode }) => (
  <svg viewBox={viewBox} style={{ ...place(box), overflow: "visible" }} aria-hidden>{children}</svg>
)
const Stairs = ({ box, color }: { box: Box; color: string }) => <Svg box={box} viewBox="0 0 30 30"><path d="M0 30V20h10V10h10V0h10v30z" fill={color} /></Svg>
const Wave = ({ box, color }: { box: Box; color: string }) => <Svg box={box} viewBox="0 0 60 12"><path d="M1 6c5-6 9-6 14 0s9 6 14 0 9-6 14 0 9 6 14 0" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></Svg>
const Dots = ({ box, color }: { box: Box; color: string }) => (
  <Svg box={box} viewBox="0 0 40 40">{[0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((col) => <circle key={`${row}-${col}`} cx={5 + col * 10} cy={5 + row * 10} r="1.8" fill={color} />))}</Svg>
)
const Sparkle = ({ box, color }: { box: Box; color: string }) => <Svg box={box} viewBox="0 0 20 20"><path d="M10 0c.9 5.6 4.4 9.1 10 10-5.6.9-9.1 4.4-10 10-.9-5.6-4.4-9.1-10-10C5.6 9.1 9.1 5.6 10 0z" fill={color} /></Svg>

/** Seis composiciones; el índice del slide elige una. Tamaños en cqw (1% del ancho del slide). */
const COMPOSITIONS: ((c: DecorColors) => ReactNode)[] = [
  (c) => <>
    <Circle box={{ top: "-14cqw", right: "-16cqw", width: "46cqw" }} color={c.solid} />
    <Ring box={{ bottom: "-10cqw", left: "-12cqw", width: "34cqw" }} color={c.line} />
    <Sparkle box={{ top: "30cqw", right: "6cqw", width: "5cqw" }} color={c.solid} />
  </>,
  (c) => <>
    <Arch box={{ bottom: "-6cqw", right: "-4cqw", width: "26cqw", height: "34cqw" }} color={c.soft} />
    <Dots box={{ top: "5cqw", right: "6cqw", width: "14cqw" }} color={c.line} />
    <Wave box={{ bottom: "8cqw", left: "-3cqw", width: "24cqw", height: "5cqw" }} color={c.solid} />
  </>,
  (c) => <>
    <Stairs box={{ bottom: "-1cqw", left: "-1cqw", width: "22cqw" }} color={c.solid} />
    <HalfCircle box={{ top: "-1cqw", right: "10cqw", width: "24cqw", rotate: 180 }} color={c.soft} />
    <Sparkle box={{ top: "8cqw", left: "6cqw", width: "4.5cqw" }} color={c.line} />
  </>,
  (c) => <>
    <Ring box={{ top: "-18cqw", left: "-18cqw", width: "48cqw" }} color={c.line} />
    <Circle box={{ bottom: "-9cqw", right: "-9cqw", width: "30cqw" }} color={c.solid} />
    <Wave box={{ top: "7cqw", right: "5cqw", width: "20cqw", height: "4cqw" }} color={c.line} />
  </>,
  (c) => <>
    <Arch box={{ top: "30cqw", left: "-13cqw", width: "20cqw", height: "30cqw", rotate: 90 }} color={c.soft} />
    <Dots box={{ bottom: "7cqw", left: "7cqw", width: "12cqw" }} color={c.line} />
    <Sparkle box={{ top: "6cqw", right: "7cqw", width: "7cqw" }} color={c.solid} />
    <Circle box={{ top: "16cqw", right: "4cqw", width: "3cqw" }} color={c.solid} />
  </>,
  (c) => <>
    <Circle box={{ bottom: "-20cqw", left: "30cqw", width: "44cqw" }} color={c.soft} />
    <Stairs box={{ top: "-1cqw", right: "-1cqw", width: "16cqw", rotate: 90 }} color={c.solid} />
    <Ring box={{ top: "10cqw", left: "5cqw", width: "8cqw" }} color={c.line} />
  </>,
]

export function Decor({ seed, colors }: { seed: number; colors: DecorColors }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      {COMPOSITIONS[Math.abs(seed) % COMPOSITIONS.length](colors)}
    </div>
  )
}
