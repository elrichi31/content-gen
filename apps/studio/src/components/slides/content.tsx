"use client"

import { EditableText } from "@/components/editable-text"
import { HighlightedTitle, ImagePlaceholder, type LayoutProps } from "./shared"

export const contentVariants = [
  { id: 'default',     label: 'Default'       },
  { id: 'centered',    label: 'Centrado'      },
  { id: 'image-right', label: 'Img Derecha'   },
  { id: 'image-left',  label: 'Img Izquierda' },
  { id: 'bg-image',    label: 'Img Fondo'     },
]

export function ContentLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'default'
  const bg = bgBuilder(primary, bgStyle, 18, 4)

  if (slide.imagePosition === 'background') {
    return (
      <div className="relative flex h-full text-white">
        {slide.imageUrl ? (
          <img src={slide.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover scale-105" style={{ filter: 'blur(3px)' }} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30">
            <ImagePlaceholder large />
          </div>
        )}
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center">
          {slide.title && (
            editable && onUpdateField ? (
              <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="text-balance text-xl font-bold leading-tight drop-shadow-md" />
            ) : (
              <h2 className="text-balance text-xl font-bold leading-tight drop-shadow-md" style={{ color: '#fff' }}>
                <HighlightedTitle text={slide.title} primary={primary} />
              </h2>
            )
          )}
          {slide.content && (
            editable && onUpdateField ? (
              <EditableText value={slide.content} field="content" onUpdate={onUpdateField} className="mt-3 text-pretty text-sm leading-relaxed opacity-85 drop-shadow-sm max-w-[85%]" multiline />
            ) : (
              <p className="mt-3 text-pretty text-sm leading-relaxed opacity-85 drop-shadow-sm max-w-[85%]">{slide.content}</p>
            )
          )}
        </div>
      </div>
    )
  }

  if (variant === 'centered') {
    return (
      <div className={`flex h-full flex-col items-center justify-center px-8 pt-6 pb-10 text-center ${slide.textColor}`} style={bg}>
        {slide.title && (
          editable && onUpdateField ? (
            <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="text-balance text-xl font-bold leading-tight line-clamp-3" />
          ) : (
            <h2 className="text-balance text-xl font-bold leading-tight line-clamp-3">
              <HighlightedTitle text={slide.title} primary={primary} />
            </h2>
          )
        )}
        {slide.content && (
          editable && onUpdateField ? (
            <EditableText value={slide.content} field="content" onUpdate={onUpdateField} className="mt-3 text-pretty text-sm leading-relaxed opacity-80 max-w-[85%] line-clamp-6" multiline />
          ) : (
            <p className="mt-3 text-pretty text-sm leading-relaxed opacity-80 max-w-[85%] line-clamp-6">{slide.content}</p>
          )
        )}
      </div>
    )
  }

  if (variant === 'image-right' || variant === 'image-left') {
    const imageOnLeft = variant === 'image-left'
    return (
      <div className={`flex h-full ${imageOnLeft ? 'flex-row' : 'flex-row-reverse'} ${slide.textColor}`} style={bg}>
        <div className="flex w-1/2 items-center justify-center bg-black/10">
          {slide.imageUrl
            ? <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
            : <ImagePlaceholder />}
        </div>
        <div className="flex w-1/2 flex-col justify-center p-6">
          {slide.title && (
            editable && onUpdateField ? (
              <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="text-balance text-lg font-bold leading-tight" />
            ) : (
              <h2 className="text-balance text-lg font-bold leading-tight">
                <HighlightedTitle text={slide.title} primary={primary} />
              </h2>
            )
          )}
          {slide.content && (
            editable && onUpdateField ? (
              <EditableText value={slide.content} field="content" onUpdate={onUpdateField} className="mt-3 text-pretty text-xs leading-relaxed opacity-80" multiline />
            ) : (
              <p className="mt-3 text-pretty text-xs leading-relaxed opacity-80">{slide.content}</p>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex h-full flex-col justify-center px-8 pt-6 pb-10 ${slide.textColor}`} style={bg}>
      {slide.title && (
        editable && onUpdateField ? (
          <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="text-balance text-xl font-bold leading-tight line-clamp-3" />
        ) : (
          <h2 className="text-balance text-xl font-bold leading-tight line-clamp-3">
            <HighlightedTitle text={slide.title} primary={primary} />
          </h2>
        )
      )}
      {slide.content && (
        editable && onUpdateField ? (
          <EditableText value={slide.content} field="content" onUpdate={onUpdateField} className="mt-3 text-pretty text-sm leading-relaxed opacity-80 line-clamp-6" multiline />
        ) : (
          <p className="mt-3 text-pretty text-sm leading-relaxed opacity-80 line-clamp-6">{slide.content}</p>
        )
      )}
    </div>
  )
}
