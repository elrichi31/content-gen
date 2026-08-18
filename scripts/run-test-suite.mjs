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
  // Hay que pasar por el shell: desde Node 20.12 lanzar `npm.cmd` directamente falla con EINVAL
  // en Windows y la suite reportaba «fallaron todos» sin haber ejecutado ninguno. El comando va
  // como cadena única porque combinar `shell` con un array de argumentos está deprecado (DEP0190).
  if (!/^[\w:-]+$/.test(name)) throw new Error(`Nombre de script no apto para el shell: ${name}`);
  const result = spawnSync(`npm run ${name}`, { stdio: "inherit", shell: true });
  if (result.status !== 0) failures.push(name);
}

if (failures.length) {
  console.error(`\nFallaron: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`\nSuite ${mode} completada: ${selected.length} comandos.`);
}
