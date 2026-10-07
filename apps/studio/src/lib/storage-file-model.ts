import type { StorageFileRow } from "./storage-videos.ts";

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
export function pageStorageFiles(files: StorageFileRow[], { q = "", kind = "all", page = 0 }: { q?: string; kind?: string; page?: number } = {}) {
  const needle = q.trim().toLocaleLowerCase("es");
  const filtered = files.filter(file => (kind === "all" || kind === file.kind || kind === "deletable" && file.deletable) && (!needle || `${file.name} ${file.pieceTitles.join(" ")}`.toLocaleLowerCase("es").includes(needle)));
  const pages = Math.max(1, Math.ceil(filtered.length / STORAGE_PAGE_SIZE));
  page = Math.min(pages - 1, Math.max(0, page));
  return { files: filtered.slice(page * STORAGE_PAGE_SIZE, (page + 1) * STORAGE_PAGE_SIZE), total: filtered.length, page, pages };
}
export type StorageFilePage = ReturnType<typeof pageStorageFiles>;
