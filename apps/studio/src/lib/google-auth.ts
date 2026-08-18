import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export class GoogleAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const serviceAccountSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
  token_uri: z.string().url().default("https://oauth2.googleapis.com/token"),
});
type ServiceAccount = z.infer<typeof serviceAccountSchema>;

/**
 * Credencial de service account: JSON en línea (`GOOGLE_SERVICE_ACCOUNT_JSON`) o ruta al
 * archivo descargado de Google Cloud. No se usa OAuth interactivo: basta con dar acceso de
 * lectura a este email desde Search Console y GA4.
 */
export function readServiceAccount(): ServiceAccount {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const path = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim();
  if (!inline && !path) throw new GoogleAuthError("Falta configurar GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_KEY_FILE.", 503);
  let raw: unknown;
  try { raw = JSON.parse(inline || readFileSync(path as string, "utf8")); }
  catch { throw new GoogleAuthError("La credencial de Google no es un JSON legible.", 503); }
  const parsed = serviceAccountSchema.safeParse(raw);
  if (!parsed.success) throw new GoogleAuthError("La credencial de Google no tiene client_email y private_key válidos.", 503);
  // En variables de entorno la clave viaja con \n escapados; PEM necesita saltos reales.
  return { ...parsed.data, private_key: parsed.data.private_key.replace(/\\n/g, "\n") };
}

function base64url(value: object) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }

function signAssertion(account: ServiceAccount, scope: string, issuedAt: number) {
  const payload = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({ iss: account.client_email, scope, aud: account.token_uri, iat: issuedAt, exp: issuedAt + 3600 })}`;
  try { return `${payload}.${createSign("RSA-SHA256").update(payload).end().sign(account.private_key, "base64url")}`; }
  catch { throw new GoogleAuthError("No se pudo firmar el token: revisa el formato de private_key.", 503); }
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>();
/** Solo para pruebas y para forzar renovación tras cambiar credenciales. */
export function resetGoogleTokenCache() { tokenCache.clear(); }

/** Intercambia el JWT firmado por un access token, con caché en memoria y 60 s de margen. */
export async function getGoogleAccessToken(scope: string, { request = fetch, now = Date.now }: { request?: typeof fetch; now?: () => number } = {}) {
  const account = readServiceAccount();
  const cacheKey = `${account.client_email}:${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now() + 60_000) return cached.value;

  const response = await request(account.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signAssertion(account, scope, Math.floor(now() / 1000)) }).toString(),
  });
  const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token) throw new GoogleAuthError(response.status === 400 || response.status === 401 ? "Google rechazó la credencial de service account." : "Google no pudo emitir el token de acceso.", response.status === 400 || response.status === 401 ? 503 : 502);

  tokenCache.set(cacheKey, { value: body.access_token, expiresAt: now() + Math.min(body.expires_in ?? 3600, 3600) * 1000 });
  return body.access_token;
}

/** Traduce los errores de las APIs de Google a mensajes accionables sin filtrar detalles internos. */
export function googleApiError(status: number, api: string) {
  if (status === 401 || status === 403) return new GoogleAuthError(`${api} rechazó el acceso: da permiso de lectura al service account en la propiedad.`, 403);
  if (status === 404) return new GoogleAuthError(`${api} no encontró la propiedad configurada.`, 404);
  if (status === 429) return new GoogleAuthError(`${api} agotó la cuota de consultas; reintenta más tarde.`, 429);
  return new GoogleAuthError(`${api} no pudo completar la solicitud.`, 502);
}
