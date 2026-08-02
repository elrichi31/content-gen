import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const storage = resolve(process.cwd(), "storage");
const name = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, "-");
if (!/^[\w.-]+$/.test(name) || name.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error("El nombre del backup no es seguro.");
const source = resolve(storage, "content-gen.sqlite"); const destination = resolve(storage, "backups", name);
if (!destination.startsWith(`${storage}${sep}`) || existsSync(destination)) throw new Error("El destino de backup no es seguro o ya existe.");
if (!existsSync(source)) throw new Error("No existe storage/content-gen.sqlite. Ejecuta npm run db:init.");
mkdirSync(destination, { recursive: true }); cpSync(source, resolve(destination, "content-gen.sqlite"));
const media = resolve(storage, "media"); if (existsSync(media)) cpSync(media, resolve(destination, "media"), { recursive: true });
writeFileSync(resolve(destination, "manifest.json"), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), database: "content-gen.sqlite", media: existsSync(media) ? "media" : null }, null, 2));
console.log(`Backup creado: ${destination}`);
