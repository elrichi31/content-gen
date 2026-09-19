// Base de datos efímera para una prueba: crea `test_xxxxxxxx` en el Postgres de TEST_DATABASE_URL,
// le aplica las migraciones reales y la borra al terminar. Así cada prueba corre contra el mismo
// esquema que producción y no comparte estado con ninguna otra.
//
//   const testDb = await createTestDatabase();
//   process.env.DATABASE_URL = testDb.url;      // antes de importar los módulos que usan la base
//   ...
//   await testDb.drop();                        // cierra el pool de la app y borra la base
//
// Necesita un Postgres accesible: docker compose -f docker-compose.dev.yml up -d
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import pg from "pg";
import { migrate } from "./migrate.mjs";

/**
 * Solo se lee TEST_DATABASE_URL de .env.local, no el archivo entero: cargarlo todo metería en las
 * pruebas las claves reales (OpenAI, ElevenLabs…) y algunas terminarían llamando a la API de verdad.
 */
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const envFile = fileURLToPath(new URL("../.env.local", import.meta.url));
  if (!existsSync(envFile)) return undefined;
  return /^TEST_DATABASE_URL=(.+)$/m.exec(readFileSync(envFile, "utf8"))?.[1].trim().replace(/^["']|["']$/g, "");
}

export async function createTestDatabase({ migrated = true } = {}) {
  const adminUrl = testDatabaseUrl();
  if (!adminUrl) {
    throw new Error("Falta TEST_DATABASE_URL (Postgres de pruebas). Levanta uno con `docker compose -f docker-compose.dev.yml up -d` y ponlo en .env.local.");
  }
  const name = `test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(`No se pudo conectar al Postgres de pruebas (${new URL(adminUrl).host}): ${error.message}. ¿Está corriendo Docker?`);
  }
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  if (migrated) await migrate(url.toString(), { silent: true });

  return {
    url: url.toString(),
    /** Consulta directa para sembrar o comprobar datos sin pasar por la app. */
    async query(sql, params = []) {
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      try {
        return (await client.query(sql, params)).rows;
      } finally {
        await client.end();
      }
    },
    async drop() {
      // El pool de la app (si llegó a abrirse) tiene conexiones a esta base y bloquearía el DROP.
      const { closeDatabase } = await import("../apps/studio/src/lib/db.ts");
      await closeDatabase();
      const cleanup = new pg.Client({ connectionString: adminUrl });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
