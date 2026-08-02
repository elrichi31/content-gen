import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createImportReport, importCarouselSnapshot, importLegacyVideos, importManualVideos, manualCompositions, renderManualComposition, scanVideoScripts } from "./legacy-import.mjs";

const root = await mkdtemp(join(tmpdir(), "content-gen-legacy-"));
try {
  await mkdir(join(root, "valid"));
  await writeFile(join(root, "valid", "script.json"), JSON.stringify({ slug: "valid", displayTitle: "Válido", scenes: { intro: { title: "Hola" } } }));
  await mkdir(join(root, "broken"));
  await writeFile(join(root, "broken", "script.json"), "{");
  await mkdir(join(root, "manual"));

  const report = await scanVideoScripts(root);
  assert.deepEqual(report.summary, { total: 2, ready: 1, imported: 0, skipped: 0, error: 1 });
  assert.equal(report.items.find((item) => item.sourceId === "video-autom:valid")?.sceneCount, 1);
  assert.match(report.items.find((item) => item.sourceId === "video-autom:broken")?.reason ?? "", /JSON/);

  const final = createImportReport("import", root, [
    { sourceId: "a", type: "asset", status: "imported", reason: "ok" },
    { sourceId: "b", type: "asset", status: "skipped", reason: "duplicado" },
    { sourceId: "c", type: "asset", status: "error", reason: "inválido" },
  ]);
  assert.deepEqual(final.summary, { total: 3, ready: 0, imported: 1, skipped: 1, error: 1 });

  const databasePath = join(root, "import.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE brand_kits (id TEXT PRIMARY KEY, schema_version INTEGER, data_json TEXT, created_at TEXT, updated_at TEXT, archived_at TEXT);
    CREATE TABLE campaigns (id TEXT PRIMARY KEY, schema_version INTEGER, brand_kit_id TEXT, data_json TEXT, created_at TEXT, updated_at TEXT, archived_at TEXT);
    CREATE TABLE content_items (id TEXT PRIMARY KEY, schema_version INTEGER, campaign_id TEXT, type TEXT, document_json TEXT, revision INTEGER, created_at TEXT, updated_at TEXT, archived_at TEXT);
    CREATE TABLE assets (id TEXT PRIMARY KEY, schema_version INTEGER, data_json TEXT, created_at TEXT);
    CREATE TABLE exports (id TEXT PRIMARY KEY, schema_version INTEGER, content_item_id TEXT, asset_id TEXT, data_json TEXT, created_at TEXT);
  `);
  database.close();
  const slide = { id: "slide-1", layout: "cover", title: "Hola", backgroundColor: "bg-black", textColor: "text-white" };
  const formData = { topic: "Tema legacy", audience: "General", tone: "Directo", slideCount: 1, visualStyle: "Minimal", withImages: false, imageSource: "unsplash" };
  const snapshotPath = join(root, "snapshot.json");
  await writeFile(snapshotPath, JSON.stringify({
    "carousel-ai-brand-presets": [{ id: "brand-1", name: "Marca", logoUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}`, colors: ["#123456"] }],
    "carousel-ai-active-brand": "brand-1",
    "carousel-ai:autosave": { slides: [slide], caption: null, platform: "instagram", formData },
    "carousel-session-history": [{ id: "history-1", timestamp: 1700000000000, topic: "Historial", slides: [slide], caption: null, formData }],
  }));
  const firstImport = await importCarouselSnapshot(snapshotPath, databasePath, join(root, "media"));
  const secondImport = await importCarouselSnapshot(snapshotPath, databasePath, join(root, "media"));
  assert.deepEqual(firstImport.summary, { total: 5, ready: 0, imported: 4, skipped: 1, error: 0 });
  assert.deepEqual(secondImport.summary, { total: 5, ready: 0, imported: 0, skipped: 5, error: 0 });

  const remotionRoot = join(root, "remotion");
  await mkdir(join(remotionRoot, "src", "legacy-video"), { recursive: true });
  await mkdir(join(remotionRoot, "public", "legacy-video"), { recursive: true });
  await mkdir(join(remotionRoot, "out"), { recursive: true });
  // Guion legacy completo: las siete escenas fijas de `video-autom`.
  const legacyScenes = { intro: { tag: "HOLA", title: "Hola", subtitle: "gancho" }, layers: { tag: "CONTEXTO", terminal: ["> a = b"], definition: "Definición" }, phase1: { timestamp: "UNO", title: "Fase 1", indicator: ["Dato"] }, phase2: { timestamp: "DOS", title: "Fase 2", indicator: ["Dato"] }, phase3: { timestamp: "TRES", title: "Fase 3", indicator: ["Dato"] }, reality: { tag: "REALIDAD", title: "Aterrizaje", actions: ["Uno", "Dos"] }, close: { tag: "CIERRE", title: "Final", subtitle: "remate" } };
  await writeFile(join(remotionRoot, "src", "legacy-video", "script.json"), JSON.stringify({ slug: "legacy-video", displayTitle: "Video legacy", niche: "ai", hookStyle: "shock", accents: { intro: ["#FF4500", "#FFD700"] }, scenes: legacyScenes }));
  await writeFile(join(remotionRoot, "public", "legacy-video", "legacy-video-intro.png"), "png");
  await writeFile(join(remotionRoot, "public", "legacy-video", "legacy-video-voiceover-intro.mp3"), "mp3");
  await writeFile(join(remotionRoot, "public", "legacy-video", "legacy-video-voiceover-script.json"), JSON.stringify({ voiceover: { scenes: { intro: { text: "Hola", durationSeconds: 4 } } } }));
  await writeFile(join(remotionRoot, "out", "legacy-video.mp4"), "mp4");
  const firstVideoImport = await importLegacyVideos(remotionRoot, databasePath, join(root, "media"));
  const secondVideoImport = await importLegacyVideos(remotionRoot, databasePath, join(root, "media"));
  assert.deepEqual(firstVideoImport.summary, { total: 6, ready: 0, imported: 6, skipped: 0, error: 0 });
  assert.deepEqual(secondVideoImport.summary, { total: 6, ready: 0, imported: 0, skipped: 6, error: 0 });
  const videoAutomRoot = join(root, "video-autom");
  await mkdir(join(videoAutomRoot, "out"), { recursive: true });
  for (const [, , outputName] of manualCompositions) await writeFile(join(videoAutomRoot, "out", outputName), outputName);
  const firstManualImport = await importManualVideos(videoAutomRoot, databasePath, join(root, "media"));
  const secondManualImport = await importManualVideos(videoAutomRoot, databasePath, join(root, "media"));
  assert.deepEqual(firstManualImport.summary, { total: 18, ready: 0, imported: 18, skipped: 0, error: 0 });
  assert.deepEqual(secondManualImport.summary, { total: 18, ready: 0, imported: 0, skipped: 18, error: 0 });
  assert.throws(() => renderManualComposition(videoAutomRoot, "NoPermitida"), /no permitida/);
  console.log("Reporte legacy y escáner de video verificados.");
} finally {
  await rm(root, { recursive: true, force: true });
}
