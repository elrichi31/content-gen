"use client"

import { EditableText } from "@/components/editable-text"
import { HighlightedTitle, type LayoutProps } from "./shared"

export const ctaVariants = [
  { id: 'centered', label: 'Centrado' },
  { id: 'card',     label: 'Card'     },
  { id: 'minimal',  label: 'Minimal'  },
]

export function CtaLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'centered'
  const bg = bgBuilder(primary, bgStyle, 22, 6)

  const followBtn = (
    <div
      className="mt-6 rounded-full border px-6 py-2 text-sm font-medium opacity-80"
      style={{ borderColor: primary, color: primary }}
    >
      Seguir →
    </div>
  )

  if (variant === 'card') {
    return (
      <div className={`flex h-full flex-col items-center justify-center p-6 ${slide.textColor}`} style={bg}>
        <div
          className="w-full rounded-2xl p-6 text-center"
          style={{
            backgroundColor: `color-mix(in srgb, ${primary} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${primary} 25%, transparent)`,
          }}
        >
          {slide.emoji && <span className="text-4xl">{slide.emoji}</span>}
          {slide.ctaText && (
            editable && onUpdateField ? (
              <EditableText value={slide.ctaText} field="ctaText" onUpdate={onUpdateField} className="mt-3 text-xl font-bold leading-tight" />
            ) : (
              <h2 className="mt-3 text-xl font-bold leading-tight">
                <HighlightedTitle text={slide.ctaText} primary={primary} />
              </h2>
            )
          )}
          {slide.ctaSubtext && (
            editable && onUpdateField ? (
              <EditableText value={slide.ctaSubtext} field="ctaSubtext" onUpdate={onUpdateField} className="mt-2 text-sm opacity-70" multiline />
            ) : (
              <p className="mt-2 text-sm opacity-70">{slide.ctaSubtext}</p>
            )
          )}
          {followBtn}
        </div>
      </div>
    )
  }

  if (variant === 'minimal') {
    return (
      <div className={`flex h-full flex-col items-center justify-center p-8 text-center ${slide.textColor}`} style={bg}>
        <div className="mb-5 h-px w-16" style={{ backgroundColor: primary }} />
        {slide.ctaText && (
          editable && onUpdateField ? (
            <EditableText value={slide.ctaText} field="ctaText" onUpdate={onUpdateField} className="text-xl font-bold leading-tight" />
          ) : (
            <h2 className="text-xl font-bold leading-tight">
              <HighlightedTitle text={slide.ctaText} primary={primary} />
            </h2>
          )
        )}
        {slide.ctaSubtext && (
          editable && onUpdateField ? (
            <EditableText value={slide.ctaSubtext} field="ctaSubtext" onUpdate={onUpdateField} className="mt-3 text-sm opacity-60" multiline />
          ) : (
            <p className="mt-3 text-sm opacity-60">{slide.ctaSubtext}</p>
          )
        )}
        <div className="mt-5 h-px w-16" style={{ backgroundColor: primary }} />
      </div>
    )
  }

  return (
    <div className={`flex h-full flex-col items-center justify-center p-8 text-center ${slide.textColor}`} style={bg}>
      {slide.emoji && <span className="mb-4 text-4xl">{slide.emoji}</span>}
      {slide.ctaText && (
        editable && onUpdateField ? (
          <EditableText value={slide.ctaText} field="ctaText" onUpdate={onUpdateField} className="text-balance text-xl font-bold leading-tight" />
        ) : (
          <h2 className="text-balance text-xl font-bold leading-tight">
            <HighlightedTitle text={slide.ctaText} primary={primary} />
          </h2>
        )
      )}
      {slide.ctaSubtext && (
        editable && onUpdateField ? (
          <EditableText value={slide.ctaSubtext} field="ctaSubtext" onUpdate={onUpdateField} className="mt-3 text-balance text-sm opacity-70" multiline />
        ) : (
          <p className="mt-3 text-balance text-sm opacity-70">{slide.ctaSubtext}</p>
        )
      )}
      {followBtn}
    </div>
  )
}
