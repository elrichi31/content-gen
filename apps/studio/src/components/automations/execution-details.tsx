"use client";
import Link from "next/link";
import { AlertTriangle, Ban, CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { AutomationExecution } from "@/lib/automation-execution";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { costMoney } from "./budget-panel";
import type { AutomationStep } from "./automation-steps";
import { cn } from "@/lib/utils";
export const executionLabels={running:"En curso",completed:"Completada",idle:"Sin trabajo pendiente",failed:"Falló",blocked:"Bloqueada por presupuesto"};
const badgeVariants: Record<AutomationExecution["status"], BadgeVariant> = { running: "secondary", completed: "default", idle: "outline", failed: "destructive", blocked: "destructive" };
export function RunStatusBadge({ status }: { status: AutomationExecution["status"] }) {
  return <Badge variant={badgeVariants[status]}>{status === "running" ? <Loader2 className="size-3 animate-spin" /> : null}{executionLabels[status]}</Badge>;
}
const relative = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
/** «hace 3 horas», «ayer», «en 2 días»: lo primero que se busca al revisar una automatización. */
export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400], ["hour", 3_600], ["minute", 60]];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return seconds <= 0 ? "hace un momento" : "en un momento";
}
export const fullDate = (iso: string) => new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "medium" });
export function duration(ms: number | null) {
  if (ms === null) return "En curso o interrumpida";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}
const stepIcons = { configured: Circle, pending: MinusCircle, running: Loader2, completed: CheckCircle2, failed: XCircle, blocked: Ban };
const stepLabels = { configured: "Configurado", pending: "No se ejecutó", running: "En curso", completed: "Completado", failed: "Falló", blocked: "Bloqueado" };
export function AutomationSteps({ steps }: { steps: AutomationStep[] }) {
  return <ol className="space-y-0">{steps.map((step, index) => {
    const Icon = stepIcons[step.state];
    const bad = step.state === "failed" || step.state === "blocked";
    return <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
      {index < steps.length - 1 ? <span aria-hidden className="absolute left-[9px] top-6 h-[calc(100%-1.25rem)] w-px bg-border" /> : null}
      <Icon aria-hidden className={cn("mt-0.5 size-[19px] shrink-0", step.state === "running" && "animate-spin", step.state === "completed" ? "text-primary" : bad ? "text-destructive" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium"><span>{step.title}</span><span className={cn("text-xs font-normal tabular-nums", bad ? "text-destructive" : "text-muted-foreground")}>{stepLabels[step.state]}{step.cost !== undefined ? ` · ${costMoney(step.cost ?? 0)}${step.unknown ? " + costo pendiente" : ""}` : ""}</span></p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
      </div>
    </li>;
  })}</ol>;
}
export function ExecutionDetails({ execution }: { execution: AutomationExecution | null }) {
  if(!execution)return <p className="text-sm text-muted-foreground">Aún no hay ejecuciones registradas. Aquí aparecerán el resultado y las operaciones realizadas.</p>;
  const summary=execution.result.summary as {found?:number;kept?:number;repeated?:number;rejected?:number;failedVerticals?:string[];searches?:{performed?:number}}|undefined;
  const contentId=typeof execution.result.contentItemId==="string"?execution.result.contentItemId:null;
  const message=typeof execution.result.message==="string"?execution.result.message:null;
  return <div className="space-y-5">
    {execution.error?<div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /><div className="min-w-0"><p className="font-medium">{execution.status==="blocked"?"Bloqueada por presupuesto":"Error de la ejecución"}</p><p className="mt-1 break-words">{execution.error}</p></div></div>:null}
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
      <div><dt className="text-muted-foreground">Resultado</dt><dd className="mt-1"><RunStatusBadge status={execution.status} /></dd></div>
      <div><dt className="text-muted-foreground">Origen</dt><dd className="mt-1">{execution.automatic ? "Programada" : "Manual"}</dd></div>
      <div><dt className="text-muted-foreground">Duración</dt><dd className="mt-1 tabular-nums">{duration(execution.durationMs)}</dd></div>
      <div><dt className="text-muted-foreground">Inicio</dt><dd className="mt-1 tabular-nums"><time dateTime={execution.startedAt}>{fullDate(execution.startedAt)}</time><span className="block text-muted-foreground">{relativeTime(execution.startedAt)}</span></dd></div>
      <div><dt className="text-muted-foreground">Fin</dt><dd className="mt-1 tabular-nums">{execution.completedAt?<time dateTime={execution.completedAt}>{fullDate(execution.completedAt)}</time>:"Sin terminar"}</dd></div>
      <div><dt className="text-muted-foreground">Costo registrado · USD</dt><dd className="mt-1 tabular-nums">{costMoney(execution.amount)}{execution.unknown?<span className="block text-muted-foreground">Costo incompleto: {execution.unknown} operaciones sin importe confirmado.</span>:execution.operations.length===0?<span className="block text-muted-foreground">No se registraron llamadas de IA.</span>:null}</dd></div>
    </dl>
    {message||summary||contentId?<div className="space-y-2"><h3 className="text-sm font-medium">Qué produjo</h3>
      {message?<p className="text-sm leading-relaxed">{message}</p>:null}
      {summary?<p className="text-sm leading-relaxed">{summary.found??0} encontrados · {summary.kept??0} guardados · {summary.repeated??0} repetidos · {summary.rejected??0} rechazados{summary.searches?.performed!==undefined?` · ${summary.searches.performed} búsquedas`:""}</p>:null}
      {summary?.failedVerticals?.length?<p className="text-xs text-destructive">Verticales con error: {summary.failedVerticals.join(" · ")}</p>:null}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {contentId?<Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/carousel?id=${encodeURIComponent(contentId)}`}>Abrir borrador</Link>:null}
        {execution.kind==="radar"&&summary?<Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/radar">Ver temas en Radar</Link>:null}
      </div>
    </div>:null}
    <div><h3 className="mb-2 text-sm font-medium">Operaciones realizadas</h3>{execution.operations.length?<ul className="divide-y divide-border rounded-md border border-border">{execution.operations.map(o=><li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs"><div className="min-w-0"><p className="break-words font-medium">{o.operation}</p><p className="mt-0.5 text-muted-foreground">{o.provider} · {o.model??"Sin modelo"}</p></div><p className={cn("tabular-nums",o.status==="failed"?"text-destructive":"text-muted-foreground")}>{o.status==="completed"?"Completada":o.status==="failed"?"Falló":"En curso"} · {o.amount===null?"Importe no confirmado":costMoney(o.amount)}</p></li>)}</ul>:<p className="text-xs text-muted-foreground">Sin operaciones de IA registradas.</p>}</div>
  </div>;
}
