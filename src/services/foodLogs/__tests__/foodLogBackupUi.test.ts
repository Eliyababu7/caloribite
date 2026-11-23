import assert from "node:assert/strict";
import { test } from "node:test";
import { componentHarness } from "../../foodSearch/__tests__/componentHarness";
import * as coordinator from "../foodLogBackupCoordinator";
import * as preferencesModule from "../foodLogBackupPreferences";
import * as repositoryModule from "../../supabase/foodLogsRepository";
import { owner, fixture, fakeServer } from "./syncFixtures";
import { nativeFoodLogCoordination } from "../foodLogCoordination";

function provider(options: {flag?:string;consent?:boolean;confirmed?:boolean;hydrated?:boolean;offline?:boolean}={}) {
  const f=fixture();const server=fakeServer();const prefs=new Map<string,string>();
  if(options.consent)prefs.set(preferencesModule.backupPreferenceKey(owner.userId),JSON.stringify({version:1,userId:owner.userId,enabled:true,lastStatus:null}));
  let auth:any={authIdentity:owner,session:{user:{id:owner.userId},access_token:"synthetic-session"},isLoading:false,isSigningOut:false,recoveryState:"idle"};
  let networkListener:(state:any)=>void=()=>{};let foregroundListener:(state:string)=>void=()=>{};
  let confirmations=0;let clients=0;const explanations:string[]=[];
  const h=componentHarness("src/context/FoodLogSyncContext.tsx","FoodLogSyncProvider",{children:null},{
    "@react-native-async-storage/async-storage":{__esModule:true,default:{async getItem(k:string){return prefs.get(k)??null;},async setItem(k:string,v:string){prefs.set(k,v);}}},
    "expo-network":{async getNetworkStateAsync(){return {isConnected:!options.offline,isInternetReachable:!options.offline};},
      addNetworkStateListener(fn:any){networkListener=fn;return {remove(){networkListener=()=>{};}};}},
    "react-native":{AppState:{currentState:"active",addEventListener(_name:string,fn:any){foregroundListener=fn;return {remove(){foregroundListener=()=>{};}};}}},
    "./AuthContext":{useAuth:()=>auth},"./FoodLogContext":{useFoodLogs:()=>({foodStorageHydrationState:options.hydrated===false?"loading":"ready"})},
    "../services/foodLogs/foodLogBackupCoordinator":coordinator,
    "../services/foodLogs/foodLogBackupPreferences":preferencesModule,
    "../services/foodLogs/platformFoodLogCoordination": { foodLogCoordination: nativeFoodLogCoordination },
    "../services/foodLogs/localFoodLogStorage":{foodLogStorage:f.storage},
    "../services/supabase/foodLogsRepository":repositoryModule,
    "../services/supabase/supabaseClient":{createSessionBoundPostgrestClient(){clients++;return {rpc(name:any,args:any){
      const work=server.client.rpc(name,args);return {abortSignal(){return work;}};
    }};}},
    "../utils/confirmAction":{async confirmAction(value:any){confirmations++;explanations.push(value.message);return options.confirmed??true;}},
  },{process:{env:{EXPO_PUBLIC_FOOD_LOG_CLOUD_SYNC_ENABLED:options.flag}}});
  return {h,f,server,prefs,explanations,get confirmations(){return confirmations;},get clients(){return clients;},
    value:()=>h.node("ContextProvider").props.value,
    async settle(){for(let i=0;i<4;i++)await h.settle();},
    network(online:boolean){networkListener({isConnected:online,isInternetReachable:online});},
    foreground(){foregroundListener("background");foregroundListener("active");},
    auth(value:Partial<typeof auth>){auth={...auth,...value};h.render();},
  };
}
for(const flag of [undefined,"false","TRUE","garbage"])test(`actual provider makes zero RPCs for rollout ${flag}`,async()=>{
  const p=provider({flag,consent:true});await p.settle();await p.value().syncNow();p.foreground();p.network(false);p.network(true);await p.settle();
  assert.equal(p.clients,0);assert.equal(p.server.calls.length,0);assert.equal(p.value().available,false);p.h.dispose();
});
test("actual provider requires confirmation and consent before creating a session client",async()=>{
  const p=provider({flag:"true"});await p.settle();assert.equal(p.clients,0);
  await p.value().enable();await p.settle();await p.value().syncNow();await p.settle();
  assert.equal(p.confirmations,1);assert.match(p.explanations[0],/Existing and future diary entries/);
  assert.match(p.explanations[0],/Offline diary use will continue/);assert.match(p.explanations[0],/does not automatically delete/);
  assert.ok(p.clients>0);assert.equal(p.value().status,"up-to-date");p.h.dispose();
});
test("cancelled confirmation never stores consent or calls RPC",async()=>{
  const p=provider({flag:"true",confirmed:false});await p.settle();await p.value().enable();await p.settle();
  assert.equal(p.confirmations,1);assert.equal(p.prefs.size,0);assert.equal(p.clients,0);p.h.dispose();
});
test("provider lifecycle events trigger bounded runs and remove listeners on unmount",async()=>{
  const p=provider({flag:"true",consent:true});await p.settle();const startup=p.clients;assert.ok(startup>0);
  p.foreground();await p.settle();assert.ok(p.clients>startup);const foreground=p.clients;
  p.network(false);await p.settle();assert.equal(p.value().status,"offline");p.network(true);await p.settle();assert.ok(p.clients>foreground);
  const before=p.clients;p.h.dispose();p.foreground();p.network(false);p.network(true);await p.settle();assert.equal(p.clients,before);
});
test("provider offline startup never blocks or changes food hydration",async()=>{
  const p=provider({flag:"true",consent:true,offline:true});await p.settle();assert.equal(p.value().status,"offline");assert.equal(p.clients,0);p.h.dispose();
});
test("provider waits for hydration and normal authentication",async()=>{
  const p=provider({flag:"true",consent:true,hydrated:false});await p.settle();assert.equal(p.clients,0);
  p.auth({recoveryState:"ready",session:null,authIdentity:null});await p.settle();assert.equal(p.value().enabled,false);assert.equal(p.clients,0);p.h.dispose();
});
test("provider pause never invokes cloud deletion",async()=>{
  const p=provider({flag:"true",consent:true});await p.settle();const count=p.server.calls.length;
  await p.value().disable();await p.settle();p.foreground();await p.settle();assert.equal(p.server.calls.length,count);assert.equal(p.value().enabled,false);p.h.dispose();
});

