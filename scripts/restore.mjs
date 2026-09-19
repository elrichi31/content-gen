// Restaura un backup en una base NUEVA y una carpeta vacía; nunca sobrescribe lo activo.
//   npm run restore -- antes-de-cambio restore_prueba
// El destino es a la vez el nombre de la base nueva (solo minúsculas, números y guion bajo) y la
// carpeta `storage/<destino>` donde quedan los medios. Necesita `pg_restore` en el PATH.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { URL } from "node:url";
import pg from "pg";

const storage = resolve(process.env.STORAGE_ROOT ?? "storage"); const [backupName, targetName] = process.argv.slice(2);
const unsafe = (name) => !/^[\w.-]+$/.test(name) || name.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
if (!backupName || !targetName || unsafe(backupName) || !/^[a-z][a-z0-9_]{0,40}$/.test(targetName)) throw new Error("Uso: npm run restore -- <backup> <destino>   (destino: minúsculas, números y _, empieza por letra)");
const source = resolve(storage, "backups", backupName); const target = resolve(storage, targetName);
if (!source.startsWith(`${storage}${sep}`) || !target.startsWith(`${storage}${sep}`) || !existsSync(resolve(source, "manifest.json"))) throw new Error("Backup o destino no seguro.");
if (existsSync(target) && readdirSync(target).length) throw new Error("La carpeta de destino debe estar vacía.");
const manifest = JSON.parse(readFileSync(resolve(source, "manifest.json"), "utf8"));
if (manifest.schemaVersion === 1) throw new Error("Este backup es de la época SQLite (schemaVersion 1). Para traer esos datos usa `npm run db:import-sqlite -- <ruta al .sqlite>`.");
if (manifest.schemaVersion !== 2 || manifest.databaseFormat !== "pg_dump-custom" || ![null, "media"].includes(manifest.media) || !existsSync(resolve(source, manifest.database))) throw new Error("Manifest de backup inválido.");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) throw new Error("DATABASE_URL debe ser una URL de Postgres.");

const admin = new pg.Client({ connectionString: databaseUrl });
await admin.connect();
try {
  await admin.query(`CREATE DATABASE ${targetName}`);
} catch (error) {
  throw new Error(`No se pudo crear la base ${targetName}: ${error.message}`);
} finally {
  await admin.end();
}
const restoreUrl = new URL(databaseUrl); restoreUrl.pathname = `/${targetName}`;
const restore = spawnSync("pg_restore", ["--no-owner", `--dbname=${restoreUrl}`, resolve(source, manifest.database)], { encoding: "utf8" });
if (restore.error?.code === "ENOENT") throw new Error(`No encuentro \`pg_restore\` (cliente de PostgreSQL). La base ${targetName} quedó creada y vacía.`);
if (restore.status !== 0) throw new Error(`pg_restore falló: ${restore.stderr || restore.error?.message}. La base ${targetName} quedó creada; bórrala antes de reintentar.`);
mkdirSync(target, { recursive: true });
if (manifest.media && existsSync(resolve(source, manifest.media))) cpSync(resolve(source, manifest.media), resolve(target, "media"), { recursive: true });
console.log(`Backup restaurado en la base ${targetName} y en ${target}`);
console.log(`Para revisarlo: DATABASE_URL=${restoreUrl} STORAGE_ROOT=${target} npm run check:integrity`);
