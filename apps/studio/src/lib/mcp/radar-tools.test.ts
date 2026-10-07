import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
// El servidor MCP importa con el alias `@/` de Next; aquí se resuelve a mano hacia src/.
const src = fileURLToPath(new URL("../../", import.meta.url));
registerHooks({ resolve(s,c,next) {
  if(s === "next/server")return next("next/server.js",c);
  const spec=s.startsWith("@/")?pathToFileURL(src+s.slice(2)).href:s;
  try{return next(spec,c);}catch(error){if((spec.startsWith(".")||spec.startsWith("file:"))&&!/\.[a-z]+$/.test(spec))return next(`${spec}.ts`,c);throw error;}
} });
import { createTestDatabase } from "../../../../../scripts/test-db.mjs";
const db=await createTestDatabase();process.env.DATABASE_URL=db.url;
try {
 const { Client }=await import("@modelcontextprotocol/sdk/client/index.js");
 const { InMemoryTransport }=await import("@modelcontextprotocol/sdk/inMemory.js");
 const { createStudioMcpServer }=await import("./server.ts");
 const radarRoute=await import("../../app/api/radar/automations/route.ts");
 const connect=async(scopes?:string[])=>{
  const [clientSide,serverSide]=InMemoryTransport.createLinkedPair();
  await createStudioMcpServer({origin:"http://localhost",scopes}).connect(serverSide);
  const client=new Client({name:"test",version:"1"});await client.connect(clientSide);return client;
 };
 const client=await connect();
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const result=await client.callTool({name,arguments:args}) as {isError?:boolean;content:{text:string}[]};
  return {error:Boolean(result.isError),data:result.content[0].text.startsWith("{")||result.content[0].text.startsWith("[")?JSON.parse(result.content[0].text):result.content[0].text};
 };
 const names=(await client.listTools()).tools.map((tool)=>tool.name);
 for (const name of ["listar_automatizaciones_radar","crear_automatizacion_radar","editar_automatizacion_radar","ejecutar_automatizacion_radar","eliminar_automatizacion_radar","historial_automatizacion"]) assert.ok(names.includes(name),name);
 const readOnly=(await (await connect(["studio:read"])).listTools()).tools.map((tool)=>tool.name);
 assert.ok(readOnly.includes("listar_automatizaciones_radar")&&!readOnly.includes("crear_automatizacion_radar"),"con solo lectura no se puede programar el radar");

 const created=await call("crear_automatizacion_radar",{name:"IA semanal",frequency:"week",weekday:3,time:"13:30",verticals:["IA","Ciberseguridad"],focus:"agentes",maxTopics:6});
 assert.equal(created.error,false,String(created.data));
 assert.equal(created.data.active,false,"queda pausada si no se dice lo contrario");
 assert.equal(created.data.scan.maxSearches,3,"mismo tope de búsquedas que la app");
 // Lo que ve la pantalla de Automatizaciones es la misma ruta.
 const screen=await (await radarRoute.GET()).json();
 assert.equal(screen.length,1);assert.equal(screen[0].id,created.data.id);assert.equal(screen[0].scan.focus,"agentes");

 const edited=await call("editar_automatizacion_radar",{id:created.data.id,active:true,maxTopics:12});
 assert.equal(edited.error,false,String(edited.data));
 assert.equal(edited.data.active,true);assert.equal(edited.data.scan.maxTopics,12);
 assert.deepEqual(edited.data.scan.verticals,["IA","Ciberseguridad"],"editar un ajuste no pierde los demás");
 assert.equal(edited.data.scan.focus,"agentes");

 const listed=await call("listar_automatizaciones_radar");
 assert.equal(listed.data.length,1);assert.equal(listed.data[0].active,true);
 const summary=await call("resumen_estado");
 assert.equal(summary.data.automatizacionesRadar[0].id,created.data.id);

 const { executeAutomation }=await import("../automation-execution.ts");
 await executeAutomation(created.data.id,"radar",false,async()=>({message:"2 temas guardados",summary:{kept:2}}));
 const history=await call("historial_automatizacion",{id:created.data.id});
 assert.equal(history.data[0].result.summary.kept,2);

 const invalid=await call("crear_automatizacion_radar",{name:"Sin verticales",frequency:"day",time:"10:00",verticals:[]});
 assert.equal(invalid.error,true);
 const missing=await call("editar_automatizacion_radar",{id:"no-existe",maxTopics:3});
 assert.equal(missing.error,true);

 assert.equal((await call("eliminar_automatizacion_radar",{id:created.data.id})).error,false);
 assert.equal((await (await radarRoute.GET()).json()).length,0);
 console.log("MCP radar: crear, editar, listar, historial y borrar búsquedas programadas verificados contra la misma ruta que Automatizaciones.");
} finally { await db.drop(); }
