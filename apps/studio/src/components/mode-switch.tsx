import Link from "next/link";
import { cn } from "@/lib/utils";

type Mode = { href: string; label: string };

export const CAROUSEL_MODES: Mode[] = [
  { href: "/carousel", label: "Editable" },
  { href: "/ai-carousel", label: "Imágenes IA" },
];

export const VIDEO_MODES: Mode[] = [
  { href: "/video", label: "Con imágenes" },
  { href: "/explainer", label: "Educativo" },
  { href: "/video/animaciones", label: "Animaciones" },
];

/** Una herramienta, varios modos: cada modo sigue siendo su propia página. */
export function ModeSwitch({ modes, current, className }: { modes: Mode[]; current: string; className?: string }) {
  return (
    <nav aria-label="Modo" className={cn("inline-flex rounded-md bg-surface-tertiary p-0.5 text-xs", className)}>
      {modes.map((mode) => (
        <Link
          key={mode.href}
          href={mode.href}
          aria-current={mode.href === current ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1 transition-colors",
            mode.href === current ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {mode.label}
        </Link>
      ))}
    </nav>
  );
}
