import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const storage = resolve(process.cwd(), "storage"); const [backupName, targetName] = process.argv.slice(2);
if (!backupName || !targetName || !/^[\w.-]+$/.test(backupName) || !/^[\w.-]+$/.test(targetName) || [backupName, targetName].some((name) => name.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))) throw new Error("Uso: npm run restore -- <backup> <carpeta-vacía-en-storage>");
const source = resolve(storage, "backups", backupName); const target = resolve(storage, targetName);
if (!source.startsWith(`${storage}${sep}`) || !target.startsWith(`${storage}${sep}`) || !existsSync(resolve(source, "manifest.json"))) throw new Error("Backup o destino no seguro.");
if (existsSync(target) && readdirSync(target).length) throw new Error("El destino debe estar vacío.");
const manifest = JSON.parse(readFileSync(resolve(source, "manifest.json"), "utf8"));
if (manifest.schemaVersion !== 1 || manifest.database !== "content-gen.sqlite" || ![null, "media"].includes(manifest.media) || !existsSync(resolve(source, manifest.database))) throw new Error("Manifest de backup inválido.");
mkdirSync(target, { recursive: true }); cpSync(resolve(source, manifest.database), resolve(target, "content-gen.sqlite"));
if (manifest.media && existsSync(resolve(source, manifest.media))) cpSync(resolve(source, manifest.media), resolve(target, "media"), { recursive: true });
console.log(`Backup restaurado: ${target}`);
