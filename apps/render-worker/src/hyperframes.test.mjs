import assert from "node:assert/strict";
import { buildHyperframesHtml } from "./hyperframes.mjs";

const document = {
  title: "Doc", fps: 30, width: 1080, height: 1920,
  scenes: [
    { id: "intro", kind: "intro", durationFrames: 48, accent: ["#ff0000", "#00ff00"], imageAssetId: "img-1", audioAssetId: "aud-1", content: { tag: "Hola <b>", title: "UNO\nDOS" } },
    { id: "close", kind: "close", durationFrames: 78, content: { subtitle: "fin" } },
  ],
};
const { html, duration } = buildHyperframesHtml(document, (id) => `media/${id}.bin`);

// (48 + 12) / 30 = 2s y (78 + 12) / 30 = 3s, una detrás de otra.
assert.equal(duration, 5);
assert.match(html, /id="scene-0"[^>]*data-start="0" data-duration="2"/);
assert.match(html, /id="scene-1"[^>]*data-start="2" data-duration="3"/);
assert.match(html, /<audio id="voice-0" src="media\/aud-1.bin" data-start="0" data-duration="2"/);
assert.match(html, /<img class="bg" src="media\/img-1.bin"/);
assert.ok(html.includes("Hola &lt;b&gt;") && !html.includes("<b>"), "escapa el texto del guion");
assert.ok(html.includes("UNO<br>DOS"));
// El intro sin título propio usaría el del documento; el close sin título no pinta <h1>.
assert.ok(!/id="scene-1"[\s\S]*<h1/.test(html));
// Los retrasos son locales a cada clip: ambas escenas revelan su primer bloque a los 0.15s.
assert.equal(html.match(/animation-delay:0\.15s/g).length, 2);

// Escena educativa: su animación se incrusta tal cual, sin imagen ni bloques de texto.
const explainer = buildHyperframesHtml({ ...document, scenes: [{ id: "scene-1", kind: "explainer", durationFrames: 18, content: { title: "T", animationHtml: '<div class="xa-scene-1">anim</div>' } }] }, () => "");
assert.equal(explainer.duration, 1);
assert.ok(explainer.html.includes('<div class="xa-scene-1">anim</div>') && !explainer.html.includes('class="content"'));
// Las animaciones SVG se llevan al tiempo local de su escena desde el seek de Anime.js.
assert.ok(explainer.html.includes("window.__hfAnime") && explainer.html.includes('closest("[data-start]")'));
console.log("hyperframes ok");
