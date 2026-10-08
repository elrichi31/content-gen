import assert from "node:assert/strict";
import { assertAssetFile, assertAssetSignature, parseByteRange } from "./asset-file.ts";

assert.doesNotThrow(() => assertAssetFile(Buffer.alloc(11 * 1024 * 1024), "video/mp4"));
assert.throws(() => assertAssetFile(Buffer.alloc(0), "video/mp4"), /vacío/);
assert.throws(() => assertAssetFile(Buffer.from("x"), "application/octet-stream"), /no permitido/);
assert.doesNotThrow(() => assertAssetSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"));
assert.throws(() => assertAssetSignature(Buffer.from("no-es-png"), "image/png"), /no coincide/);
console.log("Assets: archivos mayores a 10 MB permitidos; vacío y MIME desconocido rechazados.");

// Range para adelantar videos: tramo abierto, cerrado, sufijo, recortado al final y fuera del archivo.
assert.deepEqual(parseByteRange("bytes=0-", 1000), { start: 0, end: 999 });
assert.deepEqual(parseByteRange("bytes=100-199", 1000), { start: 100, end: 199 });
assert.deepEqual(parseByteRange("bytes=-200", 1000), { start: 800, end: 999 });
assert.deepEqual(parseByteRange("bytes=900-5000", 1000), { start: 900, end: 999 });
assert.equal(parseByteRange("bytes=1000-", 1000), "invalid");
assert.equal(parseByteRange("bytes=5-2", 1000), "invalid");
assert.equal(parseByteRange(null, 1000), null);
assert.equal(parseByteRange("bytes=0-1,5-9", 1000), null, "varios tramos: se responde el archivo entero");
