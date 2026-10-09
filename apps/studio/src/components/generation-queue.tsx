"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { fullDate, relativeTime, tones } from "@/components/automations/execution-details";
import type { GenerationRequest, GenerationStatus } from "@/lib/generation-queue";
import { cn } from "@/lib/utils";

const labels: Record<GenerationStatus, string> = { pendiente: "Espera aprobación", aprobada: "Aprobada, en espera", en_curso: "Generando", completada: "Completada", fallida: "Falló", rechazada: "Rechazada" };
const statusTone: Record<GenerationStatus, (typeof tones)[keyof typeof tones]> = { pendiente: tones.violet, aprobada: tones.sky, en_curso: tones.amber, completada: tones.emerald, fallida: tones.red, rechazada: tones.zinc };
const ACTIVE = new Set<GenerationStatus>(["pendiente", "aprobada", "en_curso"]);

/** Lo que pidió el agente, en una línea: el tema si lo hay, si no los argumentos. */
function summary(args: Record<string, unknown>) {
  const topic = args.topic ?? args.url ?? args.prompt ?? args.focus;
  return typeof topic === "string" ? topic : JSON.stringify(args);
}

export function GenerationQueue() {
  const [requests, setRequests] = useState<GenerationRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/generation-queue", { cache: "no-store" });
    if (response.ok) setRequests(await response.json());
  }, []);

  // Se refresca solo mientras hay algo vivo: así se ve el paso en curso sin recargar.
  const live = requests?.some((request) => ACTIVE.has(request.status)) ?? true;
  useEffect(() => {
    void load();
    if (!live) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 3000);
    return () => clearInterval(timer);
  }, [load, live]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const response = await fetch(`/api/generation-queue/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setNotice(response.ok ? noticeOk(action === "approve" ? "Aprobada: entra a generarse en su turno." : "Rechazada; no se gastó nada.") : noticeError(payload?.error ?? "No se pudo decidir."));
      await load();
    } finally { setBusy(null); }
  }

  if (!requests) return <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />Cargando la cola…</p>;
  const running = requests.find((request) => request.status === "en_curso");
  return (
    <div className="space-y-4">
      <Notice notice={notice} onDismiss={() => setNotice(null)} />
      <p role="status" className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", running ? cn(tones.amber.border, tones.amber.soft) : "border-border bg-muted/30")}>
        {running ? <><Loader2 aria-hidden className={cn("size-4 animate-spin", tones.amber.text)} />Generando ahora: <strong className="truncate">{running.tool}</strong> · {summary(running.args)}. Lo demás espera su turno.</> : "Nada generándose ahora."}
      </p>
      {!requests.length ? <p className="text-sm text-muted-foreground">Aún no hay solicitudes. Cuando un agente pida por MCP algo que gasta, aparece aquí para aprobarlo.</p> : null}
      <ul className="space-y-3">
        {requests.map((request) => {
          const tone = statusTone[request.status];
          const result = request.result as { abrir?: unknown; contentItemId?: unknown } | null;
          return (
            <li key={request.id} className={cn("rounded-lg border p-3", ACTIVE.has(request.status) ? tone.border : "border-border")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", tone.soft, tone.border, tone.text)}>
                      {request.status === "en_curso" ? <Loader2 aria-hidden className="size-3 animate-spin" /> : <span aria-hidden className={cn("size-2 rounded-full", tone.dot)} />}{labels[request.status]}
                    </span>
                    <code className="text-xs">{request.tool}</code>
                  </p>
                  <p className="mt-1 break-words text-sm">{summary(request.args)}</p>
                  <p className="text-xs text-muted-foreground"><time dateTime={request.createdAt} title={fullDate(request.createdAt)}>Pedida {relativeTime(request.createdAt)}</time></p>
                </div>
                {request.status === "pendiente" ? (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === request.id} onClick={() => decide(request.id, "approve")}><Check aria-hidden />Aprobar</Button>
                    <Button size="sm" variant="outline" disabled={busy === request.id} onClick={() => decide(request.id, "reject")}><X aria-hidden />Rechazar</Button>
                  </div>
                ) : null}
              </div>
              {request.error ? <p role="alert" className="mt-2 break-words text-xs text-destructive">{request.error}</p> : null}
              {typeof result?.abrir === "string" ? <Link className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline" href={result.abrir}>Abrir lo generado</Link> : null}
              <details className="mt-2 text-xs" open={request.status === "en_curso"}>
                <summary className="cursor-pointer text-muted-foreground">Registro ({request.log.length}) y argumentos</summary>
                <ol className="mt-1 space-y-0.5 font-mono">
                  {request.log.map((line, index) => <li key={index}><time className="text-muted-foreground" dateTime={line.at}>{new Date(line.at).toLocaleTimeString("es")}</time> {line.message}</li>)}
                </ol>
                <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2">{JSON.stringify(request.args, null, 2)}</pre>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
