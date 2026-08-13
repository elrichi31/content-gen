import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { Cpu, Database, HardDrive, Server, ShieldCheck, Workflow } from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mediaRoot, withDatabase } from "@/lib/db";
import { renderWorkerAutostartEnabled } from "@/lib/render-worker";

export const dynamic = "force-dynamic";

type Tone = "ok" | "warn" | "error";
type Check = {
  label: string;
  icon: typeof Cpu;
  status: string;
  tone: Tone;
  detail: string;
};

const toneClass: Record<Tone, string> = {
  ok: "border-transparent bg-primary/15 text-primary",
  warn: "border-transparent bg-orange-500/15 text-orange-300",
  error: "border-transparent bg-destructive/15 text-destructive",
};

async function databaseCheck(): Promise<Check> {
  try {
    const result = await withDatabase((database) => ({
      integrity: database.prepare("PRAGMA integrity_check").get() as { integrity_check?: string },
      tables: database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { total?: number },
    }));
    const healthy = result.integrity.integrity_check === "ok";
    return {
      label: "Base de datos",
      icon: Database,
      status: healthy ? "Operativa" : "Revisar",
      tone: healthy ? "ok" : "error",
      detail: healthy ? `SQLite respondió correctamente · ${result.tables.total ?? 0} tablas.` : "SQLite respondió, pero falló la comprobación de integridad.",
    };
  } catch {
    return { label: "Base de datos", icon: Database, status: "No disponible", tone: "error", detail: "Inicialízala con npm run db:init." };
  }
}

async function storageCheck(): Promise<Check> {
  try {
    await access(mediaRoot, constants.R_OK | constants.W_OK);
    const metadata = await stat(mediaRoot);
    if (!metadata.isDirectory()) throw new Error("not-directory");
    return { label: "Almacenamiento", icon: HardDrive, status: "Disponible", tone: "ok", detail: "La carpeta local de medios admite lectura y escritura." };
  } catch {
    return { label: "Almacenamiento", icon: HardDrive, status: "No disponible", tone: "error", detail: "La carpeta de medios no existe o no tiene permisos de escritura." };
  }
}

function integrationCheck(): Check {
  const provider = process.env.CONTENT_GEN_AI_PROVIDER ?? "none";
  const enabled = [
    provider === "openai" && process.env.OPENAI_API_KEY ? "OpenAI" : null,
    process.env.UNSPLASH_ACCESS_KEY ? "Unsplash" : null,
    process.env.ELEVENLABS_API_KEY ? "ElevenLabs" : null,
  ].filter(Boolean);
  return {
    label: "Integraciones IA",
    icon: Cpu,
    status: enabled.length ? `${enabled.length} configurada${enabled.length === 1 ? "" : "s"}` : "Modo local",
    tone: enabled.length ? "ok" : "warn",
    detail: enabled.length ? `${enabled.join(", ")} listas; ninguna clave se muestra aquí.` : "Configura .env.local para generación, imágenes y voz externas.",
  };
}

export default async function DiagnosticsPage() {
  const [database, storage] = await Promise.all([databaseCheck(), storageCheck()]);
  const checks: Check[] = [
    integrationCheck(),
    database,
    storage,
    {
      label: "Worker de render",
      icon: Server,
      status: renderWorkerAutostartEnabled() ? "Automático" : "Manual",
      tone: renderWorkerAutostartEnabled() ? "ok" : "warn",
      detail: renderWorkerAutostartEnabled() ? "Los renders encolados arrancan el worker automáticamente." : "Procesa la cola con npm run worker:once.",
    },
    { label: "Runtime", icon: Workflow, status: process.version, tone: "ok", detail: "Versión activa de Node.js en el servidor de Studio." },
    { label: "Seguridad", icon: ShieldCheck, status: "Verificada", tone: "ok", detail: "Ejecuta npm run verify para repetir auditoría, tipos, lint, pruebas y build." },
  ];

  return (
    <PageShell>
      <PageHeading
        eyebrow="Diagnóstico local"
        title="Estado del sistema"
        description="Comprobaciones del entorno activo; nunca expone claves, rutas privadas ni valores sensibles."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <Card key={check.label} className="overflow-hidden">
            <CardContent className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/70">
                <check.icon className="h-5 w-5 text-foreground" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-foreground">{check.label}</h2>
                  <Badge className={toneClass[check.tone]}>{check.status}</Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{check.detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
