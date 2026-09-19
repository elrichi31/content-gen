import { existsSync } from "node:fs";
import { resolve } from "node:path";

const provider = process.env.CONTENT_GEN_AI_PROVIDER ?? "none";
const allowedProviders = new Set(["none", "openai"]);
const renderLimit = process.env.MAX_ACTIVE_RENDER_JOBS;

if (!allowedProviders.has(provider)) {
  throw new Error(
    `CONTENT_GEN_AI_PROVIDER debe ser uno de: ${[...allowedProviders].join(", ")}. Recibido: ${provider}.`,
  );
}

if (provider === "openai" && !process.env.OPENAI_API_KEY) {
  throw new Error(
    "Falta OPENAI_API_KEY: configúrala antes de usar CONTENT_GEN_AI_PROVIDER=openai.",
  );
}

if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error(
    "DATABASE_URL debe ser una URL de Postgres (postgres://usuario:clave@host:puerto/base). En local: `docker compose -f docker-compose.dev.yml up -d`.",
  );
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "Falta BETTER_AUTH_SECRET: sin él el login no puede firmar sesiones de forma segura. Generalo con node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\".",
  );
}

if (renderLimit && (!/^\d+$/.test(renderLimit) || Number(renderLimit) < 1 || Number(renderLimit) > 10)) {
  throw new Error("MAX_ACTIVE_RENDER_JOBS debe ser un entero entre 1 y 10.");
}

const googleCredential = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim();
const searchConsoleSite = process.env.SEARCH_CONSOLE_SITE_URL?.trim();
const ga4Property = process.env.GA4_PROPERTY_ID?.trim();
const syncDays = process.env.ANALYTICS_SYNC_DAYS;

if ((searchConsoleSite || ga4Property) && !googleCredential) {
  throw new Error(
    "Falta la credencial de Google: configura GOOGLE_SERVICE_ACCOUNT_KEY_FILE o GOOGLE_SERVICE_ACCOUNT_JSON para leer métricas.",
  );
}

if (syncDays && (!/^\d+$/.test(syncDays) || Number(syncDays) < 1 || Number(syncDays) > 460)) {
  throw new Error("ANALYTICS_SYNC_DAYS debe ser un entero entre 1 y 460.");
}

// El blog vive en otro repositorio: si la ruta está mal, el fallo aparecería al exportar,
// cuando el artículo ya está escrito. Mejor detectarlo aquí.
const blogSitePath = process.env.BLOG_SITE_PATH?.trim();
if (blogSitePath && !existsSync(resolve(blogSitePath, "content", "blog"))) {
  throw new Error(`BLOG_SITE_PATH debe apuntar a la raíz del repositorio del sitio: no se encontró content/blog en ${resolve(blogSitePath)}.`);
}

// La tarifa no bloquea nada: sin ella se genera igual, solo que sin importe. Por eso avisa en vez
// de fallar. Que esté mal escrita sí es un error, y `loadPricing` lo lanza.
const { loadPricing, missingPrices } = await import("../apps/studio/src/lib/pricing.ts");
const pricing = loadPricing();
const pendingPrices = missingPrices(pricing);
if (pendingPrices.length) {
  console.warn(`Aviso: faltan tarifas en config/pricing.json (${pendingPrices.join(", ")}). Esas operaciones quedarán registradas sin importe.`);
}

console.log(
  JSON.stringify(
    {
      status: "ready",
      provider,
      pricing: { version: pricing.version, currency: pricing.currency, status: pendingPrices.length ? "incomplete" : "configured", missing: pendingPrices },
      integrations: {
        openai: provider === "openai" ? "enabled" : "disabled",
        unsplash: process.env.UNSPLASH_ACCESS_KEY ? "configured" : "not-configured",
        elevenlabs: process.env.ELEVENLABS_API_KEY ? "configured" : "not-configured",
        searchConsole: searchConsoleSite && googleCredential ? "configured" : "not-configured",
        googleAnalytics: ga4Property && googleCredential ? "configured" : "not-configured",
        blog: blogSitePath ? "configured" : "not-configured",
      },
    },
    null,
    2,
  ),
);
