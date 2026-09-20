"use client"

import { Photo, Rule, Slab, Txt, bodyStyle, fitTitle, palette, titleStyle, type LayoutProps } from "./shared"

export const splitVariants = [
  { id: 'image-right', label: 'Img Derecha'   },
  { id: 'image-left',  label: 'Img Izquierda' },
  { id: 'bg-image',    label: 'Img Fondo'     },
]

/** Imagen y texto: el texto va en un bloque de color de marca, no sobre tinta, para no repetir «contenido». */
export function SplitLayout(p: LayoutProps) {
  const { slide } = p
  const variant = slide.layoutVariant ?? (slide.imagePosition === 'left' ? 'image-left' : slide.imagePosition === 'background' ? 'bg-image' : 'image-right')
  const c = palette(p, 'primary')
  const title = (max: number, h: number, w: number) => <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { w, h, max })), color: c.fg }} />
  const body = (size: number, lines: number) => <Txt p={p} field="content" multiline lines={lines} style={{ ...bodyStyle(size), color: c.fg }} />

  if (variant === 'bg-image') {
    return (
      <Slab p={p} tone="ink" style={{ padding: 0, justifyContent: "flex-end" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}><Photo src={slide.imageUrl} /></div>
        <div style={{ ...c.style, ...c.vars, position: "relative", display: "flex", flexDirection: "column", gap: "3cqw", padding: p.tall ? "8cqw 12cqw 34cqw 8cqw" : "8cqw 8cqw 13cqw" }}>
          <Rule color={c.accent} width={10} />
          {title(12, 26, 84)}
          {body(4.4, 5)}
        </div>
      </Slab>
    )
  }

  const imageLeft = variant === 'image-left'
  return (
    <Slab p={p} tone="ink" style={{ flexDirection: imageLeft ? "row-reverse" : "row", padding: 0 }}>
      <div style={{ ...c.style, ...c.vars, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3.5cqw", padding: p.tall ? "14cqw 6cqw 34cqw" : "8cqw 6cqw 13cqw" }}>
        <Rule color={c.accent} width={10} />
        {title(11, 46, 38)}
        {body(4.2, 11)}
      </div>
      <div style={{ width: "50%" }}><Photo src={slide.imageUrl} /></div>
    </Slab>
  )
}
