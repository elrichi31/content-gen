"use client";
import Link from "next/link";
import type { AutomationExecution } from "@/lib/automation-execution";
import { costMoney } from "./budget-panel";
import { cn } from "@/lib/utils";
export const executionLabels={running:"En curso",completed:"Completada",idle:"Sin trabajo pendiente",failed:"Falló",blocked:"Bloqueada por presupuesto"};
export function ExecutionDetails({ execution }: { execution: AutomationExecution | null }) {
  if(!execution)return <p className="text-sm text-muted-foreground">Aún no hay ejecuciones registradas. Aquí aparecerán el resultado y las operaciones realizadas.</p>;
  const summary=execution.result.summary as {found?:number;kept?:number;repeated?:number;rejected?:number;failedVerticals?:string[];searches?:{performed?:number}}|undefined;
  const contentId=typeof execution.result.contentItemId==="string"?execution.result.contentItemId:null;
  const message=typeof execution.result.message==="string"?execution.result.message:null;
  return <div className="space-y-4">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
      <div className="col-span-2"><dt className="text-muted-foreground">Origen</dt><dd className="mt-1">{execution.automatic ? "Programada" : "Manual"}</dd></div>
      <div><dt className="text-muted-foreground">Resultado</dt><dd className={cn("mt-1 font-medium",execution.status==="failed"||execution.status==="blocked"?"text-destructive":"text-foreground")}>{executionLabels[execution.status]}</dd></div>
      <div><dt className="text-muted-foreground">Duración</dt><dd className="mt-1 tabular-nums">{execution.durationMs===null?"En curso o interrumpida":`${(execution.durationMs/1000).toFixed(1)} s`}</dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">Inicio</dt><dd className="mt-1 tabular-nums"><time dateTime={execution.startedAt}>{new Date(execution.startedAt).toLocaleString("es")}</time></dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">Costo registrado · USD</dt><dd className="mt-1 tabular-nums">{costMoney(execution.amount)}{execution.unknown?<span className="block text-muted-foreground">Costo incompleto: {execution.unknown} operaciones sin importe confirmado.</span>:execution.operations.length===0?<span className="block text-muted-foreground">No se registraron llamadas de IA.</span>:null}</dd></div>
    </dl>
    {execution.error?<p className="text-sm text-destructive">{execution.error}</p>:null}
    {message?<p className="text-sm leading-relaxed">{message}</p>:null}
    {summary?<p className="text-sm leading-relaxed">{summary.found??0} encontrados · {summary.kept??0} guardados · {summary.repeated??0} repetidos · {summary.rejected??0} rechazados{summary.searches?.performed!==undefined?` · ${summary.searches.performed} búsquedas`:""}</p>:null}
    {summary?.failedVerticals?.length?<p className="text-xs text-destructive">Verticales con error: {summary.failedVerticals.join(" · ")}</p>:null}
    {contentId?<Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/carousel?id=${encodeURIComponent(contentId)}`}>Abrir borrador</Link>:null}
    {execution.kind==="radar"&&summary?<Link className="block text-sm font-medium text-primary underline-offset-4 hover:underline" href="/radar">Ver temas en Radar</Link>:null}
    <div><h3 className="mb-2 text-sm font-medium">Operaciones realizadas</h3>{execution.operations.length?<ul className="divide-y divide-border">{execution.operations.map(o=><li key={o.id} className="py-2 text-xs"><p className="break-words font-medium">{o.operation}</p><p className="mt-1 text-muted-foreground">{o.provider} · {o.model??"Sin modelo"}</p><p className="mt-1 tabular-nums">{o.status==="completed"?"Completada":o.status==="failed"?"Falló":"En curso"} · {o.amount===null?"Importe no confirmado":costMoney(o.amount)}</p></li>)}</ul>:<p className="text-xs text-muted-foreground">Sin operaciones de IA registradas.</p>}</div>
  </div>;
}
