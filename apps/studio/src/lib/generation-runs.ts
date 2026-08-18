import { randomUUID } from "node:crypto";
import { priceUsage, type Usage } from "@content-gen/domain/cost";
import { generationRunSchema } from "@content-gen/domain/schemas";
import { withDatabase } from "./db.ts";
import { loadPricing } from "./pricing.ts";

export class GenerationRunError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

type Provider = "openai" | "unsplash" | "elevenlabs" | "local";

/**
 * Abre el registro de una operación de IA. `contentItemId` puede ser nulo: la investigación del
 * radar no pertenece a ninguna pieza y es justamente el gasto que interesa medir aparte.
 */
export async function beginGenerationRun({ contentItemId = null, radarTopicId = null, operation, model, provider = "openai" }: { contentItemId?: string | null; radarTopicId?: string | null; operation: string; model: string | null; provider?: Provider }) {
  const now = new Date().toISOString();
  const run = generationRunSchema.parse({ id: randomUUID(), schemaVersion: 1, contentItemId, radarTopicId, provider, status: "running", createdAt: now, completedAt: null, error: null, operation, model, durationMs: null, usage: null, cost: null });
  await withDatabase((database) => {
    if (run.contentItemId) {
      const content = database.prepare("SELECT id FROM content_items WHERE id = ? AND archived_at IS NULL").get(run.contentItemId);
      if (!content) throw new GenerationRunError("La pieza para registrar la generación no existe o está archivada.", 404);
    }
    database
      .prepare("INSERT INTO generation_runs (id, schema_version, content_item_id, radar_topic_id, operation, provider, status, cost_amount, data_json, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)")
      .run(run.id, run.schemaVersion, run.contentItemId, run.radarTopicId, run.operation, run.provider, run.status, JSON.stringify(run), now);
  });
  return run;
}

/**
 * Cierra el registro y **congela** el importe con la tarifa vigente. No se recalcula nunca: los
 * precios cambian y un histórico que se reescribe solo deja de servir para auditar (D-03).
 */
export async function finishGenerationRun(id: string, { durationMs, error = null, usage = null }: { durationMs: number; error?: string | null; usage?: Usage | null }) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM generation_runs WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!row) throw new GenerationRunError("Registro de generación no encontrado.", 404);
  const previous = JSON.parse(row.data_json) as { model: string | null };
  const completedAt = new Date().toISOString();
  const run = generationRunSchema.parse({
    ...previous,
    status: error ? "failed" : "completed",
    completedAt,
    error: error?.slice(0, 1000) ?? null,
    durationMs: Math.max(0, Math.round(durationMs)),
    usage,
    cost: usage ? cost(usage, previous.model) : null,
  });
  await withDatabase((database) => database
    .prepare("UPDATE generation_runs SET data_json = ?, status = ?, cost_amount = ?, completed_at = ? WHERE id = ?")
    .run(JSON.stringify(run), run.status, run.cost?.amount ?? null, completedAt, id));
  return run;
}

/**
 * Envuelve una operación de IA para que quede registrada pase lo que pase. Evita repetir el
 * mismo try/catch en cada ruta, que es como se acaba perdiendo justo el registro de los fallos.
 */
export async function trackGeneration<T>(
  meta: { contentItemId?: string | null; radarTopicId?: string | null; operation: string; model: string | null; provider?: Provider },
  work: () => Promise<{ value: T; usage?: Usage | null }>,
): Promise<T> {
  const startedAt = Date.now();
  const run = await beginGenerationRun(meta);
  try {
    const { value, usage = null } = await work();
    await close(run.id, { durationMs: Date.now() - startedAt, usage });
    return value;
  } catch (error) {
    await close(run.id, { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Error desconocido" });
    throw error;
  }
}

/** Cerrar el registro nunca debe tapar el error real de la generación ni provocar uno nuevo. */
async function close(id: string, options: { durationMs: number; error?: string | null; usage?: Usage | null }) {
  try { await finishGenerationRun(id, options); }
  catch { /* el registro se queda en `running`; la pantalla de costos lo muestra como incompleto */ }
}

/**
 * Una tarifa ilegible no puede tumbar una generación que el proveedor ya cobró: se registra sin
 * importe y `check:env` avisa de lo que falta.
 */
function cost(usage: Usage, model: string | null) {
  try { return priceUsage(usage, { pricing: loadPricing(), model }); }
  catch { return null; }
}
