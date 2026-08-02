import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Portado de `carousel-ai/app/workspace/carousel/page.tsx`: panel del workspace con esquina 28,
// borde tenue, fondo translúcido y sombra profunda.
export function WorkspacePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "min-h-0 overflow-hidden rounded-[28px] border border-border/60 bg-card/78 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}
