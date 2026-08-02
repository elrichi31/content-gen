"use client"

import { EditableText } from "@/components/editable-text"
import { type LayoutProps } from "./shared"

export const quoteVariants = [
  { id: 'default', label: 'Centrado'  },
  { id: 'left',    label: 'Izquierda' },
  { id: 'card',    label: 'Card'      },
]

export function QuoteLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'default'
  const bg = bgBuilder(primary, bgStyle, 15, 5)

  if (variant === 'left') {
    return (
      <div className={`flex h-full flex-col justify-center p-8 ${slide.textColor}`} style={bg}>
        <div style={{ borderLeftWidth: 3, borderLeftColor: primary, paddingLeft: 16 }}>
          {editable && onUpdateField ? (
            <EditableText value={slide.quote ?? ''} field="quote" onUpdate={onUpdateField} className="text-balance text-lg font-medium italic leading-relaxed" multiline />
          ) : (
            <blockquote className="text-balance text-lg font-medium italic leading-relaxed">
              {slide.quote}
            </blockquote>
          )}
          {slide.quoteAuthor && (
            editable && onUpdateField ? (
              <EditableText value={slide.quoteAuthor} field="quoteAuthor" onUpdate={onUpdateField} className="mt-3 text-sm opacity-60" />
            ) : (
              <cite className="mt-3 block text-sm not-italic opacity-60">&mdash; {slide.quoteAuthor}</cite>
            )
          )}
        </div>
      </div>
    )
  }

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
          <span className="text-3xl" style={{ color: primary, opacity: 0.6 }}>&ldquo;</span>
          {editable && onUpdateField ? (
            <EditableText value={slide.quote ?? ''} field="quote" onUpdate={onUpdateField} className="mt-2 text-balance text-base font-medium italic leading-relaxed" multiline />
          ) : (
            <blockquote className="mt-2 text-balance text-base font-medium italic leading-relaxed">
              {slide.quote}
            </blockquote>
          )}
          {slide.quoteAuthor && (
            editable && onUpdateField ? (
              <EditableText value={slide.quoteAuthor} field="quoteAuthor" onUpdate={onUpdateField} className="mt-3 text-sm opacity-60" />
            ) : (
              <cite className="mt-3 block text-sm not-italic opacity-60">&mdash; {slide.quoteAuthor}</cite>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex h-full flex-col items-center justify-center p-8 text-center ${slide.textColor}`} style={bg}>
      <span className="mb-4 text-4xl" style={{ color: primary, opacity: 0.6 }}>&ldquo;</span>
      {editable && onUpdateField ? (
        <EditableText value={slide.quote ?? ''} field="quote" onUpdate={onUpdateField} className="text-balance text-lg font-medium italic leading-relaxed" multiline />
      ) : (
        <blockquote className="text-balance text-lg font-medium italic leading-relaxed">
          {slide.quote}
        </blockquote>
      )}
      {slide.quoteAuthor && (
        editable && onUpdateField ? (
          <EditableText value={slide.quoteAuthor} field="quoteAuthor" onUpdate={onUpdateField} className="mt-4 text-sm opacity-60" />
        ) : (
          <cite className="mt-4 text-sm not-italic opacity-60">&mdash; {slide.quoteAuthor}</cite>
        )
      )}
    </div>
  )
}
