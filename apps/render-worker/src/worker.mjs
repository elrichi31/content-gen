import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const jobArgumentIndex = process.argv.indexOf("--job");
const jobPath = jobArgumentIndex === -1 ? undefined : process.argv[jobArgumentIndex + 1];
const now = () => new Date().toISOString();
const update = (database, job, patch) => {
  const next = { ...job, ...patch };
  return database.prepare("UPDATE render_jobs SET data_json = ? WHERE id = ? AND json_extract(data_json, '$.status') != 'cancelled'").run(JSON.stringify(next), job.id).changes ? next : null;
};

// Reclamar es atómico: si otro worker ya tomó el job, esta actualización no cambia filas.
const claim = (database, job, patch) => {
  const next = { ...job, ...patch };
  return database.prepare("UPDATE render_jobs SET data_json = ? WHERE id = ? AND json_extract(data_json, '$.status') = 'queued'").run(JSON.stringify(next), job.id).changes ? next : null;
};

/**
 * Remotion informa "Rendered X/Y" mientras dibuja los frames y "Encoded X/Y" al
 * codificar el MP4. Se traduce a 10-95% para que la barra de la app avance de
 * verdad en vez de quedarse clavada durante todo el render.
 */
export function parseRenderProgress(line) {
  const ratio = (done, total) => Math.min(1, Math.max(0, Number(done) / Number(total) || 0));
  const rendered = /Rendered (\d+)\/(\d+)/.exec(line);
  if (rendered) return 10 + Math.round(ratio(rendered[1], rendered[2]) * 65);
  const encoded = /Encoded (\d+)\/(\d+)/.exec(line);
  if (encoded) return 75 + Math.round(ratio(encoded[1], encoded[2]) * 20);
  return null;
}

/**
 * La salida de Remotion termina en un stack larguísimo con códigos ANSI: para la
 * app vale más la línea que explica el fallo que los últimos mil caracteres.
 */
