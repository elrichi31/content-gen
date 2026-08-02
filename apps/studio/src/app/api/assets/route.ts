import { NextResponse } from "next/server";
import { storeAssetStream } from "../../../lib/asset-storage";
import { withDatabase } from "../../../lib/db";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams; const campaignId = query.get("campaignId"); const kind = query.get("kind") ?? "all";
  if (!campaignId || !["all", "image", "audio", "video"].includes(kind)) return NextResponse.json({ error: "Filtro de assets inválido." }, { status: 400 });
  if (!await withDatabase((db) => db.prepare("SELECT id FROM campaigns WHERE id = ? AND archived_at IS NULL").get(campaignId))) return NextResponse.json({ error: "Campaña inválida." }, { status: 400 });
  const rows = await withDatabase((db) => db.prepare(`SELECT data_json FROM assets WHERE json_extract(data_json, '$.campaignId') = ?${kind === "all" ? "" : " AND json_extract(data_json, '$.mimeType') LIKE ?"} ORDER BY created_at DESC LIMIT 100`).all(...(kind === "all" ? [campaignId] : [campaignId, `${kind}/%`])) as { data_json: string }[]);
  return NextResponse.json(rows.map(({ data_json }) => { const asset = JSON.parse(data_json); return { ...asset, url: `/api/assets/${asset.id}` }; }));
}

export async function POST(request: Request) {
  const mimeType = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const encodedFilename = request.headers.get("x-asset-filename"); const campaignId = request.headers.get("x-campaign-id"); const contentItemId = request.headers.get("x-content-item-id");
  let filename = "";
  try { filename = decodeURIComponent(encodedFilename ?? ""); } catch { return NextResponse.json({ error: "Nombre de archivo inválido." }, { status: 400 }); }
  if (!request.body || [campaignId, contentItemId].some((id) => (id?.length ?? 0) > 200)) return NextResponse.json({ error: "Archivo inválido." }, { status: 400 });
  try {
    const asset = await storeAssetStream({ stream: request.body, mimeType, filename, campaignId, contentItemId });
    return NextResponse.json({ ...asset, url: `/api/assets/${asset.id}` }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el archivo." }, { status: 400 }); }
}
