import assert from "node:assert/strict";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;

const seededAt = "2026-07-01T00:00:00.000Z";
await testDb.query(`
  INSERT INTO campaigns (id, schema_version, data_json, created_at, updated_at, archived_at) VALUES
    ('camp1', 1, '{"name":"Lanzamiento"}', $1, $1, NULL),
    ('camp2', 1, '{"name":"Archivada"}', $1, $1, $1);
`, [seededAt]);
await testDb.query(`
  INSERT INTO content_items (id, schema_version, campaign_id, type, document_json, created_at, updated_at, archived_at) VALUES
    ('item1', 1, 'camp1', 'carousel', '{"document":{"data":{"title":"Guía de lanzamiento"}}}', $1, $1, NULL),
    ('item2', 1, 'camp1', 'video', '{"document":{"data":{}}}', $1, $1, $1),
    ('item3', 1, 'camp1', 'carousel', '{"document":{"data":{}}}', $1, $1, NULL);
`, [seededAt]);

const { createPost, createRule, deletePost, deleteRule, listPosts, listRules, monthCalendar, ScheduleError, updatePost, updateRule } = await import("./schedule.ts");

try {
  const rule = await createRule({ name: "Instagram base", platform: "instagram", weekdays: [1, 3, 5], times: ["19:00"], startDate: "2026-08-01" });
  assert.equal(rule.active, true, "una pauta nueva nace activa");
  assert.equal(rule.campaignId, null, "sin campaña la pauta es global");

  await assert.rejects(() => createRule({ name: "Sin días", platform: "tiktok", weekdays: [], times: ["10:00"], startDate: "2026-08-01" }), /inválida/, "rechaza una pauta sin días");
  await assert.rejects(() => createRule({ name: "Campaña muerta", platform: "tiktok", weekdays: [2], times: ["10:00"], startDate: "2026-08-01", campaignId: "camp2" }), /archivada/, "no admite campañas archivadas");
  await assert.rejects(() => updateRule("no-existe", { name: "x" }), /no existe/, "avisa si la pauta no existe");

  const desactivada = await updateRule(rule.id, { active: false });
  assert.equal(desactivada.active, false, "se puede pausar una pauta");
  assert.equal(desactivada.createdAt, rule.createdAt, "la fecha de creación no se toca al editar");
  assert.equal((await listRules({ includeInactive: false })).length, 0, "las pautas pausadas se pueden excluir");
  await updateRule(rule.id, { active: true });

  const tiktok = await createRule({ name: "TikTok campaña", platform: "tiktok", weekdays: [2], times: ["18:00"], startDate: "2026-08-01", campaignId: "camp1" });
  assert.equal((await listRules({ campaignId: "camp1" })).length, 2, "una campaña ve sus pautas y las globales");

  // Asignar una pieza debe traerse su campaña sin que la UI tenga que mandarla.
  const post = await createPost({ platform: "instagram", date: "2026-08-03", time: "19:00", contentItemId: "item1", ruleId: rule.id });
  assert.equal(post.campaignId, "camp1", "la publicación hereda la campaña del contenido");
  assert.equal(post.title, "Guía de lanzamiento", "sin título propio toma el del documento");
  assert.equal(post.status, "planificada", "el estado inicial es planificada");

  await assert.rejects(() => createPost({ platform: "instagram", date: "2026-08-03", time: "19:00" }), (error: unknown) => error instanceof ScheduleError && error.status === 409, "no deja dos publicaciones en el mismo hueco");
  await createPost({ platform: "tiktok", date: "2026-08-03", time: "19:00" });
  assert.equal((await listPosts()).length, 2, "el mismo día y hora en otra plataforma sí es otro hueco");
  const sinTitulo = await createPost({ platform: "youtube", date: "2026-08-04", time: "19:00", contentItemId: "item3" });
  assert.equal(sinTitulo.title, "Carrusel", "un documento sin título cae en el nombre del formato");
  await deletePost(sinTitulo.id);
  await assert.rejects(() => createPost({ platform: "instagram", date: "2026-08-04", time: "19:00", contentItemId: "item2" }), /archivado/, "no planifica contenido archivado");
  await assert.rejects(() => createPost({ platform: "instagram", date: "03-08-2026", time: "19:00" }), /inválida/, "valida el formato de fecha");

  const renombrada = await updatePost(post.id, { title: "Carrusel de apertura", status: "lista" });
  assert.equal(renombrada.title, "Carrusel de apertura", "respeta el título escrito a mano");
  assert.equal(renombrada.status, "lista", "marca la pieza como lista");
  const movida = await updatePost(post.id, { date: "2026-08-05" });
  assert.equal(movida.date, "2026-08-05", "se puede mover de día");
  assert.equal(movida.title, "Carrusel de apertura", "mover no reescribe el título");
  await assert.rejects(() => updatePost(post.id, { platform: "tiktok", date: "2026-08-03", time: "19:00" }), (error: unknown) => error instanceof ScheduleError && error.status === 409, "mover a un hueco ocupado falla");

  assert.equal((await listPosts({ startDate: "2026-08-04" })).length, 1, "filtra por fecha inicial");
  // Filtrar por campaña trae las suyas y las que no tienen ninguna, igual que con las pautas.
  const deCampaña = await listPosts({ campaignId: "camp1" });
  assert.deepEqual(new Set(deCampaña.map((row) => row.campaignId)), new Set(["camp1", null]), "la campaña ve lo suyo y lo global");

  // Un hueco reservado sin campaña no puede desaparecer al filtrar: la pantalla lo pintaría
  // libre y planificar encima chocaría con la clave única sin explicación.
  const globalPost = await createPost({ platform: "linkedin", date: "2026-08-06", time: "09:00", title: "Reservado" });
  assert.equal(globalPost.campaignId, null, "un hueco sin pieza puede quedarse sin campaña");
  assert.ok((await listPosts({ campaignId: "camp1" })).some((row) => row.id === globalPost.id), "lo global sigue visible al filtrar por campaña");

  // Agosto de 2026 empieza en sábado: la rejilla arranca el 27 de julio.
  const calendario = await monthCalendar("2026-08");
  assert.deepEqual([calendario.startDate, calendario.endDate], ["2026-08-01", "2026-08-31"], "acota el mes pedido");
  assert.equal(calendario.weeks[0][0], "2026-07-27", "la rejilla incluye el relleno del mes anterior");
  assert.equal(calendario.days.length, calendario.weeks.flat().length, "hay un día por celda de la rejilla");
  const dia5 = calendario.days.find((day) => day.date === "2026-08-05");
  assert.equal(dia5?.slots.find((slot) => slot.platform === "instagram")?.post?.id, post.id, "la publicación movida aparece en su nuevo día");
  assert.ok(calendario.summary.slots > calendario.summary.published, "el resumen cuenta huecos libres");
  await assert.rejects(() => monthCalendar("agosto"), /YYYY-MM/, "valida el mes");

  // Borrar la pauta no puede llevarse por delante lo que ya estaba planificado.
  await deleteRule(tiktok.id);
  assert.equal((await listRules()).length, 1, "la pauta desaparece");
  const conservada = (await listPosts()).find((item) => item.platform === "tiktok");
  assert.ok(conservada, "la publicación de esa pauta sigue ahí");
  const huerfana = (await monthCalendar("2026-08")).days.find((day) => day.date === "2026-08-03")?.slots.find((slot) => slot.platform === "tiktok");
  assert.equal(huerfana?.post?.id, conservada.id, "y se sigue viendo en el calendario aunque ya no haya pauta");
  assert.equal(huerfana?.ruleId, null, "el hueco huérfano no apunta a una pauta borrada");

  const antesDeBorrar = (await listPosts()).length;
  await deletePost(post.id);
  assert.equal((await listPosts()).length, antesDeBorrar - 1, "se puede vaciar un hueco");
  await assert.rejects(() => deletePost(post.id), /no existe/, "borrar dos veces avisa");

  console.log("Cronograma (persistencia): pautas, huecos únicos, herencia de campaña y calendario del mes validados.");
} finally {
  await testDb.drop();
}
