import { CostsDashboard } from "@/components/costs-dashboard";
import { PageHeading, PageShell } from "@/components/page-shell";
import { BudgetPanel } from "@/components/automations/budget-panel";

export const dynamic = "force-dynamic";

export default function CostsPage() {
  return (
    <PageShell>
      <PageHeading
       
        title="Costos"
        description="Uso y gasto de modelos, herramientas y proveedores. Tarifas públicas con fuente y fecha; el histórico conserva sus importes originales."
      />
      <CostsDashboard />
      <details className="mt-6 rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">Configurar presupuesto diario, semanal y mensual</summary>
        <div className="mt-4 max-w-lg"><BudgetPanel /></div>
      </details>
    </PageShell>
  );
}
