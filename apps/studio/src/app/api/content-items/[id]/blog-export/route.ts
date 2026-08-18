import { NextResponse } from "next/server";
import { BlogExportError, exportArticle, previewExport, siteIndex } from "@/lib/blog-export";
import { withDatabase } from "@/lib/db";

async function readArticle(id: string) {
  const row = await withDatabase((database) => database
    .prepare("SELECT type, document_json FROM content_items WHERE id = ? AND archived_at IS NULL")
    .get(id)) as { type: string; document_json: string } | undefined;
  if (!row) throw new BlogExportError("El contenido no existe o está archivado.", 404);
  if (row.type !== "article") throw new BlogExportError("Solo los artículos se publican en el blog.", 400);
  return (JSON.parse(row.document_json) as { document: { data: unknown } }).document.data;
}

function fail(error: unknown) {
  if (error instanceof BlogExportError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Error exportando al blog", error);
  return NextResponse.json({ error: "No se pudo exportar el artículo." }, { status: 500 });
}

/** Qué pasaría al exportar: si falta algo, si el slug ya existe y qué se usa en el sitio. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [preview, index] = await Promise.all([previewExport(await readArticle(id)), siteIndex()]);
    return NextResponse.json({ ...preview, site: index });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = await request.json().catch(() => null) as { overwrite?: unknown } | null;
  try {
    return NextResponse.json(await exportArticle(await readArticle(id), { overwrite: input?.overwrite === true }));
  } catch (error) {
    return fail(error);
  }
}
