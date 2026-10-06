import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";

/** Layout de las vistas con sesión, como en BethaSpend: sidebar fijo, barra superior y contenido centrado. */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="h-dvh overflow-hidden bg-background">
      <AppSidebar />
      <div className="h-full min-h-0 overflow-hidden pt-14 transition-[padding] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:pl-(--sidebar-w)">
        {/* El scroll vive en el ancho completo para que la barra quede en el borde y no dentro de la columna centrada. */}
        <main tabIndex={0} aria-label="Área de trabajo" className="h-full w-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <div className={cn("mx-auto w-full min-w-0 max-w-7xl px-4 py-5 sm:px-6 sm:py-6", className)}>{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Cabecera de página: título, descripción y acciones. La ruta ya va en la barra superior. */
export function PageHeading({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
