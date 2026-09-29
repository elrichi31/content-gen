"use client"

import { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react"
import type { Slide } from "@/lib/slide-types"

/**
 * Si el texto no cabe en sus líneas (line-clamp), baja el tamaño de letra hasta 60% para que salga entero.
 * No usa zoom: con zoom caben las mismas palabras por línea y no se gana nada.
 */
export function shrinkToFit(el: HTMLElement, fontSize: React.CSSProperties["fontSize"]) {
  el.style.fontSize = String(fontSize ?? "")
  if (getComputedStyle(el).webkitLineClamp === "none") return
  const base = parseFloat(getComputedStyle(el).fontSize)
  for (let k = 0.96; el.scrollHeight > el.clientHeight + 1 && k >= 0.6; k -= 0.04) el.style.fontSize = `${base * k}px`
}

interface EditableTextProps {
  value: string
  field: keyof Slide
  onUpdate: (field: keyof Slide, value: string) => void
  className?: string
  multiline?: boolean
  style?: React.CSSProperties
  maxLength?: number
}

export function EditableText({ value, field, onUpdate, className, multiline, style, maxLength }: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const savedValue = useRef(value)
  const [charCount, setCharCount] = useState(value.length)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    savedValue.current = value
    setCharCount(value.length)
    const el = ref.current
    if (!el || document.activeElement === el) return
    if (el.textContent !== value) el.textContent = value
  }, [value])

  // Mismo ajuste que la vista previa: el texto se achica para no cortarse, también mientras se escribe.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    shrinkToFit(el, style?.fontSize)
    void document.fonts?.ready.then(() => shrinkToFit(el, style?.fontSize))
  })

  const handleBlur = useCallback(() => {
    setFocused(false)
    const next = ref.current?.textContent?.trim() ?? ""
    if (next !== savedValue.current) {
      savedValue.current = next
      onUpdate(field, next)
    }
  }, [field, onUpdate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (ref.current) ref.current.textContent = savedValue.current
        ref.current?.blur()
        return
      }
      if (!multiline && e.key === "Enter") {
        e.preventDefault()
        ref.current?.blur()
      }
    },
    [multiline],
  )

  const isOver = maxLength !== undefined && charCount > maxLength

  return (
    <div className="relative">
      <div
        ref={ref}
        className={`${className ?? ""} cursor-text outline-none rounded-[3px] transition-shadow hover:shadow-[0_0_0_2px_rgba(255,255,255,0.25)] focus:shadow-[0_0_0_2px_rgba(255,255,255,0.6)]`}
        style={style}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onInput={(e) => { const el = e.target as HTMLElement; setCharCount(el.textContent?.length ?? 0); shrinkToFit(el, style?.fontSize) }}
      >
        {value}
      </div>
      {focused && (
        <span
          className={`absolute -bottom-4 right-0 text-[9px] select-none pointer-events-none ${isOver ? "text-red-400" : "text-white/40"}`}
        >
          {charCount}{maxLength !== undefined ? `/${maxLength}` : ""}
        </span>
      )}
    </div>
  )
}
