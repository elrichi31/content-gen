import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Piezas comunes del OAuth del MCP (portado de control-gastos). Solo ChatGPT entra por OAuth, y se
 * identifica con su documento CIMD: no hay client ID ni secreto que configurar. Claude Code y Hermes
 * siguen con MCP_TOKEN.
 */

export const CHATGPT_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const CHATGPT_REDIRECT_URI = "https://chatgpt.com/connector_platform_oauth_redirect";
export const SCOPES = ["studio:read", "studio:write"] as const;
export type Scope = (typeof SCOPES)[number];
export type OAuthConfig = { origin: string; resource: string };

export class OAuthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

/** Origen público canónico (HTTPS; en desarrollo también localhost). Sin él, el OAuth no existe. */
export function getOAuthConfig(): OAuthConfig {
  const raw = process.env.MCP_PUBLIC_ORIGIN;
  if (!raw) throw new OAuthError("server_error", "OAuth del MCP no configurado: falta MCP_PUBLIC_ORIGIN", 503);
  let origin: URL;
  try { origin = new URL(raw); } catch { throw new OAuthError("server_error", "MCP_PUBLIC_ORIGIN inválido", 503); }
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  if ((!local && origin.protocol !== "https:") || origin.origin !== raw || origin.username || origin.password) {
    throw new OAuthError("server_error", "MCP_PUBLIC_ORIGIN debe ser un origen HTTPS sin barra final ni ruta", 503);
  }
  return { origin: origin.origin, resource: `${origin.origin}/api/mcp` };
}

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomSecret = () => randomBytes(32).toString("base64url");
export const equalSecret = (a: string, b: string) => timingSafeEqual(Buffer.from(hashSecret(a), "hex"), Buffer.from(hashSecret(b), "hex"));

export function uniqueParameters(params: URLSearchParams) {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) throw new OAuthError("invalid_request", "Parámetros duplicados");
    seen.add(key);
  }
}

/** Valida la petición de autorización. Sin `scope` se pide solo lectura. */
export function validateAuthorization(params: URLSearchParams, config: OAuthConfig) {
  uniqueParameters(params);
  const scopes = (params.get("scope") || "studio:read").split(" ").filter(Boolean);
  const redirectUri = params.get("redirect_uri") || "";
  const challenge = params.get("code_challenge") || "";
  const state = params.get("state") || "";
  if (params.get("response_type") !== "code" || params.get("client_id") !== CHATGPT_CLIENT_ID || redirectUri !== CHATGPT_REDIRECT_URI
    || params.get("resource") !== config.resource || params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)
    || !state || state.length > 2048 || scopes.length === 0 || scopes.some((scope) => !SCOPES.includes(scope as Scope))) {
    throw new OAuthError("invalid_request", "Solicitud OAuth inválida");
  }
  return { redirectUri, challenge, state, scopes: [...new Set(scopes)] as Scope[] };
}

export async function readForm(request: Request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/x-www-form-urlencoded")) throw new OAuthError("invalid_request", "Se requiere form-urlencoded", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new OAuthError("invalid_request", "Falta el formulario");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) { await reader.cancel(); throw new OAuthError("invalid_request", "Solicitud demasiado grande", 413); }
    chunks.push(value);
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  uniqueParameters(params);
  return params;
}

export function requireSameOrigin(request: Request, config: OAuthConfig) {
  if (request.headers.get("origin") !== config.origin) throw new OAuthError("access_denied", "Origen inválido", 403);
}

export const privateHeaders = { "Cache-Control": "no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export function oauthErrorResponse(error: unknown) {
  const known = error instanceof OAuthError;
  if (!known) console.error("[mcp-oauth]", error);
  return Response.json({ error: known ? error.code : "server_error", error_description: known ? error.message : "No se pudo completar la operación" }, { status: known ? error.status : 503, headers: privateHeaders });
}
