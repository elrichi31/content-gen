import { createHash } from "node:crypto";
import { z } from "zod";
import { chatgptClient } from "./cimd.ts";
import {
  CHATGPT_CLIENT_ID, equalSecret, hashSecret, OAuthError, oauthErrorResponse, privateHeaders, randomSecret, readForm,
  requireSameOrigin, type OAuthConfig, type Scope, validateAuthorization,
} from "./oauth-security.ts";

/*
 * Flujo OAuth del MCP para ChatGPT (authorization code + PKCE S256, portado de control-gastos):
 * consentimiento con sesión real y CSRF, código de un solo uso de 5 min, access token de 15 min y
 * refresh token rotativo de hasta 30 días. Las reglas atómicas viven en las funciones SQL de la
 * migración 0003.
 */

export type SessionUser = { id: string; email: string } | null;
export type Rpc = (fn: string, args: unknown[]) => Promise<unknown>;
export type Query = (sql: string, args: unknown[]) => Promise<Record<string, unknown>[]>;
type Deps = { getUser: (request: Request) => Promise<SessionUser>; rpc: Rpc; query: Query; cimd?: typeof chatgptClient };

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const cookieName = (config: OAuthConfig) => config.origin.startsWith("https:") ? "__Host-mcp_csrf" : "mcp_csrf";
const cookie = (config: OAuthConfig, token: string, clear = false) =>
  `${cookieName(config)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 300}${config.origin.startsWith("https:") ? "; Secure" : ""}`;

function checkCsrf(request: Request, params: URLSearchParams, config: OAuthConfig) {
  requireSameOrigin(request, config);
  const name = cookieName(config);
  const stored = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  const sent = params.get("csrf") || "";
  if (!stored || !/^[A-Za-z0-9_-]{43}$/.test(sent) || !equalSecret(stored, sent)) throw new OAuthError("access_denied", "Confirmación inválida o vencida", 403);
}

const SCOPE_TEXT: Record<Scope, string> = {
  "studio:read": "Consultar marcas, campañas, biblioteca, cronograma, radar, automatizaciones, costos y métricas.",
  "studio:write": "Crear y editar marcas, campañas, piezas, pautas y automatizaciones, y <strong>generar contenido con IA, lo que gasta créditos</strong>.",
};

function page(config: OAuthConfig, title: string, content: string, csrf: string, formRedirect?: string) {
  // El formulario solo puede enviar a este origen y redirigir al callback de ChatGPT ya validado.
  const formAction = formRedirect ? `'self' ${new URL(formRedirect).origin}` : "'self'";
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Content Gen</title>
<style>:root{color-scheme:light dark;--bg:#fafafa;--card:#fff;--ink:#27272a;--muted:#71717a;--line:#e4e4e7;--accent:#389458}@media (prefers-color-scheme:dark){:root{--bg:#0c0c0d;--card:#101012;--ink:#f5f5f5;--muted:#8b8b93;--line:#212124;--accent:#3fa863}}
body{margin:0;padding:24px;background:var(--bg);color:var(--ink);font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:520px;margin:8vh auto;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:28px}
h1{font-size:20px;line-height:1.3;margin:0 0 6px}p{margin:10px 0}.muted{color:var(--muted)}ul{padding-left:18px}li{margin:8px 0}
button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;transition:transform .16s cubic-bezier(.23,1,.32,1)}button:active{transform:scale(.97)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}form.actions{display:flex;gap:8px;margin-top:20px}a{color:var(--accent)}.row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding:12px 0}</style>
<main>${content}</main></html>`;
  return new Response(html, { headers: { ...privateHeaders, "Referrer-Policy": "same-origin", "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`, "Set-Cookie": cookie(config, csrf), "X-Frame-Options": "DENY" } });
}

const redirect = (url: string, config: OAuthConfig, clearCsrf = false) =>
  new Response(null, { status: 303, headers: { ...privateHeaders, Location: url, ...(clearCsrf ? { "Set-Cookie": cookie(config, "", true) } : {}) } });

