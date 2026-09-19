import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Alta de cuentas del equipo, solo para quien ya inició sesión. El registro público sigue
 * apagado (`disableSignUp`): esta ruta usa el adaptador interno de Better Auth, que no pasa
 * por ese endpoint, y comprueba la sesión ella misma además del proxy.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const input = await request.json().catch(() => null) as { name?: unknown; email?: unknown; password?: unknown } | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input?.password === "string" ? input.password : "";

  const context = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = context.password.config;
  if (!name) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "El email no es válido." }, { status: 400 });
  if (password.length < minPasswordLength) return NextResponse.json({ error: `La contraseña debe tener al menos ${minPasswordLength} caracteres.` }, { status: 400 });
  if (password.length > maxPasswordLength) return NextResponse.json({ error: "La contraseña es demasiado larga." }, { status: 400 });
  if ((await context.internalAdapter.findUserByEmail(email))?.user) return NextResponse.json({ error: "Ya existe una cuenta con ese email." }, { status: 409 });

  const user = await context.internalAdapter.createUser({ email, name, emailVerified: false }, { method: "email-password" });
  await context.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await context.password.hash(password) });
  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
