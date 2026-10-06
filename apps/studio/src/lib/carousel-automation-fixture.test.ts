import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const fixture = {
  automation: {id:"fixture",name:"Prueba",active:true,ruleId:"r1",campaignId:"c1",brandKitId:null,kind:"editable",slides:3,imageSource:"unsplash",provider:"gemini",topics:["Tema fixture"],usedTopics:[],daysAhead:14},
  rule: {id:"r1",schemaVersion:1,name:"Pauta",platform:"instagram",weekdays:[1,3,5],times:["19:00"],campaignId:null,active:true,startDate:"2026-10-01",endDate:null},
  posts: [] as Record<string,unknown>[], generated:0, contentCount:0,
};
Object.assign(globalThis,{automationFixture:fixture});
registerHooks({
  resolve(specifier,context,next) {try{return next(specifier,context);}catch(error){if(specifier.startsWith(".")&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);throw error;}},
  load(url,context,next) {
    const sources: Record<string,string> = {
      "/db.ts": `export async function withDatabase(work){ const f=globalThis.automationFixture; return work({prepare(sql){return {async get(){return {data_json:JSON.stringify(f.automation)}},async run(...params){if(sql.startsWith('UPDATE carousel_automations'))f.automation=JSON.parse(params[2]);if(sql.startsWith('INSERT INTO content_items'))f.contentCount++;return {changes:1}},async all(){return []}}}})}`,
      "/automation-execution.ts": `export async function executeAutomation(id,kind,automatic,work){return work()} export async function listAutomationRuns(){return []}`,
      "/schedule.ts": `export async function getRule(){return globalThis.automationFixture.rule} export async function listPosts(){return globalThis.automationFixture.posts} export async function createPost(post){globalThis.automationFixture.posts.push({...post,status:'planificada'})} export async function updatePost(){throw new Error('unexpected update')}`,
      "/radar.ts": `export async function listTopics(){return []} export async function setTopicStatus(){} export async function linkTopicToContent(){}`,
      "/carousel-pipeline.ts": `export async function createEditableCarousel(){globalThis.automationFixture.generated++;return {document:{topic:'Tema fixture',slides:[]},missingPhotos:1,imageErrors:['Unsplash rechazó la credencial.']}} export async function drawAiCarousel(){throw new Error('unexpected images')} export async function prepareAiCarousel(){throw new Error('unexpected images')}`,
    };
    const source = url.includes("/apps/studio/src/lib/") ? Object.entries(sources).find(([suffix])=>url.endsWith(suffix))?.[1] : undefined;
    return source?{format:"module",shortCircuit:true,source}:next(url,context);
  },
});
const {runAutomation}=await import("./carousel-automation.ts");
const tuesday=await runAutomation("fixture",new Date(2026,9,6,10));
assert.equal(tuesday.status,"idle");
assert.equal(fixture.generated,0,"una automatización antigua de 14 días no genera en martes");
const monday=await runAutomation("fixture",new Date(2026,9,5,10));
assert.equal(monday.status,"created");
assert.match(monday.message,/1 foto.*credencial/i,"la automatización informa de las fotos faltantes y su causa");
assert.equal(fixture.automation.usedTopics.length,1,"un carrusel parcial no vuelve a consumir ni generar el mismo tema");
await runAutomation("fixture",new Date(2026,9,5,10,15));
assert.equal(fixture.generated,1,"el siguiente tick no genera otra pieza para el mismo hueco ni adelanta el miércoles");
assert.equal(fixture.contentCount,1);
console.log("Automation fixture: mismo día, aviso de fotos y no regeneración de un hueco cubierto verificados; persistencia y bloqueo Postgres no ejercidos.");
