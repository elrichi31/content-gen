import { PageHeading, PageShell } from "@/components/page-shell";
import { ScheduleCalendar } from "@/components/schedule-calendar";

export const dynamic = "force-dynamic";

export default function SchedulePage() {
  return (
    <PageShell>
      <PageHeading
        eyebrow="Cronograma"
        title="Calendario de publicación"
        description="Define tu cadencia por plataforma y el calendario genera los huecos. Asigna a cada uno una pieza de la biblioteca y marca a mano lo que ya has publicado."
      />
      <ScheduleCalendar />
    </PageShell>
  );
}
