import { CostsDashboard } from "@/components/costs-dashboard";
import { PageHeading, PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function CostsPage() {
  return (
    <PageShell>
      <PageHeading
        eyebrow="Sistema"
        title="Costos"
        description="Gasto en IA calculado con la tarifa vigente al generar. Los importes se congelan al terminar cada operación: cambiar los precios no reescribe el histórico."
      />
      <CostsDashboard />
    </PageShell>
  );
}
