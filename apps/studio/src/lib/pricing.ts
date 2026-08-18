import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pricingSchema, type ModelTariff, type Pricing } from "@content-gen/domain/cost";
import { openAiModel } from "./openai.ts";

export class PricingError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) { super(message); this.status = status; }
}

/** La tarifa vive fuera del código para poder actualizarla sin desplegar (D-04 de PLAN_RADAR.md). */
const DEFAULT_FILE = fileURLToPath(new URL("../../../../config/pricing.json", import.meta.url));

function pricingFile() {
  return process.env.PRICING_FILE?.trim() || DEFAULT_FILE;
}

let cached: { file: string; pricing: Pricing } | null = null;

/**
 * Carga y valida la tabla de precios. Se cachea por proceso: la leen todas las generaciones y
 * cambiarla a mitad de una ejecución daría dos importes distintos para la misma tarifa.
 */
export function loadPricing({ file = pricingFile(), reload = false }: { file?: string; reload?: boolean } = {}): Pricing {
  if (!reload && cached?.file === file) return cached.pricing;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new PricingError(`No se pudo leer la tabla de precios en ${file}: ${error instanceof Error ? error.message : "error desconocido"}.`); }
  const parsed = pricingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PricingError(`Tabla de precios inválida — ${issue?.path.join(".") || "raíz"}: ${issue?.message}`);
  }
  cached = { file, pricing: parsed.data };
  return parsed.data;
}

/**
 * Modelos de texto con tarifa cargada, ordenados de barato a caro. Es la lista que se ofrece para
 * elegir: dejar escoger un modelo cuyo precio no conocemos produciría corridas sin importe, que es
 * justo lo que la contabilidad existe para evitar.
 */
export function selectableTextModels(pricing = loadPricing()) {
  return Object.entries(pricing.models)
    .filter(([, tariff]) => tariff.inputPerMillion !== null && tariff.outputPerMillion !== null)
    .map(([id, tariff]) => ({ id, inputPerMillion: tariff.inputPerMillion!, outputPerMillion: tariff.outputPerMillion! }))
    .sort((a, b) => a.inputPerMillion - b.inputPerMillion);
}

/** Modelos que la configuración actual va a usar de verdad; son los que necesitan tarifa. */
export function configuredModels() {
  return {
    text: openAiModel("text"),
    script: openAiModel("script"),
    voiceoverScript: openAiModel("voiceoverScript"),
    research: openAiModel("research"),
    structuring: openAiModel("structuring"),
    image: openAiModel("image"),
  };
}

/** Precios que un modelo de texto necesita frente a los que necesita uno de imagen. */
const REQUIRED: Record<"text" | "image", (keyof ModelTariff)[]> = {
  text: ["inputPerMillion", "cachedInputPerMillion", "outputPerMillion"],
  image: ["perImage"],
};

/**
 * Qué falta por cargar. Se comprueban solo los modelos configurados: tener sin precio un modelo
 * que nadie usa no es un problema, y avisar de ello acostumbraría a ignorar el aviso.
 */
export function missingPrices(pricing: Pricing, models = configuredModels()) {
  const missing: string[] = [];
  if (pricing.version === "sin-cargar") missing.push("version");
  for (const [purpose, model] of Object.entries(models)) {
    const kind = purpose === "image" ? "image" : "text";
    const tariff = pricing.models[model];
    if (!tariff) { missing.push(`models.${model}`); continue; }
    for (const key of REQUIRED[kind]) if (tariff[key] === null) missing.push(`models.${model}.${key}`);
  }
  if (pricing.tools.webSearchPerCall === null) missing.push("tools.webSearchPerCall");
  if (process.env.ELEVENLABS_API_KEY?.trim() && pricing.speech.perThousandCharacters === null) missing.push("speech.perThousandCharacters");
  return [...new Set(missing)];
}
