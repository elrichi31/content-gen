"use client"

import { Photo, Rule, Slab, Txt, bodyStyle, fitTitle, palette, titleStyle, type LayoutProps } from "./shared"

export const splitVariants = [
  { id: 'image-right', label: 'Img Derecha'   },
  { id: 'image-left',  label: 'Img Izquierda' },
  { id: 'bg-image',    label: 'Img Fondo'     },
  { id: 'arch',        label: 'Arco'          },
  { id: 'circle',      label: 'Círculo'       },
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
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}><Photo src={slide.imageUrl} illustration={slide.imageSource === "illustration"} /></div>
        <div style={{ ...c.style, ...c.vars, position: "relative", display: "flex", flexDirection: "column", gap: "3cqw", padding: p.tall ? "8cqw 12cqw 34cqw 8cqw" : "8cqw 8cqw 13cqw" }}>
          <Rule color={c.accent} width={10} />
          {title(12, 26, 84)}
          {body(4.4, 5)}
        </div>
      </Slab>
    )
  }

  // Foto recortada en arco o en círculo arriba, texto debajo: el recorte es el protagonista.
  if (variant === 'arch' || variant === 'circle') {
    const ink = palette(p, 'ink')
    const arch = variant === 'arch'
    return (
      <Slab p={p} tone="ink" style={{ gap: "4cqw", alignItems: arch ? "stretch" : "center", textAlign: arch ? "left" : "center" }}>
        <div style={{ ...(arch ? { flex: 1, minHeight: 0, borderRadius: "999px 999px 2cqw 2cqw" } : { width: "58cqw", height: "58cqw", flexShrink: 0, borderRadius: "50%", boxShadow: `0 0 0 1.6cqw ${ink.panel}, 0 0 0 1.9cqw ${ink.accent}` }), overflow: "hidden", background: ink.panel }}>
          <Photo src={slide.imageUrl} illustration={slide.imageSource === "illustration"} />
        </div>
        <Txt p={p} field="title" as="h2" style={{ ...titleStyle(p, fitTitle(p, slide.title, { w: 84, h: 20, max: 11 })), color: ink.fg }} />
        <Txt p={p} field="content" multiline lines={arch ? 3 : 4} style={{ ...bodyStyle(4.2), color: ink.muted }} />
      </Slab>
    )
  }

  const imageLeft = variant === 'image-left'
  // Ilustración transparente: un solo fondo para todo el slide, sin corte entre texto e imagen, y más ancho para el texto.
  const illustration = slide.imageSource === "illustration"
  const column = illustration ? {} : { ...c.style, ...c.vars }
  const inner = illustration ? "2cqw" : "6cqw"
  return (
    <Slab p={p} tone="ink" style={{ flexDirection: imageLeft ? "row-reverse" : "row", padding: 0 }}>
      <div style={{ ...column, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3.5cqw", padding: p.tall ? `14cqw ${imageLeft ? "8cqw" : inner} 34cqw ${imageLeft ? inner : "8cqw"}` : `8cqw ${imageLeft ? "8cqw" : inner} 13cqw ${imageLeft ? inner : "8cqw"}` }}>
        <Rule color={c.accent} width={10} />
        {title(11, 46, illustration ? 50 : 38)}
        {body(4.2, 11)}
      </div>
      <div style={{ width: illustration ? "42%" : "50%" }}><Photo src={slide.imageUrl} illustration={slide.imageSource === "illustration"} /></div>
    </Slab>
  )
}
