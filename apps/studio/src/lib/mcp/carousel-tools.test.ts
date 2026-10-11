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
 const readOnly=(await (await connect(["studio:read"])).listTools()).tools.map((tool)=>tool.name);
 assert.ok(readOnly.includes("listar_layouts_carrusel")&&!readOnly.includes("crear_carrusel_desde_guion"),"con solo lectura se ve la guía pero no se crea");

 const guide=await call("listar_layouts_carrusel");
 assert.equal(guide.data.layouts.length,10);assert.ok(guide.data.estilo.surface.neon);

 const campaign=await call("crear_campana",{name:"Prueba"});
 assert.equal(campaign.error,false,String(campaign.data));
 const created=await call("crear_carrusel_desde_guion",{campaignId:campaign.data.id,topic:"Reciclar en casa",style:{surface:"neon",color:"#3366ff"},caption:{text:"Guarda esto.",hashtags:["#reciclaje"]},slides:[
  {layout:"cover",layoutVariant:"hero",title:"Cómo sumar *reciclaje* a tu rutina",subtitle:"Tres pasos."},
  {layout:"list",title:"Empieza por aquí",listItems:[{emoji:"01",text:"Separa"},{emoji:"02",text:"Reutiliza"}]},
  {layout:"bigNumber",title:"Sin cifra"},
  {layout:"cta",ctaText:"Guárdalo"},
 ]});
 // No gasta: corre al momento, sin pasar por la cola de aprobación.
 assert.equal(created.error,false,String(created.data));assert.ok(created.data.contentItemId&&!created.data.solicitudId);
 assert.deepEqual(created.data.slides.map((slide:{layout:string})=>slide.layout),["cover","list","content","cta"],"un layout sin su campo pasa a content");
 assert.equal(created.data.slides[0].layoutVariant,"hero","la variante pedida se respeta");
 assert.ok(created.data.slides[1].layoutVariant,"sin variante se reparte una");

 const stored=(await call("obtener_contenido",{id:created.data.contentItemId})).data;
 assert.equal(stored.type,"carousel");
 assert.deepEqual(stored.document.data.style,{surface:"neon",customColor:"#3366ff",themeTouched:true},"el estilo queda como lo guarda el editor");
 assert.equal(new Set(stored.document.data.slides.map((slide:{id:string})=>slide.id)).size,4);
 assert.equal(stored.document.data.caption.hashtags[0],"#reciclaje");

 const invalid=await call("crear_carrusel_desde_guion",{campaignId:campaign.data.id,topic:"Mal",slides:[{layout:"inventado",title:"x"}]});
 assert.equal(invalid.error,true);
 console.log("MCP carrusel: guía de layouts y carrusel escrito por el agente guardado sin gastar, con su estilo.");
} finally { await db.drop(); }
