"use client"

import { EditableText } from "@/components/editable-text"
import { HighlightedTitle, type LayoutProps, titleSizeClass } from "./shared"

export const coverVariants = [
  { id: 'centered', label: 'Centrado' },
  { id: 'bold',     label: 'Bold'     },
  { id: 'minimal',  label: 'Minimal'  },
  { id: 'split',    label: 'Split'    },
  { id: 'badge',    label: 'Badge'    },
  { id: 'hero',     label: 'Hero'     },
]

function DecorCircles({ primary }: { primary: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <circle cx="92%" cy="12%" r="60" fill={`color-mix(in srgb, ${primary} 12%, transparent)`} />
      <circle cx="88%" cy="8%"  r="30" fill={`color-mix(in srgb, ${primary} 18%, transparent)`} />
      <circle cx="10%" cy="88%" r="45" fill={`color-mix(in srgb, ${primary} 10%, transparent)`} />
      <circle cx="5%"  cy="95%" r="20" fill={`color-mix(in srgb, ${primary} 15%, transparent)`} />
    </svg>
  )
}

export function CoverLayout({ slide, primary, bgStyle, bgBuilder, editable, onUpdateField }: LayoutProps) {
  const variant = slide.layoutVariant ?? 'centered'
  const bg = bgBuilder(primary, bgStyle, 22, 6)
  const titleCls = titleSizeClass(slide.titleSize, 'cover')

  if (variant === 'hero') {
    return (
      <div className={`relative flex h-full flex-col items-center justify-center overflow-hidden px-8 pt-8 pb-10 text-center ${slide.textColor}`} style={bg}>
        <DecorCircles primary={primary} />
        {slide.emoji && (
          <span className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[120px] opacity-[0.07]">{slide.emoji}</span>
        )}
        <div className="relative z-10 mb-5 h-1 w-12 rounded-full" style={{ backgroundColor: primary }} />
        <div className="relative z-10">
          {editable && onUpdateField ? (
            <EditableText value={slide.title ?? ''} field="title" onUpdate={onUpdateField} className={`text-balance font-extrabold leading-tight tracking-tight line-clamp-3 ${titleCls}`} />
          ) : (
            <h1 className={`text-balance font-extrabold leading-tight tracking-tight line-clamp-3 ${titleCls}`}>
              <HighlightedTitle text={slide.title ?? ''} primary={primary} />
            </h1>
          )}
          {slide.subtitle && (
            editable && onUpdateField ? (
              <EditableText value={slide.subtitle} field="subtitle" onUpdate={onUpdateField} className="mt-4 line-clamp-2 text-sm opacity-60 max-w-[220px] leading-relaxed mx-auto" />
            ) : (
              <p className="mt-4 line-clamp-2 text-sm opacity-60 max-w-[220px] leading-relaxed mx-auto">{slide.subtitle}</p>
            )
          )}
        </div>
        <div className="relative z-10 mt-5 h-1 w-12 rounded-full" style={{ backgroundColor: primary }} />
      </div>
    )
  }

  if (variant === 'bold') {
    return (
      // pb-10 instead of pb-8 — gives the brand badge room at the very bottom
      <div className={`relative flex h-full flex-col justify-end overflow-hidden px-8 pt-8 pb-10 ${slide.textColor}`} style={bg}>
        <DecorCircles primary={primary} />
        {slide.emoji && (
          <span className="pointer-events-none absolute top-6 right-6 select-none text-7xl opacity-[0.12]">{slide.emoji}</span>
        )}
        <div className="relative z-10" style={{ borderLeftWidth: 3, borderLeftColor: primary, paddingLeft: 12 }}>
          {editable && onUpdateField ? (
            <EditableText value={slide.title ?? ''} field="title" onUpdate={onUpdateField} className={`font-extrabold leading-tight tracking-tight line-clamp-4 ${titleCls}`} />
          ) : (
            <h1 className={`font-extrabold leading-tight tracking-tight line-clamp-4 ${titleCls}`}>
              <HighlightedTitle text={slide.title ?? ''} primary={primary} />
            </h1>
          )}
          {slide.subtitle && (
            editable && onUpdateField ? (
              <EditableText value={slide.subtitle} field="subtitle" onUpdate={onUpdateField} className="mt-2 line-clamp-2 text-sm opacity-60" />
            ) : (
              <p className="mt-2 line-clamp-2 text-sm opacity-60">{slide.subtitle}</p>
            )
          )}
        </div>
      </div>
    )
  }

  if (variant === 'minimal') {
    return (
      <div className={`flex h-full flex-col items-center justify-center px-10 pt-10 pb-10 text-center ${slide.textColor}`} style={bg}>
        <div className="mb-4 h-px w-12" style={{ backgroundColor: primary }} />
        {editable && onUpdateField ? (
          <EditableText value={slide.title ?? ''} field="title" onUpdate={onUpdateField} className={`font-bold leading-tight tracking-wide uppercase line-clamp-3 ${titleCls}`} />
        ) : (
          <h1 className={`font-bold leading-tight tracking-wide uppercase line-clamp-3 ${titleCls}`}>
            <HighlightedTitle text={slide.title ?? ''} primary={primary} />
          </h1>
        )}
        {slide.subtitle && (
          editable && onUpdateField ? (
            <EditableText value={slide.subtitle} field="subtitle" onUpdate={onUpdateField} className="mt-4 line-clamp-2 text-xs opacity-60 max-w-[200px] leading-relaxed" />
          ) : (
            <p className="mt-4 line-clamp-2 text-xs opacity-60 max-w-[200px] leading-relaxed">{slide.subtitle}</p>
          )
        )}
        <div className="mt-4 h-px w-12" style={{ backgroundColor: primary }} />
      </div>
    )
  }

  if (variant === 'split') {
    return (
      <div className={`flex h-full flex-row ${slide.textColor}`} style={bg}>
        <div className="flex flex-1 flex-col justify-center px-8 pt-8 pb-10">
          {editable && onUpdateField ? (
            <EditableText value={slide.title ?? ''} field="title" onUpdate={onUpdateField} className={`font-bold leading-tight line-clamp-4 ${titleCls}`} />
          ) : (
            <h1 className={`font-bold leading-tight line-clamp-4 ${titleCls}`}>
              <HighlightedTitle text={slide.title ?? ''} primary={primary} />
            </h1>
          )}
          {slide.subtitle && (
            editable && onUpdateField ? (
              <EditableText value={slide.subtitle} field="subtitle" onUpdate={onUpdateField} className="mt-3 line-clamp-2 text-sm opacity-60 leading-relaxed" />
            ) : (
              <p className="mt-3 line-clamp-2 text-sm opacity-60 leading-relaxed">{slide.subtitle}</p>
            )
          )}
          <div className="mt-5 h-0.5 w-10" style={{ backgroundColor: primary }} />
        </div>
        {slide.emoji && (
          <div className="flex w-1/3 items-center justify-center">
            <span className="text-7xl">{slide.emoji}</span>
          </div>
        )}
      </div>
    )
  }

  if (variant === 'badge') {
    return (
      <div className={`relative flex h-full flex-col items-center justify-center overflow-hidden px-8 pt-8 pb-10 text-center ${slide.textColor}`} style={bg}>
        <DecorCircles primary={primary} />
        {slide.subtitle && (
          editable && onUpdateField ? (
            <EditableText value={slide.subtitle} field="subtitle" onUpdate={onUpdateField} className="relative z-10 mb-4 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest line-clamp-1" style={{ backgroundColor: `color-mix(in srgb, ${primary} 20%, transparent)`, color: primary } as React.CSSProperties} />
          ) : (
            <span
              className="relative z-10 mb-4 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest line-clamp-1"
              style={{ backgroundColor: `color-mix(in srgb, ${primary} 20%, transparent)`, color: primary }}
            >
              {slide.subtitle}
            </span>
          )
        )}
        {slide.emoji && <span className="relative z-10 mb-3 text-4xl">{slide.emoji}</span>}
        {editable && onUpdateField ? (
          <EditableText value={slide.title ?? ''} field="title" onUpdate={onUpdateField} className={`relative z-10 font-extrabold leading-tight line-clamp-3 ${titleCls}`} />
        ) : (
          <h1 className={`relative z-10 font-extrabold leading-tight line-clamp-3 ${titleCls}`}>
            <HighlightedTitle text={slide.title ?? ''} primary={primary} />
          </h1>
        )}
      </div>
    )
  }

  // centered (default)
  return (
    <div className={`relative flex h-full flex-col items-center justify-center overflow-hidden px-8 pt-8 pb-10 text-center ${slide.textColor}`} style={bg}>
      <DecorCircles primary={primary} />
      {slide.emoji && <span className="relative z-10 mb-4 text-5xl">{slide.emoji}</span>}
      {editable && onUpdateField ? (
        <EditableText value={slide.title ?? ''} field="title" onUpdate={onUpdateField} className={`relative z-10 text-balance font-bold leading-tight line-clamp-3 ${titleCls}`} />
      ) : (
        <h1 className={`relative z-10 text-balance font-bold leading-tight line-clamp-3 ${titleCls}`}>
          <HighlightedTitle text={slide.title ?? ''} primary={primary} />
        </h1>
      )}
      {slide.subtitle && (
        editable && onUpdateField ? (
          <EditableText value={slide.subtitle} field="subtitle" onUpdate={onUpdateField} className="relative z-10 mt-3 line-clamp-2 text-balance text-sm opacity-70" />
        ) : (
          <p className="relative z-10 mt-3 line-clamp-2 text-balance text-sm opacity-70">{slide.subtitle}</p>
        )
      )}
    </div>
  )
}
