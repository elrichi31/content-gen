import { createHash, randomUUID } from "node:crypto";
import { withDatabase, type Database } from "./db.ts";

/**
 * Cola de generaciones que piden los agentes por MCP. Nada que gaste corre hasta que una persona lo
 * aprueba en /queue, y lo aprobado corre de uno en uno: un agente que reintenta por timeout ya no
 * puede lanzar tres videos en paralelo, y lo repetido se devuelve en vez de encolarse otra vez.
 */
export type GenerationStatus = "pendiente" | "aprobada" | "en_curso" | "completada" | "fallida" | "rechazada";
export type GenerationRequest = {
  id: string; tool: string; status: GenerationStatus; createdAt: string; updatedAt: string;
  args: Record<string, unknown>; origin: string;
  log: { at: string; message: string }[];
  result: unknown; error: string | null;
};
type Row = { id: string; tool: string; status: GenerationStatus; data_json: string; created_at: string; updated_at: string };
type Data = Pick<GenerationRequest, "args" | "origin" | "log" | "result" | "error">;

export class GenerationQueueError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const ACTIVE = ["pendiente", "aprobada", "en_curso"] as const;
const fromRow = (row: Row): GenerationRequest => ({ id: row.id, tool: row.tool, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, ...(JSON.parse(row.data_json) as Data) });
// Claves ordenadas: el mismo pedido con los campos en otro orden es el mismo pedido.
const argsKey = (tool: string, args: Record<string, unknown>) => createHash("sha256").update(tool + JSON.stringify(args, Object.keys(args).sort())).digest("hex");
// El FOR UPDATE solo bloquea dentro de una transacción: sin ella dos escrituras del log se pisarían.
async function locked<T>(work: (database: Database) => Promise<T>) {
  return withDatabase(async (database) => {
    await database.exec("BEGIN");
    try { const value = await work(database); await database.exec("COMMIT"); return value; }
    catch (error) { await database.exec("ROLLBACK"); throw error; }
  });
}
const entry = (message: string) => ({ at: new Date().toISOString(), message: message.slice(0, 1000) });

/** Encola un pedido; si ya hay uno igual sin terminar, devuelve ese (`duplicate`) en vez de gastar dos veces. */
export async function enqueueGeneration({ tool, args, origin }: { tool: string; args: Record<string, unknown>; origin: string }) {
  const key = argsKey(tool, args);
  return withDatabase(async (database) => {
    const existing = await database.prepare(`SELECT * FROM generation_requests WHERE args_key = ? AND status IN (${ACTIVE.map(() => "?").join(", ")}) ORDER BY created_at LIMIT 1`).get(key, ...ACTIVE) as Row | undefined;
    if (existing) return { request: fromRow(existing), duplicate: true };
    const now = new Date().toISOString();
    const request: GenerationRequest = { id: randomUUID(), tool, status: "pendiente", createdAt: now, updatedAt: now, args, origin, log: [entry("Encolada; espera aprobación.")], result: null, error: null };
    await database.prepare("INSERT INTO generation_requests (id, tool, status, args_key, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(request.id, tool, request.status, key, JSON.stringify(data(request)), now, now);
    return { request, duplicate: false };
  });
}

const data = ({ args, origin, log, result, error }: GenerationRequest): Data => ({ args, origin, log, result, error });

export async function listGenerationRequests(limit = 50) {
  const rows = await withDatabase(async (database) => await database.prepare("SELECT * FROM generation_requests ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]);
  return rows.map(fromRow);
}

export async function getGenerationRequest(id: string) {
  const row = await withDatabase(async (database) => await database.prepare("SELECT * FROM generation_requests WHERE id = ?").get(id) as Row | undefined);
  if (!row) throw new GenerationQueueError("Solicitud no encontrada.", 404);
  return fromRow(row);
}

/**
 * Cambia el estado solo si sigue en `from`: aprobar dos veces o rechazar algo que ya corre no hace nada.
 * Devuelve null si el estado ya no era el esperado.
 */
async function transition(id: string, from: GenerationStatus, to: GenerationStatus, change: (request: GenerationRequest) => Partial<Data>, message: string) {
  return locked(async (database) => {
    const row = await database.prepare("SELECT * FROM generation_requests WHERE id = ? AND status = ? FOR UPDATE").get(id, from) as Row | undefined;
    if (!row) return null;
    const current = fromRow(row);
    const next: GenerationRequest = { ...current, ...change(current), status: to, updatedAt: new Date().toISOString() };
    next.log = [...next.log, entry(message)];
    const { changes } = await database.prepare("UPDATE generation_requests SET status = ?, data_json = ?, updated_at = ? WHERE id = ? AND status = ?")
      .run(to, JSON.stringify(data(next)), next.updatedAt, id, from);
    return changes ? next : null;
  });
}

export async function decideGeneration(id: string, decision: "approve" | "reject") {
  const decided = await transition(id, "pendiente", decision === "approve" ? "aprobada" : "rechazada", () => ({}), decision === "approve" ? "Aprobada." : "Rechazada; no se gastó nada.");
  if (!decided) {
    const current = await getGenerationRequest(id);
    throw new GenerationQueueError(`La solicitud ya está ${current.status.replace("_", " ")}.`, 409);
  }
  return decided;
}

export async function appendGenerationLog(id: string, message: string) {
  await locked(async (database) => {
    const row = await database.prepare("SELECT * FROM generation_requests WHERE id = ? FOR UPDATE").get(id) as Row | undefined;
    if (!row) return;
    const current = fromRow(row);
    current.log.push(entry(message));
    await database.prepare("UPDATE generation_requests SET data_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data(current)), new Date().toISOString(), id);
  });
}

/** La más antigua aprobada pasa a `en_curso`; null si no hay ninguna. */
export async function claimNextGeneration(): Promise<GenerationRequest | null> {
  const next = await withDatabase(async (database) => await database.prepare("SELECT id FROM generation_requests WHERE status = 'aprobada' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined);
  if (!next) return null;
  return (await transition(next.id, "aprobada", "en_curso", () => ({}), "Generando…")) ?? claimNextGeneration();
}

/** Con `error` queda fallida, pero guarda también el resultado: un video a medias dice qué borrador continuar. */
export async function finishGeneration(id: string, { result = null, error = null }: { result?: unknown; error?: string | null }) {
  return error
    ? transition(id, "en_curso", "fallida", () => ({ result, error: error.slice(0, 1000) }), `Falló: ${error}`)
    : transition(id, "en_curso", "completada", () => ({ result }), "Terminada.");
}

/**
 * Al arrancar el servidor: lo que estaba `en_curso` murió con el proceso anterior. No se reintenta
 * solo porque puede haber gastado a medias; se marca fallida para que una persona decida.
 */
export async function failInterruptedGenerations() {
  const rows = await withDatabase(async (database) => await database.prepare("SELECT id FROM generation_requests WHERE status = 'en_curso'").all() as { id: string }[]);
  for (const { id } of rows) await transition(id, "en_curso", "fallida", () => ({ error: "Interrumpida por un reinicio del servidor." }), "Interrumpida por un reinicio del servidor; revisa la biblioteca antes de pedirla otra vez.");
}
