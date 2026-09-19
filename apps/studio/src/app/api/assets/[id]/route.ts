import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveAssetPath } from "../../../../lib/asset-file";
import { mediaRoot, withDatabase } from "../../../../lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const asset = await withDatabase(async (db) => await db.prepare("SELECT data_json FROM assets WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!asset) return NextResponse.json({ error: "Asset no encontrado." }, { status: 404 });
  const data = JSON.parse(asset.data_json) as { storageKey: string; mimeType: string };
  let path: string;
  try { path = resolveAssetPath(mediaRoot, data.storageKey); }
  catch { return NextResponse.json({ error: "Asset inválido." }, { status: 400 }); }
  try { return new Response(await readFile(path), { headers: { "Content-Type": data.mimeType, "Cache-Control": "private, max-age=31536000, immutable" } }); }
  catch { return NextResponse.json({ error: "Archivo de asset no encontrado." }, { status: 404 }); }
}
