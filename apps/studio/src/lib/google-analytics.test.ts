import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readGa4PropertyId, runGa4Report } from "./google-analytics.ts";
import { resetGoogleTokenCache } from "./google-auth.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "reader@proyecto.iam.gserviceaccount.com", private_key: privateKey });

process.env.GA4_PROPERTY_ID = "properties/123456789";
assert.equal(readGa4PropertyId(), "123456789", "tolera el prefijo properties/ que muestra la UI de GA4");
process.env.GA4_PROPERTY_ID = "G-ABC123";
assert.throws(() => readGa4PropertyId(), /numérico/, "rechaza el measurement ID, que no sirve para la Data API");
process.env.GA4_PROPERTY_ID = "123456789";

let lastBody: Record<string, unknown> = {};
const responder = (payload: unknown, status = 200): typeof fetch => async (url, init) => {
  if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }));
  lastBody = JSON.parse(String(init?.body));
  assert.match(String(url), /properties\/123456789:runReport/, "consulta la propiedad configurada");
  return new Response(JSON.stringify(payload), { status });
};

const report = { metricHeaders: [{ name: "sessions" }, { name: "engagementRate" }], rows: [{ dimensionValues: [{ value: "20260701" }], metricValues: [{ value: "120" }, { value: "0.63421789" }] }] };

resetGoogleTokenCache();
const daily = await runGa4Report({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder(report) });
assert.deepEqual(lastBody.dateRanges, [{ startDate: "2026-07-01", endDate: "2026-07-02" }], "envía el rango pedido");
assert.deepEqual(lastBody.dimensions, [{ name: "date" }], "el total diario pide solo la fecha");
assert.deepEqual(daily[0], { platform: "google-analytics", propertyId: "123456789", dimension: "date", dimensionValue: "", date: "2026-07-01", metrics: { sessions: 120, engagementRate: 0.6342 }, }, "convierte YYYYMMDD a ISO y las métricas string a número");

const byPage = await runGa4Report({ startDate: "2026-07-01", endDate: "2026-07-02", dimension: "page", request: responder({ ...report, rows: [{ dimensionValues: [{ value: "20260701" }, { value: "/carruseles" }], metricValues: [{ value: "40" }, { value: "0.5" }] }] }) });
assert.deepEqual(lastBody.dimensions, [{ name: "date" }, { name: "pagePath" }], "traduce el desglose al nombre de la Data API");
assert.equal(byPage[0].dimensionValue, "/carruseles", "guarda la ruta como valor del desglose");

const messy = await runGa4Report({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder({ metricHeaders: [{ name: "sessions" }, { name: "keyEvents" }], rows: [{ dimensionValues: [{ value: "sin-fecha" }], metricValues: [{ value: "1" }] }, { dimensionValues: [{ value: "20260702" }], metricValues: [{ value: "9" }, { value: "no-numero" }] }] }) });
assert.equal(messy.length, 1, "descarta filas sin fecha válida");
assert.deepEqual(messy[0].metrics, { sessions: 9 }, "omite métricas no numéricas en lugar de romper la fila");

await assert.rejects(() => runGa4Report({ startDate: "2026-07-01", endDate: "2026-07-02", dimension: "inventada" as never, request: responder(report) }), /no soportada/, "valida la dimensión");
await assert.rejects(() => runGa4Report({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder({}, 403) }), /permiso de lectura/, "explica el 403 de permisos");

console.log("GA4: propiedad, dimensiones, normalización de métricas y errores validados.");
