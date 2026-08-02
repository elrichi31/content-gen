"use client"

import { useState } from "react"
import { Copy, Check, Pencil } from "lucide-react"
import type { PostCaption } from "@/lib/slide-types"

interface CaptionEditorProps {
  caption?: PostCaption | null
  onCaptionChange?: (caption: PostCaption) => void
  profileName?: string
}

export function CaptionEditor({ caption, onCaptionChange, profileName = "your.account" }: CaptionEditorProps) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  if (caption === undefined) return null

  const fullText = [
    caption?.text,
    caption?.hashtags?.map((h) => `#${h}`).join(" "),
  ]
    .filter(Boolean)
    .join("\n\n")

  const handleCopy = async () => {
    if (!fullText) return
    await navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!editing) {
    return (
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 text-xs leading-relaxed">
            {caption?.text ? (
              <>
                <span className="font-semibold text-foreground">{profileName} </span>
                <span className="text-foreground/80">{caption.text}</span>
                {(caption?.hashtags?.length ?? 0) > 0 && (
                  <span className="text-blue-400/80 text-[11px] block mt-1">
                    {caption.hashtags.map((h) => `#${h}`).join(" ")}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/50 italic text-[11px]">
                Tu caption aparecerá aquí después de generar...
              </span>
            )}
          </div>

          {caption?.text && (
            <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
              <button
                onClick={handleCopy}
                title="Copiar caption"
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => setEditing(true)}
                title="Editar caption"
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 pb-3 space-y-2">
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Caption</p>
        <button
          onClick={() => setEditing(false)}
          className="text-[10px] text-primary hover:text-primary/80 font-medium"
        >
          Listo
        </button>
      </div>

      <div className="relative">
        <textarea
          aria-label="Caption"
          value={caption?.text ?? ""}
          onChange={(e) =>
            onCaptionChange?.({ text: e.target.value, hashtags: caption?.hashtags ?? [] })
          }
          placeholder="Tu descripción aparecerá aquí después de generar el carrusel..."
          rows={3}
          className="w-full resize-none rounded-md border border-border/50 bg-background/50 px-2.5 py-2 pb-5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <span className="absolute bottom-2 right-2 text-[9px] text-muted-foreground/40 select-none">
          {caption?.text?.length ?? 0}/2200
        </span>
      </div>

      {(caption?.hashtags?.length ?? 0) > 0 && (
        <>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Hashtags
          </p>
          <textarea
            aria-label="Hashtags"
            value={caption?.hashtags.map((h) => `#${h}`).join(" ") ?? ""}
            onChange={(e) => {
              const tags = e.target.value
                .split(/[\s,]+/)
                .map((t) => t.replace(/^#/, "").trim())
                .filter(Boolean)
              onCaptionChange?.({ text: caption?.text ?? "", hashtags: tags })
            }}
            rows={2}
            className="w-full resize-none rounded-md border border-border/50 bg-background/50 px-2.5 py-2 text-xs text-primary placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </>
      )}
    </div>
  )
}
