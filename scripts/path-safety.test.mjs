import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { resolveAssetPath } from "../apps/studio/src/lib/asset-file.ts";

const root = resolve("storage/media");
const key = `assets/${"a".repeat(64)}.png`;
assert.equal(resolveAssetPath(root, key), resolve(root, key));
for (const unsafe of ["../secret", "assets/../secret", "assets\\secret.png", "C:\\Windows\\secret", "assets/con.png"]) assert.throws(() => resolveAssetPath(root, unsafe), /inválida/);
for (const name of ["../escape", "CON", "backup."]) {
  const result = spawnSync(process.execPath, ["scripts/backup.mjs", name], { encoding: "utf8" });
  assert.notEqual(result.status, 0, `backup debe rechazar ${name}`);
}
console.log("Rutas: traversal, absolutas y nombres reservados rechazados.");
