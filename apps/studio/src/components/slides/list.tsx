"use client"

import { EditableText } from "@/components/editable-text"
import { HighlightedTitle, type LayoutProps } from "./shared"

export const listVariants = [
  { id: 'default',  label: 'Emoji'    },
  { id: 'numbered', label: 'Numerado' },
  { id: 'cards',    label: 'Cards'    },
]

export function ListLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField, onUpdateListItem }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'default'
  const bg = bgBuilder(primary, bgStyle, 18, 4)

  if (variant === 'numbered') {
    return (
      <div className={`flex h-full flex-col justify-center p-8 ${slide.textColor}`} style={bg}>
        {slide.title && (
          editable && onUpdateField ? (
            <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="mb-5 text-balance text-xl font-bold leading-tight" />
          ) : (
            <h2 className="mb-5 text-balance text-xl font-bold leading-tight">
              <HighlightedTitle text={slide.title} primary={primary} />
            </h2>
          )
        )}
        {slide.listItems && (
          <ol className="space-y-3">
            {slide.listItems.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: `color-mix(in srgb, ${primary} 20%, transparent)`, color: primary }}
                >
                  {i + 1}
                </span>
                {editable && onUpdateListItem ? (
                  <EditableText value={item.text} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="opacity-90 pt-0.5 flex-1" />
                ) : (
                  <span className="opacity-90 pt-0.5">{item.text}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    )
  }

  if (variant === 'cards') {
    return (
      <div className={`flex h-full flex-col justify-center p-6 ${slide.textColor}`} style={bg}>
        {slide.title && (
          editable && onUpdateField ? (
            <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="mb-4 text-balance text-lg font-bold leading-tight" />
          ) : (
            <h2 className="mb-4 text-balance text-lg font-bold leading-tight">
              <HighlightedTitle text={slide.title} primary={primary} />
            </h2>
          )
        )}
        {slide.listItems && (
          <div className="space-y-2">
            {slide.listItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: `color-mix(in srgb, ${primary} 10%, transparent)` }}
              >
                <span className="text-base leading-none">{item.emoji}</span>
                {editable && onUpdateListItem ? (
                  <EditableText value={item.text} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="opacity-90 text-xs flex-1" />
                ) : (
                  <span className="opacity-90 text-xs">{item.text}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex h-full flex-col justify-center p-8 ${slide.textColor}`} style={bg}>
      {slide.title && (
        editable && onUpdateField ? (
          <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="mb-5 text-balance text-xl font-bold leading-tight" />
        ) : (
          <h2 className="mb-5 text-balance text-xl font-bold leading-tight">
            <HighlightedTitle text={slide.title} primary={primary} />
          </h2>
        )
      )}
      {slide.listItems && (
        <ul className="space-y-3">
          {slide.listItems.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="text-lg leading-none" style={{ color: primary }}>{item.emoji}</span>
              {editable && onUpdateListItem ? (
                <EditableText value={item.text} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="opacity-90 flex-1" />
              ) : (
                <span className="opacity-90">{item.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
