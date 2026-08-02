import assert from "node:assert/strict";
import { assertAssetFile, assertAssetSignature } from "./asset-file.ts";

assert.doesNotThrow(() => assertAssetFile(Buffer.alloc(11 * 1024 * 1024), "video/mp4"));
assert.throws(() => assertAssetFile(Buffer.alloc(0), "video/mp4"), /vacío/);
assert.throws(() => assertAssetFile(Buffer.from("x"), "application/octet-stream"), /no permitido/);
assert.doesNotThrow(() => assertAssetSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"));
assert.throws(() => assertAssetSignature(Buffer.from("no-es-png"), "image/png"), /no coincide/);
console.log("Assets: archivos mayores a 10 MB permitidos; vacío y MIME desconocido rechazados.");
