"use client"

import { EditableText } from "@/components/editable-text"
import { HighlightedTitle, type LayoutProps } from "./shared"

export const timelineVariants = [
  { id: 'default', label: 'Línea'    },
  { id: 'steps',   label: 'Pasos'   },
  { id: 'minimal', label: 'Minimal' },
]

export function TimelineLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField, onUpdateListItem }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'default'
  const bg = bgBuilder(primary, bgStyle, 18, 4)
  const items = slide.listItems ?? []

  if (variant === 'steps') {
    return (
      <div className={`flex h-full flex-col justify-center p-7 ${slide.textColor}`} style={bg}>
        {slide.title && (
          editable && onUpdateField ? (
            <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="mb-5 text-balance text-lg font-bold leading-tight" />
          ) : (
            <h2 className="mb-5 text-balance text-lg font-bold leading-tight">
              <HighlightedTitle text={slide.title} primary={primary} />
            </h2>
          )
        )}
        <ol className="space-y-0">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3">
              {/* step column */}
              <div className="flex flex-col items-center">
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ backgroundColor: primary, color: '#111' }}
                >
                  {i + 1}
                </div>
                {i < items.length - 1 && (
                  <div className="w-px flex-1 my-1 opacity-30" style={{ backgroundColor: primary }} />
                )}
              </div>
              {/* content column */}
              <div className={`pb-4 pt-1 ${i === items.length - 1 ? '' : ''}`}>
                {editable && onUpdateListItem ? (
                  <EditableText value={item.text} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="text-sm leading-snug opacity-90 flex-1" />
                ) : (
                  <span className="text-sm leading-snug opacity-90">{item.text}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (variant === 'minimal') {
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
        <ol className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className="text-base leading-none opacity-70" style={{ color: primary }}>{item.emoji || `0${i + 1}`}</span>
              <div className="h-px flex-1 opacity-15" style={{ backgroundColor: primary }} />
              {editable && onUpdateListItem ? (
                <EditableText value={item.text} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="opacity-85 text-right max-w-[60%]" />
              ) : (
                <span className="opacity-85 text-right max-w-[60%]">{item.text}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  // default — classic vertical timeline with dot-and-line
  return (
    <div className={`flex h-full flex-col justify-center p-7 ${slide.textColor}`} style={bg}>
      {slide.title && (
        editable && onUpdateField ? (
          <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="mb-5 text-balance text-lg font-bold leading-tight" />
        ) : (
          <h2 className="mb-5 text-balance text-lg font-bold leading-tight">
            <HighlightedTitle text={slide.title} primary={primary} />
          </h2>
        )
      )}
      <ol className="relative space-y-0 pl-5" style={{ borderLeftWidth: 2, borderLeftColor: `color-mix(in srgb, ${primary} 30%, transparent)` }}>
        {items.map((item, i) => (
          <li key={i} className="relative pb-4 pl-4 last:pb-0">
            {/* dot */}
            <span
              className="absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
              style={{ backgroundColor: primary, color: '#111', boxShadow: `0 0 0 3px color-mix(in srgb, ${primary} 20%, transparent)` }}
            >
              {i + 1}
            </span>
            {editable && onUpdateListItem ? (
              <EditableText value={item.text} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="text-sm leading-snug opacity-90" />
            ) : (
              <span className="text-sm leading-snug opacity-90">{item.text}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
