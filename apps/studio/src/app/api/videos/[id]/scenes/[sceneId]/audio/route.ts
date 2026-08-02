import { z } from "zod";
import { NextResponse } from "next/server";
import { storeAsset } from "@/lib/asset-storage";
import { validateVideoAssets } from "@/lib/content-assets";
import { withDatabase } from "@/lib/db";
import { createElevenLabsSpeech, ElevenLabsError } from "@/lib/elevenlabs";
import { beginGenerationRun, finishGenerationRun } from "@/lib/generation-runs";
import { mp3DurationSeconds, replaceSceneAudio } from "@/lib/video-scene-audio";
import { videoDocumentSchema } from "@content-gen/domain/video";

const inputSchema = z.object({ voiceId: z.string().min(8).max(64), modelId: z.string().min(3).max(80).default("eleven_multilingual_v2"), revision: z.number().int().nonnegative() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params; const input = inputSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "Solicitud de audio inválida." }, { status: 400 });
  const current = await withDatabase((database) => database.prepare("SELECT document_json, campaign_id, revision FROM content_items WHERE id = ? AND type = 'video' AND archived_at IS NULL").get(id) as { document_json: string; campaign_id: string; revision: number } | undefined); if (!current) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 }); if (current.revision !== input.data.revision) return NextResponse.json({ error: "El video cambió en otra edición.", revision: current.revision }, { status: 409 });
  const document = videoDocumentSchema.safeParse((JSON.parse(current.document_json) as { document?: { data?: unknown } }).document?.data); const scene = document.success ? document.data.scenes.find((item) => item.id === sceneId) : undefined; const text = scene && typeof scene.content.voiceover === "string" ? scene.content.voiceover.trim() : ""; if (!document.success || !scene || !text) return NextResponse.json({ error: "La escena necesita un guion de voz antes de generar audio." }, { status: 400 });
  const startedAt = Date.now(); let run: Awaited<ReturnType<typeof beginGenerationRun>> | undefined;
  try {
    run = await beginGenerationRun({ contentItemId: id, operation: "video-scene-audio", provider: "elevenlabs", model: input.data.modelId }); const audio = await createElevenLabsSpeech({ voiceId: input.data.voiceId, text, modelId: input.data.modelId }); const asset = await storeAsset({ ...audio, campaignId: current.campaign_id, contentItemId: id }); const nextDocument = replaceSceneAudio(document.data, sceneId, asset.id, input.data.voiceId, input.data.modelId, mp3DurationSeconds(audio.bytes.length)); await validateVideoAssets(nextDocument, current.campaign_id);
    const now = new Date().toISOString(); const stored = JSON.parse(current.document_json); const next = { ...stored, document: { ...stored.document, data: nextDocument }, revision: current.revision + 1, updatedAt: now }; const result = await withDatabase((database) => database.prepare("UPDATE content_items SET document_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(JSON.stringify(next), next.revision, now, id, current.revision) as { changes: number }); if (!result.changes) return NextResponse.json({ error: "El video cambió en otra edición." }, { status: 409 }); return NextResponse.json({ content: next, asset, generationRun: await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt }) });
  } catch (error) { if (run) await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Error desconocido" }); return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el audio." }, { status: error instanceof ElevenLabsError ? error.status : 502 }); }
}
