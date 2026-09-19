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
  disabled?: boolean;
};

const CREATE: Tile[] = [
  {
    href: "/carousel",
    icon: GalleryHorizontal,
    label: "Carrusel",
    description: "Genera con IA, edita los 10 layouts y previsualiza en Instagram o TikTok.",
    badge: "Disponible",
  },
  {
    href: "/ads",
    icon: Megaphone,
    label: "Anuncio",
    description: "Cinco layouts (promo, testimonial, comparación, features, dolor/solución) en story, square y landscape.",
    badge: "Beta",
  },
  {
    href: "/video",
    icon: Clapperboard,
    label: "Video",
    description: "Guion, voz, composición y render dirigidos por datos.",
    badge: "Beta",
  },
];

const MANAGE: Tile[] = [
  {
    href: "/library",
    icon: Library,
    label: "Biblioteca",
    description: "Todo el contenido con filtros por tipo, campaña, marca y estado.",
  },
  {
    href: "/campaigns",
    icon: FolderKanban,
    label: "Campañas",
    description: "El brief y la marca que comparten carruseles, anuncios y video.",
  },
  {
    href: "/brands",
    icon: Palette,
    label: "Marcas",
    description: "Colores e identidad reutilizables entre tus piezas.",
  },
  {
    href: "/diagnostics",
    icon: Activity,
    label: "Diagnóstico",
    description: "Estado local de IA, base de datos, almacenamiento y worker.",
  },
];

function TileCard({ tile }: { tile: Tile }) {
  const { href, icon: Icon, label, description, badge, disabled } = tile;
  const inner = (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-secondary transition-colors group-hover:bg-surface-tertiary">
          <Icon className="h-[18px] w-[18px] text-foreground" strokeWidth={1.5} />
        </div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      <div className="space-y-1.5">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {!disabled ? (
        <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-primary">
          Abrir
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
        </div>
      ) : null}
    </div>
  );

  const base = "group flex flex-col rounded-lg border border-border bg-card p-5 transition-colors";

  if (disabled) {
    return <div className={`${base} cursor-not-allowed opacity-60`} aria-disabled>{inner}</div>;
  }

  return (
    <Link
      href={href}
      className={`${base} hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {inner}
    </Link>
  );
}

export default function Home() {
  return (
    <PageShell>
      <section className="mb-10 border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content Gen</p>
        <h1 className="mt-2 max-w-3xl text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Un solo estudio para todo tu contenido con IA.
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-muted-foreground">
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
