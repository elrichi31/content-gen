import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createTestDatabase } from "../../../../../scripts/test-db.mjs";
import { safeLoginReturn } from "../safe-login-return.ts";

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
await testDb.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ('u1', 'Ana', 'ana@studio.test', true, now(), now())`);
await testDb.query(`INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ('a1', 'u1', 'credential', 'u1', 'hash-1', now(), now())`);

const { withDatabase } = await import("../db.ts");
const { createCimdClient } = await import("./cimd.ts");
const { createOAuthHandlers } = await import("./oauth.ts");
const { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI, hashSecret, validateAuthorization } = await import("./oauth-security.ts");

const rpc = async (fn: string, args: unknown[]) => (await withDatabase((db) => db.prepare(`SELECT ${fn}(${args.map(() => "?").join(", ")}) AS result`).get(...args)) as { result: unknown }).result;
const query = (sql: string, args: unknown[]) => withDatabase((db) => db.prepare(sql).all(...args)) as Promise<Record<string, unknown>[]>;

// ChatGPT falso: misma forma de metadatos y firma RS256 que el real, con una clave propia.
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "k1", alg: "RS256", use: "sig" };
const fakeFetch = (async (url: string) => Response.json(url === CHATGPT_CLIENT_ID
  ? { client_id: CHATGPT_CLIENT_ID, redirect_uris: [CHATGPT_REDIRECT_URI], token_endpoint_auth_methods_supported: ["private_key_jwt"], token_endpoint_auth_signing_alg: "RS256", jwks_uri: "https://chatgpt.com/oauth/jwks.json" }
  : { keys: [jwk] })) as typeof fetch;
const config = { origin: "https://studio.test", resource: "https://studio.test/api/mcp" };
const handlers = createOAuthHandlers(config, {
  getUser: async (request) => request.headers.get("x-session") === "ana" ? { id: "u1", email: "ana@studio.test" } : null,
  rpc, query, cimd: createCimdClient(fakeFetch),
});
const assertion = () => new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(CHATGPT_CLIENT_ID).setSubject(CHATGPT_CLIENT_ID)
  .setAudience(`${config.origin}/api/mcp/oauth/token`).setExpirationTime("2m").setJti(randomBytes(16).toString("hex")).sign(privateKey);
const form = (fields: Record<string, string>, headers: Record<string, string> = {}, path = "/api/mcp/oauth/token") =>
  new Request(`${config.origin}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(fields).toString() });
const verifier = randomBytes(32).toString("base64url");
const authParams = (overrides: Record<string, string> = {}) => new URLSearchParams({
  response_type: "code", client_id: CHATGPT_CLIENT_ID, redirect_uri: CHATGPT_REDIRECT_URI, resource: config.resource, state: "xyz",
  code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", scope: "studio:read studio:write", ...overrides,
});
const authorizeUrl = (params: URLSearchParams) => `${config.origin}/api/mcp/oauth/authorize?${params}`;

