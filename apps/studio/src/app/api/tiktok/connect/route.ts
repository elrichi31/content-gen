import { NextResponse } from "next/server";
import { OAUTH_COOKIE, startAuthorization, TikTokError } from "@/lib/tiktok";

export async function GET(request: Request) {
  try {
    const { url, state, verifier } = startAuthorization();
    const response = NextResponse.redirect(url);
    // Lax basta: el regreso desde tiktok.com es una navegación de primer nivel por GET.
    response.cookies.set(OAUTH_COOKIE, `${state}.${verifier}`, { httpOnly: true, sameSite: "lax", path: "/api/tiktok", maxAge: 600 });
    return response;
  } catch (error) {
    const target = new URL("/analytics", request.url);
    target.searchParams.set("tiktok", "error");
    target.searchParams.set("message", error instanceof TikTokError ? error.message : "No se pudo iniciar la conexión con TikTok.");
    return NextResponse.redirect(target);
  }
}
