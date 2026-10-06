import { createHash, timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createStudioMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Las herramientas que generan (carrusel con imágenes, radar, artículo con búsqueda) tardan minutos.
export const maxDuration = 800;

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Servidor MCP del Studio para agentes (Claude Code, Hermes). Va fuera del login por cookie: se
 * autentica con `Authorization: Bearer <MCP_TOKEN>`. Sin token configurado el MCP no existe.
 */
async function handle(request: Request) {
  const token = process.env.MCP_TOKEN ?? "";
  if (token.length < 32) return Response.json({ error: "MCP desactivado: define MCP_TOKEN (32+ caracteres) en el entorno." }, { status: 503 });
  const sent = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  // Se comparan los hashes para que la comparación en tiempo constante no dependa de la longitud.
  if (!timingSafeEqual(digest(sent), digest(token))) {
    return Response.json({ error: "Token inválido." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  const server = createStudioMcpServer({ origin: process.env.MCP_PUBLIC_ORIGIN || new URL(request.url).origin });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally { await server.close(); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
