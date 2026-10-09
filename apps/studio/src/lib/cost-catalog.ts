import type { Pricing } from "@content-gen/domain/cost";
import { configuredModels } from "./pricing.ts";
export type CatalogEntry = {
  id: string; name: string; provider: string; unit: string; rate: number | null;
  rates: { label: string; amount: number | null; unit: string }[];
  note: string; metered: boolean; source: string | null; verifiedAt: string | null;
  verification: "verified" | "pending" | "review"; basis: string;
};
/** Mapa de integraciones reales, independiente de la actividad del mes. */
export function costCatalog(pricing: Pricing | null, asOf = new Date().toISOString().slice(0, 10)): CatalogEntry[] {
  const ids = new Set([...Object.keys(pricing?.models ?? {}), ...Object.values(configuredModels()).filter((model): model is string => typeof model === "string"), "eleven_multilingual_v2", "eleven_v3"]);
  const entries: CatalogEntry[] = [...ids].map(id => {
    const tariff = pricing?.models[id];
    const speech = id.startsWith("eleven_");
    const rates = speech ? [{ label: "Voz", amount: pricing?.speech.perThousandCharacters ?? tariff?.perThousandCharacters ?? null, unit: "1K caracteres" }]
      : id.includes("image") ? [{ label: "Salida", amount: tariff?.perImage ?? null, unit: "imagen" }]
      : [{ label: "Entrada", amount: tariff?.inputPerMillion ?? null, unit: "1M tokens" }, { label: "Caché", amount: tariff?.cachedInputPerMillion ?? null, unit: "1M tokens" }, { label: "Salida", amount: tariff?.outputPerMillion ?? null, unit: "1M tokens" }];
    const overridden = speech && pricing?.speech.perThousandCharacters != null;
    return {
      id, name: id, provider: speech ? "elevenlabs" : id.startsWith("gemini-") ? "gemini" : id.startsWith("jev-") ? "typesafe" : "openai", unit: rates[0].unit, rate: rates[0].amount, rates,
      note: overridden ? "Override de cuenta en speech.perThousandCharacters; no equivale a tarifa pública verificada." : tariff?.note ?? "Falta cargar tarifa para este modelo configurado.",
      source: overridden ? null : tariff?.source ?? null, verifiedAt: overridden ? null : tariff?.verifiedAt ?? null,
      metered: true, basis: tariff?.basis ?? "usage",
      verification: overridden || !tariff?.source || !tariff.verifiedAt ? "pending" : tariff.reviewAfter && asOf >= tariff.reviewAfter ? "review" : "verified",
    };
  });
  const search = pricing?.tools;
  entries.push({ id: "web-search", name: "OpenAI · búsqueda web", provider: "openai", unit: "llamada", rate: search?.webSearchPerCall ?? null, rates: [{ label: "Búsqueda", amount: search?.webSearchPerCall ?? null, unit: "llamada" }], note: search?.note ?? "Tarifa aparte de los tokens.", metered: true, source: search?.source ?? null, verifiedAt: search?.verifiedAt ?? null, verification: search?.source && search.verifiedAt ? "verified" : "pending", basis: "usage" });
  const services = pricing?.services.length ? pricing.services : [
    { id: "unsplash", name: "Unsplash · fotos", provider: "unsplash", metered: true },
    { id: "search-console", name: "Google Search Console", provider: "google", metered: false },
    { id: "google-analytics", name: "Google Analytics Data API", provider: "google", metered: false },
    { id: "tiktok", name: "TikTok · perfil y métricas", provider: "tiktok", metered: false },
    { id: "render", name: "Render · Canvas", provider: "local", metered: false },
    { id: "database", name: "Postgres y almacenamiento de assets", provider: "local", metered: false },
  ].map(entry => ({ ...entry, unit: "servicio", rate: null, source: null, verifiedAt: null, reviewAfter: null, basis: "usage", note: "Sin tarifa cargada; no se considera gratuito." }));
  return [...entries, ...services.map(entry => ({ ...entry, rates: [{ label: "Servicio", amount: entry.rate, unit: entry.unit }], verification: entry.source && entry.verifiedAt ? "verified" as const : "pending" as const }))];
}
