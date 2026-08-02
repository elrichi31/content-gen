import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Arranca el worker de render en segundo plano al encolar un job, para que
 * renderizar desde la app no dependa de ejecutar `npm run worker:once` a mano.
 * El worker procesa un job y termina; cada job encolado arranca el suyo.
 */

const WORKER_PATH = "apps/render-worker/src/worker.mjs";

/** El worker resuelve rutas relativas a la raíz del repo; el servidor de Next corre desde `apps/studio`. */
export function findRepoRoot(start = process.cwd()) {
  let current = resolve(start);
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(current, WORKER_PATH))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export const renderWorkerAutostartEnabled = (value = process.env.RENDER_WORKER_AUTOSTART) =>
  value !== "0" && value?.toLowerCase() !== "false";

export function startRenderWorker() {
  if (!renderWorkerAutostartEnabled()) return { started: false, reason: "desactivado" as const };
  const root = findRepoRoot();
  if (!root) return { started: false, reason: "sin-worker" as const };
  try {
    const child = spawn(process.execPath, [WORKER_PATH, "--once"], {
      cwd: root,
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    // Desligado del servidor: el render sobrevive a un reinicio del dev server.
    child.unref();
    return { started: true, reason: null };
  } catch {
    return { started: false, reason: "no-arranco" as const };
  }
}
