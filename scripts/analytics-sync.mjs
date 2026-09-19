/**
 * Ingesta de métricas para cron/tarea programada. Usa el mismo código que la API:
 *   npm run analytics:sync           (ventana por defecto, 28 días)
 *   npm run analytics:sync -- --days=7
 * Sale con código 1 si alguna plataforma configurada falló, para que el cron lo reporte.
 */


const daysArgument = process.argv.slice(2).find((argument) => argument.startsWith("--days="));
const { parseSyncDays, syncAnalytics } = await import("../apps/studio/src/lib/analytics-sync.ts");
const summary = await syncAnalytics({ days: parseSyncDays(daysArgument ? daysArgument.slice("--days=".length) : undefined) });

for (const result of summary.results) {
  const range = result.startDate ? `${result.startDate} -> ${result.endDate}` : "sin rango";
  console.log(`${result.platform.padEnd(18)} ${result.status.padEnd(8)} ${range}  +${result.inserted} nuevas / ${result.updated} actualizadas  [${result.dimensions.join(", ") || "-"}]`);
  if (result.error) console.log(`  ${result.error}`);
}
console.log(`Total: ${summary.inserted} nuevas, ${summary.updated} actualizadas (${summary.days} dias).`);

if (summary.failed.length) process.exitCode = 1;
