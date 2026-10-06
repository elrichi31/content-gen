import { createHash, timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyOAuthAccess } from "@/lib/mcp/oauth-runtime";
import { getOAuthConfig, privateHeaders, SCOPES, type Scope } from "@/lib/mcp/oauth-security";
import { createStudioMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Las herramientas que generan (carrusel con imágenes, radar, artículo con búsqueda) tardan minutos.
export const maxDuration = 800;

const digest = (value: string) => createHash("sha256").update(value).digest();
const oauthConfig = () => { try { return getOAuthConfig(); } catch { return null; } };

/**
 * Servidor MCP del Studio. Va fuera del login por cookie y acepta dos credenciales:
 * - `MCP_TOKEN` fijo, para agentes que permiten cabeceras (Claude Code, Hermes): acceso completo.
 * - Access token OAuth de ChatGPT (ver /api/mcp/oauth), con los permisos que la persona aprobó.
 * Sin ninguna de las dos configurada, el MCP no existe.
 */
async function handle(request: Request) {
  const staticToken = process.env.MCP_TOKEN ?? "";
  const oauth = oauthConfig();
  if (staticToken.length < 32 && !oauth) return Response.json({ error: "MCP desactivado: define MCP_TOKEN o MCP_PUBLIC_ORIGIN." }, { status: 503, headers: privateHeaders });

  // Un navegador ajeno no puede usar el MCP con las credenciales de otro: solo el propio origen y ChatGPT.
  const origin = request.headers.get("origin");
  if (origin && origin !== oauth?.origin && origin !== "https://chatgpt.com") return Response.json({ error: "Origen no permitido." }, { status: 403, headers: privateHeaders });

  const sent = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  let scopes: readonly Scope[] | null = null;
  // Se comparan hashes para que la comparación en tiempo constante no dependa de la longitud.
  if (staticToken.length >= 32 && timingSafeEqual(digest(sent), digest(staticToken))) scopes = SCOPES;
  else if (oauth && sent) {
    const access = await verifyOAuthAccess(sent);
    if (access && "rateLimited" in access) return Response.json({ error: "rate_limit_exceeded" }, { status: 429, headers: { ...privateHeaders, "Retry-After": "60" } });
    if (access) scopes = access.scopes;
  }
  if (!scopes) {
    // `resource_metadata` es lo que le indica a ChatGPT dónde iniciar el OAuth.
    const challenge = oauth ? `Bearer resource_metadata="${oauth.origin}/.well-known/oauth-protected-resource", error="invalid_token"` : "Bearer";
    return Response.json({ error: "invalid_token" }, { status: 401, headers: { ...privateHeaders, "WWW-Authenticate": challenge } });
  }

  const server = createStudioMcpServer({ origin: oauth?.origin ?? new URL(request.url).origin, scopes });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } finally { await server.close(); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
