import { randomUUID } from "node:crypto";
import type { CarouselDocument } from "@content-gen/domain/carousel";
import { topicBrief } from "@content-gen/domain/radar";
import { addDays, todayLocal } from "@content-gen/domain/schedule";
import { AutomationError, automationInputSchema, imagesToDocument, nextListTopic, nextOpenSlot, type Automation } from "./carousel-automation-rules.ts";
import { createEditableCarousel, drawAiCarousel, prepareAiCarousel } from "./carousel-pipeline.ts";
import { withDatabase } from "./db.ts";
import { linkTopicToContent, listTopics, setTopicStatus } from "./radar.ts";
import { createPost, getRule, listPosts, updatePost } from "./schedule.ts";

/*
 * Automatización de carruseles: rellena con borradores los huecos de una pauta del cronograma.
 * Nunca publica. Cada ejecución hace como mucho un carrusel: toma el siguiente hueco libre, el
 * siguiente tema (primero la lista propia, luego el radar), genera y lo deja planificado.
 */

export { AutomationError, type Automation };

/* ------------------------------ Persistencia ------------------------------ */

type Row = { data_json: string };

export async function listAutomations() {
  return withDatabase(async (database) => (await database.prepare("SELECT data_json FROM carousel_automations ORDER BY created_at ASC").all() as Row[]).map((row) => JSON.parse(row.data_json) as Automation));
}

export async function getAutomation(id: string) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM carousel_automations WHERE id = ?").get(id)) as Row | undefined;
  if (!row) throw new AutomationError("La automatización no existe.", 404);
  return JSON.parse(row.data_json) as Automation;
}

function parseInput(input: unknown) {
  const parsed = automationInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AutomationError(`Automatización inválida: ${[issue?.path.join("."), issue?.message].filter(Boolean).join(" ")}`, 400);
  }
  return parsed.data;
}

async function assertReferences(automation: { ruleId: string; campaignId: string }) {
  await getRule(automation.ruleId).catch(() => { throw new AutomationError("La pauta no existe.", 400); });
  const campaign = await withDatabase((database) => database.prepare("SELECT id FROM campaigns WHERE id = ? AND archived_at IS NULL").get(automation.campaignId));
  if (!campaign) throw new AutomationError("La campaña no existe o está archivada.", 400);
}

