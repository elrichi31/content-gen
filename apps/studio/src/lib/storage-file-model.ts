import type { StorageFileRow, StorageProject } from "./storage-videos.ts";

export const STORAGE_PAGE_SIZE = 50;
export function formatStorageBytes(value: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${new Intl.NumberFormat("es", { maximumFractionDigits: index ? 1 : 0 }).format(value)} ${units[index]}`;
}
export function summarizeSelection(files: StorageFileRow[]) {
  const unique = [...new Map(files.filter(file => file.deletable).map(file => [file.key, file])).values()];
  return { count: unique.length, estimatedBytes: unique.reduce((sum, file) => sum + file.allocatedBytes, 0), exports: unique.reduce((sum, file) => sum + file.exportCount, 0) };
}
/** `project`: id de la pieza (o `brand:<id>`), o `none` para lo que no pertenece a ninguna. */
export function pageStorageFiles(files: StorageFileRow[], { q = "", kind = "all", page = 0, project = "" }: { q?: string; kind?: string; page?: number; project?: string } = {}) {
  const needle = q.trim().toLocaleLowerCase("es");
  const inProject = (file: StorageFileRow) => !project || (project === "none" ? !file.projects?.length : Boolean(file.projects?.some(item => item.id === project)));
  const filtered = files.filter(file => (kind === "all" || kind === file.kind || kind === "deletable" && file.deletable) && inProject(file) && (!needle || `${file.name} ${file.pieceTitles.join(" ")}`.toLocaleLowerCase("es").includes(needle)));
  const pages = Math.max(1, Math.ceil(filtered.length / STORAGE_PAGE_SIZE));
  page = Math.min(pages - 1, Math.max(0, page));
  return { files: filtered.slice(page * STORAGE_PAGE_SIZE, (page + 1) * STORAGE_PAGE_SIZE), total: filtered.length, page, pages };
}
export type StorageFilePage = ReturnType<typeof pageStorageFiles>;

export type StorageGroup = { project: StorageProject | null; files: number; allocatedBytes: number; kinds: Partial<Record<StorageFileRow["kind"], number>> };

/**
 * Archivos agrupados por la pieza a la que pertenecen, de más pesado a menos. Un archivo usado por
 * varias piezas cuenta en cada una; lo que no pertenece a ninguna va en un grupo aparte (`project: null`).
 */
export function groupStorageFiles(files: StorageFileRow[]): StorageGroup[] {
  const groups = new Map<string, StorageGroup>();
  for (const file of files) {
    const owners: (StorageProject | null)[] = file.projects?.length ? file.projects : [null];
    for (const project of owners) {
      const key = project?.id ?? "none";
      const group = groups.get(key) ?? { project, files: 0, allocatedBytes: 0, kinds: {} };
      group.files++;
      group.allocatedBytes += file.allocatedBytes;
      group.kinds[file.kind] = (group.kinds[file.kind] ?? 0) + 1;
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => Number(!a.project) - Number(!b.project) || b.allocatedBytes - a.allocatedBytes);
}
