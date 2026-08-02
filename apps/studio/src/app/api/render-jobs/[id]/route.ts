import { renderJobSchema } from "@content-gen/domain/schemas";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../../lib/db";
import { startRenderWorker } from "../../../../lib/render-worker";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = await request.json().catch(() => null) as { action?: unknown } | null;
  if (!input || !["cancel", "retry"].includes(String(input.action))) return NextResponse.json({ error: "La acción debe ser cancel o retry." }, { status: 400 });
  const current = await withDatabase((database) => database.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!current) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
  const job = JSON.parse(current.data_json);
  if (input.action === "retry") {
    if (["queued", "processing"].includes(job.status)) return NextResponse.json(job);
    if (!["failed", "cancelled"].includes(job.status)) return NextResponse.json({ error: "El job completado no se puede reintentar." }, { status: 409 });
    const parsed = renderJobSchema.safeParse({ ...job, status: "queued", progress: 0, outputAssetId: null, completedAt: null, error: null });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const result = await withDatabase((database) => database.prepare("UPDATE render_jobs SET data_json = ? WHERE id = ? AND json_extract(data_json, '$.status') IN ('failed', 'cancelled')").run(JSON.stringify(parsed.data), id) as { changes: number });
    // Reintentar también arranca el worker: la cola nunca se queda esperando a un comando manual.
    if (result.changes) { startRenderWorker(); return NextResponse.json(parsed.data); }
    const latest = await withDatabase((database) => database.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get(id) as { data_json: string } | undefined);
    return latest ? NextResponse.json(JSON.parse(latest.data_json)) : NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
  }
  if (["completed", "failed", "cancelled"].includes(job.status)) return NextResponse.json({ error: "El job ya terminó." }, { status: 409 });
  const parsed = renderJobSchema.safeParse({ ...job, status: "cancelled", completedAt: new Date().toISOString(), error: null });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await withDatabase((database) => database.prepare("UPDATE render_jobs SET data_json = ? WHERE id = ?").run(JSON.stringify(parsed.data), id));
  return NextResponse.json(parsed.data);
}
