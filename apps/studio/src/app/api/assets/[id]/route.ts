import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { parseByteRange, resolveAssetPath } from "../../../../lib/asset-file";
import { mediaRoot, withDatabase } from "../../../../lib/db";

// Range permite adelantar audio y video en el navegador sin bajar el archivo entero.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const asset = await withDatabase(async (db) => await db.prepare("SELECT data_json FROM assets WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!asset) return NextResponse.json({ error: "Asset no encontrado." }, { status: 404 });
  const data = JSON.parse(asset.data_json) as { storageKey: string; mimeType: string };
  let path: string;
  try { path = resolveAssetPath(mediaRoot, data.storageKey); }
  catch { return NextResponse.json({ error: "Asset inválido." }, { status: 400 }); }
  let size: number;
  try { size = (await stat(path)).size; }
  catch { return NextResponse.json({ error: "Archivo de asset no encontrado." }, { status: 404 }); }
  const headers = { "Content-Type": data.mimeType, "Cache-Control": "private, max-age=31536000, immutable", "Accept-Ranges": "bytes" };
  const range = parseByteRange(request.headers.get("range"), size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = size ? Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream : null;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { ...headers, "Content-Length": String(end - start + 1), ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) },
  });
}
