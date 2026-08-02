import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workspaceEnv = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(workspaceEnv)) process.loadEnvFile(workspaceEnv);
if (process.env.DATABASE_URL === "file:./storage/content-gen.sqlite") process.env.DATABASE_URL = `file:${fileURLToPath(new URL("../../storage/content-gen.sqlite", import.meta.url))}`;

const nextConfig: NextConfig = { transpilePackages: ["@content-gen/domain"] };

export default nextConfig;
