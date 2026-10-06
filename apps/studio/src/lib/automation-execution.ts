import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { assertAutomationBudget, BudgetError } from "./budget-settings.ts";
import { databasePool, withDatabase } from "./db.ts";

export const automationContext = new AsyncLocalStorage<{ runId: string; automatic: boolean }>();
export type AutomationExecution = {
  id: string; automationId: string; kind: "carousel" | "radar";
  status: "running" | "completed" | "idle" | "failed" | "blocked";
  startedAt: string; completedAt: string | null; durationMs: number | null;
  automatic: boolean;
  result: Record<string, unknown>; error: string | null;
  amount: number; unknown: number;
  operations: { id: string; operation: string; provider: string; model: string | null; status: string; amount: number | null }[];
};

/** Candado de sesión Postgres: evita pagar dos ejecuciones de la misma regla en réplicas distintas. */
export async function executeAutomation<T extends Record<string, unknown>>(automationId: string, kind: "carousel" | "radar", automatic: boolean, work: () => Promise<T>): Promise<T> {
  const lock = await databasePool().connect();
  let acquired = false;
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const start = Date.now();
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [`automation:${kind}:${automationId}`])).rows[0].locked;
    if (!acquired) throw Object.assign(new Error("Esta automatización ya se está ejecutando."), { status: 409 });
    // El proceso pudo morir: no fingir que aquella ejecución terminó bien.
    await lock.query("UPDATE automation_runs SET status='failed', completed_at=$1, data_json=$2 WHERE automation_id=$3 AND kind=$4 AND status='running'", [startedAt, JSON.stringify({ result: {}, error: "El proceso se interrumpió antes de registrar el resultado." }), automationId, kind]);
    await lock.query("INSERT INTO automation_runs (id,automation_id,kind,status,started_at,data_json) VALUES ($1,$2,$3,'running',$4,$5)", [id, automationId, kind, startedAt, JSON.stringify({ result: {}, error: null, automatic })]);
    try {
      const result = await automationContext.run({ runId: id, automatic }, async () => {
        if (automatic) await assertAutomationBudget();
        return work();
      });
      const status = result.status === "idle" ? "idle" : "completed";
      await lock.query("UPDATE automation_runs SET status=$1,completed_at=$2,data_json=$3 WHERE id=$4", [status, new Date().toISOString(), JSON.stringify({ result, error: null, durationMs: Date.now() - start, automatic }), id]);
      return result;
    } catch (error) {
      await lock.query("UPDATE automation_runs SET status=$1,completed_at=$2,data_json=$3 WHERE id=$4", [error instanceof BudgetError ? "blocked" : "failed", new Date().toISOString(), JSON.stringify({ result: {}, error: error instanceof Error ? error.message : "Falló la ejecución.", durationMs: Date.now() - start, automatic }), id]);
      throw error;
    }
  } finally {
    try { if (acquired) await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [`automation:${kind}:${automationId}`]); }
    finally { lock.release(); }
  }
}

export async function listAutomationRuns(automationId: string, limit = 20): Promise<AutomationExecution[]> {
  return withDatabase(async (db) => {
    const rows = await db.prepare("SELECT id,automation_id,kind,status,started_at,completed_at,data_json FROM automation_runs WHERE automation_id=? ORDER BY started_at DESC LIMIT ?").all(automationId, Math.min(50, Math.max(1, limit))) as { id: string; automation_id: string; kind: AutomationExecution["kind"]; status: AutomationExecution["status"]; started_at: string; completed_at: string | null; data_json: string }[];
    if (!rows.length) return [];
    const operations = await db.prepare(`SELECT id,automation_run_id,operation,provider,status,cost_amount,data_json FROM generation_runs WHERE automation_run_id IN (${rows.map(() => "?").join(",")}) ORDER BY created_at ASC`).all(...rows.map((r) => r.id)) as { id: string; automation_run_id: string; operation: string; provider: string; status: string; cost_amount: number | null; data_json: string }[];
    return rows.map((row) => {
      const data = JSON.parse(row.data_json);
      const own = operations.filter((o) => o.automation_run_id === row.id);
      return { id: row.id, automationId: row.automation_id, kind: row.kind, status: row.status, startedAt: row.started_at, completedAt: row.completed_at, automatic: data.automatic === true, result: data.result ?? {}, error: data.error ?? null, durationMs: data.durationMs ?? null,
        amount: Math.round(own.reduce((sum, o) => sum + (o.cost_amount ?? 0), 0) * 1e6) / 1e6,
        unknown: own.filter((o) => o.cost_amount === null).length,
        operations: own.map((o) => ({ id: o.id, operation: o.operation, provider: o.provider, status: o.status, amount: o.cost_amount, model: JSON.parse(o.data_json).model ?? null })) };
    });
  });
}
