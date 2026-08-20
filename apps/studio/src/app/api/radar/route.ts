import { RADAR_TOPIC_STATUSES, type RadarTopicStatus } from "@content-gen/domain/radar";
import { NextResponse } from "next/server";
import { monthSpend } from "@/lib/generation-costs";
import { openAiModel } from "@/lib/openai";
import { selectableTextModels } from "@/lib/pricing";
import { listRadarRuns, listTopics, listWatchlist, RadarError, topicSummary, TOPIC_SORTS, type TopicSort } from "@/lib/radar";

/** Tope de temas por consulta: la revisión se hace por tandas, no de mil en mil. */
const DEFAULT_LIMIT = 100;

/** Si la tarifa no se puede leer, la pantalla se queda sin selector pero sigue funcionando. */
function models() {
  try {
    return {
      available: selectableTextModels(),
      research: openAiModel("research"),
      structuring: openAiModel("structuring"),
    };
  } catch {
    return { available: [], research: null, structuring: null };
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  if (status && !RADAR_TOPIC_STATUSES.includes(status as RadarTopicStatus)) {
    return NextResponse.json({ error: `Estado desconocido: ${status}.` }, { status: 400 });
  }
  try {
    const requestedSort = params.get("sort");
    const sort: TopicSort = requestedSort && requestedSort in TOPIC_SORTS ? requestedSort as TopicSort : "score";
    const topics = await listTopics({
      status: (status as RadarTopicStatus | null) ?? undefined,
      vertical: params.get("vertical") ?? undefined,
      runId: params.get("runId") ?? undefined,
      sort,
      limit: Number(params.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
    });
    // Los contadores salen de todo el histórico, no del filtro: son para navegar entre estados y
    // tienen que seguir visibles cuando el filtro actual no devuelve nada. Los cuenta SQLite sobre
    // la columna, en vez de leer y parsear quinientos documentos en cada carga de la pantalla.
    const summary = await topicSummary();
    return NextResponse.json({
      topics,
      counts: summary.counts,
      verticals: summary.verticals,
      watchlist: await listWatchlist(),
      runs: await listRadarRuns({ limit: 10 }),
      // La pantalla necesita saber qué modelos puede ofrecer y cuáles vienen por defecto.
      models: models(),
      // El gasto del mes va **antes** de correr: avisar después de gastar no es avisar.
      spend: await monthSpend().catch(() => null),
      truncated: topics.length >= (Number(params.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron leer los temas.", topics: [] }, { status: error instanceof RadarError ? error.status : 500 });
  }
}
