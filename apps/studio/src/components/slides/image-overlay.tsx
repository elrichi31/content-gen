"use client"

import { EditableText } from "@/components/editable-text"
import { ImagePlaceholder, type LayoutProps } from "./shared"

export const imageOverlayVariants = [
  { id: 'bottom',  label: 'Texto abajo'  },
  { id: 'center',  label: 'Texto centro' },
  { id: 'top',     label: 'Texto arriba' },
]

export function ImageOverlayLayout({ slide, primary, editable, onUpdateField }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'bottom'

  const overlayClass =
    variant === 'top'    ? "bg-gradient-to-b from-black/80 via-black/40 to-black/10" :
    variant === 'center' ? "bg-black/55" :
                           "bg-gradient-to-t from-black/85 via-black/45 to-black/10"

  const contentClass =
    variant === 'top'    ? "justify-start pt-10" :
    variant === 'center' ? "justify-center items-center text-center" :
                           "justify-end pb-10"

  return (
    <div className="relative flex h-full text-white">
      {slide.imageUrl ? (
        <img src={slide.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30 gap-2">
          <ImagePlaceholder large />
        </div>
      )}

      <div className={`absolute inset-0 ${overlayClass}`} />
      <div className="absolute left-8 top-0 bottom-0 w-px opacity-60" style={{ backgroundColor: primary }} />

      <div className={`relative z-10 flex h-full flex-col px-10 ${contentClass}`}>
        {slide.emoji && variant !== 'bottom' && (
          <span className="mb-3 text-4xl">{slide.emoji}</span>
        )}
        {slide.title && (
          editable && onUpdateField ? (
            <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="text-balance text-xl font-bold leading-tight drop-shadow-md" />
          ) : (
            <h2 className="text-balance text-xl font-bold leading-tight drop-shadow-md" style={{ color: '#fff' }}>
              {slide.title}
            </h2>
          )
        )}
        {slide.content && (
          editable && onUpdateField ? (
            <EditableText value={slide.content} field="content" onUpdate={onUpdateField} className="mt-3 text-pretty text-sm leading-relaxed opacity-85 drop-shadow-sm max-w-[90%]" multiline />
          ) : (
            <p className="mt-3 text-pretty text-sm leading-relaxed opacity-85 drop-shadow-sm max-w-[90%]">
              {slide.content}
            </p>
          )
        )}
        {slide.emoji && variant === 'bottom' && (
          <span className="mt-4 text-3xl">{slide.emoji}</span>
        )}
      </div>
    </div>
  )
}
