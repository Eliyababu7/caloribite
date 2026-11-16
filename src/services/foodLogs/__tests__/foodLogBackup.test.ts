import assert from "node:assert/strict";
import { test } from "node:test";
import { synchronizeFoodLogs } from "../foodLogSync";
import { createFoodLogsRepository } from "../../supabase/foodLogsRepository";
import { createFoodLogBackupCoordinator, type BackupInput } from "../foodLogBackupCoordinator";
import { createBackupPreferenceStorage, backupPreferenceKey, parseBackupPreference, foodLogRolloutEnabled,
  FOOD_LOG_BACKUP_EXPLANATION, type StoredBackupStatus } from "../foodLogBackupPreferences";
import { foodLogSyncKey, visibleFoodLogs } from "../foodLogStorage";
import { owner, fixture, fakeServer, gate, row } from "./syncFixtures";
import { serverFood } from "../foodLogSyncTypes";

const settle = async () => { for(let i=0;i<4;i++) await new Promise(r=>setImmediate(r)); };
function setup(rollout = true, enabled = false, lastStatus: StoredBackupStatus | null = null) {
  const f=fixture();const server=fakeServer();
  let input:BackupInput={owner,token:"synthetic-session-one",normal:true,hydrated:true,rollout};
  const prefs = new Map<string,string>();
  if(enabled)prefs.set(backupPreferenceKey(owner.userId),JSON.stringify({version:1,userId:owner.userId,enabled:true,lastStatus}));
  let changeHook=()=>{};
  let confirmed=true;let confirmationCount=0;let confirmationHook:(()=>Promise<boolean>)|null=null;
  let writeHook:()=>Promise<void>=async()=>{};
  let readHook:()=>Promise<void>=async()=>{};
  const preferences=createBackupPreferenceStorage({async getItem(key){await readHook();return prefs.get(key)??null;},async setItem(key,value){await writeHook();prefs.set(key,value);}});
  const bindings:{token:string;signal:AbortSignal}[]=[];let syncCalls=0;
  const c=createFoodLogBackupCoordinator({input:()=>input,preferences,storage:f.storage,changed(){changeHook();},
    repository:(bound,token,current,signal)=>{bindings.push({token,signal});return createFoodLogsRepository(bound,token,()=>server.client,current);},
    confirm:async explanation=>{confirmationCount++;assert.equal(explanation,FOOD_LOG_BACKUP_EXPLANATION);return confirmationHook?confirmationHook():confirmed;},
    synchronize:async options=>{syncCalls++;return synchronizeFoodLogs(options);},
  });
  const unsubscribe=f.storage.subscribe(owner.userId,c.observe);
  return {f,server,c,prefs,preferences,bindings,get input(){return input;},get syncCalls(){return syncCalls;},get confirmations(){return confirmationCount;},
    configure(patch:Partial<BackupInput>={}){input={...input,...patch};c.configure();},
    onChanged(fn:()=>void){changeHook=fn;},
    choose(value:boolean){confirmed=value;},confirmWith(fn:typeof confirmationHook){confirmationHook=fn;},
    onPreferenceWrite(fn:typeof writeHook){writeHook=fn;},onPreferenceRead(fn:typeof readHook){readHook=fn;},
    dispose(){unsubscribe();c.dispose();}};
}
for(const value of [undefined,null,false,true,"false","TRUE"," true","true ","1",{},""])test(`rollout value ${String(value)} defaults disabled`,()=>{
  assert.equal(foodLogRolloutEnabled(value),false);
});
test("only exact string true enables rollout",()=>assert.equal(foodLogRolloutEnabled("true"),true));
test("rollout disabled prevents all repository construction and RPCs even with stored consent",async()=>{
  const s=setup(false,true);await s.f.seed();s.configure();s.c.setNetwork(true);await settle();await s.c.trigger();
  assert.equal(s.bindings.length,0);assert.equal(s.server.calls.length,0);assert.equal(s.c.snapshot().available,false);s.dispose();
});
test("no explicit consent means zero RPCs for startup, foreground/manual and reconnect triggers",async()=>{
  const s=setup();await s.f.seed();s.configure();s.c.setNetwork(true);await settle();await s.c.trigger();s.c.setNetwork(false);s.c.setNetwork(true);await settle();
  assert.equal(s.bindings.length,0);assert.equal(s.c.snapshot().enabled,false);s.dispose();
});
for(const raw of [null,"{","null","{}",JSON.stringify({version:2,userId:owner.userId,enabled:true,lastStatus:null}),
  JSON.stringify({version:1,userId:"other",enabled:true,lastStatus:null}),JSON.stringify({version:1,userId:owner.userId,enabled:"true",lastStatus:null})]) {
  test(`corrupt/missing/unknown consent resolves disabled: ${raw}`,()=>assert.equal(parseBackupPreference(raw,owner.userId).enabled,false));
}
test("enable requires affirmative confirmation, then durable account-scoped consent",async()=>{
  const s=setup();await s.f.seed();s.configure();s.c.setNetwork(true);await settle();s.choose(false);
  assert.equal(await s.c.enable(),false);assert.equal(s.prefs.size,0);assert.equal(s.server.calls.length,0);
  s.choose(true);assert.equal(await s.c.enable(),true);await s.c.trigger();
  assert.equal(s.confirmations,2);assert.equal(JSON.parse(s.prefs.get(backupPreferenceKey(owner.userId))!).enabled,true);
  assert.equal(s.c.snapshot().status,"up-to-date");s.dispose();
});
test("failed consent write cannot start synchronization",async()=>{
  const s=setup();await s.f.seed();s.configure();s.c.setNetwork(true);await settle();s.onPreferenceWrite(async()=>{throw Error("disk");});
  assert.equal(await s.c.enable(),false);assert.equal(s.bindings.length,0);assert.equal(s.c.snapshot().enabled,false);
  assert.ok(s.c.snapshot().preferenceError);s.onPreferenceWrite(async()=>{});assert.equal(await s.c.retryChoice(),true);
  await s.c.trigger();assert.equal(s.c.snapshot().status,"up-to-date");s.dispose();
});
test("eligible startup synchronizes only after local hydration and connectivity are ready",async()=>{
  const s=setup(true,true);await s.f.seed();s.configure({hydrated:false});s.c.setNetwork(true);await settle();assert.equal(s.syncCalls,0);
  s.configure({hydrated:true});await settle();await s.c.trigger();assert.ok(s.syncCalls>=1);assert.equal(s.c.snapshot().status,"up-to-date");s.dispose();
});
test("offline startup preserves local add/delete availability and durable pending data",async()=>{
  const s=setup(true,true);await s.f.seed();s.configure();s.c.setNetwork(false);await settle();
  const added=serverFood(row());await s.f.storage.add(owner.userId,()=>true,added);await s.f.storage.remove(owner.userId,()=>true,[added.id]);
  assert.equal(s.bindings.length,0);assert.equal(s.c.snapshot().status,"offline");assert.equal(s.f.read().tombstones.length,1);
  assert.ok(s.f.read().outbox.length);s.dispose();
});
test("reconnection and explicit foreground/manual triggers synchronize without overlap",async()=>{
  const s=setup(true,true);await s.f.seed();s.configure();s.c.setNetwork(false);await settle();
  const g=gate();const original=s.server.client.rpc.bind(s.server.client);let inflight=0;let maximum=0;
  s.server.client.rpc=async(name,args)=>{inflight++;maximum=Math.max(maximum,inflight);await g.wait();try{return await original(name,args);}finally{inflight--;}};
  s.c.setNetwork(true);await g.started;const count=s.syncCalls;
  const one=s.c.trigger(),two=s.c.trigger(),three=s.c.trigger();assert.equal(one,two);assert.equal(two,three);assert.equal(s.syncCalls,count);
  g.release();await one;assert.equal(maximum,1);assert.equal(s.c.snapshot().status,"up-to-date");s.dispose();
});
test("token refresh invalidates the old run and rebinds after it settles",async()=>{
  const s=setup(true,true);await s.f.seed();const g=gate();let first=true;const original=s.server.client.rpc.bind(s.server.client);
  s.server.client.rpc=async(name,args)=>{if(first){first=false;await g.wait();}return original(name,args);};
  s.configure();s.c.setNetwork(true);await g.started;s.configure({token:"synthetic-session-two"});
  assert.equal(s.bindings[0].signal.aborted,true);g.release();await settle();await s.c.trigger();
  assert.deepEqual(s.bindings.slice(0,2).map(b=>b.token),["synthetic-session-one","synthetic-session-two"]);assert.equal(s.c.snapshot().status,"up-to-date");s.dispose();
});
for(const reason of ["logout","account","generation","recovery","pause"]){
  test(`${reason} immediately invalidates active work and never applies stale responses`,async()=>{
    const s=setup(true,true);await s.f.seed();const before=s.f.read();const g=gate();const original=s.server.client.rpc.bind(s.server.client);
    s.server.client.rpc=async(name,args)=>{await g.wait();return original(name,args);};
    s.configure();s.c.setNetwork(true);await g.started;
    if(reason==="pause")await s.c.disable();
    else if(reason==="account")s.configure({owner:{...owner,userId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}});
    else if(reason==="generation")s.configure({owner:{...owner,generation:2}});
    else if(reason==="recovery")s.configure({normal:false});else s.configure({owner:null,normal:false,token:null});
    assert.equal(s.bindings[0].signal.aborted,true);g.release();await settle();
    if(reason!=="generation")assert.deepEqual(s.f.read(),before);
    if(reason==="account")assert.equal(s.c.snapshot().enabled,false);
    s.dispose();
  });
}
test("pausing keeps cloud rows and performs no cloud deletion; failed pause is explicit and retryable",async()=>{
  const s=setup(true,true);await s.f.seed();s.configure();s.c.setNetwork(true);await settle();await s.c.trigger();const calls=s.server.calls.length;
  s.onPreferenceWrite(async()=>{throw Error("disk");});assert.equal(await s.c.disable(),false);
  assert.equal(s.c.snapshot().enabled,false);assert.match(s.c.snapshot().preferenceError!,/before restarting/);
  await s.c.trigger();assert.equal(s.server.calls.length,calls);assert.equal(s.server.rows.size,1);
  s.onPreferenceWrite(async()=>{});assert.equal(await s.c.retryChoice(),true);assert.equal(JSON.parse(s.prefs.get(backupPreferenceKey(owner.userId))!).enabled,false);s.dispose();
});
test("account switch while confirmation is open cannot grant consent to either account",async()=>{
  const s=setup();await s.f.seed();s.configure();await settle();const g=gate();s.confirmWith(async()=>{await g.wait();return true;});
  const pending=s.c.enable();await g.started;s.configure({owner:{...owner,userId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}});g.release();
  assert.equal(await pending,false);assert.equal(s.prefs.size,0);assert.equal(s.bindings.length,0);s.dispose();
});
test("consent from another user cannot enable this account",async()=>{
  const s=setup(true,true);await s.f.seed();s.configure({owner:{...owner,userId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}});s.c.setNetwork(true);await settle();
  assert.equal(s.c.snapshot().enabled,false);assert.equal(s.bindings.length,0);s.dispose();
});
test("late consent hydration cannot undo an explicit pause",async()=>{
  const s=setup(true,true);await s.f.seed();const g=gate();let first=true;s.onPreferenceRead(async()=>{if(first){first=false;await g.wait();}});
  s.configure();await g.started;const disable=s.c.disable();g.release();await disable;await settle();s.c.setNetwork(true);await settle();
  assert.equal(s.c.snapshot().enabled,false);assert.equal(s.bindings.length,0);s.dispose();
});
test("durable pending and failure statuses restore without exposing another account",async()=>{
  const s=setup(true,true,"failed");await s.f.seed();s.configure();await settle();assert.equal(s.c.snapshot().status,"failed");
  assert.equal((await s.preferences.read(owner.userId,()=>true)).lastStatus,"failed");
  await s.preferences.setStatus(owner.userId,"pending",()=>true);assert.equal((await s.preferences.read(owner.userId,()=>true)).lastStatus,"pending");
  assert.equal((await s.preferences.read("other",()=>true)).enabled,false);s.dispose();
});
test("network failure never rejects a local diary mutation and manual retry clears the error",async()=>{
  const s=setup(true,true);await s.f.seed();const real=s.server.client.rpc.bind(s.server.client);let fail=true;
  s.server.client.rpc=async(name,args)=>{if(fail)throw Error("offline");return real(name,args);};
  s.configure();s.c.setNetwork(true);await settle();await s.c.trigger();assert.equal(s.c.snapshot().status,"offline");
  const food=serverFood(row());await s.f.storage.add(owner.userId,()=>true,food);await s.f.storage.remove(owner.userId,()=>true,[food.id]);
  assert.equal(visibleFoodLogs(s.f.read()).length,1);await settle();fail=false;await s.c.trigger();assert.equal(s.c.snapshot().status,"up-to-date");s.dispose();
});
test("disposed controller safely resumes after strict-mode effect remount",async()=>{
  const s=setup(true,true);await s.f.seed();s.configure();s.c.dispose();s.configure();s.c.setNetwork(true);await settle();await s.c.trigger();
  assert.equal(s.c.snapshot().status,"up-to-date");s.dispose();
});
test("storage notifications are scoped, durable, removable and cannot fail writes",async()=>{
  const f=fixture();await f.seed(0);let calls=0;
  const unsubscribe=f.storage.subscribe(owner.userId,e=>{assert.deepEqual(JSON.parse(f.data.get(foodLogSyncKey(owner.userId))!),e);calls++;throw Error("observer");});
  await f.storage.add(owner.userId,()=>true,serverFood(row()));assert.equal(calls,1);unsubscribe();
  await f.storage.add(owner.userId,()=>true,serverFood(row()));assert.equal(calls,1);
});

test("synchronization is already marked active when status observers run",async()=>{
  const s=setup(true,true);await s.f.seed();let retriggered=false;
  s.onChanged(()=>{if(s.c.snapshot().status==="syncing"&&!retriggered){retriggered=true;void s.c.trigger();}});
  s.configure();s.c.setNetwork(true);await settle();assert.equal(retriggered,true);assert.equal(s.syncCalls,1);s.dispose();
});

test("an addition during status persistence remains visibly and durably pending",async()=>{
  const s=setup(true,true);await s.f.seed();const g=gate();let once=true;
  s.onPreferenceWrite(async()=>{if(once){once=false;await g.wait();}});
  s.configure();s.c.setNetwork(true);await g.started;
  await s.f.storage.add(owner.userId,()=>true,serverFood(row()));g.release();await settle();
  assert.equal(s.c.snapshot().status,"pending");assert.equal(s.f.read().outbox.length,1);
  assert.equal(JSON.parse(s.prefs.get(backupPreferenceKey(owner.userId))!).lastStatus,"pending");s.dispose();
});
