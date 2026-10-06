import assert from "node:assert/strict";
import { configuredModels, loadPricing, missingPrices } from "./pricing.ts";
import { pricingSchema } from "@content-gen/domain/cost";

const configured = configuredModels();
assert.equal(configured.geminiImage, "gemini-3.1-flash-image", "la cobertura incluye el proveedor de imágenes de anuncios y carruseles");
assert.equal(configured.imageHigh, "gpt-image-2-high", "la calidad high tiene una tarifa independiente");
assert.equal(configured.explainer, "gpt-5.6-terra", "el guion de animación también necesita tarifa");
const noImages = pricingSchema.parse({ ...loadPricing(), models: { [configured.text]: { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 2 } } });
assert.ok(missingPrices(noImages).includes(`models.${configured.geminiImage}`));
assert.ok(missingPrices(noImages).includes(`models.${configured.imageHigh}`));
process.env.ELEVENLABS_API_KEY = "fixture-not-a-real-key";
assert.ok(missingPrices(noImages).some(key => key.includes("perThousandCharacters")), "no declara cubierta la voz sin una tarifa cargada");
assert.ok(!missingPrices(loadPricing()).some(key => key.includes("perThousandCharacters")), "v2 y v3 ya tienen tarifa publicada cargada");
delete process.env.ELEVENLABS_API_KEY;
console.log("Pricing coverage: Gemini, imagen high, explainer y voz validados.");
