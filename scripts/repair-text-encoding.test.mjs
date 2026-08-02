import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { repairDatabaseEncoding, repairText } from "./repair-text-encoding.mjs";

const BROKEN = "Campa�a integraci�n";

assert.deepEqual(repairText(BROKEN), { repaired: "Campaña integración", unknown: [] }, "repara las palabras conocidas");
assert.deepEqual(repairText("Zzz�zz"), { repaired: "Zzz�zz", unknown: ["Zzz�zz"] }, "no adivina palabras fuera del diccionario");
assert.deepEqual(repairText("Campaña sana"), { repaired: "Campaña sana", unknown: [] }, "deja intacto el texto correcto");

const root = await mkdtemp(join(tmpdir(), "content-gen-encoding-"));
try {
  const path = join(root, "test.sqlite");
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE campaigns (id TEXT PRIMARY KEY, data_json TEXT, created_at TEXT); CREATE TABLE numbers (id INTEGER PRIMARY KEY, total INTEGER);");
  database.prepare("INSERT INTO campaigns VALUES (?, ?, ?)").run("uno", JSON.stringify({ name: BROKEN }), "2026-08-02");
  database.prepare("INSERT INTO campaigns VALUES (?, ?, ?)").run("dos", JSON.stringify({ name: "Sin problemas" }), "2026-08-02");
  database.prepare("INSERT INTO campaigns VALUES (?, ?, ?)").run("tres", JSON.stringify({ name: "Otro�caso" }), "2026-08-02");
  database.prepare("INSERT INTO numbers VALUES (?, ?)").run(1, 42);
  database.close();

  const report = repairDatabaseEncoding(path);
  assert.equal(report.repaired, 1, "solo reescribe las filas que cambian");
  assert.deepEqual(report.changes[0], { table: "campaigns", column: "data_json", id: "uno" });
  assert.deepEqual(report.unknown, { "Otro�caso": 1 }, "reporta lo que no sabe reparar sin tocarlo");

  const check = new DatabaseSync(path);
  assert.equal(JSON.parse(check.prepare("SELECT data_json FROM campaigns WHERE id = ?").get("uno").data_json).name, "Campaña integración");
  assert.equal(JSON.parse(check.prepare("SELECT data_json FROM campaigns WHERE id = ?").get("tres").data_json).name, "Otro�caso");
  assert.equal(check.prepare("SELECT total FROM numbers WHERE id = 1").get().total, 42, "no toca columnas que no son texto");
  check.close();

  assert.equal(repairDatabaseEncoding(path).repaired, 0, "es idempotente");
  console.log("Reparación de codificación: diccionario, alcance e idempotencia validados.");
} finally {
  await rm(root, { recursive: true, force: true });
}
