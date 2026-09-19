import { betterAuth } from "better-auth";
import { databasePool } from "./db.ts";

/**
 * Sin registro público: el equipo es chico y las cuentas se crean a mano con
 * `npm run auth:create-user`. `disableSignUp` bloquea /sign-up/email tanto en la UI
 * como si alguien le pega directo a la API. Comparte el pool de Postgres con el resto de la app.
 */
export const auth = betterAuth({
  database: databasePool(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.ALLOW_SIGNUP !== "1",
  },
});