export function createOAuthHandlers(config: OAuthConfig, { getUser, rpc, query, cimd = chatgptClient }: Deps) {
  const consumeAssertion = async (clientId: string, jtiHash: string, expiresAt: number) =>
    (await rpc("mcp_consume_assertion", [clientId, jtiHash, new Date(expiresAt * 1000).toISOString()])) === true;
  const guarded = (handler: (request: Request) => Promise<Response>) => async (request: Request) => {
    try { return await handler(request); } catch (error) { return oauthErrorResponse(error); }
  };

  return {
    authorizeGet: guarded(async (request) => {
      const params = new URL(request.url).searchParams;
      await cimd.resolve(params.get("client_id") || "");
      const authorization = validateAuthorization(params, config);
      const user = await getUser(request);
      if (!user) return redirect(`${config.origin}/login?from=${encodeURIComponent(`/api/mcp/oauth/authorize?${params}`)}`, config);
      const csrf = randomSecret();
      const hidden = [...params].map(([key, value]) => `<input type="hidden" name="${escape(key)}" value="${escape(value)}">`).join("");
      return page(config, "Conectar ChatGPT", `<h1>Conectar ChatGPT con Content Gen</h1>
<p class="muted">Cuenta: <strong>${escape(user.email)}</strong></p>
<p>Al autorizar, ChatGPT podrá:</p><ul>${authorization.scopes.map((scope) => `<li>${SCOPE_TEXT[scope]}</li>`).join("")}</ul>
<p class="muted">No podrá borrar, archivar ni publicar nada. Lo que genere queda en borrador. El permiso vence en 30 días y puedes revocarlo antes.</p>
<form class="actions" method="post" action="/api/mcp/oauth/authorize">${hidden}<input type="hidden" name="csrf" value="${csrf}"><button class="primary" name="decision" value="approve">Autorizar conexión</button><button name="decision" value="deny">Cancelar</button></form>
<p class="muted"><a href="/api/mcp/connections">Administrar conexiones</a></p>`, csrf, authorization.redirectUri);
    }),

    authorizePost: guarded(async (request) => {
      const params = await readForm(request);
      checkCsrf(request, params, config);
      await cimd.resolve(params.get("client_id") || "");
      const authorization = validateAuthorization(params, config);
      const user = await getUser(request);
      if (!user) throw new OAuthError("access_denied", "Inicia sesión para autorizar", 401);
      const callback = new URL(authorization.redirectUri);
      callback.searchParams.set("state", authorization.state);
      // RFC 9207: ChatGPT comprueba el emisor para evitar confusiones entre servidores OAuth.
      callback.searchParams.set("iss", config.origin);
      if (params.get("decision") === "deny") callback.searchParams.set("error", "access_denied");
      else {
        if (params.get("decision") !== "approve") throw new OAuthError("invalid_request", "Falta la aprobación");
        const code = randomSecret();
        const grant = await rpc("mcp_create_authorization", [user.id, CHATGPT_CLIENT_ID, config.resource, authorization.redirectUri, authorization.challenge, hashSecret(code), authorization.scopes]);
        if (!grant) throw new OAuthError("access_denied", "La cuenta ya no está activa", 403);
        callback.searchParams.set("code", code);
      }
      return redirect(callback.toString(), config, true);
    }),

    token: guarded(async (request) => {
      const params = await readForm(request);
      await cimd.authenticate(request, params, config, consumeAssertion);
      if (params.get("resource") !== config.resource) throw new OAuthError("invalid_target", "Recurso inválido");
      const access = randomSecret();
      const refresh = randomSecret();
      let result: { scopes: string[]; expires_in?: number } | null;
      if (params.get("grant_type") === "authorization_code") {
        const verifier = params.get("code_verifier") || "";
        const code = params.get("code") || "";
        const redirectUri = params.get("redirect_uri") || "";
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !/^[A-Za-z0-9_-]{43}$/.test(code) || !redirectUri) throw new OAuthError("invalid_grant", "Código o verificador inválido");
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        result = await rpc("mcp_exchange_code", [hashSecret(code), CHATGPT_CLIENT_ID, redirectUri, config.resource, challenge, hashSecret(access), hashSecret(refresh)]) as typeof result;
      } else if (params.get("grant_type") === "refresh_token") {
        const token = params.get("refresh_token") || "";
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new OAuthError("invalid_grant", "Refresh token inválido");
        const scopes = params.has("scope") ? (params.get("scope") || "").split(" ").filter(Boolean) : null;
        result = await rpc("mcp_refresh_tokens", [hashSecret(token), CHATGPT_CLIENT_ID, config.resource, hashSecret(access), hashSecret(refresh), scopes]) as typeof result;
      } else throw new OAuthError("unsupported_grant_type", "Flujo OAuth no soportado");
      if (!result) throw new OAuthError("invalid_grant", "Credencial vencida, revocada o ya utilizada");
      return Response.json({ access_token: access, token_type: "Bearer", expires_in: result.expires_in ?? 900, refresh_token: refresh, scope: result.scopes.join(" ") }, { headers: privateHeaders });
    }),

    revoke: guarded(async (request) => {
      const params = await readForm(request);
      await cimd.authenticate(request, params, config, consumeAssertion);
      const token = params.get("token") || "";
      if (token && token.length <= 512) await rpc("mcp_revoke_token", [hashSecret(token), CHATGPT_CLIENT_ID, config.resource]);
      return new Response(null, { status: 200, headers: privateHeaders });
    }),

    connectionsGet: guarded(async (request) => {
      const user = await getUser(request);
      if (!user) return redirect(`${config.origin}/login?from=${encodeURIComponent("/api/mcp/connections")}`, config);
      const rows = await query("SELECT id, created_at, expires_at, scopes FROM mcp_oauth_grants WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 50", [user.id, CHATGPT_CLIENT_ID]);
      const csrf = randomSecret();
      const day = (value: unknown) => new Date(String(value)).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
      const list = rows.map((grant) => `<div class="row"><span>ChatGPT · ${(grant.scopes as string[]).includes("studio:write") ? "lectura y escritura" : "solo lectura"}<br><span class="muted">Conectado el ${day(grant.created_at)} · vence el ${day(grant.expires_at)}</span></span><form method="post" action="/api/mcp/connections"><input type="hidden" name="grant_id" value="${escape(String(grant.id))}"><input type="hidden" name="csrf" value="${csrf}"><button>Revocar</button></form></div>`).join("");
      return page(config, "Conexiones", `<h1>Conexiones de ChatGPT</h1><p class="muted">${escape(user.email)}</p>${list || '<p class="muted">No hay conexiones activas.</p>'}<p><a href="/">Volver al Studio</a></p>`, csrf);
    }),

    connectionsPost: guarded(async (request) => {
      const params = await readForm(request);
      checkCsrf(request, params, config);
      const user = await getUser(request);
      if (!user) throw new OAuthError("access_denied", "Inicia sesión", 401);
      const grantId = params.get("grant_id") || "";
      if (!z.uuid().safeParse(grantId).success) throw new OAuthError("invalid_request", "Conexión inválida");
      const revoked = await query("UPDATE mcp_oauth_grants SET revoked_at = now() WHERE id = ? AND user_id = ? AND client_id = ? RETURNING id", [grantId, user.id, CHATGPT_CLIENT_ID]);
      if (!revoked.length) throw new OAuthError("invalid_request", "Conexión no encontrada", 404);
      return redirect(`${config.origin}/api/mcp/connections`, config, true);
    }),
  };
}

export type OAuthHandlers = ReturnType<typeof createOAuthHandlers>;
