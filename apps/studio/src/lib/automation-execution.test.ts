import assert from "node:assert/strict";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";
const db = await createTestDatabase(); process.env.DATABASE_URL = db.url;
try {
  const { executeAutomation, listAutomationRuns } = await import("./automation-execution.ts");
  const { trackGeneration } = await import("./generation-runs.ts");
  const { saveBudgetSettings } = await import("./budget-settings.ts");
  let unblock!: () => void;
  const held = new Promise<void>((resolve) => { unblock = resolve; });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const first = executeAutomation("fixture", "carousel", false, async () => {
    await trackGeneration({ operation: "fixture-script", model: "no-tariff" }, async () => ({ value: "draft", usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, webSearchCalls: 0, images: 0, characters: 0 } }));
    entered(); await held; return { status: "created", message: "Borrador creado", contentItemId: "draft" };
  });
  await started;
  try {
    await assert.rejects(() => executeAutomation("fixture", "carousel", false, async () => ({ status: "idle" })), /ejecutando/);
    const running = await listAutomationRuns("fixture");
    assert.equal(running[0].status, "running");
    assert.equal(running[0].operations[0].operation, "fixture-script");
    assert.equal(running[0].unknown, 1, "no afirma gratis una operación sin tarifa");
  } finally { unblock(); }
  await first;
  const history = await listAutomationRuns("fixture");
  assert.equal(history[0].status, "completed");
  assert.equal(history[0].automatic, false, "distingue ejecución manual de automática");
  assert.equal(history[0].result.contentItemId, "draft");
  assert.equal(history[0].operations.length, 1);
  assert.ok(history[0].durationMs !== null && history[0].durationMs >= 0);
  await executeAutomation("quiet", "carousel", true, async () => ({ status: "idle", quiet: true, message: "Nada que hacer" }));
  assert.equal((await listAutomationRuns("quiet")).length, 0, "un chequeo programado sin trabajo no ensucia el historial");
  await executeAutomation("quiet", "carousel", false, async () => ({ status: "idle", quiet: true, message: "Nada que hacer" }));
  assert.equal((await listAutomationRuns("quiet")).length, 1, "una ejecución manual siempre queda registrada");
  await db.query("INSERT INTO automation_runs (id,automation_id,kind,status,started_at,data_json) VALUES ('legacy','quiet','carousel','idle',$1,$2)", [new Date(0).toISOString(), JSON.stringify({ result: { status: "idle", message: "Sin huecos pendientes para hoy antes de su hora de publicación." }, error: null, automatic: true })]);
  assert.equal((await listAutomationRuns("quiet")).length, 1, "oculta los chequeos vacíos guardados antes");
  await assert.rejects(() => executeAutomation("broken", "radar", false, async () => { throw new Error("fixture failure"); }), /fixture failure/);
  assert.equal((await listAutomationRuns("broken"))[0].status, "failed");
  await saveBudgetSettings({ timezone: "UTC", limits: { day: 0.01, week: null, month: null }, blockAutomations: true });
  await db.query("UPDATE generation_runs SET cost_amount=1, created_at=$1", [new Date().toISOString()]);
  let charged = false;
  await assert.rejects(() => executeAutomation("budget", "radar", true, async () => { charged=true; return {}; }), /presupuesto/);
  assert.equal(charged, false);
  assert.equal((await listAutomationRuns("budget"))[0].status, "blocked");
  const [attributed] = await db.query("SELECT automation_run_id FROM generation_runs LIMIT 1");
  assert.equal(attributed.automation_run_id, history[0].id);
  console.log("Automation execution: historia persistida, atribución, exclusión concurrente, fallo y bloqueo antes de gastar verificados.");
} finally { await db.drop(); }
