import type { AutomationExecution } from "@/lib/automation-execution";
import type { BudgetStatus } from "./budget-panel";
export type StepAutomation = { id: string; kind: "carousel" | "radar"; name: string; active: boolean; frequency?: string; time?: string; scan?: { verticals: string[]; focus?: string | null }; topics?: string[]; usedTopics?: string[]; radarVertical?: string | null; kindLabel?: string; slides?: number; ruleLabel?: string };
export type AutomationStep = { id: string; title: string; detail: string; state: "configured" | "pending" | "running" | "completed" | "failed" | "blocked"; cost?: number | null; unknown?: number };
/** Pasos de la automatización en orden; con ejecución, cada paso refleja lo que realmente ocurrió. */
export function buildAutomationSteps(automation: StepAutomation, execution: AutomationExecution | null, budget: BudgetStatus | null): AutomationStep[] {
  const radar = automation.kind === "radar";
  const operations = execution?.operations ?? [];
  const state = (matches: AutomationExecution["operations"]): AutomationStep["state"] => !execution ? "configured" : matches.some(o=>o.status==="running") ? "running" : matches.some(o=>o.status==="failed") ? "failed" : matches.length ? "completed" : "pending";
  const spent = (matches: AutomationExecution["operations"]) => matches.reduce((sum,o)=>sum+(o.amount??0),0);
  const sourceOps = radar ? operations.filter(o=>o.operation==="radar-research") : [];
  const generateOps = radar ? operations.filter(o=>o.operation!=="radar-research") : operations;
  const source = radar ? [automation.scan?.verticals.join(", "), automation.scan?.focus].filter(Boolean).join(" · ") : `${(automation.topics??[]).filter(t=>!(automation.usedTopics??[]).includes(t)).length} temas pendientes${automation.radarVertical ? ` · Radar: ${automation.radarVertical}` : ""}`;
  const budgets = budget ? Object.entries(budget.settings.limits).filter(([,v])=>v!==null).map(([k,v])=>`${{day:"día",week:"semana",month:"mes"}[k]}: ${v} ${budget.currency}`).join(" · ") || "Sin límites configurados" : "No se pudo consultar el presupuesto";
  const summary = execution?.result.summary as { kept?: number } | undefined;
  const output = execution?.result.contentItemId ? "Borrador guardado en biblioteca y cronograma" : summary ? `${summary.kept ?? 0} temas guardados en Radar` : "Pendiente de ejecución";
  return [
    { id:"trigger",title:"Programación",detail:radar?`${{day:"Diaria",week:"Semanal",month:"Mensual"}[automation.frequency??"day"]} · ${automation.time} UTC` : automation.ruleLabel??"Pauta del cronograma",state:execution?"completed":"configured" },
    { id:"budget",title:"Presupuesto",detail:execution?.status==="blocked"?execution.error??"Límite alcanzado":execution && !execution.automatic?"Ejecución manual · el presupuesto no la bloquea":`Límites actuales: ${budgets}`,state:execution?.status==="blocked"?"blocked":execution?.automatic?"completed":"configured" },
    { id:"source",title:radar?"Búsqueda web":"Temas",detail:source||"Sin temas",state:radar?state(sourceOps):execution?.status==="blocked"?"pending":execution?.status==="completed"?"completed":!execution?"configured":"pending",...(sourceOps.length?{cost:spent(sourceOps),unknown:sourceOps.filter(o=>o.amount===null).length}:{}) },
    { id:"generate",title:radar?"Filtrar y estructurar":"Generar carrusel",detail:radar?"Contrastar fuentes, deduplicar y ordenar temas":`${automation.kindLabel} · ${automation.slides} slides`,state:state(generateOps),...(generateOps.length?{cost:spent(generateOps),unknown:generateOps.filter(o=>o.amount===null).length}:{}) },
    { id:"output",title:radar?"Radar":"Borrador para revisar",detail:execution?output:radar?"Temas nuevos, sin crear publicaciones":"Biblioteca y cronograma · nunca publica solo",state:execution?.status==="completed"?"completed":!execution?"configured":"pending" },
  ];
}
