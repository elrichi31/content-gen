import { formatIsoDate } from "@content-gen/domain/analytics";
import { createHash, randomBytes } from "node:crypto";
import { withDatabase } from "./db.ts";
import type { IncomingSnapshot } from "./metric-snapshots.ts";

export class TikTokError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "TikTokError";
    this.status = status;
  }
}

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
/** Sin `user.info.stats` TikTok ya no entrega seguidores, likes ni videos. */
export const TIKTOK_SCOPES = "user.info.basic,user.info.stats";
/** Cookie que ata el `state` y el verificador PKCE al navegador que inició la conexión. */
export const OAUTH_COOKIE = "tiktok_oauth";
const FIELD_TO_METRIC = { follower_count: "followerCount", following_count: "followingCount", likes_count: "likesCount", video_count: "videoCount" } as const;
/** Refresca con margen: un token que caduca a mitad de la petición fallaría sin motivo. */
const REFRESH_MARGIN_MS = 5 * 60_000;

export function tiktokCredentials() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret) throw new TikTokError("Faltan TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en .env.local.", 503);
  // Debe coincidir carácter por carácter con el URI registrado en el portal de TikTok.
  return { clientKey, clientSecret, redirectUri: process.env.TIKTOK_REDIRECT_URI?.trim() || "http://localhost:3000/api/tiktok/callback" };
}

/**
 * Arranca el flujo OAuth. Se usa PKCE porque es lo que TikTok exige a las apps de escritorio, que
 * son las únicas que aceptan `http://localhost` como redirect mientras no haya dominio HTTPS.
 */
export function startAuthorization() {
  const { clientKey, redirectUri } = tiktokCredentials();
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(48).toString("base64url");
  // TikTok pide el challenge en hex, no en base64url como el estándar.
  const challenge = createHash("sha256").update(verifier).digest("hex");
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({ client_key: clientKey, response_type: "code", scope: TIKTOK_SCOPES, redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return { url: url.toString(), state, verifier };
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; scope?: string; error?: string; error_description?: string };
type StoredToken = { accessToken: string; refreshToken: string; openId: string; scope: string; accessExpiresAt: number; refreshExpiresAt: number };

// ponytail: el token va en claro en la base, igual que las claves de .env.local; cifrarlo si la base la comparte más gente.
async function readToken() {
  const row = await withDatabase(async (database) => await database.prepare("SELECT data_json FROM oauth_tokens WHERE platform = 'tiktok'").get() as { data_json: string } | undefined);
  return row ? JSON.parse(row.data_json) as StoredToken : null;
}

async function requestToken(params: Record<string, string>, request: typeof fetch, now: number) {
  const { clientKey, clientSecret } = tiktokCredentials();
  const response = await request(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, ...params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null) as TokenResponse | null;
  // TikTok a veces responde 200 con el error dentro del cuerpo, así que no basta con mirar `response.ok`.
  if (!response.ok || !body?.access_token || !body.refresh_token || !body.open_id) {
    throw new TikTokError(`TikTok rechazó la autorización: ${body?.error_description ?? body?.error ?? response.status}`, response.status === 400 ? 400 : 502);
  }
  const token: StoredToken = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    openId: body.open_id,
    scope: body.scope ?? "",
    accessExpiresAt: now + (body.expires_in ?? 86_400) * 1000,
    refreshExpiresAt: now + (body.refresh_expires_in ?? 31_536_000) * 1000,
  };
  await withDatabase((database) => database
    .prepare("INSERT INTO oauth_tokens (platform, data_json, updated_at) VALUES ('tiktok', ?, ?) ON CONFLICT (platform) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at")
    .run(JSON.stringify(token), new Date(now).toISOString()));
  return token;
}

/** Cambia el `code` del callback por los tokens y los guarda. */
export function completeAuthorization(code: string, verifier: string, { request = fetch, now = Date.now() }: { request?: typeof fetch; now?: number } = {}) {
  return requestToken({ code, grant_type: "authorization_code", redirect_uri: tiktokCredentials().redirectUri, code_verifier: verifier }, request, now);
}

async function validToken(request: typeof fetch, now: number) {
  const token = await readToken();
  // 409 significa «falta conectar la cuenta»: el sync lo trata como omitido, no como fallo.
  if (!token) throw new TikTokError("TikTok no está conectado: usa «Conectar TikTok» en Rendimiento.", 409);
  if (token.accessExpiresAt - now > REFRESH_MARGIN_MS) return token;
  if (token.refreshExpiresAt <= now) throw new TikTokError("La autorización de TikTok caducó: vuelve a conectar la cuenta.", 401);
  // ponytail: sin bloqueo entre refrescos; el sync corre de a uno, así que no hay carrera real.
  return requestToken({ grant_type: "refresh_token", refresh_token: token.refreshToken }, request, now);
}

/**
 * TikTok solo entrega los contadores de hoy, sin histórico: cada sincronización guarda una fila
 * del día y el historial se construye con el tiempo.
 */
export async function fetchTikTokStats({ request = fetch, today = new Date() }: { request?: typeof fetch; today?: Date } = {}): Promise<IncomingSnapshot[]> {
  const token = await validToken(request, today.getTime());
  const response = await request(`${USER_INFO_URL}?fields=${["open_id", ...Object.keys(FIELD_TO_METRIC)].join(",")}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null) as { data?: { user?: Record<string, unknown> }; error?: { code?: string; message?: string } } | null;
  const user = body?.data?.user;
  if (!response.ok || (body?.error?.code && body.error.code !== "ok") || !user) {
    throw new TikTokError(`TikTok: ${body?.error?.message || body?.error?.code || response.status}`, response.status === 401 ? 401 : 502);
  }
  const metrics = Object.fromEntries(Object.entries(FIELD_TO_METRIC).flatMap(([field, name]) => typeof user[field] === "number" ? [[name, user[field] as number]] : []));
  if (!Object.keys(metrics).length) throw new TikTokError("TikTok no devolvió estadísticas: reconecta la cuenta y acepta el permiso de estadísticas.", 403);
  return [{ platform: "tiktok", propertyId: token.openId, dimension: "date", dimensionValue: "", date: formatIsoDate(today), metrics }];
}
