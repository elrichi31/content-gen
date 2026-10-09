import { GenerationQueue } from "@/components/generation-queue";
import { PageHeading, PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function QueuePage() {
  return (
    <PageShell>
      <PageHeading
        title="Cola de generación"
        description="Lo que piden los agentes por MCP y gasta créditos espera aquí tu aprobación. Lo aprobado se genera de uno en uno, con su registro de pasos."
      />
      <GenerationQueue />
    </PageShell>
  );
}
