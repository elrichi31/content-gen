import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

const TEXT_COLUMN = /TEXT/i;

export function repairDatabaseEncoding(databasePath) {
  const database = new DatabaseSync(resolve(databasePath));
  const changes = [];
  const unknown = new Map();
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    for (const table of tables) {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all();
      const key = columns.find((column) => column.pk)?.name;
      const texts = columns.filter((column) => TEXT_COLUMN.test(column.type ?? "") && column.name !== key).map((column) => column.name);
      if (!key || !texts.length) continue;
      for (const row of database.prepare(`SELECT * FROM ${table}`).all()) {
        for (const column of texts) {
          const value = row[column];
          if (typeof value !== "string" || !value.includes("�")) continue;
          const { repaired, unknown: missing } = repairText(value);
          for (const word of missing) unknown.set(word, (unknown.get(word) ?? 0) + 1);
          if (repaired === value) continue;
          database.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${key} = ?`).run(repaired, row[key]);
          changes.push({ table, column, id: String(row[key]) });
        }
      }
    }
  } finally {
    database.close();
  }
  return { repaired: changes.length, changes, unknown: Object.fromEntries(unknown) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) throw new Error("DATABASE_URL debe ser una ruta local con prefijo file:.");
  console.log(JSON.stringify(repairDatabaseEncoding(url.slice("file:".length)), null, 2));
}