const native={View:"View",Text:"Text",Pressable:"Pressable",StyleSheet:{create:(s:any)=>s}};
function section(state:Record<string,any>={}) {
  const actions:string[]=[];
  const backup={available:true,enabled:false,busy:false,status:"device",preferenceError:null,
    enable(){actions.push("enable");},disable(){actions.push("disable");},syncNow(){actions.push("sync");},retryChoice(){actions.push("retry");},...state};
  const h=componentHarness("src/components/DiaryCloudBackup.tsx","DiaryCloudBackup",{},{
    "react-native":native,"../context/FoodLogSyncContext":{useFoodLogBackup:()=>backup},
    "../theme/theme":{useAppTheme:()=>({colors:{}})},
  });return {h,actions};
}
test("backup controls are hidden when rollout is unavailable",()=>{
  const {h}=section({available:false});assert.equal(h.nodes().length,0);h.dispose();
});
test("enable is an explicit accessible button without a preselected checkbox",()=>{
  const {h,actions}=section();assert.match(h.text(),/Saved on this device/);
  h.button("Enable cloud backup").props.onPress();assert.deepEqual(actions,["enable"]);
  assert.equal(h.nodes().some(n=>n.props?.accessibilityRole==="checkbox"),false);h.dispose();
});
for(const [status,label] of [["pending","Synchronization pending"],["syncing","Synchronizing"],["up-to-date","Up to date"],
  ["offline","Offline"],["sign-in-required","Sign-in required"],["failed","Synchronization failed"]])test(`accessible status ${status}`,()=>{
  const {h}=section({enabled:true,status});assert.match(h.text(),new RegExp(label));
  assert.ok(h.nodes().some(n=>n.props?.accessibilityLiveRegion==="polite"));
  assert.equal(h.button("Pause cloud backup").props.disabled,false);h.dispose();
});
test("pause remains usable during synchronization and retry does not expose database errors",()=>{
  const {h,actions}=section({enabled:true,status:"syncing"});h.button("Pause cloud backup").props.onPress();assert.deepEqual(actions,["disable"]);
  assert.equal(h.button("Sync now").props.disabled,true);h.dispose();
  const failed=section({enabled:true,status:"failed"});failed.h.button("Retry synchronization").props.onPress();assert.deepEqual(failed.actions,["sync"]);failed.h.dispose();
});
