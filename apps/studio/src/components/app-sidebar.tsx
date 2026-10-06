"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, CalendarDays, Clapperboard, FileText, FolderKanban, GalleryHorizontal, Home, Library,
  LogOut, Megaphone, Menu, PanelLeft, Palette, Radar, Sparkles, Wallet, Workflow, type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopBarClock } from "@/components/top-bar-clock";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// `also`: rutas hermanas (otro modo de la misma herramienta) que marcan la entrada como activa.
type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string; also?: string[] };
type NavGroup = { title?: string; items: NavItem[] };

export const GROUPS: NavGroup[] = [
  { items: [{ href: "/", label: "Inicio", icon: Home }] },
  { title: "Descubrir", items: [{ href: "/radar", label: "Radar", icon: Radar, badge: "Beta" }] },
  {
    title: "Crear",
    items: [
      { href: "/carousel", label: "Carrusel", icon: GalleryHorizontal, also: ["/ai-carousel"] },
      { href: "/ads", label: "Anuncio", icon: Megaphone, badge: "Beta" },
      { href: "/video", label: "Video", icon: Clapperboard, badge: "Beta", also: ["/explainer"] },
      { href: "/articles", label: "Artículo", icon: FileText, badge: "Beta" },
      { href: "/automations", label: "Automatizaciones", icon: Workflow, badge: "Beta" },
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
  { title: "Sistema", items: [{ href: "/costs", label: "Costos", icon: Wallet }, { href: "/diagnostics", label: "Diagnóstico", icon: Activity }] },
];

const COLLAPSED_KEY = "sidebar-collapsed";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
const itemActive = (pathname: string, item: NavItem) => [item.href, ...(item.also ?? [])].some((href) => isActive(pathname, href));

export function initials(name?: string | null) {
  return (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "?";
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className={cn("flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-card">
        <Sparkles className="size-4 text-primary" strokeWidth={1.75} />
      </span>
      {collapsed ? null : (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-foreground">Content Gen</span>
          <span className="block truncate text-[11px] text-sidebar-muted">Estudio de contenido</span>
        </span>
      )}
    </Link>
  );
}

function Nav({ pathname, collapsed, onNavigate }: { pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {GROUPS.map((group, index) => (
        <div key={group.title ?? index} className={cn(index > 0 && "mt-3 border-t border-sidebar-border pt-3")}>
          {group.title && !collapsed ? <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted/80">{group.title}</p> : null}
          {group.items.map((item) => {
            const active = itemActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mb-0.5 flex h-8 items-center gap-2.5 rounded-lg border px-2.5 text-[13px] transition-colors duration-150",
                  active ? "border-sidebar-border bg-sidebar-accent font-semibold text-foreground shadow-xs" : "border-transparent text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                {collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
                {item.badge && !collapsed ? <span className="rounded border border-sidebar-border px-1 text-[9px] font-medium uppercase tracking-wide text-sidebar-muted">{item.badge}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function useSignOut() {
  const router = useRouter();
  return () => void authClient.signOut({ fetchOptions: { onSuccess: () => { router.replace("/login"); router.refresh(); } } });
}

function Footer({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { data: session } = authClient.useSession();
  const signOut = useSignOut();
  const user = session?.user;
  return (
    <div className="border-t border-sidebar-border p-2">
      <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "justify-between px-1")}>
        <ThemeToggle />
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-label={collapsed ? "Expandir menú" : "Colapsar menú"} className="grid size-8 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-foreground">
            <PanelLeft className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {user ? (
        <div className={cn("mt-2 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-card p-2", collapsed && "flex-col p-1.5")}>
          <Link href="/account" title="Mi cuenta" className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{initials(user.name)}</Link>
          {collapsed ? null : (
            <Link href="/account" className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-foreground">{user.name}</span>
              <span className="block truncate text-[11px] text-sidebar-muted">{user.email}</span>
            </Link>
          )}
          <button type="button" onClick={signOut} title="Cerrar sesión" aria-label="Cerrar sesión" className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Ruta tipo «Crear / Carrusel» de la barra superior. */
function crumbs(pathname: string) {
  for (const group of GROUPS) {
    const item = group.items.find((entry) => itemActive(pathname, entry));
    if (item) return { section: group.title ?? "General", page: item.label };
  }
  if (pathname.startsWith("/account")) return { section: "Cuenta", page: "Mi cuenta" };
  if (pathname.startsWith("/content")) return { section: "Gestionar", page: "Pieza" };
  return { section: "General", page: "Content Gen" };
}

function TopBar({ pathname, onMenu }: { pathname: string; onMenu: () => void }) {
  const { data: session } = authClient.useSession();
  const { section, page } = crumbs(pathname);
  return (
    <header className="fixed right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur left-0 md:left-(--sidebar-w) sm:px-6">
      <button type="button" onClick={onMenu} aria-label="Abrir menú" className="-ml-1 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground md:hidden">
        <Menu className="size-4" />
      </button>
      <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <span className="text-muted-foreground">{section}</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="truncate font-medium text-foreground">{page}</span>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <TopBarClock />
        {session?.user ? (
          <Link href="/account" className="hidden items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 transition-colors hover:bg-accent sm:flex">
            <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{initials(session.user.name)}</span>
            <span className="max-w-40 truncate text-[13px] font-medium text-foreground">{session.user.name}</span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Sidebar fijo (colapsable a iconos) + barra superior + cajón en móvil, como en BethaSpend.
 * El ancho vive en `--sidebar-w` sobre <html>, así el contenido se desplaza sin conocer el estado.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // El script del layout ya aplicó la clase antes de pintar; aquí solo se sincroniza el estado.
    setCollapsed(document.documentElement.classList.contains("sidebar-collapsed"));
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle("sidebar-collapsed", next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* sin almacenamiento: solo esta sesión */ }
  };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-(--sidebar-w) flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:flex">
        <Brand collapsed={collapsed} />
        <Nav pathname={pathname} collapsed={collapsed} />
        <Footer collapsed={collapsed} onToggle={toggle} />
      </aside>

      <TopBar pathname={pathname} onMenu={() => setOpen(true)} />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" contentClassName="w-64" className="gap-0 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <Brand />
          <Nav pathname={pathname} onNavigate={() => setOpen(false)} />
          <Footer />
        </SheetContent>
      </Sheet>
    </>
  );
}
