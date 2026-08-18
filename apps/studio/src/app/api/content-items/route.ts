import { randomUUID } from "node:crypto";
import { adDocumentSchema } from "@content-gen/domain/ad";
import { articleDraftSchema } from "@content-gen/domain/article";
import { contentItemSchema } from "@content-gen/domain/schemas";
import { videoDocumentSchema } from "@content-gen/domain/video";
import { NextResponse } from "next/server";
import { validateAdImageAsset, validateVideoAssets } from "../../../lib/content-assets";
import { withDatabase } from "../../../lib/db";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams; const filters: string[] = []; const values: string[] = [];
  const type = query.get("type"); const campaignId = query.get("campaignId"); const brandKitId = query.get("brandKitId"); const status = query.get("status") ?? "active"; const text = query.get("q")?.trim();
  if (type && ["carousel", "ad", "video", "article"].includes(type)) { filters.push("content.type = ?"); values.push(type); }
  if (campaignId) { filters.push("content.campaign_id = ?"); values.push(campaignId); }
  if (brandKitId) { filters.push("campaign.brand_kit_id = ?"); values.push(brandKitId); }
  if (status === "archived") filters.push("content.archived_at IS NOT NULL"); else if (status !== "all") filters.push("content.archived_at IS NULL");
  if (text) { filters.push("(content.document_json LIKE ? OR campaign.data_json LIKE ?)"); values.push(`%${text.slice(0, 200)}%`, `%${text.slice(0, 200)}%`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const items = await withDatabase((database) => (database.prepare(`SELECT content.document_json, content.revision, content.archived_at, campaign.data_json AS campaign_json, campaign.brand_kit_id, (SELECT COUNT(*) FROM exports WHERE exports.content_item_id = content.id) AS export_count FROM content_items content JOIN campaigns campaign ON campaign.id = content.campaign_id ${where} ORDER BY content.updated_at DESC`).all(...values) as { document_json: string; revision: number; archived_at: string | null; campaign_json: string; brand_kit_id: string | null; export_count: number }[]).map((row) => ({ ...JSON.parse(row.document_json), revision: row.revision, archivedAt: row.archived_at, campaignName: JSON.parse(row.campaign_json).name, brandKitId: row.brand_kit_id, exportCount: row.export_count })));
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null); const now = new Date().toISOString();
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const parsed = contentItemSchema.safeParse({ ...input, id: randomUUID(), schemaVersion: 1, revision: 0, createdAt: now, updatedAt: now, archivedAt: null });
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
  const campaign = await withDatabase((database) => database.prepare("SELECT id FROM campaigns WHERE id = ? AND archived_at IS NULL").get(data.campaignId));
  if (!campaign) return NextResponse.json({ error: "La campaña no existe o está archivada." }, { status: 400 });
  try { if (ad?.success) await validateAdImageAsset(ad.data, data.campaignId); if (video?.success) await validateVideoAssets(video.data, data.campaignId); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Los assets del contenido no son válidos." }, { status: 400 }); }
  await withDatabase((database) => database.prepare("INSERT INTO content_items (id, schema_version, campaign_id, type, document_json, revision, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(data.id, 1, data.campaignId, data.type, JSON.stringify(data), 0, now, now, null));
  return NextResponse.json(data, { status: 201 });
}
