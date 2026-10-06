import { auth } from "@/lib/auth";
import { withDatabase } from "@/lib/db";
import { createOAuthHandlers, type OAuthHandlers, type Query, type Rpc } from "./oauth";
import { CHATGPT_CLIENT_ID, getOAuthConfig, hashSecret, oauthErrorResponse, type Scope } from "./oauth-security";

/** Llama a una función SQL de la migración 0003 y devuelve su resultado. */
export const rpc: Rpc = async (fn, args) => {
  if (!/^mcp_[a-z_]+$/.test(fn)) throw new Error("Función OAuth desconocida");
  const placeholders = args.map(() => "?").join(", ");
  const row = await withDatabase((database) => database.prepare(`SELECT ${fn}(${placeholders}) AS result`).get(...args)) as { result: unknown } | undefined;
  return row?.result ?? null;
};
const query: Query = (sql, args) => withDatabase((database) => database.prepare(sql).all(...args)) as Promise<Record<string, unknown>[]>;

async function getUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ? { id: session.user.id, email: session.user.email } : null;
}

/** Despacha un endpoint OAuth. Sin MCP_PUBLIC_ORIGIN responde 503: nunca degrada a acceso abierto. */
export async function handleOAuth(name: keyof OAuthHandlers, request: Request) {
  try { return await createOAuthHandlers(getOAuthConfig(), { getUser, rpc, query })[name](request); }
  catch (error) { return oauthErrorResponse(error); }
}

export type AccessResult = { scopes: Scope[] } | { rateLimited: true } | null;

/** Valida un access token de ChatGPT y cuenta la petición contra su límite por minuto. */
export async function verifyOAuthAccess(token: string): Promise<AccessResult> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const config = getOAuthConfig();
  const result = await rpc("mcp_verify_access", [hashSecret(token), CHATGPT_CLIENT_ID, config.resource]) as { rate_limited?: boolean; scopes?: Scope[] } | null;
  if (!result) return null;
  if (result.rate_limited) return { rateLimited: true };
  return Array.isArray(result.scopes) ? { scopes: result.scopes } : null;
}
