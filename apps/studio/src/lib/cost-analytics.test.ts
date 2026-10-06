import assert from "node:assert/strict";
import * as analytics from "./cost-analytics.ts";
import { emptyUsage } from "@content-gen/domain/cost";

assert.equal(typeof analytics.summarizeUsage, "function", "el informe debe incluir modelos, herramientas y evolución diaria");
const rows = [
  { operation: "article-research", provider: "openai", status: "completed", cost_amount: 0.1, created_at: "2026-10-02T12:00:00Z", data_json: JSON.stringify({ model: "text", usage: { ...emptyUsage(), inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, webSearchCalls: 2 }, cost: { amount: 0.1 } }) },
  { operation: "article-write", provider: "openai", status: "failed", cost_amount: null, created_at: "2026-10-02T14:00:00Z", data_json: JSON.stringify({ model: "text" }) },
  { operation: "carousel-image", provider: "gemini", status: "completed", cost_amount: 0.067, created_at: "2026-10-04T12:00:00Z", data_json: JSON.stringify({ model: "image", usage: { ...emptyUsage(), images: 1 } }) },
  { operation: "video-scene-audio", provider: "elevenlabs", status: "running", cost_amount: null, created_at: "2026-10-04T14:00:00Z", data_json: "{}" },
];
const report = analytics.summarizeUsage(rows, "2026-10");
assert.equal(report.models[0].model, "text", "el ranking de uso ordena por operaciones, no por gasto");
assert.equal(report.models[0].untariffed, 1, "un fallo sin importe también deja un hueco contable");
assert.equal(report.usage.inputTokens, 100);
assert.equal(report.usage.cachedInputTokens, 40, "la caché es un subconjunto, no se suma a la entrada");
assert.equal(report.usage.webSearchCalls, 2);
assert.equal(report.tools.find(tool => tool.tool === "web-search")?.units, 2);
assert.equal(report.tools.find(tool => tool.tool === "web-search")?.runs, 1, "llamadas de búsqueda y generaciones son unidades distintas");
assert.equal(report.tools.find(tool => tool.tool === "image")?.units, 1);
assert.equal(report.daily.length, 31, "incluye días sin operaciones para una escala temporal real");
assert.equal(report.daily[1].total, 0.1);
assert.equal(report.daily[2].total, 0);
assert.equal(report.daily.at(-1)?.cumulative, 0.167, "la curva acumulada conserva el total congelado");
assert.equal(report.pending, 1, "los intentos en curso no se declaran tarifados");
const empty = analytics.summarizeUsage([], "2024-02");
assert.equal(empty.daily.length, 29, "los años bisiestos conservan el calendario real");
assert.deepEqual(empty.models, []);
assert.equal(empty.daily.at(-1)?.cumulative, 0);
const identities = analytics.summarizeUsage([rows[0], { ...rows[0], provider: "other", data_json: JSON.stringify({ model: "text", usage: { ...emptyUsage(), images: 1 } }) }], "2026-10");
assert.equal(identities.models.length, 2, "modelos homónimos de proveedores distintos no se mezclan");
assert.equal(report.unmetered, 2, "el consumo ausente no se disfraza de cero medido");
assert.ok(report.daily.every(day => Number.isFinite(day.total)));
console.log("Cost analytics: modelos, consumo, herramientas y serie diaria validados.");
