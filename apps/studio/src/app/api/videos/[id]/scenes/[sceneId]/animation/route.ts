import { z } from "zod";
import { NextResponse } from "next/server";
import { withDatabase } from "@/lib/db";
import { EXPLAINER_TEMPLATE_ID, generateExplainerAnimation, replaceSceneAnimation } from "@/lib/explainer";
import { beginGenerationRun, finishGenerationRun } from "@/lib/generation-runs";
import { openAiModel } from "@/lib/openai";
import { VideoGenerationError } from "@/lib/video-generation";
import { videoDocumentSchema } from "@content-gen/domain/video";

const inputSchema = z.object({ feedback: z.string().trim().max(2000).optional() });

type Row = { document_json: string; revision: number };
const load = (id: string) => withDatabase(async (database) => await database.prepare("SELECT document_json, revision FROM content_items WHERE id = ? AND type = 'video' AND archived_at IS NULL").get(id) as Row | undefined);
const explainerDocument = (row: Row) => {
  const parsed = videoDocumentSchema.safeParse((JSON.parse(row.document_json) as { document?: { data?: unknown } }).document?.data);
  return parsed.success && parsed.data.templateId === EXPLAINER_TEMPLATE_ID ? parsed.data : null;
};

/**
 * Genera (o corrige con `feedback`) la animación HTML/CSS de una escena del video educativo.
 * No exige revisión: la IA tarda y el cliente lanza varias escenas en paralelo, así que el
 * resultado se aplica sobre la versión vigente al guardar y solo toca esta escena.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const input = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: "Solicitud de animación inválida." }, { status: 400 });
  const current = await load(id);
  if (!current) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  const document = explainerDocument(current);
  const scene = document?.scenes.find((item) => item.id === sceneId);
  if (!document || !scene) return NextResponse.json({ error: "La escena no existe o el video no es educativo." }, { status: 400 });

  const startedAt = Date.now(); let run: Awaited<ReturnType<typeof beginGenerationRun>> | undefined;
  try {
    run = await beginGenerationRun({ contentItemId: id, operation: "video-explainer-animation", model: openAiModel("explainer") });
    const generated = await generateExplainerAnimation(document, scene, input.data.feedback);
    for (let attempt = 0; attempt < 5; attempt++) {
      const latest = await load(id);
      const latestDocument = latest ? explainerDocument(latest) : null;
      if (!latest || !latestDocument) throw new VideoGenerationError("El video ya no está disponible.", 404);
      const now = new Date().toISOString(); const stored = JSON.parse(latest.document_json);
      const next = { ...stored, document: { ...stored.document, data: replaceSceneAnimation(latestDocument, sceneId, generated) }, revision: latest.revision + 1, updatedAt: now };
      const result = await withDatabase(async (database) => await database.prepare("UPDATE content_items SET document_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(JSON.stringify(next), next.revision, now, id, latest.revision) as { changes: number });
      if (result.changes) return NextResponse.json({ content: next, generationRun: await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, usage: generated.usage }) });
    }
    throw new VideoGenerationError("El video cambió demasiadas veces mientras se guardaba la animación. Intenta de nuevo.", 409);
  } catch (error) {
    if (run) await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Error desconocido" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar la animación." }, { status: error instanceof VideoGenerationError ? error.status : 502 });
  }
}
