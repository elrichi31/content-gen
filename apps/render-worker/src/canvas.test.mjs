import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
/* global addEventListener, setTimeout */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCanvasHtml } from "../../../packages/canvas-engine/src/index.js";
import { canvasSettings, frameRanges, muxArguments, prepareCanvasRender, renderCanvasStills, segmentArguments } from "./canvas.mjs";

// Tramos contiguos, sin huecos ni solapes, y nunca más tramos que frames.
assert.deepEqual(frameRanges(10, 3), [[0, 4], [4, 8], [8, 10]]);
assert.deepEqual(frameRanges(2, 4), [[0, 1], [1, 2]]);
assert.deepEqual(frameRanges(7, 1), [[0, 7]]);

// Ajustes por variables de entorno, con límites.
process.env.CANVAS_FPS = "500"; process.env.CANVAS_SUBFRAMES = "abc"; process.env.CANVAS_WORKERS = "2";
assert.deepEqual(canvasSettings(), { fps: 60, subframes: 6, workers: 2 });
delete process.env.CANVAS_FPS; delete process.env.CANVAS_SUBFRAMES; delete process.env.CANVAS_WORKERS;

// Mezcla: cada voz entra en su `voiceAt` (adelay en ms) y el video se copia sin recodificar.
const mux = muxArguments({ concatList: "list.txt", voices: [{ path: "a.mp3", at: 0.3 }, { path: "b.mp3", at: 6.2 }], duration: 12.5, output: "out.mp4" });
const filter = mux[mux.indexOf("-filter_complex") + 1];
assert.match(filter, /\[1:a\]aresample=48000,adelay=300:all=1\[v0\]/);
assert.match(filter, /\[2:a\]aresample=48000,adelay=6200:all=1\[v1\]/);
assert.match(filter, /amix=inputs=2:normalize=0/, "las voces no se atenúan al mezclarse");
assert.deepEqual(mux.slice(mux.indexOf("-c:v"), mux.indexOf("-c:v") + 2), ["-c:v", "copy"]);
assert.equal(mux[mux.indexOf("-t") + 1], "12.5");
const silent = muxArguments({ concatList: "list.txt", voices: [], duration: 3, output: "out.mp4" });
assert.ok(silent.includes("anullsrc=channel_layout=stereo:sample_rate=48000") && !silent.includes("-filter_complex"), "sin voces lleva pista muda");
// Cada tramo ya sale con la calidad final y en BT.709 de verdad (no solo etiquetado).
const segment = segmentArguments(60, "seg0.mp4").join(" ");
assert.match(segment, /-framerate 60 .*out_color_matrix=bt709.*-crf 17 .*keyint=120/);

// La página: fuentes embebidas, spec escapado y modo preview.
const spec = {
  width: 1080, height: 1920, duration: 2, palette: ["#22d3ee", "#9be9f6"], title: "Doc </script><b>",
  scenes: [{ id: "s1", start: 0, duration: 2, voiceAt: 0.3, voiceEnd: 1.5, title: "Hola </script>", plan: { template: "title", at: 0.3 }, captions: [] }],
};
const html = buildCanvasHtml(spec);
assert.equal((html.match(/@font-face/g) ?? []).length, 3, "Inter Display 500, 700 y 900");
assert.ok(html.includes("font/woff2;base64,d09G"), "woff2 en base64");
assert.equal((html.match(/<\/script>/g) ?? []).length, 1, "el texto del guion no cierra el script");
assert.ok(html.includes("<title>Doc &lt;/script&gt;&lt;b&gt;</title>"));
assert.match(html, /"subframes":6/);
const live = buildCanvasHtml(spec, { live: true, scale: 0.5 });
assert.match(live, /"subframes":1/, "la preview no promedia subframes");
assert.ok(live.includes("canvas-engine:time") && live.includes("canvas-engine:ready"));

// Documento → spec y voces: se mide el MP3 real y cada voz va en el `voiceAt` de su escena.
const mp3 = Buffer.concat(Array.from({ length: 100 }, () => { const bytes = new Uint8Array(417); bytes.set([0xff, 0xfb, 0x90, 0x00]); return bytes; }));
const dir = mkdtempSync(join(tmpdir(), "canvas-test-"));
writeFileSync(join(dir, "a.mp3"), mp3);
const document = {
  schemaVersion: 1, slug: "doc", templateId: "explainer", title: "Doc", fps: 30, width: 1080, height: 1920,
  scenes: [
    { id: "scene-1", kind: "explainer", durationFrames: 10, audioAssetId: "a", content: { title: "Uno", voiceover: "Un millón de peticiones por segundo.", canvas: { template: "hook", words: [{ text: "1 millón", cue: "millón" }] } } },
    { id: "scene-2", kind: "explainer", durationFrames: 30, content: { title: "Dos", voiceover: "Fin." } },
  ],
};
const prepared = await prepareCanvasRender(document, (id) => join(dir, `${id}.mp3`));
assert.equal(prepared.voices.length, 1);
assert.deepEqual(prepared.voices[0], { path: join(dir, "a.mp3"), at: 0.3 });
assert.ok(prepared.spec.scenes[0].duration > 2.6, "la escena se alarga hasta lo que mide su voz");
assert.equal(prepared.spec.scenes[1].start, prepared.spec.scenes[0].duration);
assert.equal(prepared.spec.scenes[0].plan.template, "hook");

// Con un Chrome a mano (CANVAS_CHROME_PATH) se pinta de verdad: frames del tamaño pedido y no vacíos.
if (process.env.CANVAS_CHROME_PATH) {
  const [still] = await renderCanvasStills(prepared.spec, [60], join(dir, "stills"), { subframes: 2 });
  const png = readFileSync(still);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1920]);
  assert.ok(png.length > 50_000, "el frame tiene contenido");

  // Preview del Studio: la página en modo vivo dentro de un iframe aislado (sandbox="allow-scripts")
  // avisa cuando está lista y pinta el instante que le manda el padre.
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: process.env.CANVAS_CHROME_PATH, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setContent(`<iframe id="f" sandbox="allow-scripts" style="width:270px;height:480px"></iframe>`);
    const result = await page.evaluate((srcdoc) => new Promise((done) => {
      const frame = document.getElementById("f");
      addEventListener("message", (event) => {
        if (event.source !== frame.contentWindow || event.data?.type !== "canvas-engine:ready") return;
        frame.contentWindow.postMessage({ type: "canvas-engine:time", t: 1 }, "*");
        setTimeout(() => done(event.data), 300);
      });
      frame.srcdoc = srcdoc;
    }), buildCanvasHtml(prepared.spec, { live: true, scale: 0.25 }));
    assert.equal(result.duration, prepared.spec.duration, "el iframe avisa que está listo con la duración");
    const shot = await (await page.$("#f")).screenshot({ encoding: "base64" });
    assert.ok(Buffer.from(shot, "base64").length > 10_000, "la preview pinta el frame pedido");
  } finally {
    await browser.close();
  }
}
rmSync(dir, { recursive: true, force: true });
console.log("canvas ok");
