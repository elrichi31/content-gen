import assert from "node:assert/strict";
import sharp from "sharp";
import { exportCarousel } from "./carousel-export.ts";

const document = { schemaVersion: 1, topic: "Exportación", platform: "instagram", caption: { text: "", hashtags: [] }, slides: [{ id: "one", layout: "cover", title: "Primera", backgroundColor: "x", textColor: "x" }, { id: "two", layout: "cta", ctaText: "Final", backgroundColor: "x", textColor: "x" }] };
const png = await exportCarousel(document, "png"); const zip = await exportCarousel(document, "zip");
assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "el export individual es PNG");
assert.deepEqual(await sharp(png).metadata().then((metadata) => [metadata.width, metadata.height]), [1080, 1350], "el PNG conserva dimensiones de Instagram");
assert.equal(zip.readUInt32LE(0), 0x04034b50, "el export múltiple es ZIP");
assert.match(zip.toString("utf8"), /slide-01\.png/, "el ZIP conserva nombres de slide");
assert.match(zip.toString("utf8"), /caption\.txt/, "el ZIP incluye el caption");
const layouts = ["cover", "content", "list", "bigNumber", "quote", "split", "imageOverlay", "timeline", "statGrid", "cta"] as const;
const regressionZip = await exportCarousel({ ...document, slides: layouts.map((layout, index) => ({ id: `legacy-${layout}`, layout, title: `Layout ${index + 1}`, ctaText: "Final", backgroundColor: "x", textColor: "x" })) }, "zip");
assert.match(regressionZip.toString("utf8"), /slide-10\.png/, "los diez layouts exportan un PNG cada uno");
console.log("Exportación de carrusel: PNG y ZIP verificados.");
