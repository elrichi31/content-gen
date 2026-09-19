// Crea una cuenta del equipo a mano: no hay registro público en la app.
// Uso: ALLOW_SIGNUP=1 npm run auth:create-user -- "correo@ejemplo.com" "contraseña" "Nombre"

const [email, password, name] = process.argv.slice(2);
if (!email || !password || !name) {
  console.error('Uso: ALLOW_SIGNUP=1 npm run auth:create-user -- "correo@ejemplo.com" "contraseña" "Nombre"');
  process.exit(1);
}
if (process.env.ALLOW_SIGNUP !== "1") {
  console.error("Falta ALLOW_SIGNUP=1: es a propósito, así nadie crea cuentas sin querer.");
  process.exit(1);
}

const { auth } = await import("../apps/studio/src/lib/auth.ts");
try {
  await auth.api.signUpEmail({ body: { email, password, name } });
  console.log(`Cuenta creada: ${email}`);
} catch (error) {
  console.error(`No se pudo crear la cuenta: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
