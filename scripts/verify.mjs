import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["audit", "--audit-level=high"]],
  ["npm", ["run", "check:secrets"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
];

for (const [command, args] of commands) {
  console.log(`\n=== ${command} ${args.join(" ")} ===`);
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nVerificación completa: seguridad, secretos, tipos, lint, pruebas y build aprobados.");
