import assert from "node:assert/strict";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;

const now = "2026-07-01T00:00:00.000Z";
const count = async (sql: string) => Number((await testDb.query(sql))[0].total);
await testDb.query("INSERT INTO campaigns (id, schema_version, data_json, created_at, updated_at) VALUES ('camp', 1, '{}', $1, $1)", [now]);
await testDb.query("INSERT INTO content_items (id, schema_version, campaign_id, type, document_json, created_at, updated_at) VALUES ('gone', 1, 'camp', 'video', '{}', $1, $1), ('busy', 1, 'camp', 'video', '{}', $1, $1)", [now]);
await testDb.query("INSERT INTO assets VALUES ('asset', 1, '{}', $1)", [now]);
await testDb.query("INSERT INTO exports VALUES ('export', 1, 'gone', 'asset', '{}', $1)", [now]);
await testDb.query("INSERT INTO render_jobs VALUES ('done', 1, 'gone', '{\"status\":\"completed\"}', $1), ('running', 1, 'busy', '{\"status\":\"processing\"}', $1)", [now]);
await testDb.query("INSERT INTO generation_runs (id, schema_version, content_item_id, cost_amount, data_json, created_at) VALUES ('run', 1, 'gone', 1.5, '{\"contentItemId\":\"gone\"}', $1)", [now]);
await testDb.query("INSERT INTO scheduled_posts (id, schema_version, platform, date, time, status, content_item_id, data_json, created_at, updated_at) VALUES ('post', 1, 'tiktok', '2026-08-01', '10:00', 'planificada', 'gone', '{\"contentItemId\":\"gone\",\"title\":\"Hueco\"}', $1, $1)", [now]);

const { deleteContentItem, ContentDeleteError } = await import("./content-delete.ts");

try {
  await assert.rejects(() => deleteContentItem("no-existe"), (error: unknown) => error instanceof ContentDeleteError && error.status === 404, "avisa si la pieza no existe");
  await assert.rejects(() => deleteContentItem("busy"), (error: unknown) => error instanceof ContentDeleteError && error.status === 409, "no borra con un render en curso");
  assert.equal(await count("SELECT COUNT(*) AS total FROM content_items"), 2, "un borrado rechazado no toca nada");

  await deleteContentItem("gone");
  assert.equal(await count("SELECT COUNT(*) AS total FROM content_items WHERE id = 'gone'"), 0, "la pieza desaparece");
  assert.equal(await count("SELECT COUNT(*) AS total FROM exports") + await count("SELECT COUNT(*) AS total FROM render_jobs WHERE content_item_id = 'gone'"), 0, "renders y exportaciones se van con ella");
  assert.equal(await count("SELECT COUNT(*) AS total FROM assets"), 1, "el archivo sigue registrado para Almacenamiento");
  const run = (await testDb.query("SELECT content_item_id, cost_amount, data_json FROM generation_runs WHERE id = 'run'"))[0];
  assert.deepEqual([run.content_item_id, run.cost_amount, JSON.parse(String(run.data_json)).contentItemId], [null, 1.5, null], "el costo se conserva sin pieza");
  const post = (await testDb.query("SELECT content_item_id, data_json FROM scheduled_posts WHERE id = 'post'"))[0];
  assert.deepEqual([post.content_item_id, JSON.parse(String(post.data_json))], [null, { contentItemId: null, title: "Hueco" }], "el hueco del calendario queda reservado sin pieza");

  console.log("Borrado de contenido: dependencias limpiadas, costos y calendario conservados.");
} finally {
  await testDb.drop();
}
