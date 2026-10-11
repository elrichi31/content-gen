import { formatIsoDate } from "@content-gen/domain/analytics";
import { createHash, randomBytes } from "node:crypto";
import { open, stat } from "node:fs/promises";
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
const VIDEO_LIST_URL = "https://open.tiktokapis.com/v2/video/list/";
const INBOX_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const PUBLISH_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";
/**
 * Sin `user.info.stats` TikTok ya no entrega seguidores, likes ni videos. `video.list` trae las
 * métricas por video y `video.upload` deja el render en los borradores de la cuenta.
 */
export const TIKTOK_SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list,video.upload";
/** Cookie que ata el `state` y el verificador PKCE al navegador que inició la conexión. */
export const OAUTH_COOKIE = "tiktok_oauth";
const FIELD_TO_METRIC = { follower_count: "followerCount", following_count: "followingCount", likes_count: "likesCount", video_count: "videoCount" } as const;
const VIDEO_FIELD_TO_METRIC = { view_count: "viewCount", like_count: "likeCount", comment_count: "commentCount", share_count: "shareCount", duration: "duration" } as const;
/** Campos de texto de la cuenta; los de `user.info.profile` solo se piden si el token los cubre. */
const BASIC_FIELD_TO_META = { display_name: "displayName" } as const;
const PROFILE_FIELD_TO_META = { username: "username", bio_description: "bio", profile_deep_link: "profileUrl" } as const;
// ponytail: como mucho 1000 videos (50 páginas de 20); paginar por fechas si la cuenta crece más.
const MAX_VIDEO_PAGES = 50;
const MB = 1024 * 1024;
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

const hasScope = (token: StoredToken, scope: string) => token.scope.split(",").includes(scope);

/** Un token de antes de ampliar permisos sigue sirviendo para lo suyo; lo nuevo pide reconectar. */
function requireScope(token: StoredToken, scope: string, what: string) {
  if (!hasScope(token, scope)) throw new TikTokError(`Falta el permiso de ${what}: pulsa «Reconectar TikTok» en Rendimiento y acepta los permisos nuevos.`, 403);
}

const API_ERRORS: Record<string, string> = {
  spam_risk_too_many_pending_share: "TikTok ya tiene 5 videos tuyos sin publicar en las últimas 24 horas: publica o descarta alguno en la app y vuelve a intentarlo.",
  scope_not_authorized: "TikTok no autorizó este permiso: pulsa «Reconectar TikTok» en Rendimiento y acepta los permisos nuevos.",
};

/** Llamada autenticada a la API. TikTok puede responder 200 con el error dentro del cuerpo. */
async function api<T>(url: string, token: StoredToken, request: typeof fetch, body?: unknown): Promise<T> {
  const response = await request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token.accessToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json; charset=UTF-8" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const parsed = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  const code = parsed?.error?.code;
  if (!response.ok || (code && code !== "ok") || !parsed?.data) {
    throw new TikTokError(API_ERRORS[code ?? ""] ?? `TikTok: ${parsed?.error?.message || code || response.status}`, [401, 403, 429].includes(response.status) ? response.status : 502);
  }
  return parsed.data;
}

/**
 * TikTok solo entrega los contadores de hoy, sin histórico: cada sincronización guarda una fila
 * del día y el historial se construye con el tiempo.
 */
export async function fetchTikTokStats({ request = fetch, today = new Date() }: { request?: typeof fetch; today?: Date } = {}): Promise<IncomingSnapshot[]> {
  const token = await validToken(request, today.getTime());
  const profile = hasScope(token, "user.info.profile");
  const textFields: Record<string, string> = { ...BASIC_FIELD_TO_META, ...(profile ? PROFILE_FIELD_TO_META : {}) };
  const fields = ["open_id", ...Object.keys(FIELD_TO_METRIC), ...Object.keys(textFields), ...(profile ? ["is_verified"] : [])];
  const { user } = await api<{ user?: Record<string, unknown> }>(`${USER_INFO_URL}?fields=${fields.join(",")}`, token, request);
  if (!user) throw new TikTokError("TikTok no devolvió la cuenta.");
  const metrics = Object.fromEntries(Object.entries(FIELD_TO_METRIC).flatMap(([field, name]) => typeof user[field] === "number" ? [[name, user[field] as number]] : []));
  if (!Object.keys(metrics).length) throw new TikTokError("TikTok no devolvió estadísticas: reconecta la cuenta y acepta el permiso de estadísticas.", 403);
  const meta: Record<string, string> = {};
  for (const [field, name] of Object.entries(textFields)) if (typeof user[field] === "string" && user[field]) meta[name] = (user[field] as string).slice(0, 2000);
  if (user.is_verified === true) meta.verified = "true";
  return [{ platform: "tiktok", propertyId: token.openId, dimension: "date", dimensionValue: "", date: formatIsoDate(today), metrics, meta }];
}

