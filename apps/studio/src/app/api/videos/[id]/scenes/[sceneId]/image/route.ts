import { z } from "zod";
import { NextResponse } from "next/server";
import { storeAsset } from "@/lib/asset-storage";
import { createRemoteImage } from "@/lib/carousel-images";
import { validateVideoAssets } from "@/lib/content-assets";
import { withDatabase } from "@/lib/db";
import { beginGenerationRun, finishGenerationRun } from "@/lib/generation-runs";
import { openAiModel } from "@/lib/openai";
import { replaceSceneImage } from "@/lib/video-scene-images";
import { videoDocumentSchema } from "@content-gen/domain/video";

// Los imagePrompts del guion son largos y cinematográficos, como en `video-autom`.
const inputSchema = z.object({ source: z.enum(["openai", "unsplash"]), prompt: z.string().trim().min(3).max(1500), revision: z.number().int().nonnegative() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params; const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "La solicitud de imagen por escena no es válida." }, { status: 400 });
  const current = await withDatabase(async (database) => await database.prepare("SELECT document_json, campaign_id, revision FROM content_items WHERE id = ? AND type = 'video' AND archived_at IS NULL").get(id) as { document_json: string; campaign_id: string; revision: number } | undefined);
  if (!current) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  if (current.revision !== input.data.revision) return NextResponse.json({ error: "El video cambió en otra edición.", revision: current.revision }, { status: 409 });
  const document = videoDocumentSchema.safeParse((JSON.parse(current.document_json) as { document?: { data?: unknown } }).document?.data);
  if (!document.success || !document.data.scenes.some((scene) => scene.id === sceneId)) return NextResponse.json({ error: "Escena de video no válida." }, { status: 400 });
  const startedAt = Date.now(); let run: Awaited<ReturnType<typeof beginGenerationRun>> | undefined;
  try {
    run = await beginGenerationRun({ contentItemId: id, operation: "video-scene-image", provider: input.data.source, model: input.data.source === "openai" ? openAiModel("image") : null });
    const image = await createRemoteImage({ source: input.data.source, prompt: input.data.prompt, campaignId: current.campaign_id }); const asset = await storeAsset({ ...image, campaignId: current.campaign_id, contentItemId: id });
    const nextDocument = replaceSceneImage(document.data, sceneId, asset.id); await validateVideoAssets(nextDocument, current.campaign_id);
    const now = new Date().toISOString(); const stored = JSON.parse(current.document_json); const next = { ...stored, document: { ...stored.document, data: nextDocument }, revision: current.revision + 1, updatedAt: now };
    const result = await withDatabase(async (database) => await database.prepare("UPDATE content_items SET document_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(JSON.stringify(next), next.revision, now, id, current.revision) as { changes: number });
    if (!result.changes) return NextResponse.json({ error: "El video cambió en otra edición." }, { status: 409 });
    return NextResponse.json({ content: next, asset, generationRun: await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, usage: image.usage }) });
  } catch (error) { if (run) await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Error desconocido" }); return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la imagen." }, { status: 502 }); }
}
