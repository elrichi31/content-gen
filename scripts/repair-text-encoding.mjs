import pg from "pg";
import { adaptClient } from "../apps/studio/src/lib/db.ts";

/**
 * Repara los textos que quedaron con el carácter de reemplazo (U+FFFD) en lugar
 * de una vocal acentuada o una eñe. No los produjo la aplicación —guarda y
 * devuelve UTF-8 correctamente— sino comandos de verificación lanzados desde una
 * consola de Windows con codificación distinta a UTF-8.
 *
 * El byte original se perdió, así que la reparación es un diccionario explícito:
 * solo se corrigen palabras conocidas y cualquier otra se reporta sin tocarla.
 */
export const REPLACEMENTS = {
  "Campa�a": "Campaña",
  "Est�ndar": "Estándar",
  "L�mite": "Límite",
  "l�mite": "límite",
  "J�venes": "Jóvenes",
  "integraci�n": "integración",
  "Verificaci�n": "Verificación",
  "cancelaci�n": "cancelación",
};

const WORD = /[\p{L}�]*�[\p{L}�]*/gu;

/** Devuelve el texto reparado y las palabras que no están en el diccionario. */
export function repairText(value) {
  const unknown = [];
  const repaired = value.replace(WORD, (word) => {
    if (REPLACEMENTS[word]) return REPLACEMENTS[word];
    unknown.push(word);
    return word;
  });
  return { repaired, unknown };
}

export async function repairDatabaseEncoding(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const database = adaptClient(client);
  const changes = [];
  const unknown = new Map();
  try {
    // Solo columnas de texto de tablas con clave primaria simple (así se sabe qué fila reescribir);
    // el historial de migraciones no es contenido y no se toca.
    const columns = await database.prepare(`
      SELECT c.table_name AS "table", c.column_name AS "column",
             (SELECT MIN(k.column_name) FROM information_schema.table_constraints t
                JOIN information_schema.key_column_usage k ON k.constraint_name = t.constraint_name AND k.table_schema = t.table_schema
               WHERE t.table_schema = 'public' AND t.table_name = c.table_name AND t.constraint_type = 'PRIMARY KEY'
               GROUP BY k.constraint_name HAVING COUNT(*) = 1) AS "key"
        FROM information_schema.columns c
        JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
       WHERE c.table_schema = 'public' AND c.data_type = 'text' AND c.table_name <> 'pgmigrations'
       ORDER BY c.table_name, c.ordinal_position`).all();
    const byTable = new Map();
    for (const { table, column, key } of columns) {
      if (!key || column === key) continue;
      byTable.set(table, { key, texts: [...(byTable.get(table)?.texts ?? []), column] });
    }
    for (const [table, { key, texts }] of byTable) {
      for (const row of await database.prepare(`SELECT * FROM "${table}"`).all()) {
        for (const column of texts) {
          const value = row[column];
          if (typeof value !== "string" || !value.includes("�")) continue;
          const { repaired, unknown: missing } = repairText(value);
          for (const word of missing) unknown.set(word, (unknown.get(word) ?? 0) + 1);
          if (repaired === value) continue;
          await database.prepare(`UPDATE "${table}" SET "${column}" = ? WHERE "${key}" = ?`).run(repaired, row[key]);
          changes.push({ table, column, id: String(row[key]) });
        }
      }
    }
  } finally {
    await client.end();
  }
  return { repaired: changes.length, changes, unknown: Object.fromEntries(unknown) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL debe ser una URL de Postgres.");
  console.log(JSON.stringify(await repairDatabaseEncoding(url), null, 2));
}
