import { contentItemSchema } from "@content-gen/domain/schemas";
import { adDocumentSchema } from "@content-gen/domain/ad";
import { articleDraftSchema } from "@content-gen/domain/article";
import { videoDocumentSchema } from "@content-gen/domain/video";
import { NextResponse } from "next/server";
import { validateAdImageAsset, validateVideoAssets } from "../../../../lib/content-assets";
import { withDatabase } from "../../../../lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await withDatabase((database) => {
    const content = database.prepare("SELECT document_json, revision, created_at, updated_at, archived_at FROM content_items WHERE id = ?").get(id) as { document_json: string; revision: number; created_at: string; updated_at: string; archived_at: string | null } | undefined;
    if (!content) return null;
    const generationRuns = database.prepare("SELECT data_json FROM generation_runs WHERE content_item_id = ? ORDER BY created_at DESC LIMIT 10").all(id) as { data_json: string }[];
    const stored = JSON.parse(content.document_json) as { campaignId?: string };
    const campaign = stored.campaignId ? database.prepare("SELECT data_json FROM campaigns WHERE id = ?").get(stored.campaignId) as { data_json: string } | undefined : undefined;
    const exports = database.prepare("SELECT export.data_json AS export_json, asset.data_json AS asset_json FROM exports export JOIN assets asset ON asset.id = export.asset_id WHERE export.content_item_id = ? ORDER BY export.created_at DESC").all(id) as { export_json: string; asset_json: string }[];
    return {
      ...stored, revision: content.revision, createdAt: content.created_at, updatedAt: content.updated_at, archivedAt: content.archived_at,
      campaign: campaign ? { id: (JSON.parse(campaign.data_json) as { id: string }).id, name: (JSON.parse(campaign.data_json) as { name: string }).name } : null,
      exports: exports.map((row) => { const exported = JSON.parse(row.export_json) as { id: string; format: string; createdAt: string }; const asset = JSON.parse(row.asset_json) as { id: string; filename: string; sizeBytes: number }; return { id: exported.id, format: exported.format, createdAt: exported.createdAt, assetId: asset.id, filename: asset.filename, sizeBytes: asset.sizeBytes }; }),
      generationRuns: generationRuns.map((run) => JSON.parse(run.data_json)),
    };
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Contenido no encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  if (!Number.isInteger(input.revision) || input.revision < 0) return NextResponse.json({ error: "Debes indicar la revisión actual." }, { status: 400 });
  const current = await withDatabase((database) => database.prepare("SELECT document_json, revision FROM content_items WHERE id = ?").get(id) as { document_json: string; revision: number } | undefined);
  if (!current) return NextResponse.json({ error: "Contenido no encontrado." }, { status: 404 });
  if (current.revision !== input.revision) return NextResponse.json({ error: "El contenido cambió en otra edición.", revision: current.revision }, { status: 409 });
  const existing = JSON.parse(current.document_json);
  const parsed = contentItemSchema.safeParse({ ...existing, campaignId: input.campaignId ?? existing.campaignId, type: input.type ?? existing.type, document: input.document ?? existing.document, archivedAt: input.archivedAt ?? null, id, revision: current.revision + 1, updatedAt: new Date().toISOString() });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const ad = parsed.data.type === "ad" ? adDocumentSchema.safeParse(parsed.data.document.data) : null;
  if (ad && !ad.success) return NextResponse.json({ error: ad.error.flatten() }, { status: 400 });
  const video = parsed.data.type === "video" ? videoDocumentSchema.safeParse(parsed.data.document.data) : null;
  if (video && !video.success) return NextResponse.json({ error: video.error.flatten() }, { status: 400 });
  // El artículo se guarda como borrador: el contrato estricto del sitio se exige al exportar.
  const article = parsed.data.type === "article" ? articleDraftSchema.safeParse(parsed.data.document.data) : null;
  if (article && !article.success) return NextResponse.json({ error: article.error.flatten() }, { status: 400 });
  const documentData = ad?.success ? ad.data : video?.success ? video.data : article?.success ? article.data : parsed.data.document.data;
  const data = { ...parsed.data, document: { ...parsed.data.document, data: documentData } };
  if (!data.archivedAt && !await withDatabase((database) => database.prepare("SELECT id FROM campaigns WHERE id = ? AND archived_at IS NULL").get(data.campaignId))) return NextResponse.json({ error: "No puedes restaurar contenido en una campaña archivada." }, { status: 409 });
  try { if (ad?.success) await validateAdImageAsset(ad.data, data.campaignId); if (video?.success) await validateVideoAssets(video.data, data.campaignId); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Los assets del contenido no son válidos." }, { status: 400 }); }
  const result = await withDatabase((database) => database.prepare("UPDATE content_items SET campaign_id = ?, type = ?, document_json = ?, revision = ?, updated_at = ?, archived_at = ? WHERE id = ? AND revision = ?").run(data.campaignId, data.type, JSON.stringify(data), data.revision, data.updatedAt, data.archivedAt, id, current.revision) as { changes: number });
  if (!result.changes) return NextResponse.json({ error: "El contenido cambió en otra edición." }, { status: 409 });
  return NextResponse.json(data);
}
