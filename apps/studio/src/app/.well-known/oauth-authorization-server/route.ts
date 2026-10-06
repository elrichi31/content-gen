import { getOAuthConfig, oauthErrorResponse, privateHeaders, SCOPES } from "@/lib/mcp/oauth-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Metadatos del servidor OAuth (RFC 8414). Solo configuración pública: ni datos ni secretos. */
export function GET() {
  try {
    const { origin } = getOAuthConfig();
    return Response.json({
      issuer: origin,
      authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
      token_endpoint: `${origin}/api/mcp/oauth/token`,
      revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["private_key_jwt"],
      token_endpoint_auth_signing_alg_values_supported: ["RS256"],
      revocation_endpoint_auth_methods_supported: ["private_key_jwt"],
      scopes_supported: SCOPES,
    }, { headers: { ...privateHeaders, "Access-Control-Allow-Origin": "*" } });
  } catch (error) { return oauthErrorResponse(error); }
}
