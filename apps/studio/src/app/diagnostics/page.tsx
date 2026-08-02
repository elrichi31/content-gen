import { Cpu, Database, HardDrive, Server } from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Tone = "ok" | "warn" | "pending";

const toneClass: Record<Tone, string> = {
  ok: "bg-primary/15 text-primary border-transparent",
  warn: "bg-orange-500/15 text-orange-400 border-transparent",
  pending: "bg-muted text-muted-foreground border-transparent",
};

const checks = [
  {
    label: "Configuración IA",
    icon: Cpu,
    status: process.env.CONTENT_GEN_AI_PROVIDER === "openai" ? "Configurada" : "Local",
    tone: (process.env.CONTENT_GEN_AI_PROVIDER === "openai" ? "ok" : "warn") as Tone,
    detail:
      process.env.CONTENT_GEN_AI_PROVIDER === "openai"
        ? "Proveedor OpenAI seleccionado; las claves no se muestran aquí."
        : "Sin proveedor externo activo.",
  },
  {
    label: "Base de datos",
    icon: Database,
    status: "Pendiente",
    tone: "pending" as Tone,
    detail: "SQLite se inicializará con el esquema de la Fase 02.",
  },
  {
    label: "Almacenamiento",
    icon: HardDrive,
    status: "Pendiente",
    tone: "pending" as Tone,
    detail: "El directorio de medios se creará junto con la biblioteca local.",
  },
  {
    label: "Worker de render",
    icon: Server,
    status: "Contrato verificado",
    tone: "ok" as Tone,
    detail: "El worker valida jobs de prueba; el render persistente llegará en F06.",
  },
];

export default function DiagnosticsPage() {
  return (
    <PageShell>
      <PageHeading
        eyebrow="Diagnóstico local"
        title="Estado del sistema"
        description="Vista local de configuración; nunca expone claves ni valores sensibles."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {checks.map((check) => (
          <Card key={check.label}>
            <CardContent className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                <check.icon className="h-5 w-5 text-foreground" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-foreground">{check.label}</h2>
                  <Badge className={toneClass[check.tone]}>{check.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{check.detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
