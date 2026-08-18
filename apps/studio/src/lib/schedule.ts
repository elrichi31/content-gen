import { randomUUID } from "node:crypto";
import {
  buildCalendar,
  monthGrid,
  monthPattern,
  monthRange,
  publishingRuleSchema,
  scheduledPostSchema,
  summarizeCalendar,
  type PublishingRule,
  type ScheduledPost,
} from "@content-gen/domain/schedule";
import { contentTitle } from "./content-title.ts";
import { withDatabase } from "./db.ts";

export class ScheduleError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

type Row = { data_json: string };
const parseRows = <T>(rows: unknown[]) => (rows as Row[]).map((row) => JSON.parse(row.data_json) as T);

/** Traduce el primer problema de zod a un error con mensaje y código para la API. */
function invalid(subject: string, error: { issues: { path: (string | number)[]; message: string }[] }) {
  const issue = error.issues[0];
  return new ScheduleError(`${subject} inválida: ${[issue?.path.join("."), issue?.message].filter(Boolean).join(" ")}`, 400);
}

/* ------------------------------- Pautas ------------------------------- */

export async function listRules({ campaignId, includeInactive = true }: { campaignId?: string | null; includeInactive?: boolean } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  // Una pauta sin campaña es global: aplica también cuando se filtra por una campaña concreta.
  if (campaignId) { clauses.push("(campaign_id = ? OR campaign_id IS NULL)"); params.push(campaignId); }
  if (!includeInactive) clauses.push("active = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return withDatabase((database) => parseRows<PublishingRule>(database.prepare(`SELECT data_json FROM publishing_rules ${where} ORDER BY platform ASC, created_at ASC`).all(...params)));
}

export async function createRule(input: unknown) {
  const now = new Date().toISOString();
  const parsed = publishingRuleSchema.safeParse({ ...(input as object), id: randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now });
  if (!parsed.success) throw invalid("La pauta", parsed.error);
  const rule = parsed.data;
  await assertCampaign(rule.campaignId);
  await withDatabase((database) => database
    .prepare("INSERT INTO publishing_rules (id, schema_version, campaign_id, platform, active, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(rule.id, 1, rule.campaignId, rule.platform, rule.active ? 1 : 0, JSON.stringify(rule), now, now));
  return rule;
}

export async function updateRule(id: string, patch: Record<string, unknown>) {
  const current = await getRule(id);
  const changes = { ...patch };
  // El identificador y el alta no se editan aunque el cliente los mande de vuelta.
  delete changes.id;
  delete changes.createdAt;
  const parsed = publishingRuleSchema.safeParse({ ...current, ...changes, id: current.id, schemaVersion: 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
  if (!parsed.success) throw invalid("La pauta", parsed.error);
  const rule = parsed.data;
  await assertCampaign(rule.campaignId);
  await withDatabase((database) => database
    .prepare("UPDATE publishing_rules SET campaign_id = ?, platform = ?, active = ?, data_json = ?, updated_at = ? WHERE id = ?")
    .run(rule.campaignId, rule.platform, rule.active ? 1 : 0, JSON.stringify(rule), rule.updatedAt, rule.id));
  return rule;
}

/** Borrar la pauta deja de generar huecos, pero lo ya planificado sobre ella se conserva. */
export async function deleteRule(id: string) {
  await getRule(id);
  // En una transacción: desligar los huecos y borrar la pauta son un solo cambio. A medias
  // dejaría publicaciones apuntando a una pauta inexistente.
  await withDatabase((database) => {
    database.exec("BEGIN");
    try {
      database.prepare("UPDATE scheduled_posts SET rule_id = NULL WHERE rule_id = ?").run(id);
      database.prepare("DELETE FROM publishing_rules WHERE id = ?").run(id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  });
}

async function getRule(id: string) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM publishing_rules WHERE id = ?").get(id)) as Row | undefined;
  if (!row) throw new ScheduleError("La pauta no existe.", 404);
  return JSON.parse(row.data_json) as PublishingRule;
}

/* --------------------------- Publicaciones --------------------------- */

export async function listPosts({ startDate, endDate, campaignId }: { startDate?: string; endDate?: string; campaignId?: string | null } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (startDate) { clauses.push("date >= ?"); params.push(startDate); }
  if (endDate) { clauses.push("date <= ?"); params.push(endDate); }
  // Igual que las pautas: lo que no tiene campaña es global y no puede desaparecer al filtrar.
  // Ocultarlo dejaría el hueco pintado como libre aunque ya esté ocupado, y planificar encima
  // chocaría con la clave única sin que la pantalla explicara por qué.
  if (campaignId) { clauses.push("(campaign_id = ? OR campaign_id IS NULL)"); params.push(campaignId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return withDatabase((database) => parseRows<ScheduledPost>(database.prepare(`SELECT data_json FROM scheduled_posts ${where} ORDER BY date ASC, time ASC, platform ASC`).all(...params)));
}

export async function createPost(input: unknown) {
  const now = new Date().toISOString();
  const parsed = scheduledPostSchema.safeParse({ ...(input as object), id: randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now });
  if (!parsed.success) throw invalid("La publicación", parsed.error);
  const post = await withResolvedContent(parsed.data);
  await withDatabase((database) => database
    .prepare("INSERT INTO scheduled_posts (id, schema_version, platform, date, time, status, content_item_id, campaign_id, rule_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(post.id, 1, post.platform, post.date, post.time, post.status, post.contentItemId, post.campaignId, post.ruleId, JSON.stringify(post), now, now))
    .catch(rethrowSlotConflict);
  return post;
}

export async function updatePost(id: string, patch: Record<string, unknown>) {
  const current = await getPost(id);
  const changes = { ...patch };
  // El identificador y el alta no se editan aunque el cliente los mande de vuelta.
  delete changes.id;
  delete changes.createdAt;
  const parsed = scheduledPostSchema.safeParse({ ...current, ...changes, id: current.id, schemaVersion: 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
  if (!parsed.success) throw invalid("La publicación", parsed.error);
  const post = await withResolvedContent(parsed.data, current);
  await withDatabase((database) => database
    .prepare("UPDATE scheduled_posts SET platform = ?, date = ?, time = ?, status = ?, content_item_id = ?, campaign_id = ?, rule_id = ?, data_json = ?, updated_at = ? WHERE id = ?")
    .run(post.platform, post.date, post.time, post.status, post.contentItemId, post.campaignId, post.ruleId, JSON.stringify(post), post.updatedAt, post.id))
    .catch(rethrowSlotConflict);
  return post;
}

export async function deletePost(id: string) {
  await getPost(id);
  await withDatabase((database) => database.prepare("DELETE FROM scheduled_posts WHERE id = ?").run(id));
}

async function getPost(id: string) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM scheduled_posts WHERE id = ?").get(id)) as Row | undefined;
  if (!row) throw new ScheduleError("La publicación planificada no existe.", 404);
  return JSON.parse(row.data_json) as ScheduledPost;
}

/** El hueco es único por plataforma, día y hora; conviene decirlo en castellano y no como error de SQLite. */
function rethrowSlotConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE") && message.includes("scheduled_posts")) throw new ScheduleError("Ese hueco ya tiene una publicación planificada.", 409);
  throw error;
}

async function assertCampaign(campaignId: string | null) {
  if (!campaignId) return;
  const campaign = await withDatabase((database) => database.prepare("SELECT id FROM campaigns WHERE id = ? AND archived_at IS NULL").get(campaignId));
  if (!campaign) throw new ScheduleError("La campaña no existe o está archivada.", 400);
}

/**
 * Al asignar una pieza se toma su campaña y, si no hay título, el de la campaña como
 * referencia: planificar no debería obligar a reescribir datos que ya están en la biblioteca.
 */
async function withResolvedContent(post: ScheduledPost, previous?: ScheduledPost) {
  if (!post.contentItemId) {
    await assertCampaign(post.campaignId);
    return post;
  }
  const row = await withDatabase((database) => database
    .prepare("SELECT content.campaign_id, content.type, content.document_json FROM content_items content WHERE content.id = ? AND content.archived_at IS NULL")
    .get(post.contentItemId)) as { campaign_id: string; type: string; document_json: string } | undefined;
  if (!row) throw new ScheduleError("El contenido no existe o está archivado.", 400);
  const document = JSON.parse(row.document_json) as { document?: { data?: { title?: unknown; headline?: unknown } } };
  const keptTitle = post.title || (previous && previous.contentItemId === post.contentItemId ? previous.title : "");
  return { ...post, campaignId: row.campaign_id, title: keptTitle || contentTitle({ type: row.type, document: document.document }) };
}

/* ----------------------------- Calendario ----------------------------- */

/** Todo lo que la pantalla del calendario necesita para un mes, en una sola lectura. */
export async function monthCalendar(month: string, { campaignId }: { campaignId?: string | null } = {}) {
  const parsedMonth = monthPattern.safeParse(month);
  if (!parsedMonth.success) throw new ScheduleError("El mes debe tener el formato YYYY-MM.", 400);
  const { startDate, endDate } = monthRange(parsedMonth.data);
  const weeks = monthGrid(parsedMonth.data);
  // La rejilla enseña días de los meses vecinos: se cargan también para no pintarlos vacíos por error.
  const gridStart = weeks[0][0];
  const gridEnd = weeks.at(-1)!.at(-1)!;
  const [rules, posts] = await Promise.all([listRules({ campaignId }), listPosts({ startDate: gridStart, endDate: gridEnd, campaignId })]);
  const days = buildCalendar({ rules, posts, startDate: gridStart, endDate: gridEnd });
  return {
    month: parsedMonth.data,
    startDate,
    endDate,
    weeks,
    days,
    rules,
    summary: summarizeCalendar(days.filter((day) => day.date >= startDate && day.date <= endDate)),
  };
}
