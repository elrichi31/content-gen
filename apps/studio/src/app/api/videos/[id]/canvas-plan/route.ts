import { z } from "zod";
import { NextResponse } from "next/server";
import { generateCanvasPlan, replaceCanvasPlans } from "@/lib/canvas-plan";
import { withDatabase } from "@/lib/db";
import { beginGenerationRun, finishGenerationRun } from "@/lib/generation-runs";
import { openAiModel } from "@/lib/openai";
import { VideoGenerationError } from "@/lib/video-generation";
import { CANVAS_TEMPLATES } from "@content-gen/domain/canvas";
import { videoDocumentSchema } from "@content-gen/domain/video";

// `sceneId` + `template`: cambia la animación de una sola escena; sin ellos, se planifican todas.
// `onlyMissing`: solo las escenas sin plan (p. ej. el guion educativo ya trae las suyas).
const inputSchema = z.object({ feedback: z.string().trim().max(2000).optional(), sceneId: z.string().min(1).optional(), template: z.enum(CANVAS_TEMPLATES).optional(), onlyMissing: z.boolean().optional() })
  .refine((input) => Boolean(input.sceneId) === Boolean(input.template), { message: "sceneId y template van juntos." });

type Row = { document_json: string; revision: number };
const load = (id: string) => withDatabase(async (database) => await database.prepare("SELECT document_json, revision FROM content_items WHERE id = ? AND type = 'video' AND archived_at IS NULL").get(id) as Row | undefined);
const videoDocument = (row: Row) => {
  const parsed = videoDocumentSchema.safeParse((JSON.parse(row.document_json) as { document?: { data?: unknown } }).document?.data);
  return parsed.success ? parsed.data : null;
};

/**
 * Genera (o corrige con `feedback`) el plan del motor Canvas de todas las escenas: plantilla, datos y
 * cues anclados a la narración. Como la animación, se aplica sobre la versión vigente al guardar y
 * solo toca `content.canvas` de cada escena.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: "Solicitud de plan inválida." }, { status: 400 });
  const current = await load(id);
  if (!current) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  const document = videoDocument(current);
  if (!document) return NextResponse.json({ error: "El documento del video no es válido." }, { status: 400 });

  const startedAt = Date.now(); let run: Awaited<ReturnType<typeof beginGenerationRun>> | undefined;
  try {
    run = await beginGenerationRun({ contentItemId: id, operation: "video-canvas-plan", model: openAiModel("explainer") });
    const { feedback, sceneId, template, onlyMissing } = input.data;
    const generated = await generateCanvasPlan(document, feedback, fetch, sceneId && template ? { sceneId, template } : undefined, onlyMissing);
    for (let attempt = 0; attempt < 5; attempt++) {
      const latest = await load(id);
      const latestDocument = latest ? videoDocument(latest) : null;
      if (!latest || !latestDocument) throw new VideoGenerationError("El video ya no está disponible.", 404);
      const now = new Date().toISOString(); const stored = JSON.parse(latest.document_json);
      const next = { ...stored, document: { ...stored.document, data: replaceCanvasPlans(latestDocument, generated.plans) }, revision: latest.revision + 1, updatedAt: now };
      const result = await withDatabase(async (database) => await database.prepare("UPDATE content_items SET document_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(JSON.stringify(next), next.revision, now, id, latest.revision) as { changes: number });
      if (result.changes) return NextResponse.json({ content: next, skipped: generated.skipped, generationRun: await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, usage: generated.usage }) });
    }
    throw new VideoGenerationError("El video cambió demasiadas veces mientras se guardaba el plan. Intenta de nuevo.", 409);
  } catch (error) {
    if (run) await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Error desconocido" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el plan." }, { status: error instanceof VideoGenerationError ? error.status : 502 });
  }
}
