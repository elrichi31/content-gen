/**
 * Next llama a `register` una vez al arrancar el servidor. Aquí corren las automatizaciones de
 * carruseles: una pasada al minuto de arrancar y luego cada 15 minutos.
 * `AUTOMATIONS_DISABLED=1` las apaga (útil en desarrollo para no gastar en generación).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.AUTOMATIONS_DISABLED === "1") return;
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
