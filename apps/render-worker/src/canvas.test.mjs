import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
/* global addEventListener, setTimeout */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCanvasHtml } from "../../../packages/canvas-engine/src/index.js";
import { spawnSync } from "node:child_process";
import { WORLD } from "../../../packages/canvas-engine/src/world.js";
import { canvasSettings, frameRanges, imageDataUrl, muxArguments, prepareCanvasRender, renderCanvasStills, segmentArguments, withMeasuredAudio } from "./canvas.mjs";

// Rejilla del mapa: tierra donde la hay y mar en medio del Atlántico.
const land = (lat, lon) => { const i = Math.floor((WORLD.lat0 - lat) / WORLD.step) * WORLD.cols + Math.floor((lon + 180) / WORLD.step); return Boolean((parseInt(WORLD.bits[i >> 2], 16) >> (3 - (i & 3))) & 1); };
assert.equal(WORLD.bits.length, (WORLD.cols * WORLD.rows) / 4);
assert.ok(land(40.4, -3.7) && land(-15, -50) && land(45, 100), "Madrid, Brasil y Asia son tierra");
assert.ok(!land(30, -40) && !land(0, -150), "Atlántico y Pacífico son mar");

// Tramos contiguos, sin huecos ni solapes, y nunca más tramos que frames.
assert.deepEqual(frameRanges(10, 3), [[0, 4], [4, 8], [8, 10]]);
assert.deepEqual(frameRanges(2, 4), [[0, 1], [1, 2]]);
assert.deepEqual(frameRanges(7, 1), [[0, 7]]);

// Ajustes por variables de entorno, con límites.
process.env.CANVAS_FPS = "500"; process.env.CANVAS_SUBFRAMES = "abc"; process.env.CANVAS_WORKERS = "2";
assert.deepEqual(canvasSettings(), { fps: 60, subframes: 4, workers: 2 });
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
assert.match(segment, /-framerate 60 .*out_color_matrix=bt709.*-preset veryfast -crf 16 .*keyint=120/);

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
assert.ok(live.includes("canvas-engine:image"), "la preview recibe las fotos por postMessage");
const withImages = buildCanvasHtml(spec, { images: { "img-1": "data:image/jpeg;base64,AAAA" } });
assert.ok(withImages.includes('var IMAGES = {"img-1":"data:image/jpeg;base64,AAAA"}') && withImages.includes("image.decode()"), "las fotos van embebidas y se decodifican antes de empezar");
assert.ok(buildCanvasHtml(spec, { live: true, images: { "img-1": "data:x" } }).includes("var IMAGES = {}"), "la preview no embebe fotos");

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
// Foto de escena: ffmpeg la reduce a un JPEG que cubre 1080x1920 con el zoom (sin quedarse corto).
spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x336699:s=3000x2000", "-frames:v", "1", join(dir, "img.png")]);
const photo = Buffer.from((await imageDataUrl(join(dir, "img.png"))).split(",")[1], "base64");
assert.deepEqual([...photo.subarray(0, 2)], [0xff, 0xd8], "sale como JPEG");
const sof = photo.indexOf(Buffer.from([0xff, 0xc0]));
assert.deepEqual([photo.readUInt16BE(sof + 7), photo.readUInt16BE(sof + 5)], [3435, 2290], "foto horizontal: alto justo para cubrir la pantalla vertical");
await assert.rejects(imageDataUrl(join(dir, "no-existe.png")), /No se pudo leer la imagen/);

document.scenes[1].imageAssetId = "img";
const prepared = await prepareCanvasRender(document, (id) => join(dir, id === "img" ? "img.png" : `${id}.mp3`));
assert.deepEqual(Object.keys(prepared.images), ["img"], "cada foto se prepara una vez");
assert.equal(prepared.spec.scenes[1].image, "img");
assert.equal(prepared.voices.length, 1);
assert.deepEqual(prepared.voices[0], { path: join(dir, "a.mp3"), at: 0.3 });
assert.ok(prepared.spec.scenes[0].duration > 2.6, "la escena se alarga hasta lo que mide su voz");
assert.equal(prepared.spec.scenes[1].start, prepared.spec.scenes[0].duration);
assert.equal(prepared.spec.scenes[0].plan.template, "hook");

// Con un Chrome a mano (CANVAS_CHROME_PATH) se pinta de verdad: frames del tamaño pedido y no vacíos.
if (process.env.CANVAS_CHROME_PATH) {
  const [still, withPhoto] = await renderCanvasStills(prepared.spec, [60, Math.round((prepared.spec.scenes[1].start + 1) * 60)], join(dir, "stills"), { subframes: 2, images: prepared.images });
  const png = readFileSync(still);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1920]);
  assert.ok(png.length > 50_000, "el frame tiene contenido");
  // La escena con foto azul (0x336699) bajo el velo: un píxel libre de texto tira a azul, no al fondo casi negro del motor.
  const [r, g, b] = spawnSync("ffmpeg", ["-loglevel", "error", "-i", withPhoto, "-vf", "crop=1:1:1000:1500,format=rgb24", "-f", "rawvideo", "-"]).stdout;
  assert.ok(b > 40 && b > r + 15 && b > g, `la foto se ve de fondo (rgb ${r},${g},${b})`);

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
// La duración de cada escena con voz sale del MP3 real, no de la guardada.
{
  const mp3 = Buffer.concat(Array.from({ length: 100 }, () => { const bytes = new Uint8Array(417); bytes.set([0xff, 0xfb, 0x90, 0x00]); return bytes; }));
  const dir = mkdtempSync(join(tmpdir(), "voz-"));
  writeFileSync(join(dir, "a.mp3"), mp3);
  const scenes = [{ id: "a", durationFrames: 10, audioAssetId: "a" }, { id: "b", durationFrames: 78 }];
  const measured = await withMeasuredAudio({ fps: 30, scenes }, () => join(dir, "a.mp3"));
  assert.equal(measured.scenes[0].durationFrames, Math.ceil(100 * 1152 / 44100 * 30) + 4, "una escena guardada más corta que su voz se alarga");
  assert.equal(measured.scenes[1].durationFrames, 78, "las escenas sin voz no cambian");
  rmSync(dir, { recursive: true, force: true });
}
console.log("canvas ok");
