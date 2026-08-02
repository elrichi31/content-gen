import { randomUUID } from "node:crypto";
import { generationRunSchema } from "@content-gen/domain/schemas";
import { withDatabase } from "./db.ts";

export class GenerationRunError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function beginGenerationRun({ contentItemId, operation, model, provider = "openai" }: { contentItemId: string; operation: string; model: string | null; provider?: "openai" | "unsplash" | "elevenlabs" | "local" }) {
  const now = new Date().toISOString();
  const run = generationRunSchema.parse({ id: randomUUID(), schemaVersion: 1, contentItemId, provider, status: "running", createdAt: now, completedAt: null, error: null, operation, model, durationMs: null, usage: null });
  await withDatabase((database) => {
    const content = database.prepare("SELECT id FROM content_items WHERE id = ? AND type = 'video' AND archived_at IS NULL").get(contentItemId);
    if (!content) throw new GenerationRunError("El video para registrar la generación no existe o está archivado.", 404);
    database.prepare("INSERT INTO generation_runs (id, schema_version, content_item_id, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(run.id, run.schemaVersion, run.contentItemId, JSON.stringify(run), now);
  });
  return run;
}

export async function finishGenerationRun(id: string, { durationMs, error = null, usage = null }: { durationMs: number; error?: string | null; usage?: Record<string, unknown> | null }) {
  const row = await withDatabase((database) => database.prepare("SELECT data_json FROM generation_runs WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!row) throw new GenerationRunError("Registro de generación no encontrado.", 404);
  const completedAt = new Date().toISOString();
  const run = generationRunSchema.parse({ ...JSON.parse(row.data_json), status: error ? "failed" : "completed", completedAt, error: error?.slice(0, 1000) ?? null, durationMs: Math.max(0, Math.round(durationMs)), usage });
  await withDatabase((database) => database.prepare("UPDATE generation_runs SET data_json = ? WHERE id = ?").run(JSON.stringify(run), id));
  return run;
}
