import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import console from "node:console";
const { Response } = globalThis;
import { radarRunSchema } from "@content-gen/domain/radar";
import { loadPricing } from "../src/lib/pricing.ts";
import { emptyUsage, priceUsage } from "@content-gen/domain/cost";

// Real scanner/client and domain logic, with only persistence/accounting I/O isolated.
const fixture = { run: null, topics: [], operations: [], calls: [], failJev: false };
globalThis.__jevFixture = fixture;
registerHooks({
  load(url, context, next) {
    const lib = fileURLToPath(new URL("../src/lib/", import.meta.url));
    const source = url === new URL("radar.ts", `file://${lib}`).href ? `
      import { radarRunSchema } from "@content-gen/domain/radar";
      const f = globalThis.__jevFixture;
      export class RadarError extends Error {}
      export const expireStaleRuns = async () => {};
      export const activeRadarRun = async () => null;
      export const listWatchlist = async () => [{ vertical: "Automatización", offering: "Flujos para clínicas", audience: "PyMEs", brandKitId: "marca" }];
      export const recentMemory = async () => ({ titles: ["Automatiza la recepción de tu clínica"], fingerprints: [] });
      export const brandProfiles = async () => { if (f.failContext) throw new Error("context unavailable"); return new Map([["marca", { name: "Clínica Labs", business: { sector: "Salud", offering: "Flujos", audience: "Clínicas", valueProposition: "Automatizar recepción" } }]]); };
      export const beginRadarRun = async (input) => f.run = radarRunSchema.parse({ id: "run", schemaVersion: 1, status: "running", startedAt: "2026-10-06T00:00:00.000Z", ...input });
      export const finishRadarRun = async (_id, patch) => f.run = radarRunSchema.parse({ ...f.run, ...patch });
      export const saveRunResearch = async (_id, research) => { f.run.research = research; };
      export const getRadarRun = async () => f.run;
      export const saveTopics = async (topics) => { f.topics.push(...topics); return { inserted: topics.length, skipped: 0 }; };
    ` : url === new URL("generation-runs.ts", `file://${lib}`).href ? `
      export async function trackGeneration(meta, work) {
        const done = await work();
        globalThis.__jevFixture.operations.push({ ...meta, usage: done.usage });
        return done.value;
      }
    ` : url === new URL("generation-costs.ts", `file://${lib}`).href ? `export const monthSpend = async () => ({ budget: null, amount: 0 });` : null;
    if (source) return { format: "module", shortCircuit: true, source };
    return next(url, context);
  },
});
process.env.CONTENT_GEN_AI_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "fixture-not-a-real-key";
process.env.TYPESAFE_API_KEY = "fixture-not-a-real-key";
process.env.JEV_RADAR_MODE = "off";
const { scanRadar, restructureRun } = await import("../src/lib/radar-scan.ts");
const fakeFetch = async (url, init) => {
  const payload = JSON.parse(String(init.body));
  fixture.calls.push({ url, payload });
  if (url === "https://api.typesafe.ai/v1/systemone") {
    if (fixture.failJev) return new Response("private upstream error", { status: 429 });
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { relevance_0: { type: "noul", noul: 0.95 }, duplicate_0: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 500, output_tokens: 12 } }));
  }
  if (payload.tools) return new Response(JSON.stringify({ output_text: "ejemplo.com y otro.org confirman una integración nueva", usage: { input_tokens: 1000, output_tokens: 100 }, output: [{ type: "message", content: [{ type: "output_text", text: "Notas", annotations: [{ type: "url_citation", url: "https://ejemplo.com/noticia", title: "Noticia" }, { type: "url_citation", url: "https://otro.org/noticia", title: "Otra" }] }] }] }));
  return new Response(JSON.stringify({ output_text: JSON.stringify({ topics: [{ title: "Automatización para clínicas", why_now: "Esta semana se publicó una integración", vertical: "Automatización", angle_for_agency: "Podemos automatizar la recepción de las clínicas", evidence: [{ url: "https://ejemplo.com/noticia", title: "Noticia", published_at: "2026-10-05" }, { url: "https://otro.org/noticia", title: "Otra", published_at: "2026-10-05" }], formats: [{ type: "article", reason: "Explicar la integración", keyword: "clínicas", intent: "informativa" }], shelf_life: "evergreen", confidence: 0.8 }] }), usage: { input_tokens: 1000, output_tokens: 100 } }));
};
const options = { request: fakeFetch, now: new Date("2026-10-06T12:00:00.000Z") };
const off = await scanRadar({}, options);
assert.equal(fixture.calls.length, 2);
assert.equal(off.run.jevObservation ?? null, null);
assert.equal(off.summary.kept, 1);
const baseCost = off.run.cost.amount;
fixture.calls.length = 0;
fixture.operations.length = 0;
process.env.JEV_RADAR_MODE = "observe";
const on = await scanRadar({}, options);
assert.equal(fixture.calls.length, 3, "JEV hace una sola evaluación adicional por corrida");
assert.equal(on.summary.kept, off.summary.kept, "un posible duplicado no se descarta en observación");
assert.equal(on.topics[0].score, off.topics[0].score, "JEV no cambia el score existente");
assert.equal(on.run.jevObservation.status, "completed");
assert.equal(on.run.jevObservation.decisions[0].recommendation, "duplicate");
assert.equal(on.run.usage.inputTokens, off.run.usage.inputTokens + 500);
const jevCost = priceUsage({ ...emptyUsage(), inputTokens: 500, outputTokens: 12 }, { pricing: loadPricing(), model: "jev-1.13.0" });
assert.notEqual(jevCost.amount, null, "JEV tiene tarifa conocida");
assert.ok(Math.abs(on.run.cost.amount - baseCost - jevCost.amount) < 1e-9, "el costo total de Radar incluye JEV con su propia tarifa");
assert.ok(fixture.operations.some(op => op.provider === "typesafe" && op.operation === "radar-jev-observe"));
const jevCall = fixture.calls.find(call => call.url.includes("typesafe"));
assert.ok(jevCall.payload.state.contexts[0].brand.includes("Clínica Labs"), "JEV recibe el contexto de la marca");
const original = JSON.stringify(on.run);
const restructured = await restructureRun(on.run.id, {}, options);
assert.equal(restructured.jevObservation.status, "completed", "también observa reinterpretaciones");
assert.equal(JSON.stringify(fixture.run), original, "reinterpretar no cambia el costo ni la observación históricos");
// Optional observation must not introduce new persistence prerequisites in mode off.
fixture.failContext = true;
process.env.JEV_RADAR_MODE = "off";
const offReinterpretation = await restructureRun(on.run.id, {}, options);
assert.equal(offReinterpretation.summary.kept, 1);
assert.equal(offReinterpretation.jevObservation, null);
process.env.JEV_RADAR_MODE = "observe";
const noContext = await restructureRun(on.run.id, {}, options);
assert.equal(noContext.summary.kept, 1, "un fallo leyendo contexto para JEV no tira una reinterpretación");
assert.equal(noContext.jevObservation.status, "failed");
fixture.failContext = false;
fixture.failJev = true;
const failed = await scanRadar({}, options);
assert.equal(failed.summary.kept, 1);
assert.equal(failed.run.status, "completed");
assert.equal(failed.run.jevObservation.status, "failed");
assert.equal(failed.run.jevObservation.error.includes("private upstream"), false);
assert.equal(failed.run.cost.amount, null, "un consumo potencial no medido no se disfraza como un total completo");
assert.equal(radarRunSchema.parse(failed.run).jevObservation.status, "failed");
console.log("JEV Radar: scanner real con persistencia aislada, modo off/observe, costos, reinterpretación y fallback validados.");
