import assert from "node:assert/strict";
import { repairDatabaseEncoding, repairText } from "./repair-text-encoding.mjs";
import { createTestDatabase } from "./test-db.mjs";

const BROKEN = "Campa�a integraci�n";

assert.deepEqual(repairText(BROKEN), { repaired: "Campaña integración", unknown: [] }, "repara las palabras conocidas");
assert.deepEqual(repairText("Zzz�zz"), { repaired: "Zzz�zz", unknown: ["Zzz�zz"] }, "no adivina palabras fuera del diccionario");
assert.deepEqual(repairText("Campaña sana"), { repaired: "Campaña sana", unknown: [] }, "deja intacto el texto correcto");

// Base sin las migraciones de la app: solo las dos tablas que la reparación tiene que distinguir.
const testDb = await createTestDatabase({ migrated: false });
try {
  await testDb.query("CREATE TABLE campaigns (id TEXT PRIMARY KEY, data_json TEXT, created_at TEXT); CREATE TABLE numbers (id INTEGER PRIMARY KEY, total INTEGER);");
  const insert = (id, name) => testDb.query("INSERT INTO campaigns VALUES ($1, $2, $3)", [id, JSON.stringify({ name }), "2026-08-02"]);
  await insert("uno", BROKEN);
  await insert("dos", "Sin problemas");
  await insert("tres", "Otro�caso");
  await testDb.query("INSERT INTO numbers VALUES (1, 42)");

  const report = await repairDatabaseEncoding(testDb.url);
  assert.equal(report.repaired, 1, "solo reescribe las filas que cambian");
  assert.deepEqual(report.changes[0], { table: "campaigns", column: "data_json", id: "uno" });
  assert.deepEqual(report.unknown, { "Otro�caso": 1 }, "reporta lo que no sabe reparar sin tocarlo");

  const nameOf = async (id) => JSON.parse((await testDb.query("SELECT data_json FROM campaigns WHERE id = $1", [id]))[0].data_json).name;
  assert.equal(await nameOf("uno"), "Campaña integración");
  assert.equal(await nameOf("tres"), "Otro�caso");
  assert.equal((await testDb.query("SELECT total FROM numbers WHERE id = 1"))[0].total, 42, "no toca columnas que no son texto");

  assert.equal((await repairDatabaseEncoding(testDb.url)).repaired, 0, "es idempotente");
  console.log("Reparación de codificación: diccionario, alcance e idempotencia validados.");
} finally {
  await testDb.drop();
}
