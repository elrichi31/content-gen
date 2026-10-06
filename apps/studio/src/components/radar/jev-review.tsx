import type { JevObservation } from "@content-gen/domain/radar";

const LABELS = { keep: "Encaja", review: "Revisar", duplicate: "Posible repetido", "off-topic": "Posible desvío del enfoque" };

/** Compact, advisory disclosure. No new approval/destructive actions. */
export function JevRadarReview({ observation }: { observation?: JevObservation | null }) {
  if (!observation) return null;
  if (observation.status === "failed") return <p className="mb-4 text-xs text-muted-foreground" role="status">JEV sin evaluación. {observation.error} El Radar continuó normalmente.</p>;
  const flagged = observation.decisions.filter(decision => decision.recommendation !== "keep").length;
  return <details className="mb-4 rounded-lg border border-border text-[13px]">
    <summary className="min-h-11 cursor-pointer rounded-lg px-3 py-3 font-medium focus-visible:outline-2 focus-visible:outline-ring">
      JEV · Observación <span className="font-normal text-muted-foreground">· {observation.decisions.length} temas evaluados · {flagged} por revisar</span>
    </summary>
    <div className="space-y-3 border-t border-border px-3 py-3">
      <p className="text-xs text-muted-foreground">No se descartó ni modificó ningún tema. Son señales del modelo, no hechos verificados. Comparación con {observation.comparedTitles} títulos recientes{observation.omitted ? ` · ${observation.omitted} temas sin evaluar` : ""}.</p>
      <ul className="divide-y divide-border">
        {observation.decisions.map(decision => <li key={decision.topicId} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <div className="min-w-0"><p className="break-words font-medium">{decision.title}</p><p className="text-xs tabular-nums text-muted-foreground">Relevancia {Math.round(decision.relevance * 100)}% · Repetición {Math.round(decision.duplicate * 100)}%</p></div>
          <span className="shrink-0 text-xs">{LABELS[decision.recommendation]}</span>
        </li>)}
      </ul>
    </div>
  </details>;
}
