import { randomUUID } from "node:crypto";
import { addUsage, emptyUsage, priceUsage, totalCost, type Usage } from "@content-gen/domain/cost";
import { dedupeTopics, normalizeGeneratedTopic, RadarTopicError, type RadarRejection, type RadarTopic } from "@content-gen/domain/radar";
import { todayLocal } from "@content-gen/domain/schedule";
import { monthSpend } from "./generation-costs.ts";
import { trackGeneration } from "./generation-runs.ts";
import { openAiModel } from "./openai.ts";
import { loadPricing } from "./pricing.ts";
import { activeRadarRun, beginRadarRun, brandProfiles, expireStaleRuns, finishRadarRun, getRadarRun, listWatchlist, RadarError, recentMemory, saveRunResearch, saveTopics } from "./radar.ts";
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
  const { windowDays, maxTopics, maxSearches, minSources, searchContextSize, verifySources, automatic, verticals: requested } = parsed.data;
  // Se resuelven una sola vez: el registro del gasto y el cálculo del importe tienen que usar el
  // mismo modelo que la llamada, o el histórico diría que costó lo que no costó.
  const researchModel = parsed.data.researchModel ?? openAiModel("research");
  const structuringModel = parsed.data.structuringModel ?? openAiModel("structuring");

  // Dos corridas simultáneas son dos facturas por el mismo trabajo, y en una operación de varios
  // minutos el segundo clic es fácil. Antes de comprobarlo se cierran las corridas que quedaron
  // vivas porque el proceso murió: si no, una sola caída dejaría el radar bloqueado para siempre.
  await expireStaleRuns({ now });
  const active = await activeRadarRun();
  if (active) {
    throw new RadarError(`Ya hay una corrida en marcha desde las ${new Date(active.startedAt).toLocaleTimeString("es")}. Espera a que termine antes de lanzar otra: buscar dos veces lo mismo se paga dos veces.`, 409);
  }

  // Freno de presupuesto (D-10): la corrida automática no arranca si el mes ya se pasó; la manual
  // sí, porque un tope que bloquea el trabajo deliberado acaba desactivado.
  const spend = await monthSpend();
  const overBudget = spend.budget !== null && spend.amount >= spend.budget;
  if (overBudget && automatic) {
    const run = await beginRadarRun({ verticals: [], windowDays });
    const skipped = await finishRadarRun(run.id, { status: "skipped", error: `Presupuesto del mes agotado: ${spend.amount} de ${spend.budget}. La corrida automática no se ejecuta.` });
    return { run: skipped, topics: [], summary: { found: 0, kept: 0, repeated: 0, rejected: 0, insufficientSources: 0, unverified: 0, failedVerticals: [] as string[], searches: { requested: 0, performed: 0 }, skipped: true as const, overBudget } };
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

    // Las notas se guardan **antes** de interpretarlas. Buscar es el ~80% del gasto y ya está
    // pagado: si la estructuración falla, la corrida termina en error pero lo caro se conserva y
    // se puede reinterpretar. Guardarlas solo al final significaba tirarlas justo cuando fallaba.
    await saveRunResearch(run.id, research.map((item) => ({ vertical: item.vertical, notes: item.notes, sources: item.sources, model: item.model })));

    step += 1;
    report({ type: "structure", step, steps });
    const structured = await trackGeneration({ operation: "radar-structure", model: structuringModel }, async () => {
      const done = await structureTopics(research, { maxTopics, recentTitles: memory.titles, minSources, model: structuringModel, request });
      return { value: done, usage: done.usage };
    });

    const { topics: normalized, rejections } = normalizeTopics(structured.topics, { runId: run.id, research, minSources, verifySources, now });

    step += 1;
    report({ type: "saving", step, steps });
    const { fresh, repeated } = dedupeTopics(normalized, { known: memory.fingerprints });
    const saved = await saveTopics(fresh, { now });

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
      summary: {
        found: structured.topics.length,
        kept: saved.inserted,
        repeated: repeated.length + saved.skipped,
        rejected: rejections.malformed.length,
        insufficientSources: rejections["insufficient-sources"].length,
        unverified: rejections.unverified.length,
        failedVerticals: failures,
        // Lo pedido frente a lo hecho: el tope de búsquedas es una petición al modelo y la ignora
        // con frecuencia. Verlo es lo único que avisa de que la palanca no está tirando.
        searches: { requested: maxSearches * research.length, performed: usage.webSearchCalls },
        skipped: false as const,
        overBudget,
      },
    };
  } catch (error) {
    await finishRadarRun(run.id, { status: "failed", error: error instanceof Error ? error.message.slice(0, 1000) : "Error desconocido" });
    throw error;
  }
}

/** Hostname sin `www`, tolerante con lo que no sea una URL: se usa para comparar, no para abrir. */
function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return value.trim().toLowerCase().replace(/^www\./, ""); }
}

/**
 * Algo con forma de dominio dentro de un texto. Las anotaciones de la API no son todo lo que se
 * encontró: el modelo cita medios en el cuerpo de sus notas, y esa mención también prueba que el
 * dominio salió de la búsqueda. Reconocer de más aquí solo hace la comprobación más indulgente,
 * que es el lado correcto por el que equivocarse: rechaza lo inventado sin castigar lo real.
 */
const HOST_IN_TEXT = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24})\b/gi;

type ResearchNotes = { vertical: string; notes: string; sources: { url: string }[] };

