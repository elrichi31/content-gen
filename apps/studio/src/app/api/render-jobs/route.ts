import { randomUUID } from "node:crypto";
import { renderJobSchema } from "@content-gen/domain/schemas";
import { videoDocumentSchema } from "@content-gen/domain/video";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../lib/db";
import { parseActiveRenderJobLimit } from "../../../lib/render-limits";
import { isRenderJobStale, startRenderWorker } from "../../../lib/render-worker";

async function recoverStaleRenderJobs() {
  const recovered = await withDatabase((database) => {
    const rows = database.prepare("SELECT id, data_json FROM render_jobs WHERE json_extract(data_json, '$.status') = 'processing'").all() as { id: string; data_json: string }[];
    const now = new Date().toISOString();
    return rows.flatMap((row) => {
      const job = JSON.parse(row.data_json) as { status: string; createdAt: string; updatedAt?: string; [key: string]: unknown };
      const lastActivity = job.updatedAt ?? job.createdAt;
      if (!isRenderJobStale(job)) return [];
      const next = { ...job, status: "queued", progress: 0, outputAssetId: null, completedAt: null, error: null, updatedAt: now };
      if (!renderJobSchema.safeParse(next).success) return [];
      const result = database.prepare("UPDATE render_jobs SET data_json = ? WHERE id = ? AND json_extract(data_json, '$.status') = 'processing' AND COALESCE(json_extract(data_json, '$.updatedAt'), json_extract(data_json, '$.createdAt')) = ?").run(JSON.stringify(next), row.id, lastActivity) as { changes: number };
      return result.changes ? [row.id] : [];
    });
  });
  recovered.forEach((id) => startRenderWorker(id));
}

export async function GET(request: Request) {
  await recoverStaleRenderJobs();
  const contentItemId = new URL(request.url).searchParams.get("contentItemId");
  const jobs = await withDatabase((database) => (database.prepare(`SELECT data_json FROM render_jobs${contentItemId ? " WHERE content_item_id = ?" : ""} ORDER BY created_at DESC`).all(...(contentItemId ? [contentItemId] : [])) as { data_json: string }[]).map((row) => JSON.parse(row.data_json)));
  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  await recoverStaleRenderJobs();
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof (input as { contentItemId?: unknown }).contentItemId !== "string") return NextResponse.json({ error: "Solicitud de render inválida." }, { status: 400 });
  const now = new Date().toISOString();
  const content = await withDatabase((database) => database.prepare("SELECT type, document_json FROM content_items WHERE id = ? AND archived_at IS NULL").get((input as { contentItemId: string }).contentItemId) as { type: string; document_json: string } | undefined);
  if (!content || content.type !== "video") return NextResponse.json({ error: "El video no existe o está archivado." }, { status: 400 });
  const document = videoDocumentSchema.safeParse(JSON.parse(content.document_json).document.data);
  if (!document.success) return NextResponse.json({ error: document.error.flatten() }, { status: 400 });
  const compositionId = document.data.templateId === "timeline" ? "TimelineVideo" : "StandardVideo";
  const hasAssets = document.data.scenes.some((scene) => scene.imageAssetId || scene.audioAssetId);
  const inputProps = { document: document.data, ...(hasAssets ? { assetBaseUrl: new URL(request.url).origin } : {}) };
  const parsed = renderJobSchema.safeParse({ ...input, id: randomUUID(), schemaVersion: 1, compositionId, inputProps, status: "queued", progress: 0, outputAssetId: null, createdAt: now, completedAt: null, error: null });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const inserted = await withDatabase((database) => {
    database.exec("BEGIN IMMEDIATE;");
    try {
      const active = (database.prepare("SELECT COUNT(*) AS total FROM render_jobs job JOIN content_items content ON content.id = job.content_item_id WHERE content.archived_at IS NULL AND json_extract(job.data_json, '$.status') IN ('queued', 'processing')").get() as { total: number }).total;
      if (active >= parseActiveRenderJobLimit()) { database.exec("ROLLBACK;"); return false; }
      database.prepare("INSERT INTO render_jobs (id, schema_version, content_item_id, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(parsed.data.id, 1, parsed.data.contentItemId, JSON.stringify(parsed.data), now);
      database.exec("COMMIT;"); return true;
    } catch (error) {
      database.exec("ROLLBACK;"); throw error;
    }
  });
  if (!inserted) return NextResponse.json({ error: "Se alcanzó el límite de renders activos. Intenta de nuevo cuando termine uno." }, { status: 429 });
  // El job se procesa solo: no hace falta lanzar el worker a mano.
  startRenderWorker(parsed.data.id);
  return NextResponse.json(parsed.data, { status: 201 });
}
