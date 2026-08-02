import assert from "node:assert/strict";
import { campaignPieceStatus } from "./campaign-progress.ts";

assert.equal(campaignPieceStatus({ revision: 0, hasExport: false }), "draft");
assert.equal(campaignPieceStatus({ revision: 1, hasExport: false }), "ready");
assert.equal(campaignPieceStatus({ revision: 1, hasExport: true }), "exported");
assert.equal(campaignPieceStatus({ revision: 1, hasExport: true, renderStatus: "processing" }), "rendering");
console.log("Progreso de campaña: borrador, listo, renderizando y exportado validados.");
