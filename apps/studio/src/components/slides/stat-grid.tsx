"use client"

import { EditableText } from "@/components/editable-text"
import { HighlightedTitle, type LayoutProps } from "./shared"

export const statGridVariants = [
  { id: 'default', label: 'Grid 2×2'  },
  { id: 'row',     label: 'Fila'      },
  { id: 'large',   label: 'Grande'    },
]

export function StatGridLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField, onUpdateListItem }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'default'
  const bg = bgBuilder(primary, bgStyle, 18, 4)
  const items = slide.listItems ?? []

  if (variant === 'row') {
    return (
      <div className={`flex h-full flex-col items-center justify-center p-7 ${slide.textColor}`} style={bg}>
        {slide.title && (
          editable && onUpdateField ? (
            <EditableText value={slide.title} field="title" onUpdate={onUpdateField} className="mb-6 text-balance text-lg font-bold leading-tight text-center" />
          ) : (
            <h2 className="mb-6 text-balance text-center text-lg font-bold leading-tight">
              <HighlightedTitle text={slide.title} primary={primary} />
            </h2>
          )
        )}
        <div className="flex w-full items-stretch divide-x" style={{ borderColor: `color-mix(in srgb, ${primary} 20%, transparent)` }}>
          {items.slice(0, 4).map((item, i) => (
            <div key={i} className="flex flex-1 flex-col items-center px-3 py-2 text-center">
              {editable && onUpdateListItem ? (
                <EditableText value={item.emoji} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="text-2xl font-extrabold tracking-tight" style={{ color: primary } as React.CSSProperties} />
              ) : (
                <span className="text-2xl font-extrabold tracking-tight" style={{ color: primary }}>{item.emoji}</span>
              )}
              <span className="mt-1 text-[10px] opacity-60 leading-tight">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'large') {
    const [first, ...rest] = items
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
        {first && (
          <div
            className="mb-3 rounded-2xl p-4"
            style={{ backgroundColor: `color-mix(in srgb, ${primary} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${primary} 25%, transparent)` }}
          >
            <span className="text-4xl font-extrabold tracking-tight" style={{ color: primary }}>{first.emoji}</span>
            <p className="mt-1 text-xs opacity-70">{first.text}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {rest.slice(0, 3).map((item, i) => (
            <div
              key={i}
              className="rounded-xl p-3"
              style={{ backgroundColor: `color-mix(in srgb, ${primary} 8%, transparent)` }}
            >
              <span className="text-2xl font-extrabold tracking-tight" style={{ color: primary }}>{item.emoji}</span>
              <p className="mt-0.5 text-[10px] opacity-60 leading-tight">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // default — 2×2 grid
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
      <div className="grid grid-cols-2 gap-3">
        {items.slice(0, 4).map((item, i) => (
          <div
            key={i}
            className="flex flex-col rounded-2xl p-4"
            style={{
              backgroundColor: `color-mix(in srgb, ${primary} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${primary} 18%, transparent)`,
            }}
          >
            {/* emoji field used as the big number/stat */}
            {editable && onUpdateListItem ? (
              <EditableText value={item.emoji} field="listItems" onUpdate={(_, v) => onUpdateListItem(i, v)} className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: primary } as React.CSSProperties} />
            ) : (
              <span className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: primary }}>{item.emoji}</span>
            )}
            <span className="mt-2 text-[10px] opacity-60 leading-tight">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
