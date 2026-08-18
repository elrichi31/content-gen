import { randomUUID } from "node:crypto";
import { addUsage, emptyUsage, priceUsage, totalCost, type Usage } from "@content-gen/domain/cost";
import { dedupeTopics, normalizeGeneratedTopic, type RadarTopic } from "@content-gen/domain/radar";
import { todayLocal } from "@content-gen/domain/schedule";
import { monthSpend } from "./generation-costs.ts";
import { trackGeneration } from "./generation-runs.ts";
import { openAiModel } from "./openai.ts";
import { loadPricing } from "./pricing.ts";
import { beginRadarRun, brandProfiles, finishRadarRun, getRadarRun, listWatchlist, RadarError, recentMemory, saveTopics } from "./radar.ts";
import { radarScanInputSchema, researchVertical, structureTopics, type VerticalResearch } from "./radar-research.ts";

/**
 * Avisos de progreso. La corrida tarda minutos —cada búsqueda por vertical son ~90 segundos— y sin
 * señales parece colgada. Los pasos son reales y se conocen de antemano: un vertical, otro
 * vertical, estructurar, guardar. Nada de mensajes rotando que finjan actividad.
 */
export type RadarProgress =
  | { type: "start"; verticals: string[]; steps: number }
  | { type: "research"; vertical: string; step: number; steps: number }
  | { type: "research-done"; vertical: string; searches: number; step: number; steps: number }
  | { type: "research-failed"; vertical: string; reason: string; step: number; steps: number }
  | { type: "structure"; step: number; steps: number }
  | { type: "saving"; step: number; steps: number };

/**
 * Una corrida del radar de principio a fin. El coste se registra por partes —cada investigación es
 * su propia operación— y además se agrega en la corrida, que es la unidad que interesa comparar
 * contra el valor obtenido: el costo por tema aprobado.
 */
