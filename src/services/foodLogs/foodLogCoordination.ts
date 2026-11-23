export type ChangeSource = symbol | undefined;
export type StorageChange = { oldValue: string | null; newValue: string | null };
type Listener = (source: ChangeSource, change?: StorageChange) => void;
export type FoodLogCoordination = {
  exclusive<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  subscribe(key: string, listener: Listener): () => void;
  publish(key: string, source?: symbol): void;
};

export class FoodLogCoordinationError extends Error {
  constructor() {
    super("Safe browser storage coordination is unavailable. Use a supported browser over HTTPS or localhost, or retry later.");
    this.name = "FoodLogCoordinationError";
  }
}

function changes() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    subscribe(key: string, listener: Listener) {
      const scoped = listeners.get(key) ?? new Set<Listener>();
      scoped.add(listener); listeners.set(key, scoped);
      return () => { scoped.delete(listener); if (!scoped.size) listeners.delete(key); };
    },
    publish(key: string | null, source?: symbol) {
      for (const [name, scoped] of listeners) if (key === null || name === key) {
        for (const listener of [...scoped]) {
          try { listener(source); } catch { /* Notifications cannot fail a durable write. */ }
        }
      }
    },
  };
}

// Native callers retain their existing per-key queues. No browser globals here.
export const nativeFoodLogCoordination: FoodLogCoordination = {
  exclusive: (_key, work) => work(),
  ...changes(),
};

export type WebStorageHost = {
  locks?: {
    request<T>(name: string, options: { mode: "exclusive"; signal: AbortSignal }, work: () => Promise<T>): Promise<T>;
  };
  subscribeStorage(listener: (key: string | null, change?: StorageChange) => void): () => void;
};

export function createWebFoodLogCoordination(host: () => WebStorageHost, waitMs = 10000): FoodLogCoordination {
  const notifications = changes();
  return {
    async exclusive(key, work, signal) {
      const waiting = new AbortController();
      const abort = () => waiting.abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let acquired = false;
      try {
        const locks = host().locks;
        if (!locks || signal?.aborted) throw new FoodLogCoordinationError();
        signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(abort, waitMs);
        return await locks.request(`caloribite:storage:${key}`, { mode: "exclusive", signal: waiting.signal }, async () => {
          acquired = true;
          clearTimeout(timer); // Timeout applies only to acquisition, never to an accepted write.
          if (signal?.aborted) throw new FoodLogCoordinationError();
          return work();
        });
      } catch (error) {
        // Keep domain/ownership errors from work intact; never retry without a lock.
        if (acquired) throw error;
        throw new FoodLogCoordinationError();
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    },
    subscribe(key, listener) {
      const unsubscribeLocal = notifications.subscribe(key, listener);
      const unsubscribeStorage = host().subscribeStorage((changedKey, change) => {
        if (changedKey === null || changedKey === key) listener(undefined, changedKey === null ? undefined : change);
      });
      return () => { unsubscribeLocal(); unsubscribeStorage(); };
    },
    publish: notifications.publish,
  };
}
