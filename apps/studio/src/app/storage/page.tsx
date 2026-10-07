import { PageShell } from "@/components/page-shell";
import { StorageOverview } from "@/components/storage-overview";
import { StorageFiles } from "@/components/storage-files";
import { storageRoot, withDatabase } from "@/lib/db";
import { getStorageUsage } from "@/lib/storage-usage";
import { getStorageCatalog } from "@/lib/storage-videos";
import { pageStorageFiles } from "@/lib/storage-file-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function StoragePage() {
  let catalog: Awaited<ReturnType<typeof getStorageCatalog>> | null = null;
  try { catalog = await withDatabase(db => getStorageCatalog(storageRoot, db)); }
  catch { /* Mantener la medición del disco si no se puede consultar la base. Borrado deshabilitado. */ }
  const usage = catalog?.usage ?? await getStorageUsage(storageRoot);
  return <PageShell><StorageOverview usage={usage} />{catalog ? <StorageFiles key={usage.checkedAt} initial={{ ...pageStorageFiles(catalog.files), partial: usage.scanStatus !== "complete" }} /> : <p role="status" className="mt-6 text-[13px] text-muted-foreground">No se pudo cargar el detalle de archivos. Revisa la base de datos y pulsa Actualizar; el borrado no está disponible.</p>}</PageShell>;
}
