import { NextRequest, NextResponse } from "next/server";
import { completeAuthorization, OAUTH_COOKIE, TikTokError } from "@/lib/tiktok";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Siempre se vuelve a Rendimiento, que enseña el resultado; y la cookie de un solo uso se borra.
  const back = (query: Record<string, string>) => {
    const target = new URL("/analytics", request.url);
    for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value.slice(0, 300));
    const response = NextResponse.redirect(target);
    response.cookies.delete({ name: OAUTH_COOKIE, path: "/api/tiktok" });
    return response;
  };

  if (params.get("error")) return back({ tiktok: "error", message: params.get("error_description") || params.get("error") || "TikTok canceló la autorización." });
  const [state, verifier] = (request.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  if (!state || !verifier || state !== params.get("state")) return back({ tiktok: "error", message: "La conexión no coincide con la que iniciaste; empieza de nuevo desde Rendimiento." });
  const code = params.get("code");
  if (!code) return back({ tiktok: "error", message: "TikTok no devolvió el código de autorización." });

  try {
    await completeAuthorization(code, verifier);
    return back({ tiktok: "connected" });
  } catch (error) {
    return back({ tiktok: "error", message: error instanceof TikTokError ? error.message : "No se pudo completar la conexión con TikTok." });
  }
}
