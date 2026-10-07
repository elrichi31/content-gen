import { storageRoot, withDatabase } from "../../../../lib/db.ts";
import { getStorageCatalog, deleteStorageVideos, StorageDeleteError } from "../../../../lib/storage-videos.ts";
import { groupStorageFiles, pageStorageFiles } from "../../../../lib/storage-file-model.ts";
import { storageDeleteInputSchema, storageDeleteOriginAllowed } from "../../../../lib/storage-delete-request.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

// El proxy exige sesión para /api/storage. DELETE exige también el origen de la app y confirmación.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const page = Number(query.get("page") ?? 0);
  const kind = query.get("kind") ?? "all";
  const q = query.get("q") ?? "";
  const project = query.get("project") ?? "";
  if (!Number.isSafeInteger(page) || page < 0 || q.length > 200 || project.length > 200 || !["all", "video", "image", "audio", "renders", "other", "deletable"].includes(kind)) return Response.json({ error: "Filtro inválido." }, { status: 400, headers });
  try {
    const catalog = await withDatabase(db => getStorageCatalog(storageRoot, db));
    return Response.json({ ...pageStorageFiles(catalog.files, { page, kind, q, project }), groups: groupStorageFiles(catalog.files), partial: catalog.usage.scanStatus !== "complete" }, { headers });
  } catch { return Response.json({ error: "No se pudo leer la lista. Revisa el volumen y la base de datos." }, { status: 503, headers }); }
}

export async function DELETE(request: Request) {
  if (!storageDeleteOriginAllowed(request, process.env.BETTER_AUTH_URL)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers });
  const input = storageDeleteInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Confirma una selección válida de entre 1 y 100 videos." }, { status: 400, headers });
  try {
    const result = await withDatabase(db => deleteStorageVideos(storageRoot, input.data.files, db));
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof StorageDeleteError ? error.message : "No se pudo completar el borrado. Actualiza la lista antes de reintentar." }, { status: error instanceof StorageDeleteError ? error.status : 503, headers });
  }
}
