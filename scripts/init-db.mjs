// Alias histórico de `npm run db:migrate`: aplica las migraciones pendientes de db/migrations.
// Se conserva porque README, guías y `npm run db:init` ya lo mencionan.
import { migrate } from "./migrate.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
  throw new Error("DATABASE_URL debe ser una URL de Postgres (postgres://usuario:clave@host:puerto/base).");
}
const applied = await migrate(databaseUrl);
console.log(applied.length ? `Base de datos inicializada: ${applied.length} migración(es) aplicada(s).` : "Base de datos al día: no había migraciones pendientes.");
