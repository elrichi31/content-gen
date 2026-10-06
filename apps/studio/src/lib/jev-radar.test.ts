import assert from "node:assert/strict";
import { generationRunSchema } from "@content-gen/domain/schemas";
assert.equal(generationRunSchema.safeParse({ id: "jev-test", schemaVersion: 1, provider: "typesafe", status: "completed", createdAt: "2026-10-06T00:00:00.000Z" }).success, true, "Typesafe es un proveedor válido para registrar consumo");
import { observeRadarWithJev } from "./jev-radar.ts";

const input = {
  topics: [{ id: "t1", title: "Automatización para clínicas", vertical: "Automatización", whyNow: "Nueva integración", angleForAgency: "Implementar flujos" }],
  recentTitles: ["Automatiza la recepción de tu clínica"],
  contexts: [{ vertical: "Automatización", offering: "Flujos para clínicas", audience: "PyMEs", brand: "Marca de automatización" }],
  focus: "Automatización en salud",
};
const before = JSON.stringify(input);
let calls = 0;
let tracked = false;
const result = await observeRadarWithJev(input, {
  env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture-not-a-real-key" },
  request: (async (url, init) => {
    calls++;
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fixture-not-a-real-key");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, "jev-1.13.0");
    assert.equal(payload.state.topics[0].title, input.topics[0].title);
    assert.equal(payload.questions.relevance_0.type, "noul");
    assert.equal(payload.questions.duplicate_0.type, "noul");
    assert.ok(init?.signal, "la evaluación tiene timeout/cancelación");
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { relevance_0: { type: "noul", noul: 0.95 }, duplicate_0: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 500, output_tokens: 12 } }));
  }) as typeof fetch,
  track: async (meta, work) => {
    tracked = true;
    assert.equal(meta.provider, "typesafe");
    assert.equal(meta.operation, "radar-jev-observe");
    assert.equal(meta.model, "jev-1.13.0");
    const done = await work();
    assert.equal(done.usage?.inputTokens, 500);
    assert.equal(done.usage?.outputTokens, 12);
    return done.value;
  },
});
assert.equal(result?.observation.status, "completed");
assert.equal(result?.observation.decisions[0]?.recommendation, "duplicate");
assert.equal(result?.observation.decisions[0]?.topicId, "t1");
assert.equal(result?.usage?.inputTokens, 500);
assert.equal(calls, 1);
assert.ok(tracked);
assert.equal(JSON.stringify(input), before, "observar no cambia temas ni memoria");
for (const env of [{}, { TYPESAFE_API_KEY: "fixture" }, { JEV_RADAR_MODE: "off", TYPESAFE_API_KEY: "fixture" }, { JEV_RADAR_MODE: "filter", TYPESAFE_API_KEY: "fixture" }]) {
  const off = await observeRadarWithJev(input, { env, request: (async () => { throw new Error("No debe llamar"); }) as typeof fetch, track: async () => { throw new Error("No debe registrar"); } });
  assert.equal(off, null, "solo el modo observe explícito habilita llamadas y gasto");
}
const noKey = await observeRadarWithJev(input, { env: { JEV_RADAR_MODE: "observe" }, track: async () => { throw new Error("No debe registrar"); } });
assert.match(noKey?.observation.error ?? "", /TYPESAFE_API_KEY/);
assert.equal(noKey?.usage, null);
async function passthrough<T>(_meta: { operation: string; provider: "typesafe"; model: string }, work: () => Promise<{ value: T; usage: import("@content-gen/domain/cost").Usage | null }>): Promise<T> { return (await work()).value; }
const evaluate = (raw: unknown, change: Partial<typeof input> = {}) => observeRadarWithJev({ ...input, ...change }, {
  env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture" }, track: passthrough,
  request: (async () => new Response(JSON.stringify(raw))) as typeof fetch,
});
const payload = (relevance: number, duplicate: number) => ({ model: "jev-1.13.0", answers: { relevance_0: { type: "noul", noul: relevance }, duplicate_0: { type: "noul", noul: duplicate } }, usage: { input_tokens: 100, output_tokens: 2 } });
for (const [relevance, duplicate, recommendation] of [[0.9, 0.1, "keep"], [0.5, 0.1, "review"], [0.1, 0.1, "off-topic"], [0.9, 0.8, "duplicate"]] as const) {
  assert.equal((await evaluate(payload(relevance, duplicate)))?.observation.decisions[0]?.recommendation, recommendation);
}
assert.equal((await evaluate(payload(0.95, 0.95), { recentTitles: [] }))?.observation.decisions[0]?.recommendation, "keep", "sin historial no puede existir un duplicado del historial");
for (const raw of [payload(2, 0), payload(Number.NaN, 0), { ...payload(0.9, 0), model: "otra-version" }, { ...payload(0.9, 0), answers: {} }, { ...payload(0.9, 0), answers: { ...payload(0.9, 0).answers, extra: { type: "noul", noul: 0.1 } } }]) {
  const bad = await evaluate(raw);
  assert.equal(bad?.observation.status, "failed");
  assert.deepEqual(bad?.observation.decisions, []);
  assert.equal(bad?.usage?.inputTokens, 100, "si la respuesta tiene consumo real, un resultado inválido no lo pierde");
}
const missingUsage = await evaluate({ ...payload(0.9, 0.1), usage: undefined });
assert.equal(missingUsage?.usage, null, "consumo ausente nunca se convierte en cero");
for (const status of [401, 429, 529]) {
  let attempts = 0;
  const unavailable = await observeRadarWithJev(input, { env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture" }, track: passthrough, request: (async () => { attempts++; return new Response("sensitive-data", { status }); }) as typeof fetch });
  assert.equal(unavailable?.observation.status, "failed");
  assert.equal(attempts, 1, "sin reintentos ni gasto multiplicado en un observador opcional");
  assert.ok(!unavailable?.observation.error?.includes("sensitive-data"));
}
const networkError = await observeRadarWithJev(input, { env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture" }, track: passthrough, request: (async () => { throw new Error("sensitive-data"); }) as typeof fetch });
assert.equal(networkError?.observation.status, "failed");
assert.ok(!networkError?.observation.error?.includes("sensitive-data"));
const empty = await observeRadarWithJev({ ...input, topics: [] }, { env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture" }, track: async () => { throw new Error("No debe registrar"); } });
assert.equal(empty, null);
const bounded = await observeRadarWithJev({ ...input, topics: Array.from({ length: 12 }, (_, index) => ({ ...input.topics[0], id: `t${index}`, whyNow: "x".repeat(4000), angleForAgency: "x".repeat(4000) })), recentTitles: Array.from({ length: 45 }, () => "x".repeat(1000)) }, {
  env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture" }, track: passthrough,
  request: (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.state.topics.length, 10);
    assert.equal(body.state.recentTitles.length, 30);
    assert.equal(body.state.recentTitles[0].length, 200);
    assert.equal(body.state.topics[0].whyNow.length, 500);
    assert.equal(Object.keys(body.questions).length, 20);
    assert.ok(!("evidence" in body.state.topics[0]), "solo se envían los campos necesarios");
    const answers = Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: "noul", noul: key.startsWith("relevance") ? 0.9 : 0.1 }]));
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 1000, output_tokens: 40 } }));
  }) as typeof fetch,
});
assert.equal(bounded?.observation.decisions.length, 10);
assert.equal(bounded?.observation.omitted, 2);
assert.equal(bounded?.observation.comparedTitles, 30);
let capturedFailure = "";
const captureFailure: typeof passthrough = async (meta, work) => {
  try { return await passthrough(meta, work); } catch (error) { capturedFailure = error instanceof Error ? error.message : "unknown"; throw error; }
};
for (const request of [(async () => { throw new Error("sensitive-data"); }) as typeof fetch, (async () => new Response("sensitive-data")) as typeof fetch]) {
  await observeRadarWithJev(input, { env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture" }, track: captureFailure, request });
  assert.ok(!capturedFailure.includes("sensitive-data"), "ni el registro de errores expone datos de red o respuestas inválidas");
}
const unicode = await observeRadarWithJev({ ...input, topics: Array.from({ length: 10 }, (_, index) => ({ ...input.topics[0], id: `t${index}`, vertical: `vertical-${index}`, title: "😀".repeat(500), whyNow: "😀".repeat(1000), angleForAgency: "😀".repeat(1000) })), contexts: Array.from({ length: 10 }, (_, index) => ({ vertical: `vertical-${index}`, offering: "😀".repeat(1000), audience: "😀".repeat(1000), brand: "😀".repeat(1000) })), recentTitles: Array.from({ length: 30 }, () => "😀".repeat(500)) }, {
  env: { JEV_RADAR_MODE: "observe", TYPESAFE_API_KEY: "fixture" }, track: passthrough,
  request: (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.ok(new TextEncoder().encode(JSON.stringify(body.state)).byteLength <= 24_000, "el estado tiene presupuesto conservador incluso con Unicode");
    const answers = Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: "noul", noul: 0.5 }]));
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 1000, output_tokens: 40 } }));
  }) as typeof fetch,
});
assert.equal(unicode?.observation.status, "completed", "las aserciones del transporte no se ocultan por el fallback");
console.log("JEV: contrato, consumo, activación, incertidumbre, fallos y límites validados.");
