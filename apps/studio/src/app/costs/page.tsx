import { CostsDashboard } from "@/components/costs-dashboard";
import { PageHeading, PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function CostsPage() {
  return (
    <PageShell>
      <PageHeading
       
        title="Costos"
        description="Uso y gasto de modelos, herramientas y proveedores. Tarifas públicas con fuente y fecha; el histórico conserva sus importes originales."
      />
      <CostsDashboard />
    </PageShell>
  );
}
