import assert from "node:assert/strict";
import { summarizeSelection, pageStorageFiles } from "./storage-file-model.ts";
import type { StorageFileRow } from "./storage-videos.ts";
const file = { key: "media/assets/a.mp4", name: "final.mp4", kind: "video", sizeBytes: 7000, allocatedBytes: 8192, links: 1, version: "v", modifiedAt: "2026-10-07T00:00:00Z", deletable: true, reason: "Video final", exportCount: 2, pieceTitles: ["Uno"] } as StorageFileRow;
assert.deepEqual(summarizeSelection([file, file, { ...file, key: "media/assets/b.mp4", allocatedBytes: 4096, exportCount: 1 }]), { count: 2, estimatedBytes: 12288, exports: 3 });
assert.equal(summarizeSelection([{ ...file, deletable: false }]).count, 0);
assert.equal(pageStorageFiles([file, { ...file, name: "Foto", kind: "image" }], { q: "FINAL", kind: "video", page: 0 }).total, 1);
assert.equal(pageStorageFiles(Array.from({ length: 51 }, () => file), { page: 1 }).files.length, 1);
console.log("Selección: tamaño estimado deduplicado, exportaciones compartidas, filtros y paginación verificados.");
