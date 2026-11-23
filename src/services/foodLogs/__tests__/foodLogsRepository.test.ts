import assert from "node:assert/strict";
import { test } from "node:test";
import type { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "../../../types/database";
import { createFoodLogsRepository, mapFoodLogMutation, type FoodLogsRpcClient } from "../../supabase/foodLogsRepository";
import { FoodLogSyncError, parseServerFoodLog } from "../foodLogSyncTypes";
import { owner, row, mutation, gate } from "./syncFixtures";

const errorKind = (kind: string) => (e: unknown) => e instanceof FoodLogSyncError && e.kind === kind;
function repo(data: unknown, status = 200, code?: string) {
  const calls: any[] = [];
  const repository = createFoodLogsRepository(owner, "synthetic-test-session", () => ({
    async rpc(name,args) { calls.push({name,args}); return {data,status,error:code ? {code,message:"Synthetic RPC failure"} : null}; },
  }), () => owner);
  return { repository, calls };
}
test("typed session-bound client is compatible with the existing PostgREST factory", () => {
  const compatible: PostgrestClient<Database> extends FoodLogsRpcClient ? true : false = true;
  assert.equal(compatible,true);
});
test("create request maps exact SQL fields and preserves log and operation UUIDs, zeroes and legacy ID", async () => {
  const r = row(); r.legacy_local_id = "000123"; const request = mutation(r); const f = repo([r]);
  assert.deepEqual(await f.repository.apply([request]), [r]);
  assert.deepEqual(f.calls[0], { name: "apply_food_log_mutations", args: { p_mutations: [{ id:r.id, mutation_id:r.last_mutation_id,
    kind:"create", snapshot: {food_name:r.food_name,calories:0,protein:r.protein,carbs:r.carbs,fat:0,meal_type:r.meal_type,
      client_created_at:r.client_created_at,logged_date:r.logged_date,legacy_local_id:"000123",originating_device_id:null} }] } });
});
test("delete maps original snapshot and requires a canonical tombstone", async () => {
  const r = row(); const f = repo([{...r,deleted_at:r.updated_at}]);
  await f.repository.apply([mutation(r,"delete")]); assert.equal(f.calls[0].args.p_mutations[0].kind,"delete");
  await assert.rejects(repo([r]).repository.apply([mutation(r,"delete")]),errorKind("malformed"));
});
test("factory captures a fixed session token and performs no request on construction", () => {
  const tokens: string[]=[]; let requests=0;
  createFoodLogsRepository(owner,"synthetic-session-a",token => {tokens.push(token);return {async rpc(){requests++;throw Error();}};},()=>owner);
  assert.deepEqual(tokens,["synthetic-session-a"]); assert.equal(requests,0);
});
for (const [status,code,kind] of [[401,"PGRST301","authentication"],[403,"42501","database"],[400,"22023","validation"],
  [409,"40001","conflict"],[500,"XX000","database"],[503,"","transport"],[408,"57014","transport"],[0,"","transport"]] as const) {
  test(`classifies ${status}/${code} as ${kind}`,async()=>{
    await assert.rejects(repo(null,status,code).repository.apply([mutation()]),errorKind(kind));
  });
}
for (const [field,value] of [["user_id","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],["id","bad"],["calories",-1],["fat",Infinity],
  ["protein",null],["server_revision",Number.MAX_SAFE_INTEGER+1],["server_revision",0],["logged_date","2024-02-30"],
  ["client_created_at","2024-02-30T00:00:00Z"],["received_at","infinity"],["deleted_at","bad"],["meal_type","Brunch"],
  ["food_name"," "],["last_mutation_id","bad"],["originating_device_id","bad"]] as const) {
  test(`strictly rejects malformed field ${field}/${String(value)}`,async()=>{
    const r=row(); await assert.rejects(repo([{...r,[field]:value}]).repository.apply([mutation(r)]),errorKind("malformed"));
  });
}
test("rejects missing/extra response columns, wrong counts and mismatched IDs",async()=>{
  const r=row(); const {fat,...missing}=r;
  for (const data of [null,{},[],[missing],[{...r,extra:true}],[{...r,id:row().id}]]) {
    await assert.rejects(repo(data).repository.apply([mutation(r)]),errorKind("malformed"));
  }
});
test("rejects immutable content mismatch and unbounded outgoing requests before RPC",async()=>{
  const r=row(); await assert.rejects(repo([{...r,calories:99}]).repository.apply([mutation(r)]),errorKind("malformed"));
  const f=repo([r]);
  await assert.rejects(f.repository.apply(Array.from({length:101},()=>mutation())),errorKind("validation"));
  await assert.rejects(f.repository.apply([mutation({...r,calories:-1})]),errorKind("validation"));
  await assert.rejects(f.repository.apply([mutation({...r,legacy_local_id:"x".repeat(1048576)})]),errorKind("validation"));
  assert.equal(f.calls.length,0);
});
test("pull request uses exact revision cursor, page size and stable watermark",async()=>{
  const r=row(undefined,3); const f=repo({changes:[r],watermark:7,next_cursor:3,has_more:true});
  assert.deepEqual(await f.repository.pull(2,1,7),{changes:[r],watermark:7,nextCursor:3,hasMore:true});
  assert.deepEqual(f.calls[0],{name:"pull_food_log_changes",args:{p_after_revision:2,p_page_size:1,p_watermark:7}});
});
test("pull rejects nonprogress, changed watermark, out-of-order, duplicate and out-of-range rows",async()=>{
  const r=row(undefined,3);
  const pages=[{changes:[],watermark:7,next_cursor:2,has_more:true},
    {changes:[r],watermark:8,next_cursor:3,has_more:true},
    {changes:[row(undefined,4),r],watermark:7,next_cursor:7,has_more:false},
    {changes:[r,r],watermark:7,next_cursor:7,has_more:false},
    {changes:[{...r,server_revision:8}],watermark:7,next_cursor:7,has_more:false},
    {changes:[r],watermark:7,next_cursor:6,has_more:false}];
  for(const page of pages) await assert.rejects(repo(page).repository.pull(2,2,7),errorKind("malformed"));
});
test("account/auth-generation switch during RPC discards the response",async()=>{
  const g=gate(); let current=owner; const r=row();
  const repository=createFoodLogsRepository(owner,"synthetic",()=>({async rpc(){await g.wait();return {data:[r],status:200,error:null};}}),()=>current);
  const pending=repository.apply([mutation(r)]); await g.started; current={...owner,generation:2};g.release();
  await assert.rejects(pending,errorKind("stale"));
});
test("timestamp parser accepts PostgreSQL microseconds and zero-valued nutrition",()=>{
  const r=row(); assert.deepEqual(parseServerFoodLog({...r,received_at:"2026-10-18T12:00:00.123456+00:00"},owner.userId).calories,0);
  assert.equal((mapFoodLogMutation(mutation(r)) as any).snapshot.fat,0);
});

test("outgoing mapping preserves sub-millisecond timestamp identity and rejects mismatched responses",async()=>{
  const r=row();const requested=mutation({...r,client_created_at:"2024-01-01T23:30:00.123456Z"});
  await assert.rejects(repo([{...r,client_created_at:"2024-01-01T23:30:00.123457Z"}]).repository.apply([requested]),errorKind("malformed"));
});
test("unauthenticated factory construction never creates a client",()=>{
  assert.throws(()=>createFoodLogsRepository(owner,"",()=>{assert.fail("client constructed");},()=>owner),errorKind("authentication"));
});
test("thrown network/timeout errors are sanitized and classified transient",async()=>{
  const repository=createFoodLogsRepository(owner,"synthetic",()=>({async rpc(){throw Error("sensitive connection details");}}),()=>owner);
  await assert.rejects(repository.pull(0,10,null),e=>errorKind("transport")(e)&&!String(e).includes("sensitive"));
});

test("malformed RPC error envelopes and invalid JSON are not mislabeled as network failures",async()=>{
  const malformed = createFoodLogsRepository(owner,"synthetic",()=>({async rpc(){
    return {status:500,data:null,error:{code:123}} as any;
  }}),()=>owner);
  await assert.rejects(malformed.pull(0,10,null),errorKind("malformed"));
  const invalidJson = createFoodLogsRepository(owner,"synthetic",()=>({async rpc(){throw new SyntaxError("invalid JSON");}}),()=>owner);
  await assert.rejects(invalidJson.pull(0,10,null),errorKind("malformed"));
});
