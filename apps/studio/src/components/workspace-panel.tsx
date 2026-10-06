import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-h-0 min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)}>
      {children}
    </section>
  );
}
