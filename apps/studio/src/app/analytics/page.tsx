import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { PageHeading, PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  return (
    <PageShell>
      <PageHeading
        eyebrow="Métricas"
        title="Rendimiento"
        description="Datos de Search Console y Google Analytics guardados en local. La sincronización reprocesa los últimos días para recoger la consolidación tardía."
      />
      <AnalyticsDashboard />
    </PageShell>
  );
}
