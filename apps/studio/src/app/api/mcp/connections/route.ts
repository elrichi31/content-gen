import { handleOAuth } from "@/lib/mcp/oauth-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleOAuth("connectionsGet", request);
export const POST = (request: Request) => handleOAuth("connectionsPost", request);
