import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workspaceEnv = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(workspaceEnv)) process.loadEnvFile(workspaceEnv);
// Absoluta: el proceso de Next corre con cwd en apps/studio y el worker en la raíz del repo.
process.env.STORAGE_ROOT ??= fileURLToPath(new URL("../../storage", import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@content-gen/domain"],
  // El proxy de auth pasa por TODAS las rutas (login obligatorio en toda la app), y Next
  // clona/buferiza el body de cada request para que el proxy pueda leerlo: por default
  // corta a los 10MB, lo que truncaba en silencio los assets subidos más grandes (imágenes,
  // exportaciones). Subido a un tamaño cómodo para eso sin ser ilimitado.
  experimental: { proxyClientMaxBodySize: 50 * 1024 * 1024 },
};

export default nextConfig;
