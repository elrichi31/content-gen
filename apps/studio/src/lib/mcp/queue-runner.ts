import { appendGenerationLog, claimNextGeneration, finishGeneration } from "../generation-queue.ts";
import type { runQueuedTool } from "./server.ts";

// En globalThis para que el HMR de desarrollo no deje dos procesadores vivos a la vez.
const state = globalThis as typeof globalThis & { contentGenQueueBusy?: boolean };

/**
 * Ejecuta lo aprobado de uno en uno, por orden de llegada. Llamarla mientras ya corre no hace nada:
 * el bucle en marcha recoge también lo aprobado después.
 */
export async function drainGenerationQueue(execute?: typeof runQueuedTool) {
  if (state.contentGenQueueBusy) return;
  state.contentGenQueueBusy = true;
  try {
    let request = await claimNextGeneration();
    while (request) {
      const id = request.id;
      // Import diferido: el servidor MCP arrastra todas las rutas y solo hace falta si hay algo aprobado.
      const run = execute ?? (await import("./server.ts")).runQueuedTool;
      // Los pasos se escriben en orden y sin frenar la generación; un fallo del log no la tumba.
      let logged = Promise.resolve();
      const log = (message: string) => { logged = logged.then(() => appendGenerationLog(id, message)).catch(() => {}); };
      try {
        const result = await run({ origin: request.origin, tool: request.tool, args: request.args, log });
        await logged;
        const incomplete = result as { status?: unknown; failedStep?: unknown; error?: unknown } | null;
        await finishGeneration(id, incomplete?.status === "incomplete" ? { result, error: `Paso ${String(incomplete.failedStep)}: ${String(incomplete.error)}` } : { result });
      } catch (error) {
        await logged;
        await finishGeneration(id, { error: error instanceof Error ? error.message : "La generación falló." });
      }
      request = await claimNextGeneration();
    }
  } catch (error) { console.error("[cola de generación]", error); }
  finally { state.contentGenQueueBusy = false; }
}
