// Aplica (o deshace) las migraciones de db/migrations con node-pg-migrate. El historial de lo que
// se ha aplicado queda en la tabla `pgmigrations` de la propia base.
//   npm run db:migrate               aplica todas las pendientes
//   npm run db:migrate -- down       deshace la última
//   npm run db:migrate -- status     lista aplicadas y pendientes
//   npm run db:migrate:create nombre crea el archivo de una migración nueva
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { runner } from "node-pg-migrate";
import pg from "pg";

export const migrationsDir = resolve(fileURLToPath(new URL("../db/migrations", import.meta.url)));
const migrationsTable = "pgmigrations";

/** Aplica las pendientes. Lo usan el CLI, `db:init` y las pruebas (que migran una base efímera). */
export function migrate(databaseUrl, { direction = "up", count, silent = false } = {}) {
  return runner({
    databaseUrl,
    dir: migrationsDir,
    direction,
    count: count ?? (direction === "up" ? Infinity : 1),
    migrationsTable,
    checkOrder: true,
    logger: silent ? { debug() {}, info() {}, warn() {}, error() {} } : console,
  });
}

async function status(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const applied = await client.query(`SELECT name, run_on FROM ${migrationsTable} ORDER BY id`).then((result) => result.rows, () => []);
    const done = new Set(applied.map((row) => row.name));
    for (const row of applied) console.log(`aplicada   ${row.name}  (${new Date(row.run_on).toISOString()})`);
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
      if (!done.has(file.replace(/\.sql$/, ""))) console.log(`pendiente  ${file.replace(/\.sql$/, "")}`);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    console.error("DATABASE_URL debe ser una URL de Postgres (postgres://usuario:clave@host:puerto/base).");
    process.exit(1);
  }
  const action = process.argv[2] ?? "up";
  if (action === "status") await status(databaseUrl);
  else if (action === "up" || action === "down") {
    const applied = await migrate(databaseUrl, { direction: action });
    console.log(applied.length ? `${applied.length} migración(es) ${action === "up" ? "aplicada(s)" : "deshecha(s)"}.` : "Nada que hacer: la base está al día.");
  } else {
    console.error(`Acción desconocida: ${action}. Usa up, down o status.`);
    process.exit(1);
  }
}
