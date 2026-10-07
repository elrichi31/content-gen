import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildHyperframesHtml, sceneFitScale, withMeasuredAudio } from "./hyperframes.mjs";

const document = {
  title: "Doc", fps: 30, width: 1080, height: 1920,
  scenes: [
    { id: "intro", kind: "intro", durationFrames: 48, accent: ["#ff0000", "#00ff00"], imageAssetId: "img-1", audioAssetId: "aud-1", content: { tag: "Hola <b>", title: "UNO\nDOS" } },
    { id: "close", kind: "close", durationFrames: 78, content: { subtitle: "fin" } },
  ],
};
const { html, duration } = buildHyperframesHtml(document, (id) => `media/${id}.bin`);

// (48 + 12 + 9 de entrada) / 30 = 2.3s y (78 + 12 + 24 de cierre) / 30 = 3.8s, una detrás de otra.
assert.equal(duration, 6.1);
assert.match(html, /id="scene-0"[^>]*data-start="0" data-duration="2.3"/);
assert.match(html, /id="scene-1"[^>]*data-start="2.3" data-duration="3.8"/);
// La primera voz entra a los 0.3s para que el arranque no se pierda.
assert.match(html, /<audio id="voice-0" src="media\/aud-1.bin" data-start="0.3" data-duration="2"/);
assert.match(html, /<img class="bg" src="media\/img-1.bin"/);
assert.ok(html.includes("Hola &lt;b&gt;") && !html.includes("<b>"), "escapa el texto del guion");
assert.ok(html.includes("UNO<br>DOS"));
// El intro sin título propio usaría el del documento; el close sin título no pinta <h1>.
assert.ok(!/id="scene-1"[\s\S]*<h1/.test(html));
// Los retrasos son locales a cada clip: ambas escenas revelan su primer bloque a los 0.15s.
assert.equal(html.match(/animation-delay:0\.15s/g).length, 2);

// Escena educativa: su animación se incrusta tal cual, sin imagen ni bloques de texto.
const explainer = buildHyperframesHtml({ ...document, scenes: [{ id: "scene-1", kind: "explainer", durationFrames: 18, content: { title: "T", animationHtml: '<div class="xa-scene-1">anim</div>' } }] }, () => "");
assert.equal(explainer.duration, 2.1);
assert.ok(explainer.html.includes('<div class="xa-scene-1">anim</div>') && !explainer.html.includes('class="content"'));
// Las animaciones SVG se llevan al tiempo local de su escena desde el seek de Anime.js.
assert.ok(explainer.html.includes("window.__hfAnime") && explainer.html.includes('closest("[data-start]")'));
// Un guion largo baja de cuerpo para caber en pantalla; uno corto se queda igual.
const short = buildHyperframesHtml({ ...document, scenes: [{ id: "intro", kind: "intro", durationFrames: 30, content: { tag: "HOY", title: "UNO\nDOS", subtitle: "corto" } }] }, () => "");
assert.ok(!short.html.includes("--fit:"), "el texto que cabe conserva su tamaño");
const long = buildHyperframesHtml({ ...document, scenes: [{ id: "reality", kind: "reality", durationFrames: 30, content: { tag: "REALIDAD", title: "Una frase muy larga que reencuadra todo lo anterior y no termina nunca ".repeat(3), actions: Array.from({ length: 6 }, () => "Accion concreta y bastante larga que ocupa varias lineas en la pantalla vertical") } }] }, () => "");
const fit = Number(long.html.match(/--fit:([\d.]+)/)?.[1]);
assert.ok(fit > 0 && fit < 1, `un guion largo se escala para caber (${fit})`);
assert.ok(sceneFitScale([{ block: 0, kind: "title", value: "X ".repeat(400) }]) >= 0.45, "la escala tiene un mínimo legible");

// La duración de cada escena con voz sale del MP3 real, no de la guardada.
const mp3 = Buffer.concat(Array.from({ length: 100 }, () => { const bytes = new Uint8Array(417); bytes.set([0xff, 0xfb, 0x90, 0x00]); return bytes; }));
const dir = mkdtempSync(join(tmpdir(), "hf-test-"));
writeFileSync(join(dir, "a.mp3"), mp3);
const measured = await withMeasuredAudio({ ...document, scenes: [{ ...document.scenes[0], durationFrames: 10 }, document.scenes[1]] }, () => join(dir, "a.mp3"));
assert.equal(measured.scenes[0].durationFrames, Math.ceil(100 * 1152 / 44100 * 30) + 4, "una escena guardada más corta que su voz se alarga");
assert.equal(measured.scenes[1].durationFrames, 78, "las escenas sin voz no cambian");
rmSync(dir, { recursive: true, force: true });
console.log("hyperframes ok");