/**
 * Una fila por video público con sus contadores de hoy. Igual que la cuenta, TikTok no da
 * histórico: la evolución de cada video sale de comparar los días guardados.
 */
export async function fetchTikTokVideos({ request = fetch, today = new Date() }: { request?: typeof fetch; today?: Date } = {}): Promise<IncomingSnapshot[]> {
  const token = await validToken(request, today.getTime());
  requireScope(token, "video.list", "videos");
  const url = `${VIDEO_LIST_URL}?fields=${["id", "title", "video_description", "create_time", "share_url", ...Object.keys(VIDEO_FIELD_TO_METRIC)].join(",")}`;
  const snapshots: IncomingSnapshot[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < MAX_VIDEO_PAGES; page += 1) {
    const data = await api<{ videos?: Record<string, unknown>[]; cursor?: number; has_more?: boolean }>(url, token, request, { max_count: 20, ...(cursor === undefined ? {} : { cursor }) });
    for (const video of data.videos ?? []) {
      if (typeof video.id !== "string" || !video.id) continue;
      const title = [video.title, video.video_description].find((value) => typeof value === "string" && value) as string | undefined;
      const meta: Record<string, string> = {};
      if (title) meta.title = title.slice(0, 300);
      if (typeof video.share_url === "string" && video.share_url) meta.url = video.share_url.slice(0, 2000);
      if (typeof video.create_time === "number") meta.publishedAt = formatIsoDate(new Date(video.create_time * 1000));
      snapshots.push({
        platform: "tiktok", propertyId: token.openId, dimension: "video", dimensionValue: video.id, date: formatIsoDate(today), meta,
        metrics: Object.fromEntries(Object.entries(VIDEO_FIELD_TO_METRIC).map(([field, name]) => [name, typeof video[field] === "number" ? video[field] as number : 0])),
      });
    }
    if (!data.has_more || data.cursor === undefined) break;
    cursor = data.cursor;
  }
  return snapshots;
}

/** Totales de la cuenta que TikTok no da en el perfil: se suman desde los videos. */
export function sumVideoMetrics(videos: IncomingSnapshot[]) {
  const sum = (name: string) => videos.reduce((total, video) => total + (video.metrics[name] ?? 0), 0);
  return { videoViews: sum("viewCount"), videoComments: sum("commentCount"), videoShares: sum("shareCount") };
}

/**
 * Reparto que exige TikTok: trozos de 5 a 64 MB, y el último absorbe el resto (hasta 128 MB).
 * Un archivo de hasta 64 MB va entero.
 */
export function chunkPlan(size: number) {
  const chunkSize = size <= 64 * MB ? size : 32 * MB;
  return { chunkSize, totalChunks: Math.max(1, Math.floor(size / chunkSize)) };
}

/**
 * Deja el MP4 en los borradores de la cuenta: TikTok avisa en la bandeja de entrada y la persona
 * lo publica desde la app. Es el camino que funciona sin auditoría; la publicación directa de una
 * app sin auditar queda en privado.
 */
export async function uploadVideoDraft(path: string, { request = fetch, now = Date.now() }: { request?: typeof fetch; now?: number } = {}) {
  const token = await validToken(request, now);
  requireScope(token, "video.upload", "envío de videos");
  const { size } = await stat(path);
  if (!size) throw new TikTokError("El video está vacío.", 400);
  const { chunkSize, totalChunks } = chunkPlan(size);
  const { publish_id: publishId, upload_url: uploadUrl } = await api<{ publish_id?: string; upload_url?: string }>(INBOX_INIT_URL, token, request, { source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks } });
  if (!publishId || !uploadUrl) throw new TikTokError("TikTok no devolvió la dirección de subida.");
  const file = await open(path);
  try {
    // TikTok exige los trozos en orden, así que no se paralelizan.
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkSize;
      const end = index === totalChunks - 1 ? size - 1 : start + chunkSize - 1;
      const { buffer } = await file.read(new Uint8Array(end - start + 1), 0, end - start + 1, start);
      const response = await request(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${size}` }, body: buffer, signal: AbortSignal.timeout(300_000) });
      if (!response.ok) throw new TikTokError(`TikTok rechazó la subida del video (${response.status}).`);
    }
  } finally {
    await file.close();
  }
  return publishId;
}

/** La subida solo entrega los bytes: TikTok procesa el video después y puede rechazarlo. */
export async function fetchDraftStatus(publishId: string, { request = fetch, now = Date.now() }: { request?: typeof fetch; now?: number } = {}) {
  const data = await api<{ status?: string; fail_reason?: string }>(PUBLISH_STATUS_URL, await validToken(request, now), request, { publish_id: publishId });
  return { status: data.status ?? "PROCESSING_UPLOAD", failReason: data.fail_reason ?? "" };
}
