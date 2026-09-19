"use client";

import type { MetricSnapshot } from "@content-gen/domain/analytics";
import { AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type Platform = "search-console" | "google-analytics" | "tiktok";
type Payload = {
  snapshots: MetricSnapshot[];
  totals: Record<string, number>;
  period?: { startDate: string; endDate: string; days: number };
  truncated?: boolean;
  freshness: Record<string, { lastDate: string; lastSync: string }>;
  configured: Record<Platform, boolean>;
  error?: string;
};

/** Periodos que cubren la ventana de sincronización por defecto y sus múltiplos habituales. */
const PERIODS = [
  { value: 7, label: "7 días" },
  { value: 28, label: "28 días" },
  { value: 90, label: "90 días" },
];

const PLATFORM_LABEL: Record<Platform, string> = { "search-console": "Search Console", "google-analytics": "Google Analytics", tiktok: "TikTok" };

const DIMENSIONS: Record<Platform, { value: string; label: string }[]> = {
  "search-console": [
    { value: "date", label: "Por día" },
    { value: "query", label: "Búsquedas" },
    { value: "page", label: "Páginas" },
    { value: "country", label: "Países" },
    { value: "device", label: "Dispositivos" },
  ],
  "google-analytics": [
    { value: "date", label: "Por día" },
    { value: "page", label: "Páginas" },
    { value: "channel", label: "Canales" },
    { value: "country", label: "Países" },
    { value: "device", label: "Dispositivos" },
  ],
  // TikTok solo entrega los contadores de la cuenta, sin desgloses.
  tiktok: [{ value: "date", label: "Por día" }],
};

const METRIC_LABEL: Record<string, string> = {
  followerCount: "Seguidores", followingCount: "Siguiendo", likesCount: "Likes", videoCount: "Videos",
  clicks: "Clics", impressions: "Impresiones", ctr: "CTR", position: "Posición media",
  sessions: "Sesiones", totalUsers: "Usuarios", newUsers: "Usuarios nuevos",
  screenPageViews: "Vistas de página", engagementRate: "Interacción", keyEvents: "Eventos clave",
};

/** CTR y tasa de interacción son porcentajes; el resto son conteos o promedios simples. */
function formatMetric(name: string, value: number) {
  if (name === "ctr") return `${value.toFixed(2)}%`;
  if (name === "engagementRate") return `${(value * 100).toFixed(1)}%`;
  if (name === "position") return value.toFixed(1);
  return value.toLocaleString("es");
}

/** `flash` es el resultado de volver del OAuth de TikTok; la página lo lee de la URL en el servidor. */
export function AnalyticsDashboard({ initialPlatform = "search-console", flash }: { initialPlatform?: Platform; flash?: string }) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [dimension, setDimension] = useState("date");
  const [days, setDays] = useState(28);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics?platform=${platform}&dimension=${dimension}&days=${days}&limit=200`);
      const payload = await response.json() as Payload;
      setData(payload);
      setNotice(response.ok ? null : payload.error ?? "No se pudieron leer las métricas.");
    } catch {
      setNotice("No se pudo contactar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [platform, dimension, days]);

  useEffect(() => { void load(); }, [load]);

  async function sync() {
    setSyncing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/analytics/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const summary = await response.json() as { failed?: string[]; inserted?: number; updated?: number; error?: string; results?: { platform: string; status: string; error?: string }[] };
      const failures = (summary.results ?? []).filter((result) => result.status === "failed");
      setNotice(summary.error ?? (failures.length ? failures.map((result) => `${PLATFORM_LABEL[result.platform as Platform] ?? result.platform}: ${result.error}`).join(" · ") : `Sincronizado: ${summary.inserted ?? 0} nuevas, ${summary.updated ?? 0} actualizadas.`));
      await load();
    } catch {
      setNotice("La sincronización no pudo completarse.");
    } finally {
      setSyncing(false);
    }
  }

  const configured = data?.configured?.[platform] ?? false;
  const freshness = data?.freshness?.[platform];
  const totals = Object.entries(data?.totals ?? {});
  const snapshots = data?.snapshots ?? [];
  const period = data?.period;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PLATFORM_LABEL) as Platform[]).map((option) => (
          <Button key={option} variant={platform === option ? "default" : "outline"} size="sm" onClick={() => { setPlatform(option); setDimension("date"); }}>
            {PLATFORM_LABEL[option]}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Periodo
            <select
              aria-label="Periodo de las métricas"
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {freshness ? <span className="text-xs text-muted-foreground">Últimos datos: {freshness.lastDate}</span> : null}
          {platform === "tiktok" && configured ? (
            <Button asChild size="sm" variant="outline">
              <a href="/api/tiktok/connect"><Link2 className="h-4 w-4" /> {freshness ? "Reconectar TikTok" : "Conectar TikTok"}</a>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> {syncing ? "Sincronizando…" : "Sincronizar"}
          </Button>
        </div>
      </div>

      {(notice ?? flash) ? (
        <Card>
          <CardContent className="flex items-start gap-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
            <p className="text-muted-foreground">{notice ?? flash}</p>
          </CardContent>
        </Card>
      ) : null}

      {data && !configured ? (
        <Card>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{PLATFORM_LABEL[platform]} todavía no está conectado.</p>
            {platform === "tiktok" ? (
              <p>
                Configura <code className="rounded bg-muted px-1">TIKTOK_CLIENT_KEY</code> y <code className="rounded bg-muted px-1">TIKTOK_CLIENT_SECRET</code> en <code className="rounded bg-muted px-1">.env.local</code>, reinicia la app y pulsa «Conectar TikTok».
              </p>
            ) : (
              <p>
                Configura <code className="rounded bg-muted px-1">{platform === "search-console" ? "SEARCH_CONSOLE_SITE_URL" : "GA4_PROPERTY_ID"}</code> y la credencial{" "}
                <code className="rounded bg-muted px-1">GOOGLE_SERVICE_ACCOUNT_KEY_FILE</code> en <code className="rounded bg-muted px-1">.env.local</code>, y da acceso de lectura al email del service account en la propiedad.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {totals.length ? (
        <div className="space-y-2">
          {/* El periodo se dice explícitamente: son los totales del rango, no los del desglose de abajo. */}
          {period ? <p className="text-xs text-muted-foreground">Totales del {period.startDate} al {period.endDate}</p> : null}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {totals.map(([name, value]) => (
              <Card key={name}>
                <CardContent className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{METRIC_LABEL[name] ?? name}</p>
                  <p className="text-2xl font-semibold tracking-tight text-foreground">{formatMetric(name, value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {DIMENSIONS[platform].map((option) => (
          <Badge
            key={option.value}
            onClick={() => setDimension(option.value)}
            className={dimension === option.value ? "cursor-pointer bg-primary/15 text-primary border-transparent" : "cursor-pointer bg-muted text-muted-foreground border-transparent"}
          >
            {option.label}
          </Badge>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Cargando métricas…</p>
          ) : !snapshots.length ? (
            <p className="p-6 text-sm text-muted-foreground">Sin datos guardados todavía. Pulsa «Sincronizar» para traerlos.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  {dimension === "date" ? null : <th className="px-4 py-3 font-medium">{DIMENSIONS[platform].find((option) => option.value === dimension)?.label}</th>}
                  {Object.keys(snapshots[0].metrics).map((name) => (
                    <th key={name} className="px-4 py-3 text-right font-medium">{METRIC_LABEL[name] ?? name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id} className="border-b border-border/30 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{snapshot.date}</td>
                    {dimension === "date" ? null : <td className="max-w-xs truncate px-4 py-2.5 text-foreground" title={snapshot.dimensionValue}>{snapshot.dimensionValue || "—"}</td>}
                    {Object.keys(snapshots[0].metrics).map((name) => (
                      <td key={name} className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMetric(name, snapshot.metrics[name] ?? 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {data?.truncated ? (
        <p className="text-xs text-muted-foreground">
          La tabla muestra las {snapshots.length} filas más recientes del periodo; hay más. Los totales de arriba sí cubren el periodo completo.
        </p>
      ) : null}
    </div>
  );
}
