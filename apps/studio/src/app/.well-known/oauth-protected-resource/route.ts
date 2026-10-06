import { getOAuthConfig, oauthErrorResponse, privateHeaders, SCOPES } from "@/lib/mcp/oauth-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Metadatos del recurso protegido (RFC 9728): le dicen a ChatGPT dónde autorizarse para usar /api/mcp. */
export function GET() {
  try {
    const { origin, resource } = getOAuthConfig();
    return Response.json({ resource, resource_name: "Content Gen", authorization_servers: [origin], scopes_supported: SCOPES, bearer_methods_supported: ["header"] },
      { headers: { ...privateHeaders, "Access-Control-Allow-Origin": "*" } });
  } catch (error) { return oauthErrorResponse(error); }
}
