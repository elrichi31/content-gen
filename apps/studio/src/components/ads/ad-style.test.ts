import assert from "node:assert/strict";
import { contrast, readableOn } from "../../lib/color.ts";
import { alpha, fitSize, geometry, onColor } from "./ad-style.ts";

assert.equal(onColor("#62de91"), "#0b0b0b", "sobre un acento verde claro el texto va oscuro");
assert.equal(onColor("#2563eb"), "#ffffff", "sobre un azul intenso el texto va claro");
assert.equal(onColor("#fff"), "#0b0b0b", "acepta hex corto");
assert.equal(onColor("rgb(0,0,0)"), "#ffffff", "un color que no se entiende no rompe");
assert.equal(onColor("oklch(0.78 0.18 90)"), "#0b0b0b", "un amarillo oklch del tema del carrusel lleva texto oscuro");
assert.equal(onColor("oklch(0.35 0.1 250)"), "#ffffff", "un azul oscuro oklch lleva texto claro");
assert.match(alpha("oklch(0.55 0.12 145)", 0.5), /^rgba\(\d+,\d+,\d+,0\.5\)$/, "oklch se convierte a rgba");

assert.equal(alpha("#ff0000", 0.5), "rgba(255,0,0,0.5)");
assert.equal(alpha("tomato", 0.5), "tomato", "sin hex devuelve el color sin transparencia");

const box = { max: 100, min: 20 };
const short = fitSize("Oferta", 300, 200, box);
const long = fitSize("Crea contenido que se queda en la cabeza de tu audiencia todos los días", 300, 200, box);
assert.ok(short > long, "un titular corto se dibuja más grande que uno largo");
assert.ok(long >= box.min && short <= box.max, "respeta los límites");
assert.equal(fitSize("Anticonstitucionalmente", 100, 400, { max: 100, min: 10 }), 10, "una palabra que no cabe baja hasta el mínimo en vez de desbordarse");

const story = geometry(340, 604);
assert.ok(story.tall && !story.wide && story.top > story.pad, "la story reserva zona segura arriba");
const wide = geometry(340, 191);
assert.ok(wide.wide && !wide.tall, "landscape se detecta");
assert.equal(geometry(340, 340).u, 3.4, "la unidad es el 1% del lado corto");

const green = "oklch(0.55 0.12 145)";
assert.ok(contrast(green, "#0f0f0e") < 4.5, "el verde del tema no llega a 4.5:1 sobre tinta");
assert.ok(contrast(readableOn(green, "#0f0f0e"), "#0f0f0e") >= 4.5, "el texto corregido sí llega");
assert.equal(readableOn("#ffffff", "#0f0f0e"), "#ffffff", "un color que ya se lee no se toca");
assert.ok(contrast("#000000", "#ffffff") > 20 && contrast("#777", "#777") === 1, "contraste WCAG básico");

console.log("Estilo de anuncios: contraste, transparencia y ajuste de texto verificados.");
