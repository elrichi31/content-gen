import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { convertLegacyCarousel } from "../packages/domain/src/carousel.ts";
import { assetSchema, brandKitSchema, campaignSchema, contentItemSchema, exportSchema } from "../packages/domain/src/schemas.ts";
import { accentPairSchema, DEFAULT_ACCENTS, SCENE_KEYS_BY_TEMPLATE, SCENE_KIND_BY_KEY, videoDocumentSchema } from "../packages/domain/src/video.ts";

const statuses = ["ready", "imported", "skipped", "error"];
export const manualCompositions = [
  ["ai-agents", "AiAgentsVerticalPremium", "AiAgentsVerticalPremium.mp4"],
  ["ai-automations", "AiAutomationsVerticalPremium", "AiAutomationsVerticalPremium.mp4"],
  ["ai-skills", "AiSkillsVerticalPremium", "AiSkillsVerticalPremium.mp4"],
  ["cyber-tools", "CyberToolsVerticalPremium", "CyberToolsVerticalPremium.mp4"],
  ["hacker-groups", "HackerGroupsVerticalPremium", "HackerGroupsVerticalPremium.mp4"],
  ["zero-day", "ZeroDayVerticalPremium", "ZeroDayVerticalPremium.mp4"],
];

export function createImportReport(operation, sourceRoot, items, startedAt = new Date().toISOString()) {
  const summary = Object.fromEntries(statuses.map((status) => [status, items.filter((item) => item.status === status).length]));
  return { schemaVersion: 1, operation, sourceRoot: resolve(sourceRoot), startedAt, completedAt: new Date().toISOString(), summary: { total: items.length, ...summary }, items };
}

function validateVideoScript(value, directory) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("El script debe ser un objeto JSON.");
  if (typeof value.slug !== "string" || value.slug !== directory) throw new Error("El slug debe coincidir con el directorio.");
  if (typeof value.displayTitle !== "string" || !value.displayTitle.trim()) throw new Error("Falta displayTitle.");
  if (!value.scenes || typeof value.scenes !== "object" || Array.isArray(value.scenes) || !Object.keys(value.scenes).length) throw new Error("Faltan escenas.");
  return value;
}

export async function scanVideoScripts(sourceRoot) {
  const root = resolve(sourceRoot);
  const items = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const scriptPath = join(root, entry.name, "script.json");
    try {
      const script = validateVideoScript(JSON.parse(await readFile(scriptPath, "utf8")), entry.name);
      items.push({ sourceId: `video-autom:${entry.name}`, type: "video-script", status: "ready", sourcePath: scriptPath, title: script.displayTitle, sceneCount: Object.keys(script.scenes).length, reason: "Script válido y listo para importar." });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      items.push({ sourceId: `video-autom:${entry.name}`, type: "video-script", status: "error", sourcePath: scriptPath, reason: error instanceof Error ? error.message : "Error desconocido." });
    }
  }
  return createImportReport("scan-video", root, items);
}

export async function writeImportReport(report, outputPath) {
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return target;
}

function stableUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function storageValue(snapshot, key) {
  const value = snapshot[key];
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function insert(database, sql, ...params) {
  return database.prepare(sql).run(...params).changes === 1;
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function importFileAsset(database, path, mediaRoot, campaignId, contentItemId, sourceId, items, mimeType) {
  const info = await stat(path);
  if (!info.size) throw new Error(`Asset vacío: ${path}`);
  const hash = await hashFile(path);
  const extension = extname(path).slice(1).toLowerCase();
  const id = stableUuid(sourceId);
  const storageKey = `assets/${hash}.${extension}`;
  const target = resolve(mediaRoot, storageKey);
  await mkdir(dirname(target), { recursive: true });
  if (!existsSync(target)) await copyFile(path, target);
  const createdAt = info.birthtime.toISOString();
  const asset = assetSchema.parse({ id, schemaVersion: 1, filename: basename(path), mimeType, sizeBytes: info.size, storageKey, campaignId, contentItemId, createdAt });
  const imported = insert(database, "INSERT OR IGNORE INTO assets (id, schema_version, data_json, created_at) VALUES (?, 1, ?, ?)", id, JSON.stringify(asset), createdAt);
  items.push({ sourceId, type: "asset", status: imported ? "imported" : "skipped", targetId: id, reason: imported ? "Asset importado." : "Asset ya importado." });
  return id;
}

function carouselDocument(value, fallbackTopic) {
  return convertLegacyCarousel({
    id: value.id,
    topic: value.topic || value.formData?.topic || fallbackTopic,
    slides: value.slides,
    caption: value.caption ?? undefined,
    platform: value.platform ?? "instagram",
    formData: value.formData,
  });
}

export async function importCarouselSnapshot(snapshotPath, databasePath, mediaRoot) {
  const sourcePath = resolve(snapshotPath);
  const snapshot = JSON.parse(await readFile(sourcePath, "utf8"));
  const database = new DatabaseSync(resolve(databasePath));
  const items = [];
  const now = new Date().toISOString();
  const campaignId = stableUuid("carousel-ai:campaign");
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
    const presets = storageValue(snapshot, "carousel-ai-brand-presets");
    const legacyBrand = storageValue(snapshot, "carousel-ai-brand");
    const brands = Array.isArray(presets) && presets.length ? presets : legacyBrand ? [{ ...legacyBrand, id: "legacy" }] : [];
    let activeBrandKitId = null;

    for (const brand of brands) {
      if (!brand?.name?.trim()) {
        items.push({ sourceId: `carousel-ai:brand:${brand?.id ?? "unknown"}`, type: "brand-kit", status: "skipped", reason: "Preset vacío." });
        continue;
      }
      const sourceId = `carousel-ai:brand:${brand.id}`;
      const brandKitId = stableUuid(sourceId);
      let logoAssetId = null;
      if (brand.logoUrl) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(brand.logoUrl);
        if (!match) throw new Error(`Logo inválido en ${sourceId}.`);
        const bytes = Buffer.from(match[2], "base64");
        const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[match[1].toLowerCase()];
        const hash = createHash("sha256").update(bytes).digest("hex");
        logoAssetId = stableUuid(`asset:${hash}`);
        const storageKey = `assets/${hash}.${extension}`;
        const target = resolve(mediaRoot, storageKey);
        await mkdir(dirname(target), { recursive: true });
        if (!existsSync(target)) await writeFile(target, bytes);
        const asset = assetSchema.parse({ id: logoAssetId, schemaVersion: 1, filename: `${brand.id}-logo.${extension}`, mimeType: match[1].toLowerCase(), sizeBytes: bytes.length, storageKey, campaignId: null, contentItemId: null, createdAt: now });
        const imported = insert(database, "INSERT OR IGNORE INTO assets (id, schema_version, data_json, created_at) VALUES (?, 1, ?, ?)", asset.id, JSON.stringify(asset), now);
        items.push({ sourceId: `${sourceId}:logo`, type: "asset", status: imported ? "imported" : "skipped", targetId: asset.id, reason: imported ? "Logo importado." : "Logo ya importado." });
      }
      const color = Array.isArray(brand.colors) && /^#[0-9a-f]{6}$/i.test(brand.colors[0] ?? "") ? brand.colors[0] : "#22c55e";
      const brandKit = brandKitSchema.parse({ id: brandKitId, schemaVersion: 1, name: brand.name.trim(), primaryColor: color, logoAssetId, createdAt: now, updatedAt: now, archivedAt: null });
      const imported = insert(database, "INSERT OR IGNORE INTO brand_kits (id, schema_version, data_json, created_at, updated_at, archived_at) VALUES (?, 1, ?, ?, ?, NULL)", brandKit.id, JSON.stringify(brandKit), now, now);
      items.push({ sourceId, type: "brand-kit", status: imported ? "imported" : "skipped", targetId: brandKit.id, reason: imported ? "Preset convertido a BrandKit." : "BrandKit ya importado; no se sobrescribió." });
      if (brand.id === storageValue(snapshot, "carousel-ai-active-brand")) activeBrandKitId = brandKit.id;
    }

    const campaign = campaignSchema.parse({ id: campaignId, schemaVersion: 1, name: "Migración carousel-ai", brief: "Contenido recuperado de localStorage.", brandKitId: activeBrandKitId, createdAt: now, updatedAt: now, archivedAt: null });
    insert(database, "INSERT OR IGNORE INTO campaigns (id, schema_version, brand_kit_id, data_json, created_at, updated_at, archived_at) VALUES (?, 1, ?, ?, ?, ?, NULL)", campaign.id, campaign.brandKitId, JSON.stringify(campaign), now, now);

    const sources = [];
    const autosave = storageValue(snapshot, "carousel-ai:autosave");
    if (autosave) sources.push({ sourceId: "carousel-ai:autosave", value: autosave, timestamp: null });
    const history = storageValue(snapshot, "carousel-session-history");
    if (Array.isArray(history)) history.forEach((value, index) => sources.push({ sourceId: `carousel-session-history:${value.id ?? index}`, value, timestamp: value.timestamp }));

    for (const source of sources) {
      try {
        const document = carouselDocument(source.value, "Carrusel legacy");
        const id = stableUuid(source.sourceId);
        const createdAt = Number.isFinite(source.timestamp) ? new Date(source.timestamp).toISOString() : now;
        const content = contentItemSchema.parse({ id, schemaVersion: 1, campaignId, type: "carousel", document: { schemaVersion: 1, data: document }, revision: 0, createdAt, updatedAt: createdAt, archivedAt: null });
        const imported = insert(database, "INSERT OR IGNORE INTO content_items (id, schema_version, campaign_id, type, document_json, revision, created_at, updated_at, archived_at) VALUES (?, 1, ?, 'carousel', ?, 0, ?, ?, NULL)", id, campaignId, JSON.stringify(content), createdAt, createdAt);
        items.push({ sourceId: source.sourceId, type: "carousel", status: imported ? "imported" : "skipped", targetId: id, reason: imported ? "Carrusel importado." : "Carrusel ya importado; no se sobrescribió." });
      } catch (error) {
        items.push({ sourceId: source.sourceId, type: "carousel", status: "error", reason: error instanceof Error ? error.message : "Carrusel inválido." });
      }
    }
    if (!autosave) items.push({ sourceId: "carousel-ai:autosave", type: "carousel", status: "skipped", reason: "La captura no contiene autosave." });
    items.push({ sourceId: "carousel-ai:ads", type: "ad", status: "skipped", reason: "Los anuncios legacy vivían solo en estado React y no tienen datos persistidos recuperables." });
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
  return createImportReport("import-carousel", sourcePath, items);
}

export async function importLegacyVideos(remotionRoot, databasePath, mediaRoot) {
  const root = resolve(remotionRoot);
  const sourceRoot = join(root, "src");
  const publicRoot = join(root, "public");
  const outputRoot = join(root, "out");
  const scan = await scanVideoScripts(sourceRoot);
  const database = new DatabaseSync(resolve(databasePath));
  const items = [];
  const now = new Date().toISOString();
  const campaignId = stableUuid("video-autom:campaign");
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
    const campaign = campaignSchema.parse({ id: campaignId, schemaVersion: 1, name: "Migración video-autom", brief: "Videos recuperados del proyecto legacy.", brandKitId: null, createdAt: now, updatedAt: now, archivedAt: null });
    insert(database, "INSERT OR IGNORE INTO campaigns (id, schema_version, brand_kit_id, data_json, created_at, updated_at, archived_at) VALUES (?, 1, NULL, ?, ?, ?, NULL)", campaign.id, JSON.stringify(campaign), now, now);

    for (const scanned of scan.items) {
      if (scanned.status !== "ready") {
        items.push(scanned);
        continue;
      }
      const slug = scanned.sourceId.slice("video-autom:".length);
      const contentItemId = stableUuid(scanned.sourceId);
      try {
        const script = JSON.parse(await readFile(scanned.sourcePath, "utf8"));
        const voiceoverPath = join(publicRoot, slug, `${slug}-voiceover-script.json`);
        const voiceover = existsSync(voiceoverPath) ? JSON.parse(await readFile(voiceoverPath, "utf8")) : null;
        const voiceoverAssetId = existsSync(voiceoverPath)
          ? await importFileAsset(database, voiceoverPath, mediaRoot, campaignId, contentItemId, `${scanned.sourceId}:voiceover-script`, items, "application/json")
          : null;
        const singleAudioPath = join(publicRoot, slug, `${slug}-voiceover.mp3`);
        const legacyVoiceoverAssetId = existsSync(singleAudioPath)
          ? await importFileAsset(database, singleAudioPath, mediaRoot, campaignId, contentItemId, `${scanned.sourceId}:voiceover`, items, "audio/mpeg")
          : null;
        // El guion legacy ya trae las siete escenas fijas: se mapean a sus mismas claves y layouts.
        const templateId = script.compositionType === "timeline" ? "timeline" : "standard";
        const scenes = [];
        for (const sceneId of SCENE_KEYS_BY_TEMPLATE[templateId]) {
          const content = script.scenes?.[sceneId];
          if (!content) throw new Error(`Al guion legacy le falta la escena ${sceneId}.`);
          const imagePath = join(publicRoot, slug, `${slug}-${sceneId}.png`);
          const audioPath = join(publicRoot, slug, `${slug}-voiceover-${sceneId}.mp3`);
          const imageAssetId = existsSync(imagePath) ? await importFileAsset(database, imagePath, mediaRoot, campaignId, contentItemId, `${scanned.sourceId}:image:${sceneId}`, items, "image/png") : null;
          const audioAssetId = existsSync(audioPath) ? await importFileAsset(database, audioPath, mediaRoot, campaignId, contentItemId, `${scanned.sourceId}:audio:${sceneId}`, items, "audio/mpeg") : null;
          const voice = voiceover?.voiceover?.scenes?.[sceneId];
          const accent = accentPairSchema.safeParse(script.accents?.[sceneId]);
          scenes.push({
            id: sceneId, kind: SCENE_KIND_BY_KEY[sceneId],
            durationFrames: Math.max(1, Math.round((voice?.durationSeconds ?? 5) * 30)),
            accent: accent.success ? accent.data : [...DEFAULT_ACCENTS[sceneId]],
            imageAssetId, audioAssetId,
            content: { ...content, ...(script.imagePrompts?.[sceneId] ? { imagePrompt: script.imagePrompts[sceneId] } : {}), ...(voice?.text ? { voiceover: voice.text } : {}) },
          });
        }
        const document = videoDocumentSchema.parse({
          schemaVersion: 1, slug, templateId, title: script.displayTitle, width: 1080, height: 1920, fps: 30,
          ...(script.niche ? { niche: script.niche } : {}), ...(script.hookStyle ? { hookStyle: script.hookStyle } : {}),
          ...(script.targetDurationSeconds ? { targetDurationSeconds: script.targetDurationSeconds } : {}),
          scenes, legacy: { sourcePath: scanned.sourcePath, voiceoverAssetId, legacyVoiceoverAssetId },
        });
        const content = contentItemSchema.parse({ id: contentItemId, schemaVersion: 1, campaignId, type: "video", document: { schemaVersion: 1, data: document }, revision: 0, createdAt: now, updatedAt: now, archivedAt: null });
        const imported = insert(database, "INSERT OR IGNORE INTO content_items (id, schema_version, campaign_id, type, document_json, revision, created_at, updated_at, archived_at) VALUES (?, 1, ?, 'video', ?, 0, ?, ?, NULL)", content.id, campaignId, JSON.stringify(content), now, now);
        items.push({ sourceId: scanned.sourceId, type: "video", status: imported ? "imported" : "skipped", targetId: content.id, reason: imported ? "Video importado." : "Video ya importado; no se sobrescribió." });

        const outputPath = join(outputRoot, `${slug}.mp4`);
        if (existsSync(outputPath)) {
          const outputAssetId = await importFileAsset(database, outputPath, mediaRoot, campaignId, contentItemId, `${scanned.sourceId}:output`, items, "video/mp4");
          const exportId = stableUuid(`${scanned.sourceId}:export`);
          const exported = exportSchema.parse({ id: exportId, schemaVersion: 1, contentItemId, format: "mp4", assetId: outputAssetId, createdAt: now });
          const exportImported = insert(database, "INSERT OR IGNORE INTO exports (id, schema_version, content_item_id, asset_id, data_json, created_at) VALUES (?, 1, ?, ?, ?, ?)", exportId, contentItemId, outputAssetId, JSON.stringify(exported), now);
          items.push({ sourceId: `${scanned.sourceId}:export`, type: "export", status: exportImported ? "imported" : "skipped", targetId: exportId, reason: exportImported ? "MP4 registrado como Export." : "Export ya importado." });
        }
      } catch (error) {
        items.push({ sourceId: scanned.sourceId, type: "video", status: "error", reason: error instanceof Error ? error.message : "Video inválido." });
      }
    }
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
  return createImportReport("import-video", root, items);
}

export async function importManualVideos(videoAutomRoot, databasePath, mediaRoot) {
  const root = resolve(videoAutomRoot);
  const database = new DatabaseSync(resolve(databasePath));
  const items = [];
  const now = new Date().toISOString();
  const campaignId = stableUuid("video-autom:campaign");
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
    const campaign = campaignSchema.parse({ id: campaignId, schemaVersion: 1, name: "Migración video-autom", brief: "Videos recuperados del proyecto legacy.", brandKitId: null, createdAt: now, updatedAt: now, archivedAt: null });
    insert(database, "INSERT OR IGNORE INTO campaigns (id, schema_version, brand_kit_id, data_json, created_at, updated_at, archived_at) VALUES (?, 1, NULL, ?, ?, ?, NULL)", campaign.id, JSON.stringify(campaign), now, now);
    for (const [slug, compositionId, outputName] of manualCompositions) {
      const sourceId = `video-autom:manual:${compositionId}`;
      const contentItemId = stableUuid(sourceId);
      const document = videoDocumentSchema.parse({
        // Estas composiciones se importan solo como registro del MP4 ya renderizado,
        // por eso no usan la plantilla de siete escenas del editor.
        schemaVersion: 1, slug, templateId: "legacy", title: slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        width: 1080, height: 1920, fps: 30,
        scenes: [{ id: "legacy", kind: "intro", durationFrames: 150, content: { title: compositionId, legacyCompositionId: compositionId } }],
        legacy: { engine: "video-autom/remotion", compositionId, sourcePath: join(root, "remotion", "src", slug) },
      });
      const content = contentItemSchema.parse({ id: contentItemId, schemaVersion: 1, campaignId, type: "video", document: { schemaVersion: 1, data: document }, revision: 0, createdAt: now, updatedAt: now, archivedAt: null });
      const imported = insert(database, "INSERT OR IGNORE INTO content_items (id, schema_version, campaign_id, type, document_json, revision, created_at, updated_at, archived_at) VALUES (?, 1, ?, 'video', ?, 0, ?, ?, NULL)", content.id, campaignId, JSON.stringify(content), now, now);
      items.push({ sourceId, type: "manual-video", status: imported ? "imported" : "skipped", targetId: content.id, reason: imported ? "Composición manual registrada." : "Composición manual ya registrada." });
      const outputPath = join(root, "out", outputName);
      if (!existsSync(outputPath)) {
        items.push({ sourceId: `${sourceId}:export`, type: "export", status: "error", reason: `No existe ${outputPath}.` });
        continue;
      }
      const outputAssetId = await importFileAsset(database, outputPath, mediaRoot, campaignId, contentItemId, `${sourceId}:output`, items, "video/mp4");
      const exportId = stableUuid(`${sourceId}:export`);
      const exported = exportSchema.parse({ id: exportId, schemaVersion: 1, contentItemId, format: "mp4", assetId: outputAssetId, createdAt: now });
      const exportImported = insert(database, "INSERT OR IGNORE INTO exports (id, schema_version, content_item_id, asset_id, data_json, created_at) VALUES (?, 1, ?, ?, ?, ?)", exportId, contentItemId, outputAssetId, JSON.stringify(exported), now);
      items.push({ sourceId: `${sourceId}:export`, type: "export", status: exportImported ? "imported" : "skipped", targetId: exportId, reason: exportImported ? "MP4 manual registrado." : "Export manual ya importado." });
    }
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
  return createImportReport("import-manual-video", root, items);
}

export function renderManualComposition(videoAutomRoot, compositionId, outputPath) {
  if (!manualCompositions.some(([, id]) => id === compositionId)) throw new Error("Composición manual no permitida.");
  const storageRoot = resolve("storage");
  const target = resolve(outputPath ?? join(storageRoot, "renders", `${compositionId}.mp4`));
  if (!target.startsWith(`${storageRoot}${sep}`)) throw new Error("La salida debe quedar dentro de storage.");
  const root = resolve(videoAutomRoot, "remotion");
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["remotion", "render", "src/index.ts", compositionId, target], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Falló el render legacy.").slice(-1000));
  return target;
}

async function main() {
  const [command, sourceArg, outputArg, renderOutputArg] = process.argv.slice(2);
  if (command === "render-manual") return console.log(JSON.stringify({ outputPath: renderManualComposition("../video-autom", sourceArg, outputArg) }));
  if (!["scan-video", "import-carousel", "import-video", "import-manual"].includes(command)) throw new Error("Usa: legacy-import.mjs <scan-video|import-carousel|import-video|import-manual|render-manual> [fuente] [reporte.json]");
  const report = command === "scan-video"
    ? await scanVideoScripts(resolve(sourceArg ?? "../video-autom/remotion/src"))
    : command === "import-carousel"
      ? await importCarouselSnapshot(sourceArg, process.env.DATABASE_URL?.replace(/^file:/, "") ?? "storage/content-gen.sqlite", "storage/media")
      : command === "import-video"
        ? await importLegacyVideos(resolve(sourceArg ?? "../video-autom/remotion"), process.env.DATABASE_URL?.replace(/^file:/, "") ?? "storage/content-gen.sqlite", "storage/media")
        : await importManualVideos(resolve(sourceArg ?? "../video-autom"), process.env.DATABASE_URL?.replace(/^file:/, "") ?? "storage/content-gen.sqlite", "storage/media");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = await writeImportReport(report, outputArg ?? renderOutputArg ?? `storage/migration-reports/${command}-${stamp}.json`);
  console.log(JSON.stringify({ outputPath, summary: report.summary }));
  if (report.summary.error) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
