import assert from "node:assert/strict";
import { campaignCaptions, campaignExportName } from "./campaign-export.ts";

assert.equal(campaignExportName("video", "12345678-abcd", "mp4"), "video-12345678.mp4");
const captions = campaignCaptions([{ id: "abcdefgh-1", type: "carousel", document: { caption: { text: "Texto", hashtags: ["#uno"] } } }, { id: "ijklmnop-2", type: "ad", document: { headline: "Oferta", body: "Hoy" } }]);
assert.match(captions, /\[carousel-abcdefgh\]\nTexto\n#uno/);
assert.match(captions, /\[ad-ijklmnop\]\nOferta\nHoy/);
console.log("Paquete de campaña: nombres y captions deterministas validados.");
