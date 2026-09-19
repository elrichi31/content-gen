import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";

const testDb = await createTestDatabase(); process.env.DATABASE_URL = testDb.url;

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "reader@proyecto.iam.gserviceaccount.com", private_key: privateKey });

const { configuredPlatforms, parseSyncDays, syncAnalytics } = await import("./analytics-sync.ts");
const { listMetricSnapshots } = await import("./metric-snapshots.ts");

assert.equal(parseSyncDays(undefined), 28, "por defecto sincroniza cuatro semanas");
assert.equal(parseSyncDays("7"), 7, "respeta la ventana configurada");
assert.throws(() => parseSyncDays("0"), /entre 1 y 460/, "valida la ventana");
assert.throws(() => parseSyncDays("mucho"), /entre 1 y 460/, "rechaza valores no numéricos");

delete process.env.SEARCH_CONSOLE_SITE_URL;
delete process.env.GA4_PROPERTY_ID;
delete process.env.TIKTOK_CLIENT_KEY;
delete process.env.TIKTOK_CLIENT_SECRET;
assert.deepEqual(configuredPlatforms(), { "search-console": false, "google-analytics": false, tiktok: false }, "sin propiedades no hay nada configurado");
const none = await syncAnalytics({ days: 7, request: async () => { throw new Error("no debería llamar a la red"); } });
assert.deepEqual(none.results.map((result) => result.status), ["skipped", "skipped", "skipped"], "sin configuración no se llama a ninguna API");
assert.match(none.results[0].error ?? "", /SEARCH_CONSOLE_SITE_URL/, "explica qué falta configurar");

process.env.SEARCH_CONSOLE_SITE_URL = "sc-domain:ejemplo.com";
process.env.GA4_PROPERTY_ID = "123456789";

const requested: string[] = [];
const request: typeof fetch = async (url, init) => {
  const target = String(url);
  if (target.includes("oauth2")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }));
  if (target.includes("tiktokapis")) return new Response(JSON.stringify({ data: { user: { open_id: "abc-123", follower_count: 10, following_count: 2, likes_count: 300, video_count: 4 } }, error: { code: "ok" } }));
  const body = JSON.parse(String(init?.body));
  if (target.includes("searchconsole")) {
    requested.push(`gsc:${body.dimensions.join("+")}:${body.startDate}..${body.endDate}`);
    const value = body.dimensions.length > 1 ? ["2026-07-20", "carruseles"] : ["2026-07-20"];
    return new Response(JSON.stringify({ rows: [{ keys: value, clicks: 5, impressions: 100, ctr: 0.05, position: 9 }] }));
  }
  requested.push(`ga4:${body.dimensions.map((dimension: { name: string }) => dimension.name).join("+")}:${body.dateRanges[0].startDate}..${body.dateRanges[0].endDate}`);
  const values = body.dimensions.length > 1 ? [{ value: "20260720" }, { value: "/carruseles" }] : [{ value: "20260720" }];
  return new Response(JSON.stringify({ metricHeaders: [{ name: "sessions" }], rows: [{ dimensionValues: values, metricValues: [{ value: "42" }] }] }));
};

const today = new Date("2026-08-02T00:00:00.000Z");
const full = await syncAnalytics({ days: 7, today, request });
assert.deepEqual(full.results.map((result) => result.status), ["ok", "ok", "skipped"], "sincroniza las plataformas configuradas");
assert.equal(full.inserted, 10, "guarda las cinco dimensiones de cada plataforma");
assert.equal(full.failed.length, 0, "no reporta fallos");

// Cada plataforma usa su propio retraso de consolidación.
assert.ok(requested.includes("gsc:date:2026-07-24..2026-07-30"), `Search Console retrasa 3 días: ${requested.join(", ")}`);
assert.ok(requested.includes("ga4:date:2026-07-26..2026-08-01"), `GA4 retrasa 1 día: ${requested.join(", ")}`);
assert.ok(requested.includes("gsc:date+query:2026-07-24..2026-07-30"), "los desgloses conservan la fecha");
assert.ok(requested.includes("ga4:date+pagePath:2026-07-26..2026-08-01"), "GA4 traduce el desglose de página");

assert.equal((await listMetricSnapshots({ platform: "search-console", dimension: "date" })).length, 1, "persiste el total diario de Search Console");
assert.equal((await listMetricSnapshots({ platform: "google-analytics", dimension: "page" }))[0].metrics.sessions, 42, "persiste el desglose de GA4");

const repeat = await syncAnalytics({ days: 7, today, request });
assert.equal(repeat.inserted, 0, "repetir la sincronización no duplica");
assert.equal(repeat.updated, 10, "repetir la sincronización refresca los mismos registros");

// Un proveedor caído no debe impedir que el otro se sincronice.
let calls = 0;
const flaky: typeof fetch = async (url, init) => {
  if (String(url).includes("oauth2")) return request(url, init);
  if (String(url).includes("searchconsole")) { calls += 1; return calls > 1 ? new Response("{}", { status: 500 }) : request(url, init); }
  return request(url, init);
};
const partial = await syncAnalytics({ days: 7, today, request: flaky });
assert.equal(partial.results[0].status, "failed", "marca la plataforma caída");
assert.deepEqual(partial.results[0].dimensions, ["date"], "conserva las dimensiones que sí terminaron");
assert.equal(partial.results[1].status, "ok", "la otra plataforma se sincroniza igual");
assert.deepEqual(partial.failed, ["search-console"], "resume qué falló");

// TikTok con credenciales pero sin cuenta conectada es un paso pendiente, no un fallo.
process.env.TIKTOK_CLIENT_KEY = "clave"; process.env.TIKTOK_CLIENT_SECRET = "secreto";
const pending = await syncAnalytics({ days: 7, today, request });
assert.equal(pending.results[2].status, "skipped", "sin cuenta conectada se omite");
assert.match(pending.results[2].error ?? "", /Conectar TikTok/, "dice qué hacer");
assert.deepEqual(pending.failed, [], "no cuenta como fallo");

await testDb.query("INSERT INTO oauth_tokens (platform, data_json, updated_at) VALUES ('tiktok', $1, $2)", [JSON.stringify({ accessToken: "act.uno", refreshToken: "rft.uno", openId: "abc-123", scope: "", accessExpiresAt: today.getTime() + 3_600_000, refreshExpiresAt: today.getTime() + 86_400_000 }), today.toISOString()]);
const connected = await syncAnalytics({ days: 7, today, request });
assert.equal(connected.results[2].status, "ok", "con la cuenta conectada sincroniza");
assert.equal((await listMetricSnapshots({ platform: "tiktok" }))[0].metrics.followerCount, 10, "guarda los contadores del día");

await testDb.drop();
console.log("AnalyticsSync: ventanas por plataforma, idempotencia y aislamiento de fallos validados.");
