"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sparkles,
  Menu,
  Home,
  GalleryHorizontal,
  Megaphone,
  Clapperboard,
  Library,
  FolderKanban,
  Palette,
  Activity,
  BarChart3,
  CalendarDays,
  FileText,
  Radar,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; disabled?: boolean; badge?: string };
type NavGroup = { title?: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { items: [{ href: "/", label: "Inicio", icon: Home }] },
  {
    title: "Descubrir",
    items: [{ href: "/radar", label: "Radar", icon: Radar, badge: "Beta" }],
  },
  {
    title: "Crear",
    items: [
      { href: "/carousel", label: "Carrusel", icon: GalleryHorizontal },
      { href: "/ads", label: "Anuncio", icon: Megaphone, badge: "Beta" },
      { href: "/video", label: "Video", icon: Clapperboard, badge: "Beta" },
      { href: "/articles", label: "Artículo", icon: FileText, badge: "Beta" },
    ],
  },
  {
    title: "Gestionar",
    items: [
      { href: "/library", label: "Biblioteca", icon: Library },
      { href: "/campaigns", label: "Campañas", icon: FolderKanban },
      { href: "/schedule", label: "Cronograma", icon: CalendarDays },
      { href: "/brands", label: "Marcas", icon: Palette },
      { href: "/analytics", label: "Métricas", icon: BarChart3 },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/costs", label: "Costos", icon: Wallet },
      { href: "/diagnostics", label: "Diagnóstico", icon: Activity },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {GROUPS.map((group, index) => (
        <div key={group.title ?? index} className="space-y-1">
          {group.title ? (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {group.title}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = !item.disabled && isActive(pathname, item.href);
            const content = (
              <>
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </>
            );
            const base = "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors";
            if (item.disabled) {
              return (
                <span key={item.label} className={cn(base, "cursor-not-allowed text-muted-foreground/50")} aria-disabled>
                  {content}
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  base,
                  active
                    ? "bg-primary/12 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {active ? <span className="absolute left-0 h-5 w-0.5 rounded-full bg-primary" /> : null}
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-5 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      <span className="text-lg font-semibold tracking-tight text-foreground">Content Gen</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/50 bg-card/40 backdrop-blur-xl md:flex">
        <Brand />
        <SidebarNav pathname={pathname} />
        <div className="border-t border-border/50 px-3 py-4">
          <Button asChild className="w-full">
            <Link href="/carousel">
              <Sparkles className="h-4 w-4" /> Crear carrusel
            </Link>
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur-xl md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight text-foreground">Content Gen</span>
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menú">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navegación</SheetTitle>
            </SheetHeader>
            <div className="flex h-full flex-col">
              <Brand onNavigate={() => setOpen(false)} />
              <SidebarNav pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
