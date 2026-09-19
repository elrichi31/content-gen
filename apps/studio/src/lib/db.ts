import { resolve } from "node:path";
import pg from "pg";

// int8 (COUNT, SUM de enteros) y numeric (AVG) llegan como string por defecto. SQLite los daba como
// number y el código los usa así; ninguno se acerca a 2^53 en esta app.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

/**
 * Carpeta que contiene `media/` (assets) y `renders/` (salida del worker). En despliegue es un
 * volumen persistente; en local, `<repo>/storage`. `next.config.ts` la fija absoluta al arrancar.
 */
export const storageRoot = resolve(process.env.STORAGE_ROOT ?? resolve(process.cwd(), "../../storage"));
export const mediaRoot = resolve(storageRoot, "media");

type Statement = {
  get(...params: unknown[]): Promise<unknown>;
  all(...params: unknown[]): Promise<unknown[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
};
export type Database = { exec(sql: string): Promise<void>; prepare(sql: string): Statement };

/** Un pool por proceso; en dev cuelga de globalThis para que el HMR no abra uno nuevo en cada recarga. */
const globalWithPool = globalThis as typeof globalThis & { contentGenPool?: pg.Pool };

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL debe ser una URL de Postgres (postgres://usuario:clave@host:puerto/base).");
  return url;
}

export function databasePool() {
  // El pool no abre conexión hasta la primera consulta, así que crearlo al importar es inocuo,
  // pero DATABASE_URL tiene que existir (en `next build` basta con una URL de relleno).
  globalWithPool.contentGenPool ??= new pg.Pool({ connectionString: databaseUrl(), max: Number(process.env.DATABASE_POOL_MAX) || 10, allowExitOnIdle: true });
  return globalWithPool.contentGenPool;
}

/** Cierra el pool: los scripts y las pruebas lo llaman al terminar para poder borrar su base efímera. */
export async function closeDatabase() {
  const pool = globalWithPool.contentGenPool;
  globalWithPool.contentGenPool = undefined;
  await pool?.end();
}

/** SQLite pedía `?`; Postgres pide `$1, $2…`. Se traduce fuera de los literales entre comillas. */
function withNumberedParameters(sql: string) {
  let index = 0;
  let quoted = false;
  let translated = "";
  for (const character of sql) {
    if (character === "'") quoted = !quoted;
    translated += character === "?" && !quoted ? `$${++index}` : character;
  }
  return translated;
}

/**
 * Da a una conexión suelta la misma API que recibe el callback de `withDatabase` (`prepare().get/all/run`,
 * `exec`, placeholders `?`). Es para los scripts de mantenimiento, que abren su propio `pg.Client`.
 */
export function adaptClient(client: pg.ClientBase): Database {
  return {
    async exec(sql) { await client.query(sql); },
    prepare(sql) {
      const text = withNumberedParameters(sql);
      return {
        get: async (...params) => (await client.query(text, params)).rows[0],
        all: async (...params) => (await client.query(text, params)).rows,
        run: async (...params) => ({ changes: (await client.query(text, params)).rowCount ?? 0 }),
      };
    },
  };
}

/**
 * Presta una conexión dedicada al callback: los BEGIN/COMMIT que haga viven en la misma sesión.
 * Si el callback falla, la conexión se destruye en vez de devolverla al pool, para no reciclar una
 * transacción abortada a medias.
 */
export async function withDatabase<T>(callback: (database: Database) => T | Promise<T>): Promise<T> {
  const client = await databasePool().connect();
  let failure: Error | undefined;
  try {
    return await callback(adaptClient(client));
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    throw error;
  } finally {
    client.release(failure);
  }
}
