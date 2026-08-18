import { randomUUID } from "node:crypto";
import {
  canTransition,
  radarRunSchema,
  radarTopicSchema,
  radarWatchlistSchema,
  type RadarRun,
  type RadarTopic,
  type RadarTopicStatus,
  type RadarWatchlistEntry,
} from "@content-gen/domain/radar";
import type { BrandKit } from "@content-gen/domain/schemas";
import { withDatabase } from "./db.ts";

export class RadarError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

type Row = { data_json: string };
const parseRows = <T>(rows: unknown[]) => (rows as Row[]).map((row) => JSON.parse(row.data_json) as T);

function invalid(subject: string, error: { issues: { path: (string | number)[]; message: string }[] }) {
  const issue = error.issues[0];
  return new RadarError(`${subject} inválido: ${[issue?.path.join("."), issue?.message].filter(Boolean).join(" ")}`, 400);
}

/* ------------------------------ Vigilancia ------------------------------ */

export async function listWatchlist({ onlyActive = false }: { onlyActive?: boolean } = {}) {
  const where = onlyActive ? "WHERE active = 1" : "";
  return withDatabase((database) => parseRows<RadarWatchlistEntry>(database
    .prepare(`SELECT data_json FROM radar_watchlist ${where} ORDER BY priority ASC, vertical ASC`)
    .all()));
}

/**
 * El perfil de negocio de la marca a la que pertenece el vertical, si tiene una. Es lo que permite
 * que la búsqueda hable de un negocio concreto sin repetir su descripción en cada vertical.
 */
export async function brandProfiles(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((value): value is string => Boolean(value)))];
  if (!unique.length) return new Map<string, BrandKit>();
  const rows = await withDatabase((database) => database
    .prepare(`SELECT data_json FROM brand_kits WHERE archived_at IS NULL AND id IN (${unique.map(() => "?").join(", ")})`)
    .all(...unique) as Row[]);
  return new Map(rows.map((row) => {
    const brand = JSON.parse(row.data_json) as BrandKit;
    return [brand.id, brand];
  }));
}

/** La marca se valida en código: `ALTER TABLE` no sabe añadir claves foráneas en SQLite. */
async function assertBrandKit(brandKitId: string | null) {
  if (!brandKitId) return;
  const brand = await withDatabase((database) => database.prepare("SELECT id FROM brand_kits WHERE id = ? AND archived_at IS NULL").get(brandKitId));
  if (!brand) throw new RadarError("La marca no existe o está archivada.", 400);
}