export function renderErrorMessage(output) {
  // eslint-disable-next-line no-control-regex
  const clean = (output ?? "").replace(/\[[0-9;]*m/g, "").trim();
  if (!clean) return "Remotion no pudo renderizar.";
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const meaningful = lines.filter((line) => !line.startsWith("at ") && !/^\d+\s*│/.test(line) && !/^│/.test(line));
  const start = meaningful.findIndex((line) => /error|failed|cannot|no se pudo/i.test(line));
  const picked = (start === -1 ? meaningful : meaningful.slice(start)).slice(0, 4).join(" ");
  return (picked || clean).slice(0, 1000);
}

function runRemotion(job, outputPath, propsPath, onProgress) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["remotion", "render", resolve(process.cwd(), "packages/video-engine/src/index.ts"), job.compositionId, outputPath, `--props=${propsPath}`];
  const child = spawn(command, args, { cwd: process.cwd(), shell: process.platform === "win32" });
  let output = "";
  let reported = 10;
  const read = (chunk) => {
    const text = chunk.toString();
    output = (output + text).slice(-4000);
    for (const line of text.split(/[\r\n]+/)) {
      const progress = parseRenderProgress(line);
      if (progress !== null && progress > reported) { reported = progress; onProgress(progress); }
    }
  };
  child.stdout.on("data", read);
  child.stderr.on("data", read);
  return new Promise((resolveRun) => {
    child.on("error", (error) => resolveRun({ status: 1, output: error.message }));
    child.on("close", (status) => resolveRun({ status, output }));
  });
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function saveExport(database, job, outputPath, mediaRoot) {
  const sizeBytes = statSync(outputPath).size;
  if (!sizeBytes) throw new Error("El MP4 renderizado está vacío.");
  const content = database.prepare("SELECT campaign_id FROM content_items WHERE id = ? AND archived_at IS NULL").get(job.contentItemId);
  if (!content) throw new Error("El contenido ya no está disponible para guardar el MP4.");
  const hash = await hashFile(outputPath); const storageKey = `assets/${hash}.mp4`; const target = resolve(mediaRoot, storageKey);
  mkdirSync(dirname(target), { recursive: true }); if (!existsSync(target)) await copyFile(outputPath, target);
  const createdAt = now(); const asset = { id: randomUUID(), schemaVersion: 1, filename: `${job.id}.mp4`, mimeType: "video/mp4", sizeBytes, storageKey, campaignId: content.campaign_id, contentItemId: job.contentItemId, createdAt };
  const exported = { id: randomUUID(), schemaVersion: 1, contentItemId: job.contentItemId, format: "mp4", assetId: asset.id, createdAt };
  database.prepare("INSERT INTO assets (id, schema_version, data_json, created_at) VALUES (?, ?, ?, ?)").run(asset.id, 1, JSON.stringify(asset), createdAt);
  database.prepare("INSERT INTO exports (id, schema_version, content_item_id, asset_id, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(exported.id, 1, job.contentItemId, asset.id, JSON.stringify(exported), createdAt);
  return asset;
}

async function validateFixture() {
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  if (job.status !== "queued") throw new Error(`El job ${job.id ?? "sin-id"} debe iniciar en estado queued.`);
  if (job.kind !== "video" || typeof job.compositionId !== "string") throw new Error("El contrato mínimo requiere kind=video y compositionId.");
  console.log(JSON.stringify({ id: job.id, kind: job.kind, compositionId: job.compositionId, status: "completed", events: ["queued", "processing", "completed"].map((status) => ({ status, at: now() })) }, null, 2));
}

async function processNext() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:") || url.includes("..")) throw new Error("DATABASE_URL debe ser una ruta local segura con prefijo file:.");
  const databasePath = resolve(url.slice("file:".length)); const mediaRoot = resolve(dirname(databasePath), "media"); const database = new DatabaseSync(databasePath);
  try {
    const row = database.prepare("SELECT data_json FROM render_jobs WHERE json_extract(data_json, '$.status') = 'queued' ORDER BY created_at LIMIT 1").get();
    if (!row) return console.log(JSON.stringify({ status: "idle" }));
    const job = JSON.parse(row.data_json);
    const claimed = claim(database, job, { status: "processing", progress: 10 });
    if (!claimed) return console.log(JSON.stringify({ id: job.id, status: "taken" }));
    const outputPath = resolve(dirname(databasePath), "renders", `${job.id}.mp4`);
    const propsPath = resolve(dirname(databasePath), "renders", `${job.id}.json`);
    try {
      if (!["StandardVideo", "TimelineVideo"].includes(job.compositionId)) throw new Error("La composición de video no está registrada.");
      mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(propsPath, JSON.stringify(job.inputProps));
      const render = await runRemotion(job, outputPath, propsPath, (progress) => {
        const latest = JSON.parse(database.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get(job.id).data_json);
        if (latest.status === "processing") update(database, latest, { progress });
      });
      if (render.status !== 0) throw new Error(renderErrorMessage(render.output));
      const latest = JSON.parse(database.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get(job.id).data_json);
      if (latest.status === "cancelled") return console.log(JSON.stringify({ id: latest.id, status: "cancelled" }));
      const asset = await saveExport(database, job, outputPath, mediaRoot);
      const completed = update(database, claimed, { status: "completed", progress: 100, outputAssetId: asset.id, completedAt: now(), error: null });
      console.log(JSON.stringify({ id: job.id, status: completed?.status ?? "cancelled", assetId: asset.id }));
    } catch (error) {
      const latest = JSON.parse(database.prepare("SELECT data_json FROM render_jobs WHERE id = ?").get(job.id).data_json);
      if (latest.status === "cancelled") return console.log(JSON.stringify({ id: latest.id, status: "cancelled" }));
      const failed = update(database, latest, { status: "failed", completedAt: now(), error: error instanceof Error ? error.message.slice(0, 1000) : "Error de render desconocido." });
      console.log(JSON.stringify({ id: job.id, status: failed?.status ?? "cancelled", error: failed?.error }));
    } finally {
      if (existsSync(outputPath)) rmSync(outputPath, { force: true }); if (existsSync(propsPath)) rmSync(propsPath, { force: true });
    }
  } finally {
    database.close();
  }
}

// Solo actúa como ejecutable: importarlo desde una prueba no lanza ningún render.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  if (jobPath) await validateFixture(); else if (process.argv.includes("--once")) await processNext(); else throw new Error("Usa --job <ruta-al-job.json> o --once.");
}
