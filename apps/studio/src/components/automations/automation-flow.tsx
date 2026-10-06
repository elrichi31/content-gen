"use client";
import { useMemo } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import type { AutomationExecution } from "@/lib/automation-execution";
import { costMoney, type BudgetStatus } from "./budget-panel";
import { buildAutomationFlow, type FlowAutomation, type FlowNode } from "./flow-model";
import { cn } from "@/lib/utils";
const states={configured:"Configurado",pending:"Sin ejecutar",running:"En curso",completed:"Completado",failed:"Falló",blocked:"Bloqueado"};
function StepNode({ data }: NodeProps<FlowNode>) {
  return <div className={cn("h-full w-full rounded-lg border bg-card px-3 py-3 text-foreground", data.state==="failed"||data.state==="blocked"?"border-destructive":"border-border")}>
    <Handle type="target" position={Position.Left} />
    <p className="text-sm font-semibold">{data.title}</p>
    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{data.detail}</p>
    <p className={cn("mt-2 text-xs",data.state==="completed"?"text-primary":data.state==="failed"||data.state==="blocked"?"text-destructive":"text-muted-foreground")}>{states[data.state]}{data.cost!==undefined?` · ${costMoney(data.cost??0)}${data.unknown?" + costo pendiente":""}`:""}</p>
    <Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes={step:StepNode};
export function AutomationFlow({ automation, execution, budget }: { automation: FlowAutomation; execution: AutomationExecution | null; budget: BudgetStatus | null }) {
  const graph=useMemo(()=>buildAutomationFlow(automation,execution,budget),[automation,execution,budget]);
  return <div className="automation-flow h-full min-h-[240px] w-full" aria-label={`Flujo de ${automation.name}`}>
    <ReactFlow key={automation.id} nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} fitView fitViewOptions={{padding:0.12}} minZoom={0.3} maxZoom={1.5} preventScrolling ariaLabelConfig={{"controls.zoomIn.ariaLabel":"Acercar","controls.zoomOut.ariaLabel":"Alejar","controls.fitView.ariaLabel":"Ajustar flujo"}}>
      <Background gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
