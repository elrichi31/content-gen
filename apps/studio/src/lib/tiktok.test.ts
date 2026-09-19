import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";

const testDb = await createTestDatabase(); process.env.DATABASE_URL = testDb.url;

const { completeAuthorization, fetchTikTokStats, startAuthorization, TikTokError } = await import("./tiktok.ts");

delete process.env.TIKTOK_CLIENT_KEY; delete process.env.TIKTOK_CLIENT_SECRET;
assert.throws(() => startAuthorization(), /TIKTOK_CLIENT_KEY/, "sin credenciales no arranca el flujo");

process.env.TIKTOK_CLIENT_KEY = "clave"; process.env.TIKTOK_CLIENT_SECRET = "secreto";
process.env.TIKTOK_REDIRECT_URI = "http://localhost:3000/api/tiktok/callback";

const { url, state, verifier } = startAuthorization();
const params = new URL(url).searchParams;
assert.equal(new URL(url).origin + new URL(url).pathname, "https://www.tiktok.com/v2/auth/authorize/", "usa el endpoint v2");
assert.equal(params.get("client_key"), "clave");
assert.equal(params.get("scope"), "user.info.basic,user.info.stats", "pide el permiso de estadísticas");
assert.equal(params.get("state"), state, "el state viaja en la URL");
assert.equal(params.get("code_challenge"), createHash("sha256").update(verifier).digest("hex"), "TikTok exige el challenge en hex");
assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/, "el verificador cumple el rango PKCE");
assert.ok(!verifier.includes("."), "el punto separa state y verificador en la cookie");

const now = Date.parse("2026-09-19T12:00:00.000Z");
const today = new Date(now);
const tokenBody = (access: string, refresh: string) => ({ access_token: access, refresh_token: refresh, expires_in: 86400, refresh_expires_in: 31536000, open_id: "abc-123", scope: "user.info.basic,user.info.stats" });
const calls: { url: string; body?: string; auth?: string }[] = [];
const request: typeof fetch = async (input, init) => {
  const target = String(input);
  calls.push({ url: target, body: init?.body ? String(init.body) : undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
  if (target.includes("/oauth/token/")) {
    return new Response(JSON.stringify(String(init?.body).includes("refresh_token") ? tokenBody("act.nuevo", "rft.nuevo") : tokenBody("act.uno", "rft.uno")));
  }
  return new Response(JSON.stringify({ data: { user: { open_id: "abc-123", follower_count: 1200, following_count: 80, likes_count: 45000, video_count: 37 } }, error: { code: "ok", message: "" } }));
};

await assert.rejects(() => fetchTikTokStats({ request, today }), (error: unknown) => error instanceof TikTokError && error.status === 409, "sin conectar responde 409, que el sync trata como omitido");

await completeAuthorization("codigo", verifier, { request, now });
const exchange = new URLSearchParams(calls[0].body);
assert.equal(exchange.get("grant_type"), "authorization_code");
assert.equal(exchange.get("code_verifier"), verifier, "envía el verificador PKCE");
assert.equal(exchange.get("redirect_uri"), "http://localhost:3000/api/tiktok/callback", "el redirect coincide con el de la autorización");

const [snapshot] = await fetchTikTokStats({ request, today });
assert.equal(calls.at(-1)?.auth, "Bearer act.uno", "usa el token guardado");
assert.deepEqual(snapshot.metrics, { followerCount: 1200, followingCount: 80, likesCount: 45000, videoCount: 37 }, "mapea los cuatro contadores");
assert.equal(snapshot.propertyId, "abc-123", "la propiedad es el open_id");
assert.equal(snapshot.date, "2026-09-19", "una fila por día");

// Token caducado: refresca con el refresh_token y usa el nuevo.
const [refreshed] = await fetchTikTokStats({ request, today: new Date(now + 2 * 86_400_000) });
assert.equal(new URLSearchParams(calls.find((call) => call.body?.includes("refresh_token"))?.body).get("refresh_token"), "rft.uno", "refresca con el refresh_token guardado");
assert.equal(calls.at(-1)?.auth, "Bearer act.nuevo", "usa el token refrescado");
assert.equal(refreshed.date, "2026-09-21");

// Sin el permiso de estadísticas TikTok solo devuelve el open_id: debe avisar, no guardar ceros.
const sinPermiso: typeof fetch = async (input, init) => String(input).includes("/oauth/token/") ? request(input, init) : new Response(JSON.stringify({ data: { user: { open_id: "abc-123" } }, error: { code: "ok" } }));
await assert.rejects(() => fetchTikTokStats({ request: sinPermiso, today }), /permiso de estadísticas/, "explica que falta el scope");

// Un error de TikTok no se confunde con un éxito vacío.
const caido: typeof fetch = async () => new Response(JSON.stringify({ error: { code: "access_token_invalid", message: "token inválido" } }), { status: 401 });
await assert.rejects(() => fetchTikTokStats({ request: caido, today }), /token inválido/, "propaga el mensaje de TikTok");

await testDb.drop();
console.log("tiktok ok");
