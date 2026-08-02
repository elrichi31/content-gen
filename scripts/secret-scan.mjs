import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";

const secret = /\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[oprsu]_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const exposed = /\bNEXT_PUBLIC_(?:OPENAI|ELEVENLABS|UNSPLASH_SECRET|DATABASE|API_SECRET|PRIVATE_KEY)[A-Z0-9_]*\b/;
assert.equal(secret.test(["sk", "a".repeat(24)].join("-")), true);
assert.equal(exposed.test(["NEXT_PUBLIC", "OPENAI_API_KEY"].join("_")), true);

const listed = spawnSync("rg", ["--files", "-g", "!package-lock.json"], { encoding: "utf8" });
if (listed.status !== 0) throw new Error(listed.stderr || "No se pudieron listar archivos.");
const allowed = new Set([".css", ".js", ".json", ".md", ".mjs", ".ts", ".tsx"]);
const findings = [];
for (const file of listed.stdout.split(/\r?\n/).filter(Boolean)) {
  if (!allowed.has(extname(file))) continue;
  for (const [index, line] of readFileSync(file, "utf8").split(/\r?\n/).entries()) {
    if (secret.test(line) || exposed.test(line)) findings.push(`${file}:${index + 1}`);
  }
}
if (findings.length) throw new Error(`Posibles secretos encontrados:\n${findings.join("\n")}`);
console.log("Secretos: sin claves incrustadas ni variables sensibles NEXT_PUBLIC.");
