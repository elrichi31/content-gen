import { z } from "zod";

/**
 * Contabilidad del gasto en IA. Dos piezas separadas a propósito:
 *
 * 1. **Consumo** (`usage`): lo que realmente se gastó, en las unidades en que lo cobra cada
 *    proveedor. Es un hecho y no cambia nunca.
 * 2. **Tarifa** (`pricing`): cuánto vale cada unidad. Cambia con el tiempo, así que el importe
 *    se calcula al terminar la operación y se congela con la versión de tarifa que se usó.
 *
 * La API no devuelve importes: la Responses API devuelve tokens, y la Admin API de costos está
 * agregada por día y organización, que no permite atribuir gasto a una pieza. De ahí este módulo.
 */

const nonNegativeInt = z.number().int().nonnegative();

/**
 * Consumo normalizado. Cinco unidades porque se cobran cinco cosas distintas; contar solo tokens
 * subestima justo las operaciones con búsqueda web e imágenes.
 */
export const usageSchema = z.object({
  /** Tokens de entrada **totales**, cacheados incluidos: es lo que informa la API. */
  inputTokens: nonNegativeInt.default(0),
  /** Subconjunto de `inputTokens` servido desde caché, que se cobra más barato. */
  cachedInputTokens: nonNegativeInt.default(0),
  outputTokens: nonNegativeInt.default(0),
  /** Búsquedas ejecutadas por la herramienta `web_search`; se cobran por llamada, aparte. */
  webSearchCalls: nonNegativeInt.default(0),
  images: nonNegativeInt.default(0),
  /** Caracteres sintetizados (ElevenLabs). */
  characters: nonNegativeInt.default(0),
}).refine((usage) => usage.cachedInputTokens <= usage.inputTokens, {
  message: "cachedInputTokens no puede superar inputTokens: los cacheados son un subconjunto",
  path: ["cachedInputTokens"],
});
export type Usage = z.infer<typeof usageSchema>;

export const EMPTY_USAGE: Usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, webSearchCalls: 0, images: 0, characters: 0 };

export function emptyUsage(): Usage {
  return { ...EMPTY_USAGE };
}

