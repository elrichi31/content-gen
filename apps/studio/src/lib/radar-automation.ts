import { randomUUID } from "node:crypto";
import { z } from "zod";
import { radarScanInputSchema } from "./radar-research.ts";
import { executeAutomation, listAutomationRuns, type AutomationExecution } from "./automation-execution.ts";
import { withDatabase } from "./db.ts";

export const radarAutomationInputSchema = z.object({
  name: z.string().trim().min(1).max(120), active: z.boolean().default(false),
  frequency: z.enum(["day", "week", "month"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6).default(1),
  monthDay: z.number().int().min(1).max(31).default(1),
  scan: radarScanInputSchema.omit({ automatic: true }).refine((s) => s.verticals.length > 0 && s.verticals.length <= 20, "Elige al menos un vertical (máximo 20)."),
});
export type RadarAutomationInput = z.infer<typeof radarAutomationInputSchema>;
export type RadarAutomation = RadarAutomationInput & { id: string; nextRunAt: string; createdAt: string; updatedAt: string; lastExecution?: AutomationExecution | null };
const fail = (message: string, status=400) => Object.assign(new Error(message), { status });
function parse(input: unknown) {
  const parsed=radarAutomationInputSchema.safeParse(input);
  if (!parsed.success) throw fail(`Automatización inválida: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
/** Horarios UTC explícitos; calendario natural, no meses de 30 días. */
export function nextRadarRun(input: { frequency: string; time: string; weekday: number; monthDay: number }, now = new Date()) {
  const [hour, minute] = input.time.split(":").map(Number);
  const candidate = new Date(now);
  candidate.setUTCHours(hour, minute, 0, 0);
  if (input.frequency === "week") {
    candidate.setUTCDate(candidate.getUTCDate() + (input.weekday - candidate.getUTCDay() + 7) % 7);
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate()+7);
  } else if (input.frequency === "month") {
    const setDay = () => candidate.setUTCDate(Math.min(input.monthDay,new Date(Date.UTC(candidate.getUTCFullYear(),candidate.getUTCMonth()+1,0)).getUTCDate()));
    candidate.setUTCDate(1); setDay();
    if (candidate <= now) { candidate.setUTCDate(1); candidate.setUTCMonth(candidate.getUTCMonth()+1); setDay(); }
  } else if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate()+1);
  return candidate.toISOString();
}
export async function getRadarAutomation(id: string): Promise<RadarAutomation> {
  const row=await withDatabase((db)=>db.prepare("SELECT data_json FROM radar_automations WHERE id=?").get(id)) as {data_json:string}|undefined;
  if (!row) throw fail("La búsqueda programada no existe.",404);
  return JSON.parse(row.data_json);
}
async function save(row: RadarAutomation) {
  await withDatabase((db)=>db.prepare("INSERT INTO radar_automations (id,active,next_run_at,data_json) VALUES (?,?,?,?) ON CONFLICT (id) DO UPDATE SET active=EXCLUDED.active,next_run_at=EXCLUDED.next_run_at,data_json=EXCLUDED.data_json").run(row.id,row.active?1:0,row.nextRunAt,JSON.stringify(row)));
  return row;
}
export async function createRadarAutomation(input: unknown,now=new Date()) {
  const data=parse(input);
  return save({...data,id:randomUUID(),nextRunAt:nextRadarRun(data,now),createdAt:now.toISOString(),updatedAt:now.toISOString()});
}
export async function updateRadarAutomation(id: string,patch: Record<string,unknown>,now=new Date()) {
  const current=await getRadarAutomation(id); const data=parse({...current,...patch});
  const changed = !current.active && data.active || ["frequency","time","weekday","monthDay"].some((key)=>key in patch);
  return save({...current,...data,nextRunAt:changed?nextRadarRun(data,now):current.nextRunAt,updatedAt:now.toISOString()});
}
export async function deleteRadarAutomation(id: string) {
  await getRadarAutomation(id);
  await withDatabase((db)=>db.prepare("DELETE FROM radar_automations WHERE id=?").run(id));
}
export async function listRadarAutomations(): Promise<RadarAutomation[]> {
  const rows=await withDatabase((db)=>db.prepare("SELECT data_json FROM radar_automations ORDER BY next_run_at ASC").all()) as {data_json:string}[];
  return Promise.all(rows.map(async (row)=> {const data=JSON.parse(row.data_json);return {...data,lastExecution:(await listAutomationRuns(data.id,1))[0]??null};}));
}
type Scanner=(input: unknown)=>Promise<Record<string,unknown>>;
export async function runRadarAutomation(id: string,{automatic=false,now=new Date(),scan}: {automatic?:boolean;now?:Date;scan?:Scanner}={}) {
  return executeAutomation(id,"radar",automatic,async()=> {
    const current=await getRadarAutomation(id);
    if (automatic && (!current.active || current.nextRunAt > now.toISOString())) return {status:"idle",message:"La búsqueda todavía no está programada para ejecutarse."};
    // Consumir el turno antes de llamar al proveedor: una caída no repite automáticamente una factura.
    await save({...current,nextRunAt:nextRadarRun(current,now),updatedAt:now.toISOString()});
    const scanner=scan??(await import("./radar-scan.ts")).scanRadar;
    const result=await scanner({...current.scan,automatic});
    const summary=result.summary as {kept?:number}|undefined;
    return {...result,message:`Radar completado: ${summary?.kept??0} temas guardados.`};
  });
}
export async function runDueRadarAutomations(now=new Date(),scan?:Scanner) {
  const rows=await listRadarAutomations();
  for (const row of rows) {
    if (!row.active || row.nextRunAt > now.toISOString()) continue;
    await runRadarAutomation(row.id,{automatic:true,now,scan}).catch((error)=>console.error(`[radar automático] ${row.name}:`,error instanceof Error?error.message:error));
  }
}
