import assert from "node:assert/strict";
import { assertAssetReference } from "./content-assets.ts";

assert.doesNotThrow(() => assertAssetReference({ mimeType: "image/png", campaignId: null }, "image", "campaign-1"));
assert.doesNotThrow(() => assertAssetReference({ mimeType: "audio/mpeg", campaignId: "campaign-1" }, "audio", "campaign-1"));
assert.throws(() => assertAssetReference(undefined, "image", "campaign-1"), /no existe/);
assert.throws(() => assertAssetReference({ mimeType: "audio/mpeg", campaignId: null }, "image", "campaign-1"), /no es una imagen/);
assert.throws(() => assertAssetReference({ mimeType: "image/png", campaignId: "campaign-2" }, "image", "campaign-1"), /otra campaña/);
console.log("Referencias de assets: existencia, tipo y campaña validados.");
