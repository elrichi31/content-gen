"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectPrimitiveTrigger } from "@/components/ui/select";

const DEFAULT_ZONE = "America/Guayaquil";
const ZONES = [
  "America/Guayaquil", "America/Bogota", "America/Lima", "America/Mexico_City", "America/New_York",
  "America/Caracas", "America/Santiago", "America/Argentina/Buenos_Aires", "Europe/Madrid", "UTC",
];

const time = (date: Date, timeZone: string) => date.toLocaleTimeString("es", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
/** «UTC-5», «UTC+2», «UTC» a partir del desfase que da Intl («GMT-5»). */
function offset(date: Date, timeZone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  return name.replace("GMT", "UTC");
}
const city = (zone: string) => zone === "UTC" ? "UTC" : zone.split("/").pop()!.replaceAll("_", " ");

/** Reloj de la barra superior; la zona se guarda para todo el estudio (las automatizaciones siguen en UTC). */
export function TopBarClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [zone, setZone] = useState(DEFAULT_ZONE);

  useEffect(() => {
    // Sin hora en el render del servidor: evita desajustes de hidratación.
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    fetch("/api/clock").then((res) => res.ok ? res.json() : null).then((data: { timezone?: string } | null) => { if (data?.timezone) setZone(data.timezone); }).catch(() => {});
    return () => clearInterval(id);
  }, []);

  const change = async (next: string) => {
    const previous = zone;
    setZone(next);
    const res = await fetch("/api/clock", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ timezone: next }) }).catch(() => null);
    if (!res?.ok) { setZone(previous); toast.error("No se pudo guardar la zona horaria."); }
  };

  const zones = ZONES.includes(zone) ? ZONES : [zone, ...ZONES];
  return (
    <Select value={zone} onValueChange={change}>
      <SelectPrimitiveTrigger
        aria-label="Reloj: cambiar zona horaria"
        title={now ? `${city(zone)} · UTC ${time(now, "UTC")} (las automatizaciones usan UTC)` : undefined}
        className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[13px] text-foreground transition-colors hover:bg-accent focus:outline-hidden focus-visible:ring-3 focus-visible:ring-ring/20"
      >
        <Clock className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="font-medium tabular-nums">{now ? time(now, zone) : "--:--:--"}</span>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">{now ? offset(now, zone) : ""}</span>
      </SelectPrimitiveTrigger>
      <SelectContent align="end" className="min-w-56">
        {zones.map((entry) => (
          <SelectItem key={entry} value={entry}>
            {city(entry)} <span className="text-muted-foreground">{now ? offset(now, entry) : ""}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
