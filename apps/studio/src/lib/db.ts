import { dirname, resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && (!databaseUrl.startsWith("file:") || databaseUrl.includes(".."))) {
  throw new Error("DATABASE_URL debe ser una ruta local segura con prefijo file:.");
}
const databasePath = databaseUrl
  ? resolve(databaseUrl.slice("file:".length))
  : resolve(process.cwd(), "../../storage/content-gen.sqlite");
export const mediaRoot = resolve(dirname(databasePath), "media");

type SQLiteDatabase = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
};

export async function withDatabase<T>(callback: (database: SQLiteDatabase) => T): Promise<T> {
  const { DatabaseSync } = await import("node:" + "sqlite");
  const database = new DatabaseSync(databasePath) as SQLiteDatabase;
  database.exec("PRAGMA foreign_keys = ON;");
  try {
    return callback(database);
  } finally {
    database.close();
  }
}
