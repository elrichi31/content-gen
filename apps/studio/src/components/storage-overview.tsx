import { PageHeading } from "@/components/page-shell";
import { StorageRefresh } from "@/components/storage-refresh";
import type { StorageCategory, StorageUsage } from "@/lib/storage-usage";

const labels: Record<StorageCategory, string> = {
  video: "Videos guardados", image: "Imágenes", audio: "Audio", renders: "Renders", other: "Otros archivos",
};
const bytes = (value: number) => {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${new Intl.NumberFormat("es", { maximumFractionDigits: index ? 1 : 0 }).format(value)} ${units[index]}`;
};

export function StorageOverview({ usage }: { usage: StorageUsage }) {
  const disk = usage.disk;
  const availablePercent = disk && disk.totalBytes ? disk.availableBytes / disk.totalBytes * 100 : null;
  const critical = availablePercent !== null && availablePercent < 5;
  const low = availablePercent !== null && availablePercent < 10;
  const status = critical ? "Espacio crítico" : low ? "Poco espacio disponible" : "Espacio disponible";
  const percent = disk ? Math.round(disk.usedPercent * 10) / 10 : 0;
  const measured = usage.scanStatus !== "unavailable";
  return (
    <>
      <PageHeading title="Almacenamiento" description="Espacio del volumen donde Content Gen guarda sus archivos." actions={<StorageRefresh />} />
      <section aria-labelledby="storage-disk" className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="storage-disk" className="text-sm font-semibold">Disco del almacenamiento</h2>
          {disk ? <span className={`text-xs font-medium ${low ? "text-destructive" : "text-muted-foreground"}`}>{status}</span> : null}
        </div>
        {disk ? (
          <>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
              <span><span className="font-semibold tabular-nums">{bytes(disk.usedBytes)}</span><span className="text-muted-foreground"> de {bytes(disk.totalBytes)} usados</span></span>
              <span className="tabular-nums text-muted-foreground">{new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(percent)} %</span>
            </div>
            <div role="meter" aria-label="Uso del disco" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent} por ciento usado`} className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${low ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percent}%` }} />
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-[13px]">
              {[["Capacidad", disk.totalBytes], ["Usado", disk.usedBytes], ["Disponible", disk.availableBytes]].map(([label, value]) => (
                <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{bytes(value as number)}</dd></div>
              ))}
            </dl>
            {low ? <p role="status" className="mt-4 text-[13px] text-destructive">{critical ? "Queda menos del 5 % disponible." : "Queda menos del 10 % disponible."} Revisa el almacenamiento antes de generar más videos.</p> : null}
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Otros servicios que compartan este volumen también cuentan en el uso del disco.{disk.reservedBytes > 0 ? ` El sistema reserva ${bytes(disk.reservedBytes)}, no disponibles para la app.` : ""}</p>
          </>
        ) : <p role="status" className="mt-4 text-[13px] text-muted-foreground">No se pudo leer la capacidad del volumen. Comprueba que el almacenamiento esté montado y vuelve a actualizar.</p>}
      </section>
      <section aria-labelledby="storage-files" className="mt-7">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="storage-files" className="text-sm font-semibold">Archivos de Content Gen</h2>
          {measured ? <span className="text-xs tabular-nums text-muted-foreground">{usage.files.toLocaleString("es")} archivos · {bytes(usage.allocatedBytes)} en disco{usage.scanStatus === "partial" ? " medidos" : ""}</span> : null}
        </div>
        {measured ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Uso de almacenamiento por tipo de archivo</caption>
              <thead className="border-b border-border bg-muted/40 text-muted-foreground"><tr><th scope="col" className="px-4 py-3 text-left font-medium">Tipo</th><th scope="col" className="px-4 py-3 text-right font-medium">Archivos</th><th scope="col" className="px-4 py-3 text-right font-medium">Espacio en disco</th></tr></thead>
              <tbody className="divide-y divide-border">
                {(Object.keys(labels) as StorageCategory[]).map((type) => <tr key={type}><th scope="row" className="px-4 py-3 text-left font-medium">{labels[type]}</th><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{usage.categories[type].files.toLocaleString("es")}</td><td className="px-4 py-3 text-right tabular-nums">{bytes(usage.categories[type].allocatedBytes)}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <p role="status" className="text-[13px] text-muted-foreground">No se pudo leer la carpeta de archivos. Revisa el volumen y sus permisos, y vuelve a actualizar.</p>}
        {usage.scanStatus === "partial" ? <p role="status" className="mt-3 text-[13px] text-destructive">Medición parcial: el recorrido alcanzó su límite o algunos archivos no se pudieron leer. El desglose no representa el total.</p> : null}
        {measured ? <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">Renders incluye salidas del worker; Videos guardados incluye las copias finales de la biblioteca. Se mide el espacio físico de archivos únicos, sin sumar registros duplicados de la base de datos.{usage.files === 0 ? " Todavía no hay archivos guardados." : ""}</p> : null}
      </section>
      <p className="mt-5 text-xs text-muted-foreground">Medición: {new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "medium", timeZone: "UTC" }).format(new Date(usage.checkedAt))} UTC</p>
    </>
  );
}
