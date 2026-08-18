import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { resetGoogleTokenCache } from "./google-auth.ts";
import { querySearchConsole, readSearchConsoleSite } from "./search-console.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "reader@proyecto.iam.gserviceaccount.com", private_key: privateKey });

process.env.SEARCH_CONSOLE_SITE_URL = "sc-domain:ejemplo.com";
assert.equal(readSearchConsoleSite(), "sc-domain:ejemplo.com", "acepta propiedad de dominio");
process.env.SEARCH_CONSOLE_SITE_URL = "https://ejemplo.com/";
assert.equal(readSearchConsoleSite(), "https://ejemplo.com/", "acepta prefijo de URL");
process.env.SEARCH_CONSOLE_SITE_URL = "ejemplo.com";
assert.throws(() => readSearchConsoleSite(), /sc-domain/, "rechaza formatos que la API no entiende");
process.env.SEARCH_CONSOLE_SITE_URL = "sc-domain:ejemplo.com";

let lastBody: Record<string, unknown> = {};
const responder = (payload: unknown, status = 200): typeof fetch => async (url, init) => {
  if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }));
  lastBody = JSON.parse(String(init?.body));
  assert.match(String(url), /sites\/sc-domain%3Aejemplo.com\/searchAnalytics\/query/, "codifica el siteUrl en la ruta");
  return new Response(JSON.stringify(payload), { status });
};

resetGoogleTokenCache();
const daily = await querySearchConsole({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder({ rows: [{ keys: ["2026-07-01"], clicks: 10, impressions: 400, ctr: 0.025, position: 12.345 }] }) });
assert.deepEqual(lastBody.dimensions, ["date"], "el total diario pide solo la fecha");
assert.equal(lastBody.dataState, "final", "solo consume datos consolidados");
assert.deepEqual(daily[0], { platform: "search-console", propertyId: "sc-domain:ejemplo.com", dimension: "date", dimensionValue: "", date: "2026-07-01", metrics: { clicks: 10, impressions: 400, ctr: 2.5, position: 12.35 } }, "normaliza ctr a porcentaje y redondea posición");

const byQuery = await querySearchConsole({ startDate: "2026-07-01", endDate: "2026-07-02", dimension: "query", request: responder({ rows: [{ keys: ["2026-07-01", "generador de carruseles"], clicks: 3, impressions: 90, ctr: 0.0333, position: 8 }] }) });
assert.deepEqual(lastBody.dimensions, ["date", "query"], "los desgloses conservan granularidad diaria");
assert.equal(byQuery[0].dimensionValue, "generador de carruseles", "guarda el valor del desglose");
assert.equal(byQuery[0].date, "2026-07-01", "la fecha sigue siendo la primera clave");

const partial = await querySearchConsole({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder({ rows: [{ keys: ["no-es-fecha"], clicks: 1 }, { keys: ["2026-07-02"] }] }) });
assert.equal(partial.length, 1, "descarta filas sin fecha válida");
assert.deepEqual(partial[0].metrics, { clicks: 0, impressions: 0, ctr: 0, position: 0 }, "las métricas ausentes valen cero");

assert.deepEqual(await querySearchConsole({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder({}) }), [], "un informe sin filas no rompe");
await assert.rejects(() => querySearchConsole({ startDate: "2026-07-02", endDate: "2026-07-01", request: responder({}) }), /invertido/, "valida el orden del rango");
await assert.rejects(() => querySearchConsole({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder({}, 403) }), /permiso de lectura/, "explica el 403 de permisos");
await assert.rejects(() => querySearchConsole({ startDate: "2026-07-01", endDate: "2026-07-02", request: responder({}, 429) }), /cuota/, "traduce la cuota agotada");

console.log("Search Console: propiedad, dimensiones, normalización y errores validados.");
