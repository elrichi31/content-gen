import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-h-0 min-w-0 overflow-hidden rounded-lg border border-border bg-card", className)}>
      {children}
    </section>
  );
}