function knownHostsOf(item: ResearchNotes) {
  const hosts = new Set(item.sources.map((source) => hostOf(source.url)));
  for (const match of item.notes.matchAll(HOST_IN_TEXT)) hosts.add(match[1]!.toLowerCase().replace(/^www\./, ""));
  return hosts;
}

function evidenceHosts(raw: unknown) {
  const evidence = (raw as { evidence?: unknown } | null)?.evidence;
  if (!Array.isArray(evidence)) return new Set<string>();
  return new Set(evidence.flatMap((item) => {
    const url = (item as { url?: unknown } | null)?.url;
    return typeof url === "string" ? [hostOf(url)] : [];
  }));
}

/**
 * A qué vertical pertenece el tema. Tiene que ser uno de los que se investigaron: una etiqueta
 * inventada haría desaparecer el tema del filtro por el que se buscó.
 *
 * Antes se caía en el primer vertical de la lista, que provocaba justo eso, pero peor: el tema no
 * desaparecía, aparecía donde no era. Ahora manda la etiqueta si se reconoce, y si no, las fuentes
 * —el vertical cuya investigación trajo esos dominios—. Sin ninguna de las dos y con varios
 * verticales en juego se devuelve nulo: perder un tema mal etiquetado es más barato que ensuciar
 * la clasificación de todos los demás.
 */
function verticalOf(raw: unknown, verticals: string[], hostsByVertical: Map<string, Set<string>>) {
  const declared = (raw as { vertical?: unknown } | null)?.vertical;
  if (typeof declared === "string" && declared.trim()) {
    const label = declared.trim().toLowerCase();
    const match = verticals.find((vertical) => vertical.toLowerCase() === label)
      ?? verticals.find((vertical) => label.includes(vertical.toLowerCase()) || vertical.toLowerCase().includes(label));
    if (match) return match;
  }

  const hosts = evidenceHosts(raw);
  if (hosts.size) {
    const ranked = verticals
      .map((vertical) => ({ vertical, hits: [...hosts].filter((host) => hostsByVertical.get(vertical)?.has(host)).length }))
      .sort((a, b) => b.hits - a.hits);
    if (ranked[0]?.hits) return ranked[0].vertical;
  }

  return verticals.length === 1 ? verticals[0]! : null;
}

/**
 * Convierte lo que devolvió el modelo en temas del sistema. Cada uno se valida por separado: uno
 * malformado se descarta sin tumbar a los demás, que ya están pagados.
 *
 * Los descartes se separan por motivo porque significan cosas distintas. «Devolvió basura» es un
 * problema del modelo; «encontró algo que no pudo contrastar» es un hallazgo débil, que a veces
 * interesa ver bajando el umbral; y «citó fuentes que no aparecen en la investigación» es el
 * único que indica invención, y ese conviene mirarlo.
 */
function normalizeTopics(raws: unknown[], { runId, research, minSources, verifySources, now }: { runId: string; research: ResearchNotes[]; minSources: number; verifySources: boolean; now: Date }) {
  const hostsByVertical = new Map(research.map((item) => [item.vertical, knownHostsOf(item)]));
  const known = new Set([...hostsByVertical.values()].flatMap((hosts) => [...hosts]));
  const verticals = research.map((item) => item.vertical);

  const topics: RadarTopic[] = [];
  const rejections: Record<RadarRejection, string[]> = { malformed: [], "insufficient-sources": [], unverified: [] };

  for (const raw of raws) {
    const vertical = verticalOf(raw, verticals, hostsByVertical);
    if (!vertical) {
      rejections.malformed.push("Un tema no dice de qué vertical sale y sus fuentes tampoco lo aclaran.");
      continue;
    }
    try {
      topics.push(normalizeGeneratedTopic(raw, {
        runId,
        vertical,
        today: now,
        makeId: randomUUID,
        minSources,
        // Sin nada contra lo que comparar no se comprueba nada: marcarlo todo como inventado
        // porque la corrida no guardó fuentes sería peor que no comprobar.
        knownHosts: known.size ? known : null,
        // Apagar la comprobación no deja de comprobar: deja de rechazar. Quien revisa sigue viendo
        // qué fuente salió de la búsqueda y cuál no, que es la información que necesita.
        requireVerified: verifySources,
      }));
    } catch (error) {
      const reason = error instanceof RadarTopicError ? error.reason : "malformed";
      rejections[reason].push(error instanceof Error ? error.message : "tema inutilizable");
    }
  }

  return { topics, rejections };
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
  const { maxTopics, minSources, verifySources } = parsed.data;
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

  const { topics: normalized, rejections } = normalizeTopics(structured.topics, { runId: run.id, research: run.research, minSources, verifySources, now });

  const { fresh, repeated } = dedupeTopics(normalized, { known: memory.fingerprints });
  const saved = await saveTopics(fresh, { now });

  return {
    // La corrida original conserva su costo: reinterpretar no reescribe lo que costó buscar.
    runId: run.id,
    topics: fresh,
    cost: restructureCost(structured.usage, structuringModel),
    summary: {
      found: structured.topics.length,
      kept: saved.inserted,
      repeated: repeated.length + saved.skipped,
      rejected: rejections.malformed.length,
      insufficientSources: rejections["insufficient-sources"].length,
      unverified: rejections.unverified.length,
    },
  };
}

function restructureCost(usage: Usage, model: string) {
  try { return priceUsage(usage, { pricing: loadPricing(), model }); }
  catch { return null; }
}