export async function scanRadar(input: unknown = {}, { request = fetch, now = new Date(), onProgress }: { request?: typeof fetch; now?: Date; onProgress?: (event: RadarProgress) => void } = {}) {
  const parsed = radarScanInputSchema.safeParse(input);
  if (!parsed.success) throw new RadarError(`La solicitud de corrida no es válida: ${parsed.error.issues[0]?.message}`, 400);
  const { windowDays, maxTopics, maxSearches, minSources, searchContextSize, automatic, verticals: requested } = parsed.data;
  // Se resuelven una sola vez: el registro del gasto y el cálculo del importe tienen que usar el
  // mismo modelo que la llamada, o el histórico diría que costó lo que no costó.
  const researchModel = parsed.data.researchModel ?? openAiModel("research");
  const structuringModel = parsed.data.structuringModel ?? openAiModel("structuring");

  // Freno de presupuesto (D-10): la corrida automática no arranca si el mes ya se pasó; la manual
  // sí, porque un tope que bloquea el trabajo deliberado acaba desactivado.
  const spend = await monthSpend();
  const overBudget = spend.budget !== null && spend.amount >= spend.budget;
  if (overBudget && automatic) {
    const run = await beginRadarRun({ verticals: [], windowDays });
    const skipped = await finishRadarRun(run.id, { status: "skipped", error: `Presupuesto del mes agotado: ${spend.amount} de ${spend.budget}. La corrida automática no se ejecuta.` });
    return { run: skipped, topics: [], summary: { found: 0, kept: 0, repeated: 0, rejected: 0, insufficientSources: 0, failedVerticals: [] as string[], skipped: true as const, overBudget } };
  }

  const watchlist = (await listWatchlist({ onlyActive: true }))
    .filter((entry) => !requested.length || requested.includes(entry.vertical));
  if (!watchlist.length) {
    throw new RadarError(
      requested.length
        ? "Ninguno de los verticales pedidos está activo en la lista de vigilancia."
        : "No hay verticales activos que vigilar: añade alguno a la lista de vigilancia.",
      400,
    );
  }

  const memory = await recentMemory({ now });
  const today = todayLocal(now);
  const brands = await brandProfiles(watchlist.map((entry) => entry.brandKitId));
  const run = await beginRadarRun({ verticals: watchlist.map((entry) => entry.vertical), windowDays });

  // Un paso por vertical, más estructurar, más guardar.
  const steps = watchlist.length + 2;
  const report = (event: RadarProgress) => { try { onProgress?.(event); } catch { /* informar no puede tumbar la corrida */ } };
  report({ type: "start", verticals: watchlist.map((entry) => entry.vertical), steps });

  try {
    // Una búsqueda por vertical, no por tema: es la decisión que más pesa en la factura.
    const research: VerticalResearch[] = [];
    const failures: string[] = [];
    let step = 0;
    for (const entry of watchlist) {
      step += 1;
      report({ type: "research", vertical: entry.vertical, step, steps });
      try {
        const done = await trackGeneration({ operation: "radar-research", model: researchModel }, async () => {
          const brand = entry.brandKitId ? brands.get(entry.brandKitId) ?? null : null;
          const result = await researchVertical(entry, { windowDays, today, recentTitles: memory.titles, brand, maxSearches, minSources, searchContextSize, model: researchModel, request });
          return { value: result, usage: result.usage };
        });
        research.push(done);
        report({ type: "research-done", vertical: entry.vertical, searches: done.usage.webSearchCalls, step, steps });
      } catch (error) {
        // Un vertical caído no debe tirar la corrida entera ni perder lo ya investigado y pagado.
        const reason = error instanceof Error ? error.message : "error desconocido";
        failures.push(`${entry.vertical}: ${reason}`);
        report({ type: "research-failed", vertical: entry.vertical, reason, step, steps });
      }
    }
    if (!research.length) throw new RadarError(`Ningún vertical se pudo investigar. ${failures.join(" | ")}`, 502);

    step += 1;
    report({ type: "structure", step, steps });
    const structured = await trackGeneration({ operation: "radar-structure", model: structuringModel }, async () => {
      const done = await structureTopics(research, { maxTopics, recentTitles: memory.titles, minSources, model: structuringModel, request });
      return { value: done, usage: done.usage };
    });

    // Cada tema se valida por separado: uno malformado se descarta, no tumba a los demás.
    const normalized: RadarTopic[] = [];
    const rejected: string[] = [];
    const insufficient: string[] = [];
    for (const raw of structured.topics) {
      const vertical = verticalOf(raw, watchlist.map((entry) => entry.vertical));
      try { normalized.push(normalizeGeneratedTopic(raw, { runId: run.id, vertical, today: now, makeId: randomUUID, minSources })); }
      catch (error) {
        const message = error instanceof Error ? error.message : "tema inutilizable";
        // Se separan los descartes por falta de corroboración: significan «el modelo encontró algo
        // pero no lo pudo contrastar», que es información distinta de «devolvió basura».
        (message.includes("fuente(s) independiente(s)") ? insufficient : rejected).push(message);
      }
    }

    step += 1;
    report({ type: "saving", step, steps });
    const { fresh, repeated } = dedupeTopics(normalized, { known: memory.fingerprints });
    const saved = await saveTopics(fresh);

    const usage = addUsage(...research.map((item) => item.usage), structured.usage);
    return {
      run: await finishRadarRun(run.id, {
        status: "completed",
        topicsFound: structured.topics.length,
        topicsKept: saved.inserted,
        // Lo caro ya está pagado: guardarlo permite reinterpretarlo después con otro modelo.
        research: research.map((item) => ({ vertical: item.vertical, notes: item.notes, sources: item.sources, model: item.model })),
        usage,
        cost: runCost(research.map((item) => item.usage), structured.usage, { researchModel, structuringModel }),
        error: failures.length ? `Verticales fallidos — ${failures.join(" | ")}`.slice(0, 1000) : null,
      }),
      // Se informa de todo lo que se cayó por el camino: una corrida que guarda 2 de 10 temas no
      // es lo mismo que una que encontró 2, y la diferencia decide si el radar vale lo que cuesta.
      topics: fresh,
      summary: { found: structured.topics.length, kept: saved.inserted, repeated: repeated.length + saved.skipped, rejected: rejected.length, insufficientSources: insufficient.length, failedVerticals: failures, skipped: false as const, overBudget },
    };
  } catch (error) {
    await finishRadarRun(run.id, { status: "failed", error: error instanceof Error ? error.message.slice(0, 1000) : "Error desconocido" });
    throw error;
  }
}

/**
 * El vertical del tema debe ser uno de los que se buscaron: si el modelo devuelve una etiqueta
 * inventada, el tema desaparecería del filtro por el que se pidió.
 */
