import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";

// Sidebar fija a la izquierda (decisión del usuario: da el toque de aplicación web)
// con el contenido centrado a su derecha.
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="md:pl-64">
        <main className={cn("mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 md:pt-10 lg:px-8", className)}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
