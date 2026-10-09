/**
 * Next llama a `register` una vez al arrancar el servidor. Aquí corren las automatizaciones de
 * carruseles: una pasada al minuto de arrancar y luego cada 15 minutos.
 * `AUTOMATIONS_DISABLED=1` las apaga (útil en desarrollo para no gastar en generación).
 * También arranca la cola de generaciones aprobadas del MCP (ver lib/generation-queue).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // La cola de generaciones del MCP corre aunque las automatizaciones estén apagadas: solo procesa lo aprobado.
  const { failInterruptedGenerations } = await import("./lib/generation-queue");
  const { drainGenerationQueue } = await import("./lib/mcp/queue-runner");
  // Sin esperar al procesador: lo aprobado antes del reinicio puede tardar minutos y no debe frenar el arranque.
  await failInterruptedGenerations().then(() => { void drainGenerationQueue(); }).catch((error) => console.error("[cola de generación]", error));
  // ponytail: red de seguridad por si una aprobación llega justo cuando el procesador termina; un evento lo haría inmediato.
  setInterval(() => void drainGenerationQueue(), 60_000);
  if (process.env.AUTOMATIONS_DISABLED === "1") return;
  const { runDueAutomations } = await import("./lib/carousel-automation");
  const { runDueRadarAutomations } = await import("./lib/radar-automation");
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await runDueRadarAutomations(); await runDueAutomations(); }
    catch (error) { console.error("[automatizaciones]", error); }
    finally { busy = false; }
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 15 * 60_000);
}
