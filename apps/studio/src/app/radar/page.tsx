import { PageHeading, PageShell } from "@/components/page-shell";
import { RadarBoard } from "@/components/radar-board";

export const dynamic = "force-dynamic";

export default function RadarPage() {
  return (
    <PageShell>
      <PageHeading
        eyebrow="Descubrir"
        title="Radar"
        description="Temas de contenido encontrados buscando en la web los verticales que vende la agencia. El radar propone; decidir qué se produce sigue siendo tuyo."
      />
      <RadarBoard />
    </PageShell>
  );
}
