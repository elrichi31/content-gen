import { campaignSchema } from "@content-gen/domain/schemas";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../../lib/db";
import { campaignPieceStatus } from "../../../../lib/campaign-progress";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await withDatabase(async (database) => {
    const campaign = await database.prepare("SELECT data_json FROM campaigns WHERE id = ? AND archived_at IS NULL").get(id) as { data_json: string } | undefined;
    if (!campaign) return null;
    const content = await database.prepare("SELECT id, type, revision, updated_at FROM content_items WHERE campaign_id = ? AND archived_at IS NULL ORDER BY updated_at DESC").all(id) as { id: string; type: string; revision: number; updated_at: string }[];
    const exportQuery = database.prepare("SELECT 1 FROM exports WHERE content_item_id = ? LIMIT 1");
    const renderQuery = database.prepare("SELECT data_json FROM render_jobs WHERE content_item_id = ? ORDER BY created_at DESC LIMIT 1");
    const pieces = [];
    for (const item of content) {
      const render = await renderQuery.get(item.id) as { data_json: string } | undefined;
      const renderStatus = render ? JSON.parse(render.data_json).status as string : null;
      pieces.push({ id: item.id, type: item.type, status: campaignPieceStatus({ revision: item.revision, hasExport: Boolean(await exportQuery.get(item.id)), renderStatus }), updatedAt: item.updated_at });
    }
    return { ...JSON.parse(campaign.data_json), pieces };
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const current = await withDatabase(async (database) => await database.prepare("SELECT data_json FROM campaigns WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!current) return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  const now = new Date().toISOString(); const existing = JSON.parse(current.data_json);
  const parsed = campaignSchema.safeParse({ ...existing, ...input, id, updatedAt: now });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.archivedAt && !existing.archivedAt && await withDatabase((database) => database.prepare("SELECT id FROM content_items WHERE campaign_id = ? AND archived_at IS NULL LIMIT 1").get(id))) return NextResponse.json({ error: "Archiva o mueve primero el contenido activo de esta campaña." }, { status: 409 });
  if (!parsed.data.archivedAt && parsed.data.brandKitId && !await withDatabase((database) => database.prepare("SELECT id FROM brand_kits WHERE id = ? AND archived_at IS NULL").get(parsed.data.brandKitId))) return NextResponse.json({ error: "No puedes restaurar una campaña con marca archivada." }, { status: 409 });
  await withDatabase((database) => database.prepare("UPDATE campaigns SET brand_kit_id = ?, data_json = ?, updated_at = ?, archived_at = ? WHERE id = ?").run(parsed.data.brandKitId, JSON.stringify(parsed.data), now, parsed.data.archivedAt, id));
  return NextResponse.json(parsed.data);
}
