import assert from "node:assert/strict";
import { addUsage, emptyUsage, imageUsage, normalizeResponsesUsage, priceUsage, pricingSchema, speechUsage, totalCost, usageSchema } from "./cost.ts";

/* ------------------------------- Consumo ------------------------------- */

const responsesBody = {
  usage: { input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 1000 } },
  output: [{ type: "web_search_call" }, { type: "web_search_call" }, { type: "message", content: [] }],
};

const research = normalizeResponsesUsage(responsesBody);
assert.deepEqual(research, { inputTokens: 1200, cachedInputTokens: 1000, outputTokens: 300, webSearchCalls: 2, images: 0, characters: 0 }, "mapea tokens y cuenta las búsquedas del output");
assert.deepEqual(normalizeResponsesUsage(null), emptyUsage(), "una respuesta sin usage no rompe la contabilidad");
assert.deepEqual(normalizeResponsesUsage({ usage: { input_tokens: 10 } }), { ...emptyUsage(), inputTokens: 10 }, "los campos ausentes valen cero");
assert.equal(normalizeResponsesUsage({ usage: { input_tokens: 5, input_tokens_details: { cached_tokens: 40 } } }).cachedInputTokens, 5, "recorta los cacheados al total en vez de invalidar el registro");

assert.equal(usageSchema.safeParse({ inputTokens: 10, cachedInputTokens: 40 }).success, false, "el esquema rechaza más cacheados que totales");
assert.equal(usageSchema.safeParse({ inputTokens: -1 }).success, false, "rechaza consumos negativos");

const suma = addUsage(research, imageUsage(2), speechUsage(500), null);
assert.deepEqual(suma, { inputTokens: 1200, cachedInputTokens: 1000, outputTokens: 300, webSearchCalls: 2, images: 2, characters: 500 }, "suma consumos de llamadas distintas e ignora los nulos");
assert.deepEqual(research, { inputTokens: 1200, cachedInputTokens: 1000, outputTokens: 300, webSearchCalls: 2, images: 0, characters: 0 }, "sumar no muta los operandos");

/* ------------------------------- Tarifas ------------------------------- */

const pricing = pricingSchema.parse({
  version: "2026-08-17",
  currency: "USD",
  models: {
    "modelo-texto": { inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 10 },
    "modelo-imagen": { perImage: 0.04 },
    "modelo-sin-salida": { inputPerMillion: 2, cachedInputPerMillion: 0.2 },
  },
  tools: { webSearchPerCall: 0.01 },
  speech: { perThousandCharacters: 0.3 },
});

assert.equal(pricing.models["modelo-imagen"].inputPerMillion, null, "los precios no declarados quedan nulos, no en cero");

// (1200 - 1000) input a 2/M + 1000 cacheados a 0,2/M + 300 salida a 10/M + 2 búsquedas a 0,01
const costoInvestigacion = priceUsage(research, { pricing, model: "modelo-texto" });
assert.equal(costoInvestigacion.amount, 0.0236, "cobra los cacheados aparte y suma las búsquedas por llamada");
assert.deepEqual(costoInvestigacion.missing, [], "no falta ninguna tarifa");
assert.equal(costoInvestigacion.pricingVersion, "2026-08-17", "el importe se congela con su versión de tarifa");

const soloBusqueda = priceUsage({ ...emptyUsage(), webSearchCalls: 3 }, { pricing, model: "modelo-texto" });
assert.equal(soloBusqueda.amount, 0.03, "las búsquedas se cobran aunque no haya tokens");

assert.equal(priceUsage(imageUsage(3), { pricing, model: "modelo-imagen" }).amount, 0.12, "las imágenes se cobran por unidad");
assert.equal(priceUsage(speechUsage(1500), { pricing, model: null }).amount, 0.45, "el audio se cobra por millar de caracteres y no depende del modelo");

const sinTarifa = priceUsage(research, { pricing, model: "modelo-desconocido" });
assert.equal(sinTarifa.amount, null, "un modelo sin tarifa no vale cero: vale desconocido");
assert.deepEqual(sinTarifa.missing, ["modelo-desconocido.inputPerMillion", "modelo-desconocido.cachedInputPerMillion", "modelo-desconocido.outputPerMillion"], "informa exactamente qué precios faltan");

const parcial = priceUsage(research, { pricing, model: "modelo-sin-salida" });
assert.equal(parcial.amount, null, "si falta un solo precio el importe no es fiable");
assert.deepEqual(parcial.missing, ["modelo-sin-salida.outputPerMillion"], "señala solo el precio ausente");

assert.equal(priceUsage(emptyUsage(), { pricing, model: "modelo-desconocido" }).amount, 0, "sin consumo no hace falta tarifa: cuesta cero de verdad");

/* -------------------------------- Totales ------------------------------- */

const total = totalCost([costoInvestigacion, sinTarifa, { amount: 1, currency: "EUR", pricingVersion: "x", missing: [] }, null]);
assert.equal(total.amount, 0.0236, "suma solo los importes fiables de la misma moneda");
assert.equal(total.untariffed, 2, "cuenta aparte lo no tarifado y lo de otra moneda para que el total se vea incompleto");

console.log("Costos: consumo normalizado, tarifas, importes congelados y totales validados.");
