import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Toda la app vive detrás de login (equipo interno, sin registro público). Valida la
 * sesión de verdad contra la base —no solo que exista la cookie— porque esto corre en
 * runtime Node (Next 16 proxy), que sí puede hacer esa consulta.
 */
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) return NextResponse.next();

  // Un fetch de API que no puede seguir un redirect a una página HTML necesita un 401 con el
  // que un cliente programático pueda razonar; solo la navegación del browser va a /login.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // terms y privacy son públicas a propósito: TikTok las revisa sin cuenta del equipo.
  matcher: ["/((?!api/auth|login|terms|privacy|_next/static|_next/image|favicon.ico).*)"],
};