try {
  // Consentimiento: sin sesión manda al login (con vuelta segura), con sesión muestra el permiso.
  const anonymous = await handlers.authorizeGet(new Request(authorizeUrl(authParams())));
  assert.equal(anonymous.status, 303);
  const back = new URL(anonymous.headers.get("location")!).searchParams.get("from")!;
  assert.equal(safeLoginReturn(back), back, "el login vuelve a la autorización");
  assert.equal((await handlers.authorizeGet(new Request(authorizeUrl(authParams({ redirect_uri: "https://evil.test/cb" })), { headers: { "x-session": "ana" } }))).status, 400, "callback ajeno rechazado");
  assert.equal((await handlers.authorizeGet(new Request(authorizeUrl(authParams({ code_challenge_method: "plain" })), { headers: { "x-session": "ana" } }))).status, 400, "PKCE plain rechazado");
  const consent = await handlers.authorizeGet(new Request(authorizeUrl(authParams()), { headers: { "x-session": "ana" } }));
  assert.equal(consent.status, 200);
  assert.match(await consent.text(), /gasta créditos/, "el consentimiento avisa del gasto");
  const csrf = /mcp_csrf=([^;]+)/.exec(consent.headers.get("set-cookie")!)![1];

  // Aprobar exige el mismo origen y el CSRF de la cookie.
  const approve = Object.fromEntries([...authParams(), ["csrf", csrf], ["decision", "approve"]]);
  assert.equal((await handlers.authorizePost(form(approve, { "x-session": "ana", cookie: `__Host-mcp_csrf=${csrf}` }, "/api/mcp/oauth/authorize"))).status, 403, "sin Origin no se aprueba");
  assert.equal((await handlers.authorizePost(form({ ...approve, csrf: randomBytes(32).toString("base64url") }, { "x-session": "ana", origin: config.origin, cookie: `__Host-mcp_csrf=${csrf}` }, "/api/mcp/oauth/authorize"))).status, 403, "CSRF distinto rechazado");
  const approved = await handlers.authorizePost(form(approve, { "x-session": "ana", origin: config.origin, cookie: `__Host-mcp_csrf=${csrf}` }, "/api/mcp/oauth/authorize"));
  assert.equal(approved.status, 303);
  const callback = new URL(approved.headers.get("location")!);
  assert.equal(`${callback.origin}${callback.pathname}`, CHATGPT_REDIRECT_URI);
  assert.equal(callback.searchParams.get("iss"), config.origin, "RFC 9207: el callback lleva el emisor");
  const code = callback.searchParams.get("code")!;

  // Canje del código: PKCE correcto, aserción firmada de un solo uso, código de un solo uso.
  const exchange = async (fields: Record<string, string>, signed?: string) => handlers.token(form({ client_id: CHATGPT_CLIENT_ID, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: signed ?? await assertion(), resource: config.resource, ...fields }));
  assert.equal((await exchange({ grant_type: "authorization_code", code, code_verifier: randomBytes(32).toString("base64url"), redirect_uri: CHATGPT_REDIRECT_URI })).status, 400, "verificador PKCE incorrecto");
  const signed = await assertion();
  const tokens = await (await exchange({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: CHATGPT_REDIRECT_URI }, signed)).json();
  assert.equal(tokens.token_type, "Bearer");
  assert.equal(tokens.scope, "studio:read studio:write");
  assert.equal((await exchange({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: CHATGPT_REDIRECT_URI }, signed)).status, 401, "aserción reutilizada");
  assert.equal((await exchange({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: CHATGPT_REDIRECT_URI })).status, 400, "código reutilizado");
  const tampered = (await assertion()).slice(0, -4) + "AAAA";
  assert.equal((await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }, tampered)).status, 401, "firma alterada");

  const verify = (token: string) => rpc("mcp_verify_access", [hashSecret(token), CHATGPT_CLIENT_ID, config.resource]) as Promise<{ scopes?: string[] } | null>;
  assert.deepEqual((await verify(tokens.access_token))?.scopes, ["studio:read", "studio:write"], "el access token sirve");

  // Refresh rotativo: reutilizar el anterior revoca la conexión entera.
  const rotated = await (await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token })).json();
  assert.ok(rotated.access_token && rotated.refresh_token !== tokens.refresh_token);
  assert.equal((await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token })).status, 400, "refresh reutilizado");
  assert.equal(await verify(rotated.access_token), null, "tras el robo detectado, la conexión queda revocada");

  // Cambiar la contraseña corta las conexiones vivas.
  const second = validateAuthorization(authParams({ scope: "studio:read" }), config);
  const secondCode = randomBytes(32).toString("base64url");
  await rpc("mcp_create_authorization", ["u1", CHATGPT_CLIENT_ID, config.resource, CHATGPT_REDIRECT_URI, second.challenge, hashSecret(secondCode), second.scopes]);
  const readOnly = await (await exchange({ grant_type: "authorization_code", code: secondCode, code_verifier: verifier, redirect_uri: CHATGPT_REDIRECT_URI })).json();
  assert.equal(readOnly.scope, "studio:read", "se respeta el permiso pedido");
  assert.ok(await verify(readOnly.access_token));
  await testDb.query(`UPDATE "account" SET password = 'hash-2' WHERE id = 'a1'`);
  assert.equal(await verify(readOnly.access_token), null, "cambio de contraseña revoca");

  assert.throws(() => validateAuthorization(authParams({ scope: "studio:admin" }), config), /inválida/, "permiso desconocido rechazado");
  for (const bad of ["//evil.test", "https://evil.test", "/\\evil.test", "/ok#x", ""]) assert.equal(safeLoginReturn(bad), "/", `vuelta insegura: ${bad}`);
  assert.equal(safeLoginReturn("/carousel?id=1"), "/carousel?id=1");
  console.log("mcp-oauth: ok");
} finally {
  await testDb.drop();
}
