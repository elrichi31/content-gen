"use client"

import type { CSSProperties, ReactNode } from "react"

/*
 * Formas de adorno detrás del texto: círculos, aros, arcos, cápsulas, ondas y puntos, como en las
 * plantillas editoriales de Instagram. Solo asoman por los márgenes del slide (8cqw a los lados y
 * arriba, 13cqw abajo) o por las esquinas, casi enteras fuera del lienzo: el texto ocupa el centro
 * y ninguna forma llega hasta él.
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
/** Cápsula: barra con las puntas redondas. */
const Pill = ({ box, color }: { box: Box; color: string }) => <div style={{ ...place(box), borderRadius: "999px", background: color }} />
const HalfCircle = ({ box, color }: { box: Box; color: string }) => <div style={{ ...place(box), borderRadius: "999px 999px 0 0", background: color, height: `calc(${box.width} / 2)` }} />

const Svg = ({ box, viewBox, children }: { box: Box; viewBox: string; children: ReactNode }) => (
  <svg viewBox={viewBox} style={{ ...place(box), overflow: "visible" }} aria-hidden>{children}</svg>
)
const Wave = ({ box, color }: { box: Box; color: string }) => <Svg box={box} viewBox="0 0 60 12"><path d="M1 6c5-6 9-6 14 0s9 6 14 0 9-6 14 0 9 6 14 0" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></Svg>
const Dots = ({ box, color }: { box: Box; color: string }) => (
  <Svg box={box} viewBox="0 0 40 40">{[0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((col) => <circle key={`${row}-${col}`} cx={5 + col * 10} cy={5 + row * 10} r="1.8" fill={color} />))}</Svg>
)

/** Seis composiciones; el índice del slide elige una. Tamaños en cqw (1% del ancho del slide). */
const COMPOSITIONS: ((c: DecorColors) => ReactNode)[] = [
  (c) => <>
    <Ring box={{ top: "-20cqw", right: "-20cqw", width: "36cqw" }} color={c.line} />
    <Circle box={{ bottom: "-58cqw", left: "-10cqw", width: "70cqw" }} color={c.soft} />
    <Circle box={{ top: "4cqw", left: "8cqw", width: "2.4cqw" }} color={c.solid} />
  </>,
  (c) => <>
    <Arch box={{ bottom: "-22cqw", right: "-4cqw", width: "24cqw", height: "34cqw" }} color={c.soft} />
    <Dots box={{ top: "3cqw", left: "4cqw", width: "10cqw" }} color={c.line} />
    <Pill box={{ bottom: "5cqw", left: "-8cqw", width: "24cqw", height: "3.2cqw" }} color={c.solid} />
  </>,
  (c) => <>
    <HalfCircle box={{ top: "-4cqw", right: "12cqw", width: "24cqw", rotate: 180 }} color={c.soft} />
    <Ring box={{ bottom: "-24cqw", left: "-24cqw", width: "34cqw" }} color={c.line} />
    <Ring box={{ bottom: "-30cqw", left: "-30cqw", width: "46cqw" }} color={c.line} />
    <Circle box={{ bottom: "5cqw", right: "18cqw", width: "2.4cqw" }} color={c.solid} />
  </>,
  (c) => <>
    <Ring box={{ top: "-26cqw", left: "-26cqw", width: "40cqw" }} color={c.line} />
    <Circle box={{ bottom: "-18cqw", right: "-18cqw", width: "30cqw" }} color={c.solid} />
    <Wave box={{ top: "3cqw", right: "6cqw", width: "18cqw", height: "3.6cqw" }} color={c.line} />
  </>,
  (c) => <>
    <Arch box={{ top: "30cqw", left: "-17cqw", width: "20cqw", height: "30cqw", rotate: 90 }} color={c.soft} />
    <Dots box={{ bottom: "2.5cqw", left: "8cqw", width: "10cqw" }} color={c.line} />
    <Ring box={{ top: "4cqw", right: "7cqw", width: "5cqw" }} color={c.solid} />
  </>,
  (c) => <>
    <Circle box={{ bottom: "-34cqw", left: "30cqw", width: "44cqw" }} color={c.soft} />
    <Pill box={{ top: "4cqw", right: "-8cqw", width: "22cqw", height: "3.2cqw" }} color={c.solid} />
    <Ring box={{ top: "3cqw", left: "4cqw", width: "6cqw" }} color={c.line} />
  </>,
]

export function Decor({ seed, colors }: { seed: number; colors: DecorColors }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      {COMPOSITIONS[Math.abs(seed) % COMPOSITIONS.length](colors)}
    </div>
  )
}
