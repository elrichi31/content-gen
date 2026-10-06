"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/** Toaster de shadcn/ui con los tokens del sistema (el mismo de BethaSpend). */
function Toaster(props: ToasterProps) {
  const { resolvedTheme = "system" } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--success-bg": "var(--popover)",
        "--success-text": "var(--primary)",
        "--success-border": "color-mix(in oklch, var(--primary) 35%, transparent)",
        "--error-bg": "var(--popover)",
        "--error-text": "var(--destructive)",
        "--error-border": "color-mix(in oklch, var(--destructive) 35%, transparent)",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties}
      toastOptions={{ classNames: { toast: "font-sans text-[13px] shadow-lg", description: "text-muted-foreground" } }}
      {...props}
    />
  )
}

// Para avisos con acción (p. ej. «Deshacer»); los avisos simples van por <Notice>.
export { toast } from "sonner"
export { Toaster }
