import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const mode = process.argv[2] ?? "local";
const integration = new Set(["test:http-boundaries", "test:persistence", "test:e2e", "test:performance"]);
const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
const selected = mode === "integration"
  ? [...integration]
  : Object.keys(scripts).filter((name) => name.startsWith("test:") && name !== "test:integration" && !integration.has(name));

if (!["local", "integration"].includes(mode)) throw new Error("Uso: node scripts/run-test-suite.mjs <local|integration>");

const failures = [];
for (const name of selected) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", name], { stdio: "inherit" });
  if (result.status !== 0) failures.push(name);
}

if (failures.length) {
  console.error(`\nFallaron: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`\nSuite ${mode} completada: ${selected.length} comandos.`);
}
