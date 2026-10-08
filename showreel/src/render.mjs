// Render del showreel: Chromium headless dibuja cada frame (scene.html es función pura del tiempo)
// y ffmpeg lo codifica. Se reparte en tramos contiguos entre varios navegadores en paralelo.
//
//   node render.mjs stills <dirSalida> 0,120,450        -> PNG sueltos para revisar
//   node render.mjs video <salida.mp4> <musica.wav> [workers] [sub]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS = 60, FRAMES = 15 * FPS;
const [mode, outArg, third, workersArg, subArg] = process.argv.slice(2);
const SUB = Number(subArg || process.env.SUB || 4);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${pathToFileURL(join(HERE, 'scene.html'))}?sub=${SUB}`);
  await page.evaluate(() => window.ready);
  return page;
}
const grab = async (page, f) => Buffer.from((await page.evaluate((n) => window.renderFrame(n), f)).split(',')[1], 'base64');

function run(cmd, args, opts = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
    p.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} salió con ${code}`))));
    if (opts.feed) opts.feed(p.stdin);
  });
}

const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
const t0 = Date.now();
try {
  if (mode === 'stills') {
    const dir = resolve(outArg); mkdirSync(dir, { recursive: true });
    const page = await openPage(browser);
    for (const f of third.split(',').map(Number)) {
      const s = Date.now();
      writeFileSync(join(dir, `f${String(f).padStart(4, '0')}.png`), await grab(page, f));
      console.log(`frame ${f} ${Date.now() - s} ms`);
    }
  } else if (mode === 'video') {
    const out = resolve(outArg), wav = resolve(third), workers = Number(workersArg || 4);
    const tmp = join(dirname(out), '.segments'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
    const per = Math.ceil(FRAMES / workers);
    let done = 0;
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const a = w * per, b = Math.min(FRAMES, a + per);
      const page = await openPage(browser);
      // Segmento intermedio casi sin pérdida (x264 qp 4, 4:4:4) para no comprimir dos veces fuerte
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
        '-c:v', 'libx264', '-preset', 'veryfast', '-qp', '4', '-pix_fmt', 'yuv444p', join(tmp, `seg${w}.mkv`)], { stdio: ['pipe', 'inherit', 'inherit'] });
      const finished = new Promise((ok, fail) => ff.on('exit', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg seg${w}: ${c}`)))));
      for (let f = a; f < b; f++) {
        const png = await grab(page, f);
        if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
        if (++done % 60 === 0) console.log(`${done}/${FRAMES} frames · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      ff.stdin.end();
      await finished;
    }));
    const list = join(tmp, 'list.txt');
    writeFileSync(list, Array.from({ length: workers }, (_, w) => `file 'seg${w}.mkv'`).join('\n'));
    // Master: H.264 High 4:2:0, CRF 14, AAC 320k; audio normalizado a -14 LUFS / -1 dBTP (estándar de redes)
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
      '-x264-params', 'keyint=60:min-keyint=60', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '320k',
      '-t', '15', '-movflags', '+faststart', out]);
    rmSync(tmp, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
