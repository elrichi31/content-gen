"use client"

import { ImageIcon } from "lucide-react"
import type { Slide } from "@/lib/slide-types"
import type { BgStyleId } from "@/lib/themes"
import { buildBgStyle } from "@/lib/themes"

/** Maps the AI-assigned titleSize to the right Tailwind text class per layout category. */
export function titleSizeClass(
  size: Slide['titleSize'],
  category: 'cover' | 'content' | 'cta' = 'content'
): string {
  if (category === 'cover') {
    switch (size) {
      case 'compact': return 'text-xl'
      case 'large':   return 'text-3xl'
      case 'display': return 'text-4xl'
      default:        return 'text-2xl'
    }
  }
  // content / cta
  switch (size) {
    case 'compact': return 'text-base'
    case 'large':   return 'text-2xl'
    case 'display': return 'text-3xl'
    default:        return 'text-xl'
  }
}

export type BgBuilder = typeof buildBgStyle

export type LayoutProps = {
  slide: Slide
  primary: string
  bgStyle: BgStyleId
  bgBuilder: BgBuilder
  editable?: boolean
  onUpdateField?: (field: keyof Slide, value: string) => void
  onUpdateListItem?: (index: number, text: string) => void
}

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','is','are',
  'was','were','be','been','have','has','had','do','does','did','will','would',
  'could','should','may','might','can','not','this','that','these','those',
  'i','you','he','she','it','we','they','my','your','our','its','their',
  'el','la','los','las','un','una','y','o','de','en','con','por','para',
  'que','se','lo','le','es','su','del','al','nos','te','me','mi','tu',
  'si','no','como','más','pero','hay','muy','cada','este','esta','estos',
])

export function HighlightedTitle({ text, primary }: { text: string; primary: string }) {
  const tokens = text.split(/(\s+)/)
  let found = false
  const nodes = tokens.map((token, i) => {
    if (/^\s+$/.test(token)) return token
    if (!found) {
      const clean = token.toLowerCase().replace(/[^a-záéíóúñü0-9]/g, '')
      if (clean.length > 3 && !STOP_WORDS.has(clean)) {
        found = true
        return <span key={i} style={{ color: primary }}>{token}</span>
      }
    }
    return token
  })
  return <>{nodes}</>
}

export function ImagePlaceholder({ large = false }: { large?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 opacity-30">
      <ImageIcon className={large ? "h-10 w-10" : "h-8 w-8"} />
      <span className="text-xs">Image</span>
    </div>
  )
}