async function save(automation: Automation, insert = false) {
  await withDatabase((database) => insert
    ? database.prepare("INSERT INTO carousel_automations (id, rule_id, active, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(automation.id, automation.ruleId, automation.active ? 1 : 0, JSON.stringify(automation), automation.createdAt, automation.updatedAt)
    : database.prepare("UPDATE carousel_automations SET rule_id = ?, active = ?, data_json = ?, updated_at = ? WHERE id = ?").run(automation.ruleId, automation.active ? 1 : 0, JSON.stringify(automation), automation.updatedAt, automation.id));
  return automation;
}

export async function createAutomation(input: unknown) {
  const data = parseInput(input);
  await assertReferences(data);
  const now = new Date().toISOString();
  return save({ ...data, id: randomUUID(), usedTopics: [], lastRunAt: null, lastResult: null, lastFailed: false, createdAt: now, updatedAt: now }, true);
}

export async function updateAutomation(id: string, patch: Record<string, unknown>) {
  const current = await getAutomation(id);
  const data = parseInput({ ...current, ...patch });
  await assertReferences(data);
  return save({ ...current, ...data, updatedAt: new Date().toISOString() });
}

export async function deleteAutomation(id: string) {
  await getAutomation(id);
  await withDatabase((database) => database.prepare("DELETE FROM carousel_automations WHERE id = ?").run(id));
}

/* ------------------------------- Ejecución ------------------------------- */

type PickedTopic = { title: string; context: string; radarTopicId: string | null };

async function pickTopic(automation: Automation): Promise<PickedTopic | null> {
  const listed = nextListTopic(automation.topics, automation.usedTopics);
  if (listed) return { title: listed, context: "", radarTopicId: null };
  if (!automation.radarVertical) return null;
  // Primero lo que alguien guardó a mano en el radar; si no hay, lo mejor puntuado sin revisar.
  for (const status of ["guardado", "nuevo"] as const) {
    const [best] = await listTopics({ status, vertical: automation.radarVertical, limit: 20 });
    if (best) { const brief = topicBrief(best, "carousel"); return { title: brief.topic, context: brief.context, radarTopicId: best.id }; }
  }
  return null;
}

async function generate(automation: Automation, picked: PickedTopic) {
  if (automation.kind === "editable") {
    const { document } = await createEditableCarousel({ topic: picked.title.slice(0, 240), ...(picked.context ? { context: picked.context } : {}), slideCount: automation.slides, campaignId: automation.campaignId, imageSource: automation.imageSource, ...(automation.brandKitId ? { brandKitId: automation.brandKitId } : {}) });
    return document;
  }
  const { input, brand } = await prepareAiCarousel({ topic: [picked.title, picked.context].filter(Boolean).join("\n\n").slice(0, 500), slides: automation.slides, provider: automation.provider, ...(automation.brandKitId ? { brandKitId: automation.brandKitId } : {}) }, automation.campaignId);
  const drawn = await drawAiCarousel(input, brand, { campaignId: automation.campaignId });
  return imagesToDocument(picked.title, drawn.slides);
}

async function insertCarousel(campaignId: string, document: CarouselDocument) {
  const now = new Date().toISOString();
  const item = { id: randomUUID(), schemaVersion: 1, campaignId, type: "carousel", document: { schemaVersion: 1, data: document }, revision: 0, createdAt: now, updatedAt: now, archivedAt: null };
  await withDatabase((database) => database.prepare("INSERT INTO content_items (id, schema_version, campaign_id, type, document_json, revision, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(item.id, 1, campaignId, "carousel", JSON.stringify(item), 0, now, now, null));
  return item.id;
}

// ponytail: candado en memoria, vale con un solo proceso de Next; con varias réplicas, pasar a pg_try_advisory_lock.
const running = new Set<string>();

export type RunOutcome = { status: "created" | "idle"; message: string; contentItemId?: string };

/** Rellena el siguiente hueco libre de la automatización con un carrusel en borrador. */
export async function runAutomation(id: string, now = new Date()): Promise<RunOutcome> {
  if (running.has(id)) throw new AutomationError("Esta automatización ya se está ejecutando.", 409);
  running.add(id);
  const automation = await getAutomation(id).catch((error) => { running.delete(id); throw error; });
  const finish = async (outcome: RunOutcome, failed = false, usedTopic?: string) => {
    const latest = await getAutomation(id).catch(() => null);
    if (latest) await save({ ...latest, usedTopics: usedTopic ? [...latest.usedTopics, usedTopic] : latest.usedTopics, lastRunAt: new Date().toISOString(), lastResult: outcome.message, lastFailed: failed, updatedAt: new Date().toISOString() });
    return outcome;
  };
  try {
    const rule = await getRule(automation.ruleId);
    const today = todayLocal(now);
    const posts = await listPosts({ startDate: today, endDate: addDays(today, automation.daysAhead) });
    const slot = nextOpenSlot(rule, posts, automation.daysAhead, now);
    if (!slot) return await finish({ status: "idle", message: `Sin huecos libres en los próximos ${automation.daysAhead} días.` });
    const picked = await pickTopic(automation);
    if (!picked) return await finish({ status: "idle", message: "Se acabaron los temas: agrega más a la lista o elige un vertical del radar con temas." }, true);

    const contentItemId = await insertCarousel(automation.campaignId, await generate(automation, picked));
    const notes = `Borrador generado por la automatización «${automation.name}».`;
    const title = picked.title.slice(0, 200);
    if (slot.post) await updatePost(slot.post.id, { contentItemId, notes, title });
    else await createPost({ platform: slot.platform, date: slot.date, time: slot.time, contentItemId, ruleId: rule.id, notes, title });
    if (picked.radarTopicId) {
      await setTopicStatus(picked.radarTopicId, "usado");
      await linkTopicToContent({ topicId: picked.radarTopicId, contentItemId, format: "carousel" });
    }
    return await finish({ status: "created", message: `Carrusel «${picked.title}» para el ${slot.date} a las ${slot.time}.`, contentItemId }, false, picked.radarTopicId ? undefined : picked.title);
  } catch (error) {
    await finish({ status: "idle", message: error instanceof Error ? error.message : "Falló la ejecución." }, true);
    throw error;
  } finally {
    running.delete(id);
  }
}

/** Lista con el siguiente hueco libre de cada una: lo que la pantalla necesita para decir qué va a pasar. */
export async function listAutomationsWithStatus(now = new Date()) {
  const automations = await listAutomations();
  const today = todayLocal(now);
  const horizon = Math.max(1, ...automations.map((automation) => automation.daysAhead));
  const posts = await listPosts({ startDate: today, endDate: addDays(today, horizon) });
  return Promise.all(automations.map(async (automation) => {
    const rule = await getRule(automation.ruleId).catch(() => null);
    const slot = rule ? nextOpenSlot(rule, posts, automation.daysAhead, now) : null;
    return { ...automation, nextSlot: slot ? { date: slot.date, time: slot.time } : null, horizonEnd: addDays(today, automation.daysAhead - 1) };
  }));
}

/** Una pasada por todas las activas. Un fallo en una no frena a las demás. */
export async function runDueAutomations(now = new Date()) {
  for (const automation of await listAutomations()) {
    if (!automation.active) continue;
    await runAutomation(automation.id, now).catch((error) => console.error(`[automatizaciones] ${automation.name}:`, error instanceof Error ? error.message : error));
  }
}
