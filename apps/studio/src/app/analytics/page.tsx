import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { PageHeading, PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tiktok?: string; message?: string }> }) {
  // Al volver del OAuth de TikTok el callback deja el resultado en la URL.
  const { tiktok, message } = await searchParams;
  const flash = tiktok === "connected" ? "TikTok conectado. Pulsa «Sincronizar» para traer tus estadísticas." : tiktok === "error" ? message ?? "No se pudo conectar TikTok." : undefined;

  return (
    <PageShell>
      <PageHeading
        eyebrow="Métricas"
        title="Rendimiento"
        description="Datos de Search Console, Google Analytics y TikTok guardados en local. La sincronización reprocesa los últimos días para recoger la consolidación tardía."
      />
      <AnalyticsDashboard initialPlatform={tiktok ? "tiktok" : undefined} flash={flash} />
    </PageShell>
  );
}
