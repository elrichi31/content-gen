"use client"

export function SlideLoadingOverlay({ message = "Generando..." }: { message?: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/75 backdrop-blur-sm">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="mt-3 text-xs font-medium text-foreground">{message}</p>
    </div>
  )
}