export async function createWatchlistEntry(input: unknown) {
  const now = new Date().toISOString();
  const parsed = radarWatchlistSchema.safeParse({ ...(input as object), id: randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now });
  if (!parsed.success) throw invalid("El vertical", parsed.error);
  const entry = parsed.data;
  await assertBrandKit(entry.brandKitId);
  await withDatabase((database) => {
    // El vertical es único: dos filas iguales significarían pagar dos veces la misma búsqueda.
    const existing = database.prepare("SELECT id FROM radar_watchlist WHERE vertical = ?").get(entry.vertical);
    if (existing) throw new RadarError(`El vertical «${entry.vertical}» ya está en la lista de vigilancia.`, 409);
    database
      .prepare("INSERT INTO radar_watchlist (id, schema_version, vertical, active, priority, brand_kit_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(entry.id, 1, entry.vertical, entry.active ? 1 : 0, entry.priority, entry.brandKitId, JSON.stringify(entry), now, now);
  });
  return entry;
}

/** Quitar un vertical de la vigilancia no borra los temas que ya trajo (D-09). */
export async function deleteWatchlistEntry(id: string) {
  const removed = await withDatabase((database) => (database.prepare("DELETE FROM radar_watchlist WHERE id = ?").run(id) as { changes: number }).changes);
  if (!removed) throw new RadarError("El vertical no existe.", 404);
  return { id };
}

export async function updateWatchlistEntry(id: string, patch: Record<string, unknown>) {
  const current = (await listWatchlist()).find((entry) => entry.id === id);
  if (!current) throw new RadarError("El vertical no existe.", 404);
  const changes = { ...patch };
  delete changes.id;
  delete changes.createdAt;
  const parsed = radarWatchlistSchema.safeParse({ ...current, ...changes, id: current.id, schemaVersion: 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
  if (!parsed.success) throw invalid("El vertical", parsed.error);
  const entry = parsed.data;
  await assertBrandKit(entry.brandKitId);
  await withDatabase((database) => database
    .prepare("UPDATE radar_watchlist SET vertical = ?, active = ?, priority = ?, brand_kit_id = ?, data_json = ?, updated_at = ? WHERE id = ?")
    .run(entry.vertical, entry.active ? 1 : 0, entry.priority, entry.brandKitId, JSON.stringify(entry), entry.updatedAt, id));
  return entry;
}

/* -------------------------------- Corridas -------------------------------- */

export async function beginRadarRun({ verticals, windowDays }: { verticals: string[]; windowDays: number }) {
  const now = new Date().toISOString();
  const run = radarRunSchema.parse({ id: randomUUID(), schemaVersion: 1, status: "running", startedAt: now, verticals, windowDays });
  await withDatabase((database) => database
    .prepare("INSERT INTO radar_runs (id, schema_version, status, started_at, completed_at, cost_amount, data_json, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)")
    .run(run.id, 1, run.status, now, JSON.stringify(run), now));
  return run;
}

export async function finishRadarRun(id: string, patch: Partial<Pick<RadarRun, "status" | "error" | "usage" | "cost" | "topicsFound" | "topicsKept" | "research">>) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM radar_runs WHERE id = ?").get(id) as Row | undefined);
  if (!row) throw new RadarError("La corrida no existe.", 404);
  const completedAt = new Date().toISOString();
  const run = radarRunSchema.parse({ ...JSON.parse(row.data_json), ...patch, completedAt });
  await withDatabase((database) => database
    .prepare("UPDATE radar_runs SET status = ?, completed_at = ?, cost_amount = ?, data_json = ? WHERE id = ?")
    .run(run.status, completedAt, run.cost?.amount ?? null, JSON.stringify(run), id));
  return run;
}

export async function getRadarRun(id: string) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM radar_runs WHERE id = ?").get(id) as Row | undefined);
  if (!row) throw new RadarError("La corrida no existe.", 404);
  return JSON.parse(row.data_json) as RadarRun;
}

export async function listRadarRuns({ limit = 20 }: { limit?: number } = {}) {
  return withDatabase((database) => parseRows<RadarRun>(database
    .prepare("SELECT data_json FROM radar_runs ORDER BY started_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(200, limit)))));
}

/* --------------------------------- Temas --------------------------------- */

/**
 * Guarda los temas de una corrida. La huella es la defensa contra el duplicado, pero se comprueba
 * aquí y no con un índice único: un tema repetido no es un error que deba abortar la corrida, es
 * simplemente un tema que no se guarda.
 */
export async function saveTopics(topics: RadarTopic[]) {
  if (!topics.length) return { inserted: 0, skipped: 0 };
  return withDatabase((database) => {
    const exists = database.prepare("SELECT 1 FROM radar_topics WHERE fingerprint = ?");
    const insert = database.prepare("INSERT INTO radar_topics (id, schema_version, run_id, vertical, status, score, fingerprint, origin, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    let inserted = 0;
    let skipped = 0;
    for (const topic of topics) {
      if (exists.get(topic.fingerprint)) { skipped += 1; continue; }
      insert.run(topic.id, 1, topic.runId, topic.vertical, topic.status, topic.score, topic.fingerprint, topic.origin, JSON.stringify(topic), topic.createdAt, topic.updatedAt);
      inserted += 1;
    }
    return { inserted, skipped };
  });
}

/**
 * Orden de la revisión. Por puntuación se atiende primero lo que más probablemente valga; por
 * fecha se ve lo último que trajo el radar, que es lo que interesa al revisar una corrida recién
 * hecha. El desempate cruzado mantiene el orden estable entre recargas.
 */
export const TOPIC_SORTS = { score: "score DESC, created_at DESC", recent: "created_at DESC, score DESC", oldest: "created_at ASC, score DESC" } as const;
export type TopicSort = keyof typeof TOPIC_SORTS;

export async function listTopics({ status, vertical, runId, sort = "score", limit = 100 }: { status?: RadarTopicStatus; vertical?: string; runId?: string; sort?: TopicSort; limit?: number } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (status) { clauses.push("status = ?"); params.push(status); }
  if (vertical) { clauses.push("vertical = ?"); params.push(vertical); }
  if (runId) { clauses.push("run_id = ?"); params.push(runId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // El orden sale de una tabla fija, nunca del parámetro: es lo único que impide inyectar SQL.
  const order = TOPIC_SORTS[sort] ?? TOPIC_SORTS.score;
  return withDatabase((database) => parseRows<RadarTopic>(database
    .prepare(`SELECT data_json FROM radar_topics ${where} ORDER BY ${order} LIMIT ?`)
    .all(...params, Math.max(1, Math.min(500, limit)))));
}

export async function getTopic(id: string) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM radar_topics WHERE id = ?").get(id) as Row | undefined);
  if (!row) throw new RadarError("El tema no existe.", 404);
  return JSON.parse(row.data_json) as RadarTopic;
}

/** Cambia el estado del tema. Nada se borra: un descarte es información, no una supresión (D-09). */
export async function setTopicStatus(id: string, status: RadarTopicStatus) {
  const current = await getTopic(id);
  if (!canTransition(current.status, status)) throw new RadarError(`Un tema «${current.status}» no puede pasar a «${status}».`, 409);
  const topic = radarTopicSchema.parse({ ...current, status, updatedAt: new Date().toISOString() });
  await withDatabase((database) => database
    .prepare("UPDATE radar_topics SET status = ?, data_json = ?, updated_at = ? WHERE id = ?")
    .run(topic.status, JSON.stringify(topic), topic.updatedAt, id));
  return topic;
}

/* ---------------------------- Memoria reciente ---------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que la corrida anterior ya trajo. Las huellas filtran de forma exacta al guardar; los
 * titulares se le pasan al modelo, que sí puede darse cuenta de que dos redacciones distintas
 * cuentan lo mismo (T-16).
 *
 * Incluye los descartados a propósito: son memoria negativa, para no volver a proponerlos.
 */
export async function recentMemory({ weeks = 8, limit = 60, now = new Date() }: { weeks?: number; limit?: number; now?: Date } = {}) {
  const since = new Date(now.getTime() - weeks * 7 * DAY_MS).toISOString();
  const rows = await withDatabase((database) => database
    .prepare("SELECT fingerprint, data_json FROM radar_topics WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?")
    .all(since, Math.max(1, Math.min(500, limit))) as { fingerprint: string; data_json: string }[]);
  return {
    fingerprints: [...new Set(rows.map((row) => row.fingerprint))],
    titles: [...new Set(rows.map((row) => (JSON.parse(row.data_json) as RadarTopic).title))],
  };
}

/* ------------------------------ Piezas ligadas ------------------------------ */

/** Un tema puede dar varias piezas y una pieza sale de un tema: por eso tabla puente (D-02). */
export async function linkTopicToContent({ topicId, contentItemId, format }: { topicId: string; contentItemId: string; format: string }) {
  const now = new Date().toISOString();
  await withDatabase((database) => {
    const topic = database.prepare("SELECT id FROM radar_topics WHERE id = ?").get(topicId);
    if (!topic) throw new RadarError("El tema no existe.", 404);
    const content = database.prepare("SELECT id FROM content_items WHERE id = ? AND archived_at IS NULL").get(contentItemId);
    if (!content) throw new RadarError("La pieza no existe o está archivada.", 404);
    database
      .prepare("INSERT OR IGNORE INTO radar_topic_items (topic_id, content_item_id, format, created_at) VALUES (?, ?, ?, ?)")
      .run(topicId, contentItemId, format, now);
  });
  return { topicId, contentItemId, format, createdAt: now };
}

export async function topicContentItems(topicId: string) {
  return withDatabase((database) => database
    .prepare("SELECT content_item_id AS contentItemId, format, created_at AS createdAt FROM radar_topic_items WHERE topic_id = ? ORDER BY created_at ASC")
    .all(topicId) as { contentItemId: string; format: string; createdAt: string }[]);
}
