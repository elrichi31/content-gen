import { handleOAuth } from "@/lib/mcp/oauth-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) => handleOAuth("revoke", request);
