import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import type * as TypeScript from "typescript";
import { synchronizeFoodLogs } from "../foodLogSync";
import { mergeFoodLogChanges } from "../foodLogReconciliation";
import { FoodLogSyncError, serverFood } from "../foodLogSyncTypes";
import { visibleFoodLogs, foodLogSyncKey } from "../foodLogStorage";
import { owner, row, fixture, fakeServer, gate } from "./syncFixtures";
import type { FoodLogsRepository } from "../../supabase/foodLogsRepository";

function run(f: ReturnType<typeof fixture>, repository: FoodLogsRepository, extra: Record<string,number>={}) {
  return synchronizeFoodLogs({storage:f.storage,repository,owner,currentOwner:f.currentOwner,...extra});
}
test("create replay persists canonical acknowledgement before removing the stable operation",async()=>{
  const f=fixture();await f.seed();const before=f.read();const s=fakeServer();
  assert.deepEqual(await run(f,s.repository(f.currentOwner)),{status:"complete"});
  const after=f.read();assert.equal(after.outbox.length,0);assert.equal(after.entries[0].server?.server_revision,1);
  const receiptWrite=f.writes.findIndex(e=>!!e.acknowledgements?.length);
  assert.ok(receiptWrite>=0);assert.deepEqual(f.writes[receiptWrite].outbox,before.outbox);
  assert.equal(f.writes[receiptWrite+1].outbox.length,0);
  assert.equal(s.calls[0].args.p_mutations[0].mutation_id,before.outbox[0].id);
});
test("create+delete replay acknowledges a terminal tombstone and cannot resurrect",async()=>{
  const f=fixture();await f.seed(1,"delete");const s=fakeServer();
  assert.deepEqual(await run(f,s.repository(f.currentOwner)),{status:"complete"});
  const after=f.read();assert.equal(after.outbox.length,0);assert.equal(after.tombstones.length,1);
  assert.equal(visibleFoodLogs(after).length,0);assert.ok(after.entries[0].server?.deleted_at);
  assert.equal(f.writes.find(e=>e.acknowledgements?.length)?.outbox.length,2);
});
test("replay is bounded and later invocations resume unchanged IDs",async()=>{
  const f=fixture();await f.seed(5);const original=f.read().outbox;const s=fakeServer();
  assert.deepEqual(await run(f,s.repository(f.currentOwner),{batchSize:2,maxReplayBatches:1}),{status:"bounded"});
  assert.deepEqual(f.read().outbox,original.slice(2));assert.equal(s.calls.filter(c=>c.name==="apply_food_log_mutations")[0].args.p_mutations.length,2);
  assert.deepEqual(await run(f,s.repository(f.currentOwner),{batchSize:2}),{status:"complete"});assert.equal(s.rows.size,5);
});
test("lost response then idempotent retry preserves stable IDs without duplicate rows",async()=>{
  const f=fixture();await f.seed();const before=f.read();const s=fakeServer();const real=s.repository(f.currentOwner);
  const lost:FoodLogsRepository={...real,async apply(batch){await real.apply(batch);throw new FoodLogSyncError("transport");}};
  assert.equal((await run(f,lost)).status,"paused");assert.deepEqual(f.read(),before);
  assert.deepEqual(await run(f,real),{status:"complete"});assert.equal(s.rows.size,1);
  const calls=s.calls.filter(c=>c.name==="apply_food_log_mutations");assert.deepEqual(calls[0].args,calls[1].args);
});
for(const kind of ["transport","authentication","validation","conflict","database","malformed"] as const) {
  test(`${kind} pauses and retains the exact pending diary and operation`,async()=>{
    const f=fixture();await f.seed();const before=f.read();const s=fakeServer();
    const result=await run(f,{...s.repository(),async apply(){throw new FoodLogSyncError(kind);}});
    assert.deepEqual(result,{status:"paused",kind,operationIds:before.outbox.map(o=>o.id)});assert.deepEqual(f.read(),before);
  });
}
test("failed acknowledgement write after server success leaves safe retry state",async()=>{
  const f=fixture();await f.seed();const before=f.read();const s=fakeServer();
  f.onWrite(async()=>{throw Error("disk");});
  const result=await run(f,s.repository());assert.equal(result.status,"paused");assert.equal((result as any).kind,"storage");
  assert.deepEqual(f.read(),before);assert.equal(s.rows.size,1);
  f.onWrite(async()=>{});assert.equal((await run(f,s.repository())).status,"complete");assert.equal(s.rows.size,1);
});
test("failed outbox cleanup resumes durable receipts without repeating RPC",async()=>{
  const f=fixture();await f.seed();const s=fakeServer();
  f.onWrite(async(_key,encoded)=>{const e=JSON.parse(encoded);if(e.outbox.length===0)throw Error("disk");});
  assert.equal((await run(f,s.repository())).status,"paused");assert.equal(f.read().acknowledgements?.length,1);assert.equal(f.read().outbox.length,1);
  f.onWrite(async()=>{});assert.equal((await run(f,s.repository())).status,"complete");
  assert.equal(s.calls.filter(c=>c.name==="apply_food_log_mutations").length,1);
});
test("stable-watermark pagination persists every page before advancing and resumes after restart",async()=>{
  const f=fixture();await f.seed(0);const s=fakeServer();for(let i=0;i<5;i++)s.add();
  const r=s.repository();assert.equal((await run(f,r,{batchSize:2,maxPullPages:1})).status,"bounded");
  assert.deepEqual(f.read().pull,{cursor:"2",watermark:5});assert.equal(f.read().entries.length,2);
  s.add();assert.equal((await run(f,r,{batchSize:2})).status,"complete");
  assert.equal(f.read().entries.length,5);assert.deepEqual(f.read().pull,{cursor:"5",watermark:null});
  assert.deepEqual(s.calls.filter(c=>c.name==="pull_food_log_changes").map(c=>c.args.p_watermark),[undefined,5,5]);
  assert.equal((await run(f,r,{batchSize:2})).status,"complete");assert.equal(f.read().entries.length,6);
});
test("pull preserves pending local additions and merges unrelated remote records",async()=>{
  const f=fixture();await f.seed();const original=f.read();const s=fakeServer();const remote=s.add();
  await run(f,s.repository(),{maxReplayBatches:0});const e=f.read();
  assert.deepEqual(e.outbox,original.outbox);assert.deepEqual(e.entries[0],original.entries[0]);assert.equal(e.entries[1].food.id,remote);
});
test("pulled tombstones hide matching entries and retain original diary snapshots",async()=>{
  const f=fixture();await f.seed();const local=f.read().entries[0];const s=fakeServer();
  s.add(row(local.food.id,1,{deleted_at:"2026-10-18T12:00:00Z"}));
  await run(f,s.repository(),{maxReplayBatches:0});assert.equal(visibleFoodLogs(f.read()).length,0);
  assert.deepEqual(f.read().entries[0].food,local.food);assert.equal(f.read().outbox.length,1);
});
test("pending local deletion wins over pulled active state; acknowledged deletion is terminal",async()=>{
  const f=fixture();await f.seed(1,"delete");const before=f.read();const s=fakeServer();s.add(row(before.entries[0].food.id));
  await run(f,s.repository(),{maxReplayBatches:0});assert.equal(visibleFoodLogs(f.read()).length,0);assert.deepEqual(f.read().outbox,before.outbox);
  await run(f,s.repository());assert.equal(visibleFoodLogs(f.read()).length,0);
  const e=f.read();const active={...e.entries[0].server!,server_revision:99,deleted_at:null};
  assert.equal(visibleFoodLogs(mergeFoodLogChanges(e,[active])).length,0);
});
test("older server revisions cannot replace newer per-entry metadata or tombstones",async()=>{
  const f=fixture();await f.seed(0);const newer=row(undefined,10,{deleted_at:"2026-10-18T12:00:00Z"});
  const e=mergeFoodLogChanges(f.read(),[newer]);const merged=mergeFoodLogChanges(e,[{...newer,server_revision:9,deleted_at:null,calories:999}]);
  assert.deepEqual(merged,e);
});
test("same-ID content conflict during pull pauses without overwriting data or cursor",async()=>{
  const f=fixture();await f.seed();const before=f.read();const s=fakeServer();s.add(row(before.entries[0].food.id,1,{calories:999}));
  const result=await run(f,s.repository(),{maxReplayBatches:0});assert.deepEqual(result,{status:"paused",kind:"conflict",operationIds:[]});
  assert.deepEqual(f.read(),before);
});
test("pull persistence failure does not advance the durable cursor",async()=>{
  const f=fixture();await f.seed(0);const before=f.read();const s=fakeServer();s.add();f.onWrite(async()=>{throw Error("disk");});
  assert.equal((await run(f,s.repository())).status,"paused");assert.deepEqual(f.read(),before);
  f.onWrite(async()=>{});await run(f,s.repository());assert.equal(f.read().entries.length,1);
});
for (const boundary of ["replay","pull","merge"]) {
  test(`account/auth-generation switch during ${boundary} discards stale response before persistence`,async()=>{
    const f=fixture();await f.seed(boundary==="replay"?1:0);const before=f.read();const s=fakeServer();if(boundary!=="replay")s.add();
    const g=gate();const real=s.repository(f.currentOwner);let reads=0;
    let repository=real;
    if(boundary==="replay")repository={...real,async apply(batch){const rows=await real.apply(batch);await g.wait();return rows;}};
    if(boundary==="pull")repository={...real,async pull(...args){const page=await real.pull(...args);await g.wait();return page;}};
    if(boundary==="merge")f.onRead(async()=>{if(++reads===2)await g.wait();});
    const pending=run(f,repository);await g.started;
    f.switch(boundary==="pull"?{...owner,userId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}:{...owner,generation:2});g.release();
    assert.deepEqual(await pending,{status:"stale"});assert.deepEqual(f.read(),before);assert.equal(f.writes.length,0);
  });
}
test("account switch during dispatched persistence can finish only under original key and never starts later RPCs",async()=>{
  const f=fixture();await f.seed();const s=fakeServer();const g=gate();
  f.onWrite(async()=>{await g.wait();});const pending=run(f,s.repository(f.currentOwner));await g.started;
  f.switch({...owner,userId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",generation:2});g.release();
  assert.deepEqual(await pending,{status:"stale"});assert.equal(f.data.size,1);assert.ok(f.data.has(foodLogSyncKey(owner.userId)));
  assert.equal(s.calls.length,1);assert.equal(f.read().outbox.length,1);
});
test("queued local mutation during replay is retained by latest-envelope acknowledgement",async()=>{
  const f=fixture();await f.seed();const s=fakeServer();const real=s.repository();let added=false;
  const repository={...real,async apply(batch:Parameters<typeof real.apply>[0]){
    const rows=await real.apply(batch);if(!added){added=true;await f.storage.add(owner.userId,()=>true,serverFood(row()));}return rows;
  }};
  await run(f,repository,{maxReplayBatches:1});assert.equal(f.read().entries.length,2);assert.equal(f.read().outbox.length,1);
});
test("same-user token refresh resumes safely using a newly session-bound repository",async()=>{
  const f=fixture();await f.seed();const s=fakeServer();
  await run(f,{...s.repository(),async apply(){throw new FoodLogSyncError("authentication");}});
  const before=f.read().outbox;assert.equal((await run(f,s.repository(f.currentOwner))).status,"complete");
  assert.equal(s.calls[0].args.p_mutations[0].mutation_id,before[0].id);
});
test("engine/repository imports have no client, storage, environment or network side effects",()=>{
  const ts=createRequire(resolve("package.json"))("typescript") as typeof TypeScript;
  for(const file of ["src/services/supabase/foodLogsRepository.ts","src/services/foodLogs/foodLogSync.ts"]){
    const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    const requireCalls:string[]=[];
    runInNewContext(code,{exports:{},require(name:string){requireCalls.push(name);return {};},
      fetch(){assert.fail("import triggered network");},setTimeout(){assert.fail("import started timer");}});
    assert.ok(requireCalls.every(name=>!name.includes("supabaseClient")&&!name.includes("async-storage")));
  }
});
test("runtime import graph never reaches repository or engine from any app entry point",()=>{
  const ts=createRequire(resolve("package.json"))("typescript") as typeof TypeScript;
  const forbidden=new Set([resolve("src/services/supabase/foodLogsRepository.ts"),resolve("src/services/foodLogs/foodLogSync.ts")]);
  const visited=new Set<string>();
  function visit(file:string){
    file=resolve(file);assert.ok(!forbidden.has(file),`Runtime wiring: ${relative(process.cwd(),file)}`);
    if(visited.has(file))return;visited.add(file);
    const ast=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
    for(const node of ast.statements){
      if(!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier)||node.importClause?.isTypeOnly)continue;
      const name=node.moduleSpecifier.text;if(!name.startsWith("."))continue;
      const root=resolve(file,"..",name);
      const target=[root+".ts",root+".tsx",resolve(root,"index.ts")].find(p=>{try{return !!readFileSync(p);}catch{return false;}});
      if(target)visit(target);
    }
  }
  for(const directory of ["src/app","src/context","src/components"]){
    for(const name of readdirSync(directory))if(/\.tsx?$/.test(name))visit(resolve(directory,name));
  }
});

test("invalid local cursor or sync metadata pauses safely without networking or replacement",async()=>{
  const f=fixture();await f.seed(0);const e=f.read();e.pull.cursor="corrupt-cursor";
  const raw=JSON.stringify(e);f.data.set(foodLogSyncKey(owner.userId),raw);const s=fakeServer();
  assert.deepEqual(await run(f,s.repository()),{status:"paused",kind:"storage",operationIds:[]});
  assert.equal(f.data.get(foodLogSyncKey(owner.userId)),raw);assert.equal(s.calls.length,0);
});
test("pull after local deletion during an outstanding request retains deletion and its operation",async()=>{
  const f=fixture();await f.seed();const s=fakeServer();s.add(row(f.read().entries[0].food.id));const real=s.repository();
  const repository={...real,async pull(...args:Parameters<typeof real.pull>){
    const page=await real.pull(...args);await f.storage.remove(owner.userId,()=>true,[f.read().entries[0].food.id]);return page;
  }};
  await run(f,repository,{maxReplayBatches:0});assert.equal(visibleFoodLogs(f.read()).length,0);
  assert.equal(f.read().outbox.at(-1)?.kind,"delete");
});
test("page progress is not overwritten by a concurrent invocation",async()=>{
  const f=fixture();await f.seed(0);const s=fakeServer();s.add();const real=s.repository();
  const repository={...real,async pull(...args:Parameters<typeof real.pull>){
    const page=await real.pull(...args);await f.storage.update(owner.userId,()=>true,latest=>({...latest,pull:{cursor:"1",watermark:null}}));return page;
  }};
  assert.equal((await run(f,repository)).status,"paused");assert.equal(f.read().pull.cursor,"1");assert.equal(f.read().entries.length,0);
});

test("corrupt local server metadata is a storage failure and cannot resurrect a tombstone",async()=>{
  const f=fixture();await f.seed(0);const r=row(undefined,1,{deleted_at:"2026-10-18T12:00:00Z"});
  const corrupt={...f.read(),entries:[{food:serverFood(r),legacyId:null,server:r}],tombstones:[]};
  const raw=JSON.stringify(corrupt);f.data.set(foodLogSyncKey(owner.userId),raw);const s=fakeServer();
  assert.deepEqual(await run(f,s.repository()),{status:"paused",kind:"storage",operationIds:[]});
  assert.equal(f.data.get(foodLogSyncKey(owner.userId)),raw);assert.equal(s.calls.length,0);
  corrupt.entries[0].server={...r,calories:-1};
  f.data.set(foodLogSyncKey(owner.userId),JSON.stringify(corrupt));
  assert.equal((await run(f,s.repository()) as any).kind,"storage");
});

test("replay splits batches by UTF-8 payload bytes as well as operation count",async()=>{
  const f=fixture();await f.seed(2);
  await f.storage.update(owner.userId,()=>true,latest=>({...latest,
    entries:latest.entries.map(entry=>({...entry,legacyId:"x".repeat(600000)})),
    migration:{...latest.migration,importedCount:2}}));
  const s=fakeServer();assert.equal((await run(f,s.repository())).status,"complete");
  assert.deepEqual(s.calls.filter(c=>c.name==="apply_food_log_mutations").map(c=>c.args.p_mutations.length),[1,1]);
});
