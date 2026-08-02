"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, PencilLine } from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Detail = {
  id: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  campaign: { id: string; name: string } | null;
  document: { data?: unknown };
  exports: { id: string; format: string; createdAt: string; assetId: string; filename: string; sizeBytes: number }[];
  generationRuns: { id: string; provider: string; status: string; createdAt: string; operation?: string; model?: string | null; durationMs?: number | null }[];
};

const typeLabel: Record<string, string> = { carousel: "Carrusel", ad: "Anuncio", video: "Video" };
const editorPath: Record<string, string> = { carousel: "/carousel", ad: "/ads", video: "/video" };
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;

// El título vive dentro del documento y cambia por formato: carrusel y video usan `title`,
// el anuncio guarda su titular en `headline`.
function documentTitle(detail: Detail) {
  const data = detail.document?.data as { title?: unknown; headline?: unknown } | undefined;
  if (typeof data?.title === "string" && data.title.trim()) return data.title;
  if (typeof data?.headline === "string" && data.headline.trim()) return data.headline;
  return typeLabel[detail.type] ?? detail.type;
}

export default function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then(async ({ id }) => {
      const response = await fetch(`/api/content-items/${id}`);
      if (!response.ok) return setError("Contenido no encontrado.");
      setDetail(await response.json());
    });
  }, [params]);

  if (error) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">{error}</p>
        <Button asChild variant="outline" className="mt-4"><Link href="/library"><ArrowLeft className="h-4 w-4" /> Volver a biblioteca</Link></Button>
      </PageShell>
    );
  }

  if (!detail) {
    return <PageShell><p className="text-sm text-muted-foreground">Cargando contenido…</p></PageShell>;
  }

  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="mb-4 text-muted-foreground">
        <Link href="/library"><ArrowLeft className="h-4 w-4" /> Biblioteca</Link>
      </Button>
      <PageHeading
        eyebrow={`${typeLabel[detail.type] ?? detail.type}${detail.campaign ? ` · ${detail.campaign.name}` : ""}`}
        title={documentTitle(detail)}
        description={`Creado ${new Date(detail.createdAt).toLocaleString("es-EC")} · actualizado ${new Date(detail.updatedAt).toLocaleString("es-EC")}`}
        actions={
          <div className="flex items-center gap-2">
            {detail.archivedAt ? <Badge variant="secondary">Archivado</Badge> : <Badge className="bg-primary/15 text-primary border-transparent">Activo</Badge>}
            {!detail.archivedAt && editorPath[detail.type] ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`${editorPath[detail.type]}?id=${detail.id}`}><PencilLine className="h-4 w-4" /> Abrir en el editor</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Exportaciones</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {detail.exports.map((exported) => (
                <div key={exported.id} className="flex items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{exported.filename}</p>
                    <p className="text-xs text-muted-foreground">{exported.format.toUpperCase()} · {megabytes(exported.sizeBytes)} · {new Date(exported.createdAt).toLocaleString("es-EC")}</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/assets/${exported.assetId}`} download={exported.filename}><Download className="h-4 w-4" /> Descargar</a>
                  </Button>
                </div>
              ))}
              {!detail.exports.length ? <p className="text-sm text-muted-foreground">Todavía no hay exportaciones de este contenido.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Documento</CardTitle></CardHeader>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Ver JSON completo</summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-background/60 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                  {JSON.stringify(detail.document, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle>Últimas generaciones</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {detail.generationRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between gap-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{run.operation ?? run.provider}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {run.model ? `${run.model} · ` : ""}{new Date(run.createdAt).toLocaleString("es-EC")}
                    {typeof run.durationMs === "number" ? ` · ${(run.durationMs / 1000).toFixed(1)} s` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{run.status}</Badge>
              </div>
            ))}
            {!detail.generationRuns.length ? <p className="text-sm text-muted-foreground">Aún no hay generaciones para este contenido.</p> : null}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
