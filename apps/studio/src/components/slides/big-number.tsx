"use client"

import { EditableText } from "@/components/editable-text"
import { type LayoutProps } from "./shared"

export const bigNumberVariants = [
  { id: 'default',    label: 'Centrado'   },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'full',       label: 'Full'       },
]

export function BigNumberLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'default'
  const bg = bgBuilder(primary, bgStyle, 15, 5)

  if (variant === 'full') {
    return (
      <div className={`relative flex h-full flex-col items-center justify-center overflow-hidden p-8 text-center ${slide.textColor}`} style={bg}>
        {/* ghost watermark */}
        <span
          className="pointer-events-none absolute select-none font-extrabold tracking-tighter leading-none opacity-[0.06]"
          style={{ fontSize: '11rem', color: primary, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          aria-hidden
        >
          {slide.bigNumber}
        </span>
        {slide.emoji && <span className="relative z-10 mb-3 text-3xl">{slide.emoji}</span>}
        {editable && onUpdateField ? (
          <EditableText value={slide.bigNumber ?? ''} field="bigNumber" onUpdate={onUpdateField} className="relative z-10 text-7xl font-extrabold tracking-tight" style={{ color: primary } as React.CSSProperties} />
        ) : (
          <span className="relative z-10 text-7xl font-extrabold tracking-tight" style={{ color: primary }}>
            {slide.bigNumber}
          </span>
        )}
        {slide.bigNumberLabel && (
          editable && onUpdateField ? (
            <EditableText value={slide.bigNumberLabel} field="bigNumberLabel" onUpdate={onUpdateField} className="relative z-10 mt-4 max-w-[80%] text-balance text-sm opacity-70" multiline />
          ) : (
            <p className="relative z-10 mt-4 max-w-[80%] text-balance text-sm opacity-70">{slide.bigNumberLabel}</p>
          )
        )}
      </div>
    )
  }

  if (variant === 'horizontal') {
    return (
      <div className={`relative flex h-full flex-col justify-center overflow-hidden p-8 ${slide.textColor}`} style={bg}>
        {/* ghost watermark */}
        <span
          className="pointer-events-none absolute right-[-1rem] top-1/2 -translate-y-1/2 select-none font-extrabold tracking-tighter opacity-[0.07]"
          style={{ fontSize: '8rem', color: primary, lineHeight: 1 }}
          aria-hidden
        >
          {slide.bigNumber}
        </span>
        <div className="relative z-10 flex items-center gap-4">
          {slide.emoji && <span className="text-4xl">{slide.emoji}</span>}
          {editable && onUpdateField ? (
            <EditableText value={slide.bigNumber ?? ''} field="bigNumber" onUpdate={onUpdateField} className="text-5xl font-extrabold tracking-tight" style={{ color: primary } as React.CSSProperties} />
          ) : (
            <span className="text-5xl font-extrabold tracking-tight" style={{ color: primary }}>
              {slide.bigNumber}
            </span>
          )}
        </div>
        {slide.bigNumberLabel && (
          editable && onUpdateField ? (
            <EditableText value={slide.bigNumberLabel} field="bigNumberLabel" onUpdate={onUpdateField} className="relative z-10 mt-4 text-sm opacity-70 max-w-[80%]" multiline />
          ) : (
            <p className="relative z-10 mt-4 text-sm opacity-70 max-w-[80%]">{slide.bigNumberLabel}</p>
          )
        )}
      </div>
    )
  }

  return (
    <div className={`relative flex h-full flex-col items-center justify-center overflow-hidden p-8 text-center ${slide.textColor}`} style={bg}>
      {/* ghost watermark */}
      <span
        className="pointer-events-none absolute select-none font-extrabold tracking-tighter leading-none opacity-[0.06]"
        style={{ fontSize: '9rem', color: primary, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        aria-hidden
      >
        {slide.bigNumber}
      </span>
      {slide.emoji && <span className="relative z-10 mb-2 text-3xl">{slide.emoji}</span>}
      {editable && onUpdateField ? (
        <EditableText value={slide.bigNumber ?? ''} field="bigNumber" onUpdate={onUpdateField} className="relative z-10 text-5xl font-extrabold tracking-tight" style={{ color: primary } as React.CSSProperties} />
      ) : (
        <span className="relative z-10 text-5xl font-extrabold tracking-tight" style={{ color: primary }}>
          {slide.bigNumber}
        </span>
      )}
      {slide.bigNumberLabel && (
        editable && onUpdateField ? (
          <EditableText value={slide.bigNumberLabel} field="bigNumberLabel" onUpdate={onUpdateField} className="relative z-10 mt-4 max-w-[80%] text-balance text-sm opacity-70" multiline />
        ) : (
          <p className="relative z-10 mt-4 max-w-[80%] text-balance text-sm opacity-70">{slide.bigNumberLabel}</p>
        )
      )}
    </div>
  )
}
