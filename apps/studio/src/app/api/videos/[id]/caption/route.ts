import { z } from "zod";
import { NextResponse } from "next/server";
import { withDatabase } from "@/lib/db";
import { beginGenerationRun, finishGenerationRun } from "@/lib/generation-runs";
import { openAiModel } from "@/lib/openai";
import { applyVideoCaption, captionText, generateVideoCaption, videoCaptionSchema, VideoCaptionError } from "@/lib/video-caption";
import { videoDocumentSchema } from "@content-gen/domain/video";

const inputSchema = z.object({ action: z.enum(["generate", "edit"]).default("generate"), revision: z.number().int().nonnegative(), caption: videoCaptionSchema.optional() });
async function storedVideo(id: string) { return withDatabase((database) => database.prepare("SELECT document_json, revision FROM content_items WHERE id = ? AND type = 'video' AND archived_at IS NULL").get(id) as { document_json: string; revision: number } | undefined); }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await storedVideo((await params).id); if (!current) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 }); const document = videoDocumentSchema.safeParse((JSON.parse(current.document_json) as { document?: { data?: unknown } }).document?.data); if (!document.success) return NextResponse.json({ error: "Video inválido." }, { status: 400 }); return new Response(captionText(document.data), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${document.data.slug}-caption.txt"` } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id; const input = inputSchema.safeParse(await request.json().catch(() => null)); if (!input.success || input.data.action === "edit" && !input.data.caption) return NextResponse.json({ error: "Solicitud de caption inválida." }, { status: 400 }); const current = await storedVideo(id); if (!current) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 }); if (current.revision !== input.data.revision) return NextResponse.json({ error: "El video cambió en otra edición.", revision: current.revision }, { status: 409 }); const document = videoDocumentSchema.safeParse((JSON.parse(current.document_json) as { document?: { data?: unknown } }).document?.data); if (!document.success) return NextResponse.json({ error: "Video inválido." }, { status: 400 });
  const startedAt = Date.now(); let run: Awaited<ReturnType<typeof beginGenerationRun>> | undefined;
  try { if (input.data.action === "generate") run = await beginGenerationRun({ contentItemId: id, operation: "video-caption", model: openAiModel("text") }); const generated = input.data.action === "edit" ? { document: applyVideoCaption(document.data, input.data.caption!) } : await generateVideoCaption(document.data); const now = new Date().toISOString(); const stored = JSON.parse(current.document_json); const next = { ...stored, document: { ...stored.document, data: generated.document }, revision: current.revision + 1, updatedAt: now }; const result = await withDatabase((database) => database.prepare("UPDATE content_items SET document_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(JSON.stringify(next), next.revision, now, id, current.revision) as { changes: number }); if (!result.changes) return NextResponse.json({ error: "El video cambió en otra edición." }, { status: 409 }); return NextResponse.json({ content: next, ...(run ? { generationRun: await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, usage: "usage" in generated ? generated.usage : null }) } : {}) }); }
  catch (error) { if (run) await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Error desconocido" }); return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el caption." }, { status: error instanceof VideoCaptionError ? error.status : 502 }); }
}
