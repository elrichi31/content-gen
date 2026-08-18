import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { getGoogleAccessToken, googleApiError, readServiceAccount, resetGoogleTokenCache, SEARCH_CONSOLE_SCOPE } from "./google-auth.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const account = { client_email: "reader@proyecto.iam.gserviceaccount.com", private_key: privateKey, token_uri: "https://oauth2.googleapis.com/token" };

delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
assert.throws(() => readServiceAccount(), /GOOGLE_SERVICE_ACCOUNT_JSON/, "avisa cuando no hay credencial configurada");

process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{ no es json";
assert.throws(() => readServiceAccount(), /JSON legible/, "detecta credencial corrupta");

// La clave escapada con \n literales es la forma habitual de guardarla en .env.local.
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ ...account, private_key: privateKey.replace(/\n/g, "\\n") });
assert.equal(readServiceAccount().private_key, privateKey, "restaura los saltos de línea del PEM");

let calls = 0;
let requestedScope = SEARCH_CONSOLE_SCOPE;
const request: typeof fetch = async (_url, init) => {
  calls += 1;
  const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
  const [header, payload, signature] = assertion.split(".");
  assert.ok(createVerify("RSA-SHA256").update(`${header}.${payload}`).end().verify(publicKey, Buffer.from(signature, "base64url")), "el JWT va firmado con la clave privada");
  const claim = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claim.iss, account.client_email, "el emisor es el service account");
  assert.equal(claim.scope, requestedScope, "pide el scope solicitado");
  assert.equal(claim.exp - claim.iat, 3600, "el JWT dura una hora");
  return new Response(JSON.stringify({ access_token: `token-${calls}`, expires_in: 3600 }));
};

resetGoogleTokenCache();
const now = () => Date.parse("2026-08-02T00:00:00.000Z");
assert.equal(await getGoogleAccessToken(SEARCH_CONSOLE_SCOPE, { request, now }), "token-1", "emite el token");
assert.equal(await getGoogleAccessToken(SEARCH_CONSOLE_SCOPE, { request, now }), "token-1", "reutiliza el token cacheado");
assert.equal(calls, 1, "no vuelve a firmar mientras el token siga vigente");
requestedScope = "otro-scope";
assert.equal(await getGoogleAccessToken("otro-scope", { request, now }), "token-2", "cachea por scope");
requestedScope = SEARCH_CONSOLE_SCOPE;
assert.equal(await getGoogleAccessToken(SEARCH_CONSOLE_SCOPE, { request, now: () => now() + 3_600_000 }), "token-3", "renueva al expirar");

resetGoogleTokenCache();
await assert.rejects(() => getGoogleAccessToken(SEARCH_CONSOLE_SCOPE, { request: async () => new Response("{}", { status: 401 }), now }), /rechazó la credencial/, "traduce credencial inválida");
await assert.rejects(() => getGoogleAccessToken(SEARCH_CONSOLE_SCOPE, { request: async () => new Response("{}", { status: 500 }), now }), /token de acceso/, "traduce fallo del emisor");

assert.equal(googleApiError(403, "Search Console").status, 403, "propaga falta de permisos");
assert.match(googleApiError(403, "Search Console").message, /permiso de lectura al service account/, "explica cómo arreglar el 403");
assert.equal(googleApiError(429, "GA4").status, 429, "propaga la cuota agotada");
assert.equal(googleApiError(500, "GA4").status, 502, "colapsa fallos del proveedor en 502");

console.log("Google auth: credencial, firma JWT, caché de token y errores validados.");
