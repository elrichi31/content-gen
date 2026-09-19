// Backup = volcado de Postgres (pg_dump, formato custom) + copia de los medios + manifest.
//   npm run backup -- antes-de-cambio
// Necesita `pg_dump` (cliente de PostgreSQL) en el PATH. En el servidor, el respaldo programado de la
// base lo hace Dokploy; este script es para una copia puntual antes de tocar algo delicado.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const storage = resolve(process.env.STORAGE_ROOT ?? "storage");
const name = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, "-");
if (!/^[\w.-]+$/.test(name) || name.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error("El nombre del backup no es seguro.");
const destination = resolve(storage, "backups", name);
if (!destination.startsWith(`${storage}${sep}`) || existsSync(destination)) throw new Error("El destino de backup no es seguro o ya existe.");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) throw new Error("DATABASE_URL debe ser una URL de Postgres (corré esto con `npm run backup`, que carga .env.local).");

mkdirSync(destination, { recursive: true });
const dump = spawnSync("pg_dump", ["--format=custom", "--no-owner", `--file=${resolve(destination, "database.dump")}`, `--dbname=${databaseUrl}`], { encoding: "utf8" });
if (dump.error || dump.status !== 0) {
  // Un backup a medias es peor que ninguno: no se deja la carpeta del intento.
  rmSync(destination, { recursive: true, force: true });
  if (dump.error?.code === "ENOENT") throw new Error("No encuentro `pg_dump`. Instala el cliente de PostgreSQL (en Windows: https://www.postgresql.org/download/windows/, solo «Command Line Tools») y vuelve a intentarlo.");
  throw new Error(`pg_dump falló: ${dump.stderr || dump.error?.message}`);
}

const media = resolve(storage, "media");
if (existsSync(media)) cpSync(media, resolve(destination, "media"), { recursive: true });
writeFileSync(resolve(destination, "manifest.json"), JSON.stringify({ schemaVersion: 2, createdAt: new Date().toISOString(), database: "database.dump", databaseFormat: "pg_dump-custom", media: existsSync(media) ? "media" : null }, null, 2));
console.log(`Backup creado: ${destination}`);
