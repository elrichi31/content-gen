"use client";

import type { PostStatus, PublishPlatform } from "@content-gen/domain/schedule";
import { useEffect, useState } from "react";

export const PLATFORM_LABEL: Record<PublishPlatform, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", blog: "Blog",
};
export const STATUS_LABEL: Record<PostStatus, string> = {
  planificada: "Planificada", lista: "Lista", publicada: "Publicada", omitida: "Omitida",
};

// Ecuador no tiene horario de verano: UTC-5 todo el año. Es la misma zona por defecto del reloj.
const DEFAULT_ZONE = "America/Guayaquil";

/** Día y hora de reloj en la zona del estudio: el cronograma guarda horas civiles, sin UTC. */
export function nowInZone(zone: string, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Zona horaria configurada en el reloj de la barra superior. */
export function useStudioTimezone() {
  const [zone, setZone] = useState(DEFAULT_ZONE);
  useEffect(() => {
    void fetch("/api/clock").then((response) => response.ok ? response.json() as Promise<{ timezone?: string }> : null).then((data) => { if (data?.timezone) setZone(data.timezone); }).catch(() => {});
  }, []);
  return zone;
}

export const formatPostDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const nextMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber, 1, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

