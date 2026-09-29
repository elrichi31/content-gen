"use client"

import { INK, Photo, Rule, Slab, Txt, alpha, bodyStyle, fitTitle, flexTone, palette, tabular, titleStyle, type LayoutProps } from "./shared"

export const contentVariants = [
  { id: 'default',     label: 'Default'       },
  { id: 'centered',    label: 'Centrado'      },
  { id: 'image-right', label: 'Img Derecha'   },
  { id: 'image-left',  label: 'Img Izquierda' },
  { id: 'bg-image',    label: 'Img Fondo'     },
  { id: 'editorial',   label: 'Editorial'     },
  { id: 'sticker',     label: 'Sticker'       },
]

/** Una idea con su explicación: titular grande arriba y el párrafo debajo. */
export function ContentLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? 'default'
  const tone = variant === 'image-right' || variant === 'image-left' || variant === 'bg-image' ? 'ink' : flexTone(p)
  const c = palette(p, tone)
  const title = (max: number, h: number, w = 84) => <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { w, h, max })), color: c.fg }} />
  const body = (size: number, lines: number) => <Txt p={p} field="content" multiline lines={lines} style={{ ...bodyStyle(size), color: c.fg, opacity: 0.88 }} />
  // Si la IA numeró el paso («01»), el número es el gancho del slide; si no, una barra abre el titular.
  const step = /^\d{1,2}$/.test(slide.emoji ?? "") ? slide.emoji : undefined
  const opener = step ? <span style={{ ...titleStyle(p, 20), ...tabular, color: c.text, lineHeight: 0.8 }}>{step}</span> : <Rule color={c.accent} />

  if (variant === 'image-right' || variant === 'image-left') {
    const imageLeft = variant === 'image-left'
    return (
      <Slab p={p} tone="ink" style={{ flexDirection: imageLeft ? "row-reverse" : "row", padding: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3.5cqw", padding: p.tall ? "14cqw 6cqw 34cqw" : "8cqw 6cqw 13cqw" }}>
          <Rule color={c.accent} width={10} />
          {title(11, 46, 40)}
          {body(4.2, 11)}
        </div>
        <div style={{ position: "relative", width: "46%" }}>
          <Photo src={slide.imageUrl} illustration={slide.imageSource === "illustration"} />
          <div style={{ position: "absolute", top: 0, bottom: 0, [imageLeft ? "right" : "left"]: 0, width: "2cqw", background: c.accent }} />
        </div>
      </Slab>
    )
  }

  if (variant === 'bg-image') {
    return (
      <Slab p={p} tone="ink" style={{ justifyContent: "flex-end" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}><Photo src={slide.imageUrl} illustration={slide.imageSource === "illustration"} /></div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: `linear-gradient(180deg, ${alpha(INK, 0.3)} 0%, ${alpha(INK, 0.92)} 72%)` }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "3.5cqw" }}>
          <Rule color={c.accent} width={10} />
          {title(12, 30)}
          {body(4.4, 6)}
        </div>
      </Slab>
    )
  }

  // Revista: número gigante en contorno detrás, titular abajo a la izquierda.
  if (variant === 'editorial') {
    const n = step ?? String((p.seed ?? 0) + 1).padStart(2, "0")
    return (
      <Slab p={p} tone={tone} style={{ justifyContent: "flex-end", gap: "4cqw" }}>
        <span aria-hidden style={{ ...titleStyle(p, 72), ...tabular, position: "absolute", top: "-4cqw", right: "-3cqw", lineHeight: 0.8, color: "transparent", WebkitTextStroke: `0.5cqw ${c.accent}`, opacity: 0.55, zIndex: -1 }}>{n}</span>
        <Rule color={c.accent} />
        {title(17, 38, 80)}
        {body(4.6, 6)}
      </Slab>
    )
  }

  // Neo-brutalista: tarjeta del color de marca con borde y sombra dura, un poco girada.
  if (variant === 'sticker') {
    const ink = palette(p, 'ink'), card = palette(p, 'primary')
    return (
      <Slab p={p} tone="ink" style={{ justifyContent: "center" }}>
        <div style={{ ...card.vars, background: p.primary, color: card.fg, border: `0.6cqw solid ${ink.fg}`, boxShadow: `2.4cqw 2.4cqw 0 ${ink.fg}`, borderRadius: "2cqw", padding: "7cqw 6cqw", display: "flex", flexDirection: "column", gap: "3.5cqw", transform: "rotate(-1.5deg)" }}>
          <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { w: 70, h: 30, max: 14 })), color: card.fg }} />
          <Txt p={p} field="content" multiline lines={6} style={{ ...bodyStyle(4.4), color: card.fg }} />
        </div>
      </Slab>
    )
  }

  const centered = variant === 'centered'
  return (
    <Slab p={p} tone={tone} style={{ justifyContent: "center", gap: "4cqw", ...(centered ? { alignItems: "center", textAlign: "center" } : null) }}>
      {opener}
      {title(19, 32)}
      {body(4.8, 7)}
    </Slab>
  )
}
