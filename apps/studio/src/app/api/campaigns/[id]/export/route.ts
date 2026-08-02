import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveAssetPath } from "../../../../../lib/asset-file";
import { campaignCaptions, campaignExportName } from "../../../../../lib/campaign-export";
import { storedZip } from "../../../../../lib/carousel-export";
import { mediaRoot, withDatabase } from "../../../../../lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await withDatabase((database) => {
    const campaign = database.prepare("SELECT data_json FROM campaigns WHERE id = ? AND archived_at IS NULL").get(id) as { data_json: string } | undefined;
    if (!campaign) return null;
    const pieces = (database.prepare("SELECT id, type, document_json FROM content_items WHERE campaign_id = ? AND archived_at IS NULL ORDER BY id").all(id) as { id: string; type: "carousel" | "ad" | "video"; document_json: string }[]).map((row) => ({ id: row.id, type: row.type, document: JSON.parse(row.document_json).document.data }));
    const exports = database.prepare("SELECT export.data_json AS export_json, asset.data_json AS asset_json, content.type FROM exports export JOIN assets asset ON asset.id = export.asset_id JOIN content_items content ON content.id = export.content_item_id WHERE content.campaign_id = ? AND content.archived_at IS NULL ORDER BY content.type, content.id, export.created_at").all(id) as { export_json: string; asset_json: string; type: string }[];
    return { campaign: JSON.parse(campaign.data_json) as { name: string }, pieces, exports };
  });
  if (!data) return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  let files;
  try { files = await Promise.all(data.exports.map(async (row) => { const exported = JSON.parse(row.export_json); const asset = JSON.parse(row.asset_json); return { name: campaignExportName(row.type, exported.contentItemId, exported.format), bytes: await readFile(resolveAssetPath(mediaRoot, asset.storageKey)) }; })); }
  catch { return NextResponse.json({ error: "La campaña contiene un asset inválido." }, { status: 400 }); }
  files.push({ name: "captions.txt", bytes: Buffer.from(campaignCaptions(data.pieces)) });
  const slug = data.campaign.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign";
  return new Response(storedZip(files), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}.zip"` } });
}
