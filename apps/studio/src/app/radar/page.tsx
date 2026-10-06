import { PageShell } from "@/components/page-shell";
import { RadarBoard } from "@/components/radar-board";

export const dynamic = "force-dynamic";

export default function RadarPage() {
  return (
    <PageShell>
      <RadarBoard />
    </PageShell>
  );
}