function verticalOf(raw: unknown, verticals: string[]) {
  const declared = (raw as { vertical?: unknown } | null)?.vertical;
  if (typeof declared === "string") {
    const match = verticals.find((vertical) => vertical.toLowerCase() === declared.trim().toLowerCase());
    if (match) return match;
  }
  return verticals[0]!;
}

/**
 * Importe de la corrida. Se tarifa cada parte con **su** modelo y luego se suma: investigar y
 * estructurar pueden usar modelos distintos a propósito (T-15), y aplicar una sola tarifa al total
 * daría un número que no es el de ninguno de los dos.
 *
 * Igual que en las generaciones, una tarifa ilegible no invalida lo que ya se gastó.
 */
function runCost(research: Usage[], structuring: Usage, { researchModel, structuringModel }: { researchModel: string; structuringModel: string }) {
  try {
    const pricing = loadPricing();
    const parts = [
      ...research.map((usage) => priceUsage(usage, { pricing, model: researchModel })),
      priceUsage(structuring, { pricing, model: structuringModel }),
    ];
    const total = totalCost(parts, { currency: pricing.currency });
    // Si alguna parte quedó sin tarifar, el total sería un mínimo disfrazado de cifra exacta.
    const missing = [...new Set(parts.flatMap((part) => part.missing))];
    return { amount: total.untariffed ? null : total.amount, currency: pricing.currency, pricingVersion: pricing.version, missing };
  } catch { return null; }
}

/**
 * Reinterpreta las notas ya guardadas de una corrida, sin volver a buscar.
 *
 * Separar recolectar de interpretar es lo que abarata de verdad el radar: la búsqueda es el ~80%
 * del costo y una vez pagada queda en la base, así que probar otro modelo, otro umbral de fuentes
 * o pedir más temas cuesta solo la llamada de estructuración —céntimos con un modelo barato—.
 *
 * Los temas que ya existan no se duplican: la huella los filtra igual que en una corrida normal.
 */
export async function restructureRun(runId: string, input: unknown = {}, { request = fetch, now = new Date() }: { request?: typeof fetch; now?: Date } = {}) {
  const parsed = radarScanInputSchema.safeParse(input);
  if (!parsed.success) throw new RadarError(`La solicitud no es válida: ${parsed.error.issues[0]?.message}`, 400);
  const { maxTopics, minSources } = parsed.data;
  const structuringModel = parsed.data.structuringModel ?? openAiModel("structuring");

  const run = await getRadarRun(runId);
  if (!run.research.length) {
    throw new RadarError("Esa corrida no guardó notas de investigación: solo se pueden reinterpretar las posteriores a esta función.", 400);
  }

  const memory = await recentMemory({ now });
  const research = run.research.map((item) => ({ ...item, usage: emptyUsage(), model: item.model ?? null })) as unknown as VerticalResearch[];

  const structured = await trackGeneration({ operation: "radar-restructure", model: structuringModel }, async () => {
    const done = await structureTopics(research, { maxTopics, recentTitles: memory.titles, minSources, model: structuringModel, request });
    return { value: done, usage: done.usage };
  });

  const normalized: RadarTopic[] = [];
  const rejected: string[] = [];
  const insufficient: string[] = [];
  for (const raw of structured.topics) {
    const vertical = verticalOf(raw, run.verticals);
    try { normalized.push(normalizeGeneratedTopic(raw, { runId: run.id, vertical, today: now, makeId: randomUUID, minSources })); }
    catch (error) {
      const message = error instanceof Error ? error.message : "tema inutilizable";
      (message.includes("fuente(s) independiente(s)") ? insufficient : rejected).push(message);
    }
  }

  const { fresh, repeated } = dedupeTopics(normalized, { known: memory.fingerprints });
  const saved = await saveTopics(fresh);

  return {
    // La corrida original conserva su costo: reinterpretar no reescribe lo que costó buscar.
    runId: run.id,
    topics: fresh,
    cost: restructureCost(structured.usage, structuringModel),
    summary: { found: structured.topics.length, kept: saved.inserted, repeated: repeated.length + saved.skipped, rejected: rejected.length, insufficientSources: insufficient.length },
  };
}

function restructureCost(usage: Usage, model: string) {
  try { return priceUsage(usage, { pricing: loadPricing(), model }); }
  catch { return null; }
}
