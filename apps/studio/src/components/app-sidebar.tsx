"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";
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
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-3">
      {GROUPS.map((group, index) => (
        <div key={group.title ?? index} className="space-y-0.5">
          {group.title ? (
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
              {group.title}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = !item.disabled && isActive(pathname, item.href);
            const content = (
              <>
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </>
            );
            const base = "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors";
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
                    ? "bg-surface-tertiary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-surface-tertiary/60 hover:text-foreground",
                )}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { data: session } = authClient.useSession();
  const router = useRouter();
  if (!session) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
      <Link href="/account" className="truncate text-xs text-muted-foreground hover:text-foreground" title="Mi cuenta">
        {session.user.email}
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Cerrar sesión"
        onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => { router.replace("/login"); router.refresh(); } } })}
      >
        <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-4 py-3.5">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
        <Sparkles className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={1.5} />
      </div>
      <span className="text-sm font-semibold tracking-tight text-foreground">Content Gen</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface-secondary md:flex">
        <div className="flex items-center justify-between pr-2">
          <Brand />
          <ThemeToggle />
        </div>
        <SidebarNav pathname={pathname} />
        <div className="px-3 py-3">
          <Button asChild size="sm" className="w-full justify-start gap-2">
            <Link href="/carousel">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} /> Crear carrusel
            </Link>
          </Button>
        </div>
        <UserMenu />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={1.5} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">Content Gen</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menú">
                <Menu className="h-5 w-5" strokeWidth={1.5} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navegación</SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <Brand onNavigate={() => setOpen(false)} />
                <SidebarNav pathname={pathname} onNavigate={() => setOpen(false)} />
                <UserMenu />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
}
