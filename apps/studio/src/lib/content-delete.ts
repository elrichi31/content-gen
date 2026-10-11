import { withDatabase } from "./db.ts";

export class ContentDeleteError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/**
 * Borra una pieza para siempre. Los costos de IA y los huecos del calendario se conservan sin
 * pieza; renders y exportaciones se van con ella.
 */
// ponytail: los archivos quedan en disco (los MP4 pasan a ser borrables en Almacenamiento); borrarlos aquí si el disco aprieta.
export async function deleteContentItem(id: string) {
  await withDatabase(async (database) => {
    await database.exec("BEGIN;");
    try {
      // El bloqueo de fila frena un render o una exportación que se encole a mitad del borrado.
      if (!await database.prepare("SELECT id FROM content_items WHERE id = ? FOR UPDATE").get(id)) throw new ContentDeleteError("Contenido no encontrado.", 404);
      // El worker escribiría la exportación de una pieza que ya no existe.
      if (await database.prepare("SELECT id FROM render_jobs WHERE content_item_id = ? AND (data_json::jsonb->>'status') IN ('queued', 'processing') LIMIT 1").get(id)) throw new ContentDeleteError("Hay un render en curso. Espera a que termine para borrar.", 409);
      await database.prepare("UPDATE generation_runs SET content_item_id = NULL, data_json = jsonb_set(data_json::jsonb, '{contentItemId}', 'null')::text WHERE content_item_id = ?").run(id);
      await database.prepare("UPDATE scheduled_posts SET content_item_id = NULL, data_json = jsonb_set(data_json::jsonb, '{contentItemId}', 'null')::text WHERE content_item_id = ?").run(id);
      for (const table of ["radar_topic_items", "render_jobs", "exports"]) await database.prepare(`DELETE FROM ${table} WHERE content_item_id = ?`).run(id);
      await database.prepare("DELETE FROM content_items WHERE id = ?").run(id);
      await database.exec("COMMIT;");
    } catch (error) {
      await database.exec("ROLLBACK;");
      throw error;
    }
  });
}