/** Suma consumos. Una operación puede costar varias llamadas: una corrida del radar son cinco. */
export function addUsage(...parts: (Usage | null | undefined)[]): Usage {
  const total = emptyUsage();
  for (const part of parts) {
    if (!part) continue;
    total.inputTokens += part.inputTokens;
    total.cachedInputTokens += part.cachedInputTokens;
    total.outputTokens += part.outputTokens;
    total.webSearchCalls += part.webSearchCalls;
    total.images += part.images;
    total.characters += part.characters;
  }
  return total;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Consumo a partir de una respuesta cruda de la Responses API.
 *
 * Las llamadas de búsqueda **no** aparecen en `usage`: hay que contarlas en `output`, donde cada
 * búsqueda ejecutada deja su propio elemento. Sin esto, el radar parecería gratis.
 */
export function normalizeResponsesUsage(body: unknown): Usage {
  const response = body as { usage?: { input_tokens?: unknown; output_tokens?: unknown; input_tokens_details?: { cached_tokens?: unknown } }; output?: { type?: unknown }[] } | null;
  const inputTokens = count(response?.usage?.input_tokens);
  return {
    inputTokens,
    // Si la API informase más cacheados que totales, el `refine` del esquema rechazaría el
    // registro entero: se recorta aquí porque perder la contabilidad es peor que redondear.
    cachedInputTokens: Math.min(inputTokens, count(response?.usage?.input_tokens_details?.cached_tokens)),
    outputTokens: count(response?.usage?.output_tokens),
    webSearchCalls: (response?.output ?? []).filter((item) => item?.type === "web_search_call").length,
    images: 0,
    characters: 0,
  };
}

export function imageUsage(images: number): Usage {
  return { ...EMPTY_USAGE, images: count(images) };
}

export function speechUsage(characters: number): Usage {
  return { ...EMPTY_USAGE, characters: count(characters) };
}

/* ------------------------------- Tarifas ------------------------------- */

const price = z.number().nonnegative().nullable().default(null);

/**
 * Precio de un modelo. `null` significa «sin tarifa cargada todavía», que no es lo mismo que
 * gratis: el importe sale nulo y la operación se marca como no tarifada en vez de valer cero.
 */
export const modelTariffSchema = z.object({
  inputPerMillion: price,
  cachedInputPerMillion: price,
  outputPerMillion: price,
  /** Para modelos de imagen; asume el tamaño y calidad que usa la aplicación. */
  perImage: price,
});
export type ModelTariff = z.infer<typeof modelTariffSchema>;

export const pricingSchema = z.object({
  /** Fecha de vigencia de la tarifa. Se congela en cada registro para poder auditarlo después. */
  version: z.string().min(1).max(40),
  currency: z.string().length(3).default("USD"),
  models: z.record(z.string(), modelTariffSchema).default({}),
  tools: z.object({ webSearchPerCall: price }).default({ webSearchPerCall: null }),
  speech: z.object({ perThousandCharacters: price }).default({ perThousandCharacters: null }),
});
export type Pricing = z.infer<typeof pricingSchema>;

export const costSchema = z.object({
  /** Importe en la moneda de la tarifa, o `null` si faltaba algún precio. */
  amount: z.number().nonnegative().nullable().default(null),
  currency: z.string().length(3).default("USD"),
  pricingVersion: z.string().min(1).max(40).nullable().default(null),
  /** Precios que hacían falta y no estaban cargados. Vacío cuando el importe es fiable. */
  missing: z.array(z.string().min(1)).default([]),
});
export type Cost = z.infer<typeof costSchema>;

/** Céntimos de dólar por millón de tokens producen colas binarias largas; seis decimales bastan. */
function round(amount: number) {
  return Math.round(amount * 1e6) / 1e6;
}

/**
 * Importe de un consumo. Devuelve `missing` en vez de fallar: una tarifa incompleta no debe
 * tumbar una generación que ya se pagó, solo marcar que ese registro no es contable todavía.
 */
export function priceUsage(usage: Usage, { pricing, model }: { pricing: Pricing; model: string | null }): Cost {
  const tariff = model ? pricing.models[model] : undefined;
  const missing: string[] = [];
  let amount = 0;

  const apply = (units: number, rate: number | null | undefined, label: string, divisor: number) => {
    if (units <= 0) return;
    if (rate === null || rate === undefined) { missing.push(label); return; }
    amount += (units / divisor) * rate;
  };

  // Los cacheados vienen incluidos en el total, así que la parte a precio normal es la diferencia.
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const modelLabel = model ?? "(sin modelo)";
  apply(uncachedInput, tariff?.inputPerMillion, `${modelLabel}.inputPerMillion`, 1e6);
  apply(usage.cachedInputTokens, tariff?.cachedInputPerMillion, `${modelLabel}.cachedInputPerMillion`, 1e6);
  apply(usage.outputTokens, tariff?.outputPerMillion, `${modelLabel}.outputPerMillion`, 1e6);
  apply(usage.images, tariff?.perImage, `${modelLabel}.perImage`, 1);
  apply(usage.webSearchCalls, pricing.tools.webSearchPerCall, "tools.webSearchPerCall", 1);
  apply(usage.characters, pricing.speech.perThousandCharacters, "speech.perThousandCharacters", 1000);

  return { amount: missing.length ? null : round(amount), currency: pricing.currency, pricingVersion: pricing.version, missing };
}

/**
 * Suma importes ya congelados. Los no tarifados no se cuentan como cero: se informan aparte para
 * que un total incompleto se vea como incompleto.
 */
export function totalCost(costs: (Cost | null | undefined)[], { currency = "USD" }: { currency?: string } = {}) {
  let amount = 0;
  let untariffed = 0;
  for (const cost of costs) {
    if (!cost) continue;
    if (cost.amount === null) { untariffed += 1; continue; }
    if (cost.currency !== currency) { untariffed += 1; continue; }
    amount += cost.amount;
  }
  return { amount: round(amount), currency, untariffed };
}
