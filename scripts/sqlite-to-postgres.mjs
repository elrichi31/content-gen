// Copia los datos de un archivo SQLite (la base de antes de migrar) a la base Postgres de DATABASE_URL,
// conservando IDs, contenido y también el login: los hashes de contraseña viajan tal cual, así que la
// cuenta entra con la misma contraseña de siempre.
//
//   npm run db:import-sqlite                        origen: storage/content-gen.sqlite
//   npm run db:import-sqlite -- ruta/otra.sqlite    otro origen
//   npm run db:import-sqlite -- --force             vacía primero las tablas del destino
//
// Aplica las migraciones pendientes, copia todo en UNA transacción (o entra todo o no entra nada) y
// al final compara el número de filas de cada tabla. Se niega a mezclar con un destino que ya tenga
// datos, salvo --force.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { migrate } from "./migrate.mjs";

// Orden de padres a hijos: cada tabla va después de aquellas a las que referencia por clave foránea.
const TABLES = [
  "brand_kits", "campaigns", "content_items", "assets",
  "radar_runs", "radar_watchlist", "radar_topics", "radar_topic_items",
  "generation_runs", "render_jobs", "exports",
  "metric_snapshots", "publishing_rules", "scheduled_posts", "oauth_tokens",
  "user", "session", "account", "verification",
];
// `migrations` era el historial de SQLite; en Postgres lo lleva `pgmigrations`, así que no se copia.
const IGNORED = new Set(["migrations"]);

const args = process.argv.slice(2);
const force = args.includes("--force");
const sourcePath = resolve(args.find((argument) => !argument.startsWith("--")) ?? "storage/content-gen.sqlite");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) throw new Error("DATABASE_URL debe ser una URL de Postgres (corré esto con `npm run db:import-sqlite`, que carga .env.local).");
if (!existsSync(sourcePath)) throw new Error(`No existe el archivo SQLite de origen: ${sourcePath}`);

const source = new DatabaseSync(sourcePath, { readOnly: true });
const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
const unknown = [...sourceTables].filter((name) => !TABLES.includes(name) && !IGNORED.has(name));
if (unknown.length) throw new Error(`El origen tiene tablas que este script no sabe copiar: ${unknown.join(", ")}. Añádelas a TABLES (en orden de dependencia) antes de seguir.`);

await migrate(databaseUrl, { silent: true });
const target = new pg.Client({ connectionString: databaseUrl });
await target.connect();

/** SQLite guarda booleanos como 0/1 y fechas como texto ISO; Postgres necesita el tipo real. */
function convert(value, pgType) {
  if (value === null || value === undefined) return null;
  if (pgType === "boolean") return value === 1 || value === true || value === "1";
  if (pgType.startsWith("timestamp")) return typeof value === "number" ? new Date(value < 1e11 ? value * 1000 : value) : value;
  return value;
}

const report = [];
try {
  await target.query("BEGIN");
  const present = TABLES.filter((table) => sourceTables.has(table));

  const occupied = [];
  for (const table of TABLES) {
    const { rows } = await target.query(`SELECT COUNT(*)::int AS total FROM "${table}"`);
    if (rows[0].total) occupied.push(`${table} (${rows[0].total})`);
  }
  if (occupied.length && !force) throw new Error(`El destino ya tiene datos: ${occupied.join(", ")}. Usa --force para vaciarlo antes de importar.`);
  if (occupied.length) await target.query(`TRUNCATE ${TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`);

  for (const table of present) {
    const columns = source.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name);
    const { rows: typeRows } = await target.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table]);
    const types = new Map(typeRows.map((row) => [row.column_name, row.data_type]));
    const missing = columns.filter((column) => !types.has(column));
    if (missing.length) throw new Error(`La tabla ${table} tiene columnas que Postgres no conoce: ${missing.join(", ")}.`);

    const insert = `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`;
    const rows = source.prepare(`SELECT * FROM "${table}"`).all();
    for (const [index, row] of rows.entries()) {
      try {
        await target.query(insert, columns.map((column) => convert(row[column], types.get(column))));
      } catch (error) {
        throw new Error(`Falló la fila ${index + 1} de ${table}: ${error.message}`);
      }
    }
    report.push({ table, source: rows.length });
  }

  // Comprobación: lo que hay en Postgres tiene que coincidir con lo que había en SQLite.
  for (const entry of report) {
    entry.target = (await target.query(`SELECT COUNT(*)::int AS total FROM "${entry.table}"`)).rows[0].total;
    if (entry.target !== entry.source) throw new Error(`${entry.table}: el origen tenía ${entry.source} filas y el destino ${entry.target}.`);
  }
  await target.query("COMMIT");
} catch (error) {
  await target.query("ROLLBACK").catch(() => {});
  console.error(`Importación cancelada, el destino no se modificó: ${error.message}`);
  process.exitCode = 1;
} finally {
  await target.end();
  source.close();
}

if (!process.exitCode) {
  console.log(`Importado desde ${sourcePath}:`);
  for (const { table, source: count } of report) if (count) console.log(`  ${table.padEnd(20)} ${count}`);
  const empty = report.filter((entry) => !entry.source).map((entry) => entry.table);
  if (empty.length) console.log(`  (vacías: ${empty.join(", ")})`);
  console.log("Listo: las filas coinciden tabla por tabla.");
}
