"use client";
import Link from "next/link";
import { AlertTriangle, Ban, CalendarClock, CheckCircle2, Circle, CircleDollarSign, Clock, Hand, Loader2, MinusCircle, Sparkles, Timer, XCircle } from "lucide-react";
import type { AutomationExecution } from "@/lib/automation-execution";
import { costMoney } from "./budget-panel";
import type { AutomationStep } from "./automation-steps";
import { cn } from "@/lib/utils";
export const executionLabels={running:"En curso",completed:"Completada",idle:"Sin trabajo pendiente",failed:"Falló",blocked:"Bloqueada por presupuesto"};
type Tone = { dot: string; text: string; soft: string; border: string };
/** Un color por estado: verde bien, azul sin trabajo, ámbar en curso, rojo error, naranja bloqueo. */
export const tones = {
  emerald: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-500/10", border: "border-emerald-500/40" },
  sky: { dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", soft: "bg-sky-500/10", border: "border-sky-500/40" },
  amber: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", soft: "bg-amber-500/10", border: "border-amber-500/40" },
  red: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400", soft: "bg-red-500/10", border: "border-red-500/40" },
  orange: { dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", soft: "bg-orange-500/10", border: "border-orange-500/40" },
  zinc: { dot: "bg-zinc-500", text: "text-zinc-600 dark:text-zinc-400", soft: "bg-zinc-500/10", border: "border-zinc-500/40" },
  violet: { dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", soft: "bg-violet-500/10", border: "border-violet-500/40" },
} satisfies Record<string, Tone>;
export const runTone: Record<AutomationExecution["status"], Tone> = { completed: tones.emerald, idle: tones.sky, running: tones.amber, failed: tones.red, blocked: tones.orange };
export function StatusDot({ status, className }: { status: AutomationExecution["status"]; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", runTone[status].dot, status === "running" && "animate-pulse", className)} />;
}
export function RunStatusBadge({ status }: { status: AutomationExecution["status"] }) {
  const t = runTone[status];
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-4", t.soft, t.border, t.text)}>{status === "running" ? <Loader2 className="size-3 animate-spin" /> : <StatusDot status={status} />}{executionLabels[status]}</span>;
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
const stepTones = { configured: tones.sky, pending: tones.zinc, running: tones.amber, completed: tones.emerald, failed: tones.red, blocked: tones.orange };
export function AutomationSteps({ steps }: { steps: AutomationStep[] }) {
  return <ol>{steps.map((step, index) => {
    const Icon = stepIcons[step.state];
    const t = stepTones[step.state];
    return <li key={step.id} className="relative flex gap-2.5 pb-3 last:pb-0">
      {index < steps.length - 1 ? <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px bg-border" /> : null}
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", t.soft)}><Icon aria-hidden className={cn("size-3.5", t.text, step.state === "running" && "animate-spin")} /></span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center justify-between gap-x-2 text-sm font-medium leading-6"><span>{step.title}</span><span className={cn("text-[11px] font-medium tabular-nums", t.text)}>{stepLabels[step.state]}{step.cost !== undefined ? ` · ${costMoney(step.cost ?? 0)}${step.unknown ? " + costo pendiente" : ""}` : ""}</span></p>
        <p className="break-words text-xs leading-snug text-muted-foreground">{step.detail}</p>
      </div>
    </li>;
  })}</ol>;
}
function Fact({ icon: Icon, label, color, children }: { icon: typeof Clock; label: string; color: Tone; children: React.ReactNode }) {
  return <div className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2"><span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", color.soft)}><Icon aria-hidden className={cn("size-3.5", color.text)} /></span><div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="text-xs font-medium tabular-nums">{children}</dd></div></div>;
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("es", { timeStyle: "medium" });
export function ExecutionDetails({ execution }: { execution: AutomationExecution | null }) {
  if(!execution)return <p className="text-sm text-muted-foreground">Aún no hay ejecuciones registradas. Aquí aparecerán el resultado y las operaciones realizadas.</p>;
  const summary=execution.result.summary as {found?:number;kept?:number;repeated?:number;rejected?:number;failedVerticals?:string[];searches?:{performed?:number}}|undefined;
  const contentId=typeof execution.result.contentItemId==="string"?execution.result.contentItemId:null;
  const message=typeof execution.result.message==="string"?execution.result.message:null;
  const t=runTone[execution.status];
  return <div className="space-y-3">
    {execution.error?<div role="alert" className="flex gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /><div className="min-w-0"><p className="font-medium">{execution.status==="blocked"?"Bloqueada por presupuesto":"Error de la ejecución"}</p><p className="break-words text-xs">{execution.error}</p></div></div>:null}
    <dl className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
      <Fact icon={execution.automatic?CalendarClock:Hand} label="Origen" color={tones.violet}>{execution.automatic ? "Programada" : "Manual"}</Fact>
      <Fact icon={Timer} label="Duración" color={tones.sky}>{duration(execution.durationMs)}</Fact>
      <Fact icon={Clock} label="Inicio → Fin" color={t}><time dateTime={execution.startedAt}>{time(execution.startedAt)}</time> → {execution.completedAt?<time dateTime={execution.completedAt}>{time(execution.completedAt)}</time>:"sin terminar"}<span className="block text-[11px] font-normal text-muted-foreground">{fullDate(execution.startedAt)}</span></Fact>
      <Fact icon={CircleDollarSign} label="Costo registrado · USD" color={tones.amber}>{costMoney(execution.amount)}{execution.unknown?<span className="block text-[11px] font-normal text-muted-foreground">Costo incompleto: {execution.unknown} operaciones sin importe confirmado.</span>:execution.operations.length===0?<span className="block text-[11px] font-normal text-muted-foreground">No se registraron llamadas de IA.</span>:null}</Fact>
    </dl>
    {message||summary||contentId?<div className={cn("space-y-1.5 rounded-md border px-3 py-2",tones.sky.border,tones.sky.soft)}><p className={cn("flex items-center gap-1.5 text-xs font-semibold",tones.sky.text)}><Sparkles aria-hidden className="size-3.5" />Qué produjo</p>
      {message?<p className="text-sm leading-snug">{message}</p>:null}
      {summary?<p className="flex flex-wrap gap-1.5 text-xs tabular-nums"><span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-600 dark:text-sky-400">{summary.found??0} encontrados</span><span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">{summary.kept??0} guardados</span><span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-muted-foreground">{summary.repeated??0} repetidos</span><span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400">{summary.rejected??0} rechazados</span>{summary.searches?.performed!==undefined?<span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-600 dark:text-violet-400">{summary.searches.performed} búsquedas</span>:null}</p>:null}
      {summary?.failedVerticals?.length?<p className="text-xs text-destructive">Verticales con error: {summary.failedVerticals.join(" · ")}</p>:null}
      {contentId||(execution.kind==="radar"&&summary)?<div className="flex flex-wrap gap-x-4 gap-y-1">
        {contentId?<Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/carousel?id=${encodeURIComponent(contentId)}`}>Abrir borrador</Link>:null}
        {execution.kind==="radar"&&summary?<Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/radar">Ver temas en Radar</Link>:null}
      </div>:null}
    </div>:null}
    <div><h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">Operaciones realizadas</h3>{execution.operations.length?<ul className="divide-y divide-border rounded-md border border-border">{execution.operations.map(o=><li key={o.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs"><div className="flex min-w-0 items-center gap-2"><span aria-hidden className={cn("size-2 shrink-0 rounded-full",o.status==="completed"?"bg-emerald-500":o.status==="failed"?"bg-red-500":"bg-amber-500")} /><div className="min-w-0"><p className="truncate font-medium">{o.operation}</p><p className="truncate text-[11px] text-muted-foreground">{o.provider} · {o.model??"Sin modelo"}</p></div></div><p className={cn("shrink-0 tabular-nums",o.status==="failed"?"text-destructive":"text-muted-foreground")}>{o.status==="completed"?"Completada":o.status==="failed"?"Falló":"En curso"} · {o.amount===null?"Importe no confirmado":costMoney(o.amount)}</p></li>)}</ul>:<p className="text-xs text-muted-foreground">Sin operaciones de IA registradas.</p>}</div>
  </div>;
}
