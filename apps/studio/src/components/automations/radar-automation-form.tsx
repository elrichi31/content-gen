"use client";
import { useState } from "react";
import type { RadarAutomation } from "@/lib/radar-automation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
const weekdays=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
export function RadarAutomationForm({ editing, verticals, onSubmit, onCancel }: { editing: RadarAutomation | null; verticals: string[]; onSubmit: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [name,setName]=useState(editing?.name??"");
  const [active,setActive]=useState(editing?.active??false);
  const [frequency,setFrequency]=useState(editing?.frequency??"day");
  const [time,setTime]=useState(editing?.time??"12:00");
  const [weekday,setWeekday]=useState(editing?.weekday??1);
  const [monthDay,setMonthDay]=useState(editing?.monthDay??1);
  const [chosen,setChosen]=useState(editing?.scan.verticals??[]);
  const [focus,setFocus]=useState(editing?.scan.focus??"");
  const [maxTopics,setMaxTopics]=useState(editing?.scan.maxTopics??10);
  const [maxSearches,setMaxSearches]=useState(editing?.scan.maxSearches??3);
  const [windowDays,setWindowDays]=useState(editing?.scan.windowDays??7);
  const [minSources,setMinSources]=useState(editing?.scan.minSources??2);
  const [searchContextSize,setSearchContextSize]=useState(editing?.scan.searchContextSize??"low");
  const [verifySources,setVerifySources]=useState(editing?.scan.verifySources??true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const missing=!name.trim()?"Ponle un nombre.":!chosen.length?"Elige al menos un vertical.":focus.trim()&&chosen.length>1?"Un enfoque concreto requiere un solo vertical.":"";
  async function submit(e:React.FormEvent){e.preventDefault();if(missing){setError(missing);return;}setSaving(true);setError("");try{await onSubmit({name,active,frequency,time,weekday,monthDay,scan:{...editing?.scan,verticals:chosen,focus:focus.trim()||null,maxTopics,maxSearches,windowDays,minSources,searchContextSize,verifySources}});}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}finally{setSaving(false);}}
  return <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
    <div className="shrink-0 border-b border-border p-5 pr-12"><SheetTitle>{editing?"Editar búsqueda":"Automatizar radar"}</SheetTitle><p className="mt-1 text-sm text-muted-foreground">Busca y guarda temas. No genera piezas ni publica.</p></div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
      <div className="space-y-1.5"><Label htmlFor="radar-auto-name">Nombre</Label><Input id="radar-auto-name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} required /></div>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Verticales</legend>{[...new Set([...verticals,...chosen])].map(v=><label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={chosen.includes(v)} onChange={e=>setChosen(e.target.checked?[...chosen,v]:chosen.filter(x=>x!==v))} />{v}</label>)}{!verticals.length?<p className="text-xs text-muted-foreground">Añade verticales a la lista de vigilancia del Radar primero.</p>:null}</fieldset>
      <div className="space-y-1.5"><Label htmlFor="radar-auto-focus">Enfoque opcional</Label><Input id="radar-auto-focus" value={focus} onChange={e=>setFocus(e.target.value)} maxLength={300} placeholder="Ej. agentes de IA para atención al cliente" /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Frecuencia</Label><Select value={frequency} onValueChange={v=>setFrequency(v as typeof frequency)}><SelectTrigger aria-label="Frecuencia"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Diaria</SelectItem><SelectItem value="week">Semanal</SelectItem><SelectItem value="month">Mensual</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="radar-auto-time">Hora UTC</Label><Input id="radar-auto-time" type="time" value={time} onChange={e=>setTime(e.target.value)} required /></div></div>
      {frequency==="week"?<div className="space-y-1.5"><Label>Día de la semana</Label><Select value={String(weekday)} onValueChange={v=>setWeekday(Number(v))}><SelectTrigger aria-label="Día de la semana"><SelectValue /></SelectTrigger><SelectContent>{weekdays.map((v,i)=><SelectItem key={v} value={String(i)}>{v}</SelectItem>)}</SelectContent></Select></div>:null}
      {frequency==="month"?<div className="space-y-1.5"><Label htmlFor="radar-auto-day">Día del mes</Label><Input id="radar-auto-day" type="number" min={1} max={31} value={monthDay} onChange={e=>setMonthDay(Number(e.target.value))} /><p className="text-xs text-muted-foreground">Si no existe ese día, usa el último del mes.</p></div>:null}
      <p className="text-xs text-muted-foreground">Horarios UTC. El servidor revisa cada 15 minutos; debe permanecer encendido para ejecutar las búsquedas.</p>
      <div className="grid grid-cols-2 gap-3">{([{id:"window",label:"Últimos días",value:windowDays,set:setWindowDays,max:90},{id:"topics",label:"Máximo de temas",value:maxTopics,set:setMaxTopics,max:30},{id:"searches",label:"Búsquedas objetivo",value:maxSearches,set:setMaxSearches,max:30},{id:"sources",label:"Fuentes mínimas",value:minSources,set:setMinSources,max:5}]).map(f=><div key={f.id} className="space-y-1.5"><Label htmlFor={`radar-auto-${f.id}`}>{f.label}</Label><Input id={`radar-auto-${f.id}`} type="number" min={1} max={f.max} value={f.value} onChange={e=>f.set(Number(e.target.value))} required /></div>)}</div>
      <div className="space-y-1.5"><Label>Contexto de búsqueda</Label><Select value={searchContextSize} onValueChange={v=>setSearchContextSize(v as typeof searchContextSize)}><SelectTrigger aria-label="Contexto de búsqueda"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Bajo · menor consumo</SelectItem><SelectItem value="medium">Medio</SelectItem><SelectItem value="high">Alto</SelectItem></SelectContent></Select></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={verifySources} onChange={e=>setVerifySources(e.target.checked)} />Verificar fuentes contra la investigación</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={active} onChange={e=>setActive(e.target.checked)} />Activar búsqueda automática</label>
      <p className="text-xs leading-relaxed text-muted-foreground">Consume créditos de IA y búsqueda web. El objetivo de búsquedas no es un tope estricto del proveedor. Las nuevas reglas quedan pausadas salvo que las actives.</p>
      {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    </div>
    <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4"><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?"Guardando…":"Guardar búsqueda"}</Button></div>
  </form>;
}
