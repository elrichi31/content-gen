import assert from "node:assert/strict";
import { addBeforeCta, replaceSlide } from "./carousel-slides.ts";
import { carouselDocumentSchema } from "@content-gen/domain/carousel";

const document = carouselDocumentSchema.parse({ schemaVersion: 1, topic: "Prueba", platform: "instagram", caption: { text: "", hashtags: [] }, slides: [{ id: "cover", layout: "cover", title: "Inicio", backgroundColor: "x", textColor: "x" }, { id: "cta", layout: "cta", ctaText: "Final", backgroundColor: "x", textColor: "x" }] });
const replaced = replaceSlide(document, 0, { layout: "cover", title: "Nuevo" });
assert.equal(replaced.slides[0].id, "cover", "regenerar conserva el ID de la slide"); assert.equal(replaced.slides[1].ctaText, "Final", "regenerar no cambia otras slides");
assert.equal(replaceSlide(document, 0, { layout: "cover", title: "Nuevo", content: ["Uno", "Dos"] }).slides[0].content, "Uno Dos", "normaliza texto devuelto como lista");
assert.equal(replaceSlide(document, 0, { layout: "cover", title: "Nuevo", content: { intro: "Uno", cierre: "Dos" } }).slides[0].content, "Uno Dos", "normaliza texto devuelto como objeto");
assert.equal(replaceSlide(document, 0, { layout: "title_and_content", title: "Nuevo" }).slides[0].layout, "cover", "regenerar conserva el layout original ante una respuesta inválida de IA");
const added = addBeforeCta(document, { layout: "content", title: "Intermedia", content: "Texto" });
assert.deepEqual(added.slides.map((slide) => slide.layout), ["cover", "content", "cta"], "agregar inserta antes del CTA");
console.log("Slides de carrusel: reemplazo aislado e inserción antes del CTA verificados.");
