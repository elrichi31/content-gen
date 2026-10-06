import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (error) { if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context); throw error; } } });
import { createTestDatabase } from "../../../../scripts/test-db.mjs";
const db=await createTestDatabase(); process.env.DATABASE_URL=db.url;
try {
 const now=new Date("2026-10-06T12:00:00Z");
 const stamp=now.toISOString();
 const rule={id:"r1",schemaVersion:1,name:"Sin huecos",platform:"instagram",weekdays:[1],times:["10:00"],campaignId:null,active:false,startDate:"2026-10-01",endDate:null,createdAt:stamp,updatedAt:stamp};
 await db.query("INSERT INTO campaigns (id,schema_version,data_json,created_at,updated_at) VALUES ('c1',1,'{}',$1,$1)",[stamp]);
 await db.query("INSERT INTO publishing_rules (id,schema_version,platform,active,data_json,created_at,updated_at) VALUES ('r1',1,'instagram',0,$1,$2,$2)",[JSON.stringify(rule),stamp]);
 const {createAutomation,runAutomation,listAutomationsWithStatus}=await import("./carousel-automation.ts");
 const row=await createAutomation({name:"Carruseles",ruleId:"r1",campaignId:"c1",kind:"editable",topics:["Tema fixture"]});
 await runAutomation(row.id,now);
 const [listed]=await listAutomationsWithStatus(now);
 assert.equal(listed.lastExecution?.status,"idle");
 assert.equal(listed.lastExecution?.operations.length,0);
 assert.match(listed.lastExecution?.result.message as string,/Sin huecos/);
 console.log("Carousel idle: ejecución real persistida y visible sin llamada de IA.");
} finally {await db.drop();}
