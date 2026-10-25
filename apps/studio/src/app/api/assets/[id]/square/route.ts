import { execFile } from "node:child_process";
import { readFile, rename, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { resolveAssetPath } from "@/lib/asset-file";
import { mediaRoot, withDatabase } from "@/lib/db";

// Franja 230–1500 del 9:16: de la cabecera de escena a los subtítulos. Se escala a 1080 de alto y
// se centra sobre el mismo video desenfocado, para no perder ni títulos ni subtítulos. El fondo se
// desenfoca a 1/10 de tamaño y se amplía: se ve igual y cuesta ~3 veces menos que desenfocar a 1080.
const SQUARE_FILTER = "[0:v]split[a][b];[a]scale=108:108:force_original_aspect_ratio=increase,crop=108:108,boxblur=4,scale=1080:1080[bg];[b]crop=1080:1270:0:230,scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p[v]";

/** Versión 1:1 (1080×1080) de un MP4 ya renderizado, para los anuncios de Facebook e Instagram. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await withDatabase(async (database) => await database.prepare("SELECT data_json FROM assets WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!row) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  const asset = JSON.parse(row.data_json) as { storageKey: string; mimeType: string };
  if (asset.mimeType !== "video/mp4") return NextResponse.json({ error: "Solo se pueden convertir videos MP4." }, { status: 400 });
  const source = resolveAssetPath(mediaRoot, asset.storageKey);
  // El MP4 de un asset no cambia: la conversión se guarda al lado y se reutiliza.
  const cached = `${source}.square.mp4`;
  try {
    const exists = await stat(cached).then(() => true, () => false);
    if (!exists) {
      const partial = `${cached}.part.mp4`;
      await promisify(execFile)("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-filter_complex", SQUARE_FILTER, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "copy", "-movflags", "+faststart", partial], { timeout: 300_000 });
      await rename(partial, cached);
    }
    return new Response(await readFile(cached), { headers: { "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="${id.slice(0, 8)}-cuadrado.mp4"` } });
  } catch (error) {
    console.error("square:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No se pudo convertir el video a formato cuadrado." }, { status: 500 });
  }
}
