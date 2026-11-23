import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import type * as TypeScript from "typescript";
import type { FoodLogCoordination, StorageChange, WebStorageHost } from "../foodLogCoordination";

const sourceCache = new Map<string, string>();
// Every tab gets its own module cache and module-level queues/listeners.
// Only immutable transpiled source, the backing bytes, and browser primitives are shared.
function independentRuntime(adapters: Record<string, unknown> = {}) {
  const ts = createRequire(resolve("package.json"))("typescript") as typeof TypeScript;
  const modules = new Map<string, { exports: any }>();
  function load(file: string): any {
    file = resolve(file); if (!extname(file)) file += ".ts";
    if (modules.has(file)) return modules.get(file)!.exports;
    const module = { exports: {} }; modules.set(file, module);
    let code = sourceCache.get(file);
    if (!code) {
      code = ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      sourceCache.set(file, code);
    }
    runInNewContext(code, { module, exports: module.exports,
      require: (name: string) => {
        if (name in adapters) return adapters[name];
        if (!name.startsWith(".")) throw Error(`Unexpected runtime dependency: ${name}`);
        return load(resolve(dirname(file), name));
      }, Error, AbortController, setTimeout, clearTimeout, console });
    return module.exports;
  }
  return load;
}

export function platformCoordination(platform: string): FoodLogCoordination {
  return independentRuntime({ "react-native": { Platform: { OS: platform } } })("src/services/foodLogs/platformFoodLogCoordination.ts").foodLogCoordination;
}

export function gate() {
  let enter!: () => void; let release!: () => void;
  const started = new Promise<void>(r => { enter = r; });
  const waiting = new Promise<void>(r => { release = r; });
  return { started, release, async wait() { enter(); await waiting; } };
}
export const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
export const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const food = () => ({ id: randomUUID(), foodName: "Synthetic meal", calories: 1.2345,
  protein: 0, carbs: 2.5, fat: 0, mealType: "Lunch" as const,
  createdAt: "2026-01-01T00:00:00.000Z", loggedDate: "2026-01-01" });

export function browserHarness() {
  const data = new Map<string, string>();
  const pending = new Map<string, (() => void)[]>();
  const active = new Set<string>();
  const contexts: { listeners: Set<(key: string | null, change?: StorageChange) => void> }[] = [];
  let failLock = false;
  let deliverEvents = true;
  const locks: NonNullable<WebStorageHost["locks"]> = {
    request<T>(key: string, options: { signal: AbortSignal }, work: () => Promise<T>): Promise<T> {
      if (failLock) { failLock = false; return Promise.reject(Error("Browser refused lock acquisition")); }
      return new Promise<T>((resolveRequest, reject) => {
        const queue = pending.get(key) ?? []; pending.set(key, queue);
        let acquired = false;
        const abort = () => {
          if (acquired) return;
          const at = queue.indexOf(start); if (at >= 0) queue.splice(at, 1);
          const error = Error("Aborted while waiting"); error.name = "AbortError"; reject(error);
        };
        const next = () => { active.delete(key); queue.shift()?.(); };
        const start = () => {
          if (options.signal.aborted) { abort(); next(); return; }
          if (active.has(key)) { queue.unshift(start); return; }
          acquired = true; active.add(key); options.signal.removeEventListener("abort", abort);
          void Promise.resolve().then(work).then(resolveRequest, reject).finally(next);
        };
        options.signal.addEventListener("abort", abort, { once: true });
        if (options.signal.aborted) abort();
        else if (active.has(key)) queue.push(start);
        else start();
      });
    },
  };
  function tab(options: { supported?: boolean; waitMs?: number } = {}) {
    const load = independentRuntime();
    const context = { listeners: new Set<(key: string | null, change?: StorageChange) => void>() };
    contexts.push(context);
    let reads = 0; let writes = 0;
    let beforeRead: (key: string) => Promise<void> = async () => {};
    let beforeWrite: (key: string, value: string) => Promise<void> = async () => {};
    const host: WebStorageHost = {
      locks: options.supported === false ? undefined : locks,
      subscribeStorage(listener) { context.listeners.add(listener); return () => { context.listeners.delete(listener); }; },
    };
    const coordination = load("src/services/foodLogs/foodLogCoordination.ts").createWebFoodLogCoordination(() => host, options.waitMs);
    const adapter = {
      async getItem(key: string) { reads++; await beforeRead(key); return data.get(key) ?? null; },
      async setItem(key: string, value: string) {
        await beforeWrite(key, value); const oldValue = data.get(key) ?? null;
        writes++; data.set(key, value);
        if (oldValue !== value && deliverEvents) for (const other of contexts) if (other !== context) {
          queueMicrotask(() => { for (const listener of other.listeners) listener(key, { oldValue, newValue: value }); });
        }
      },
    };
    const storageModule = load("src/services/foodLogs/foodLogStorage.ts") as typeof import("../foodLogStorage");
    const prefsModule = load("src/services/foodLogs/foodLogBackupPreferences.ts") as typeof import("../foodLogBackupPreferences");
    return { load, coordination, adapter, storageModule, prefsModule,
      storage: storageModule.createFoodLogStorage(adapter, randomUUID, coordination),
      preferences: prefsModule.createBackupPreferenceStorage(adapter, coordination),
      get reads() { return reads; }, get writes() { return writes; },
      onRead(fn: typeof beforeRead) { beforeRead = fn; },
      onWrite(fn: typeof beforeWrite) { beforeWrite = fn; },
      readDiary(uid = user) { return JSON.parse(data.get(storageModule.foodLogSyncKey(uid))!); },
    };
  }
  return { data, tab, locks, failNextLock() { failLock = true; }, events(enabled: boolean) { deliverEvents = enabled; } };
}
