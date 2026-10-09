import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(s, c, next) { try { return next(s, c); } catch (error) { if (s.startsWith(".") && !/\.[a-z]+$/.test(s)) return next(`${s}.ts`, c); throw error; } } });
import { createTestDatabase } from "../../../../scripts/test-db.mjs";
const db = await createTestDatabase(); process.env.DATABASE_URL = db.url;
try {
  const queue = await import("./generation-queue.ts");
  // El runner real importa el servidor MCP entero; aquí se le pasa un ejecutor falso.
  const { drainGenerationQueue } = await import("./mcp/queue-runner.ts");
  const origin = "http://localhost";

  const first = await queue.enqueueGeneration({ tool: "generar_video_completo", args: { topic: "IA", campaignId: "c" }, origin });
  assert.equal(first.duplicate, false); assert.equal(first.request.status, "pendiente");
  const retry = await queue.enqueueGeneration({ tool: "generar_video_completo", args: { campaignId: "c", topic: "IA" }, origin });
  assert.equal(retry.duplicate, true, "el reintento del agente no encola otro video");
  assert.equal(retry.request.id, first.request.id);
  const other = await queue.enqueueGeneration({ tool: "generar_video_completo", args: { topic: "Cripto", campaignId: "c" }, origin });
  const rejected = await queue.enqueueGeneration({ tool: "crear_carrusel", args: { topic: "x" }, origin });

  // Nada corre sin aprobar.
  let ran: string[] = [];
  const fake = async ({ args, log }: { args: Record<string, unknown>; log: (m: string) => void }) => {
    ran.push(String(args.topic)); log("Paso: create");
    if (args.topic === "Cripto") return { status: "incomplete", failedStep: "image:s1", error: "Unsplash caído", contentItemId: "v2" };
    return { status: "queued", contentItemId: "v1", abrir: "/video?id=v1" };
  };
  await drainGenerationQueue(fake as never);
  assert.deepEqual(ran, []);

  await queue.decideGeneration(rejected.request.id, "reject");
  await assert.rejects(queue.decideGeneration(rejected.request.id, "approve"), /rechazada/);
  await queue.decideGeneration(first.request.id, "approve");
  await queue.decideGeneration(other.request.id, "approve");
  await assert.rejects(queue.decideGeneration(first.request.id, "approve"), (error: { status?: number }) => error.status === 409);

  // De uno en uno y por orden; una segunda llamada mientras corre no lanza otra generación.
  let concurrent = 0, peak = 0;
  const slow = async (input: Parameters<typeof fake>[0]) => { peak = Math.max(peak, ++concurrent); await new Promise((r) => setTimeout(r, 20)); try { return await fake(input); } finally { concurrent--; } };
  await Promise.all([drainGenerationQueue(slow as never), drainGenerationQueue(slow as never)]);
  assert.deepEqual(ran, ["IA", "Cripto"]); assert.equal(peak, 1);

  const done = await queue.getGenerationRequest(first.request.id);
  assert.equal(done.status, "completada"); assert.deepEqual((done.result as { contentItemId: string }).contentItemId, "v1");
  assert.deepEqual(done.log.map((line) => line.message), ["Encolada; espera aprobación.", "Aprobada.", "Generando…", "Paso: create", "Terminada."]);
  const failed = await queue.getGenerationRequest(other.request.id);
  assert.equal(failed.status, "fallida"); assert.match(failed.error ?? "", /image:s1.*Unsplash/);
  assert.equal((failed.result as { contentItemId: string }).contentItemId, "v2", "el borrador a medias queda a mano");

  // Terminado, el mismo pedido sí puede volver a encolarse.
  assert.equal((await queue.enqueueGeneration({ tool: "generar_video_completo", args: { topic: "IA", campaignId: "c" }, origin })).duplicate, false);

  // Un reinicio a mitad: lo que estaba en curso queda fallido, no se reintenta solo.
  const stuck = await queue.enqueueGeneration({ tool: "crear_articulo", args: { topic: "y" }, origin });
  await queue.decideGeneration(stuck.request.id, "approve");
  await queue.claimNextGeneration();
  await queue.failInterruptedGenerations();
  assert.equal((await queue.getGenerationRequest(stuck.request.id)).status, "fallida");
  ran = [];
  console.log("Cola de generación: aprobación, duplicados, ejecución de una en una, registro y reinicio verificados.");
} finally { await db.drop(); }
