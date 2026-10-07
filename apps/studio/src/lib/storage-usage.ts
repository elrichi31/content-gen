import { createHash } from "node:crypto";
import { lstat, opendir, statfs } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

export type StorageEntry = { key: string; name: string; kind: StorageCategory; sizeBytes: number; allocatedBytes: number; links: number; version: string; modifiedAt: string };

export type StorageCategory = "video" | "image" | "audio" | "renders" | "other";
type FileUsage = { files: number; logicalBytes: number; allocatedBytes: number };
export type StorageUsage = FileUsage & {
  checkedAt: string;
  disk: ReturnType<typeof diskUsage> | null;
  scanStatus: "complete" | "partial" | "unavailable";
  categories: Record<StorageCategory, FileUsage>;
  entries?: StorageEntry[];
};

/** bfree incluye la reserva del sistema; bavail es lo que realmente puede usar la aplicación. */
export function diskUsage(fs: { bsize: number; blocks: number; bfree: number; bavail: number }) {
  const totalBytes = Math.max(0, fs.blocks * fs.bsize);
  const freeBytes = Math.min(totalBytes, Math.max(0, fs.bfree * fs.bsize));
  const availableBytes = Math.min(freeBytes, Math.max(0, fs.bavail * fs.bsize));
  const usedBytes = totalBytes - freeBytes;
  return { totalBytes, usedBytes, availableBytes, reservedBytes: freeBytes - availableBytes, usedPercent: totalBytes ? usedBytes / totalBytes * 100 : 0 };
}

function categoryFor(relative: string): StorageCategory {
  if (relative.split(/[\\/]/)[0] === "renders") return "renders";
  const extension = extname(relative).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(extension)) return "video";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"].includes(extension)) return "image";
  if ([".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"].includes(extension)) return "audio";
  return "other";
}

/** Lee STORAGE_ROOT, no la DB: mide archivos únicos reales, incluidas copias y restos de render. */
export async function getStorageUsage(root: string, { maxEntries = 100_000, maxDurationMs = 5_000, includeEntries = false }: { maxEntries?: number; maxDurationMs?: number; includeEntries?: boolean } = {}): Promise<StorageUsage> {
  const empty = (): FileUsage => ({ files: 0, logicalBytes: 0, allocatedBytes: 0 });
  const result: StorageUsage = {
    ...empty(), checkedAt: new Date().toISOString(), disk: null, scanStatus: "complete",
    categories: { video: empty(), image: empty(), audio: empty(), renders: empty(), other: empty() },
    ...(includeEntries ? { entries: [] } : {}),
  };
  root = resolve(root);
  try {
    if (!(await lstat(root)).isDirectory()) throw new Error("not-directory");
  } catch { result.scanStatus = "unavailable"; return result; }
  try { result.disk = diskUsage(await statfs(root)); } catch { /* El desglose sigue siendo útil si statfs no está disponible. */ }
  const stack = [""];
  const seen = new Set<string>();
  const deadline = Date.now() + maxDurationMs;
  let visited = 0;
  while (stack.length) {
    if (visited >= maxEntries || Date.now() >= deadline) { result.scanStatus = "partial"; break; }
    const relative = stack.pop()!;
    try {
      const directory = await opendir(join(root, relative));
      for await (const entry of directory) {
        if (++visited > maxEntries || Date.now() >= deadline) { result.scanStatus = "partial"; break; }
        const child = join(relative, entry.name);
        try {
          // No sigue symlinks: evita bucles y contar archivos ajenos al volumen de la app.
          const metadata = await lstat(join(root, child));
          if (metadata.isDirectory()) { stack.push(child); continue; }
          if (!metadata.isFile()) continue;
          const identity = `${metadata.dev}:${metadata.ino}`;
          if (seen.has(identity)) continue;
          seen.add(identity);
          const group = result.categories[categoryFor(child)];
          const allocatedBytes = metadata.blocks * 512;
          result.entries?.push({ key: child.replaceAll("\\", "/"), name: basename(child), kind: categoryFor(child), sizeBytes: metadata.size, allocatedBytes, links: metadata.nlink, modifiedAt: metadata.mtime.toISOString(), version: createHash("sha256").update(`${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`).digest("hex") });
          for (const usage of [result, group]) {
            usage.files++;
            usage.logicalBytes += metadata.size;
            usage.allocatedBytes += allocatedBytes;
          }
        } catch { result.scanStatus = "partial"; }
      }
    } catch { result.scanStatus = "partial"; }
  }
  return result;
}
