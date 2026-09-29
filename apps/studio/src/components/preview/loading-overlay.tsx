"use client"

import { AiProgress } from "@/components/ai-progress"

export function SlideLoadingOverlay({ message = "Generando" }: { message?: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/75 text-xs font-medium text-foreground backdrop-blur-sm">
      <AiProgress label={message} size={64} estimateMs={30_000} state="composing" />
    </div>
  )
}
