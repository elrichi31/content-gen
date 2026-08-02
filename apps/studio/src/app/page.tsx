import Link from "next/link";
import {
  GalleryHorizontal,
  Megaphone,
  Clapperboard,
  Library,
  FolderKanban,
  Palette,
  Activity,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";

type Tile = {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  badge?: string;
  badgeClass?: string;
  gradient: string;
  disabled?: boolean;
};

const CREATE: Tile[] = [
  {
    href: "/carousel",
    icon: GalleryHorizontal,
    label: "Carrusel",
    description: "Genera con IA, edita los 10 layouts y previsualiza en Instagram o TikTok.",
    badge: "Disponible",
    badgeClass: "bg-primary/15 text-primary border-transparent",
    gradient: "from-primary/10 to-primary/5",
  },
  {
    href: "/ads",
    icon: Megaphone,
    label: "Anuncio",
    description: "Cinco layouts (promo, testimonial, comparación, features, dolor/solución) en story, square y landscape.",
    badge: "Beta",
    badgeClass: "bg-orange-500/15 text-orange-400 border-transparent",
    gradient: "from-orange-500/10 to-orange-500/5",
  },
  {
    href: "/video",
    icon: Clapperboard,
    label: "Video",
    description: "Guion, voz, composición y render dirigidos por datos.",
    badge: "Beta",
    badgeClass: "bg-chart-3/15 text-chart-3 border-transparent",
    gradient: "from-chart-3/10 to-chart-3/5",
  },
];

const MANAGE: Tile[] = [
  {
    href: "/library",
    icon: Library,
    label: "Biblioteca",
    description: "Todo el contenido con filtros por tipo, campaña, marca y estado.",
    gradient: "from-primary/10 to-transparent",
  },
  {
    href: "/campaigns",
    icon: FolderKanban,
    label: "Campañas",
    description: "El brief y la marca que comparten carruseles, anuncios y video.",
    gradient: "from-primary/10 to-transparent",
  },
  {
    href: "/brands",
    icon: Palette,
    label: "Marcas",
    description: "Colores e identidad reutilizables entre tus piezas.",
    gradient: "from-primary/10 to-transparent",
  },
  {
    href: "/diagnostics",
    icon: Activity,
    label: "Diagnóstico",
    description: "Estado local de IA, base de datos, almacenamiento y worker.",
    gradient: "from-primary/10 to-transparent",
  },
];

function TileCard({ tile }: { tile: Tile }) {
  const { href, icon: Icon, label, description, badge, badgeClass, gradient, disabled } = tile;
  const inner = (
    <>
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} opacity-0 transition-opacity group-hover:opacity-100`} />
      <div className="relative flex h-full flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted transition-colors group-hover:bg-background/80">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          {badge ? <Badge className={badgeClass}>{badge}</Badge> : null}
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">{label}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {!disabled ? (
          <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-primary">
            Abrir
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        ) : null}
      </div>
    </>
  );

  const base =
    "group relative flex flex-col rounded-2xl border border-border/60 bg-card p-6 transition-all";

  if (disabled) {
    return <div className={`${base} cursor-not-allowed opacity-60`} aria-disabled>{inner}</div>;
  }

  return (
    <Link
      href={href}
      className={`${base} hover:border-border hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {inner}
    </Link>
  );
}

export default function Home() {
  return (
    <PageShell>
      <section className="mb-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Content Gen</p>
        <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Un solo estudio para todo tu contenido con IA.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
          Crea carruseles, anuncios y video que comparten campaña, marca y recursos. Elige por dónde empezar.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Crear</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CREATE.map((tile) => (
            <TileCard key={tile.label} tile={tile} />
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Gestionar</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MANAGE.map((tile) => (
            <TileCard key={tile.label} tile={tile} />
          ))}
        </div>
      </section>
    </PageShell>
  );
}
