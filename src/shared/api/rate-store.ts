// A second's margin over the API's minute, so latency can't put a minute's
// last request into the API's next window early.
export const RATE_WINDOW = 61_000;

/**
 * Request counts and cooldowns for the endpoint groups the API limits per
 * IP: one tab's own, or shared by every tab and window of the app.
 */
export interface RateStore {
  /**
   * Counts a request against the group if none of `keys` is cooling down
   * and the group has had fewer than `limit` in the window: then 0.
   * Otherwise null while cooling down, or how long until the oldest
   * request leaves the window. `claim` runs just before the request is
   * counted, in the same step: if it throws, as for a request no one wants
   * any more, nothing is counted and the promise rejects with its error.
   */
  take(
    group: string,
    limit: number,
    keys: string[],
    claim: () => void,
  ): Promise<number | null>;
  cooling(keys: string[]): boolean;
  cool(key: string, until: number): void;
  /** Calls `listener` when another tab or window starts a cooldown. */
  watch(listener: () => void): () => void;
}

const recent = (times: number[], now: number) =>
  times
    .filter((at) => at <= now && now - at < RATE_WINDOW)
    .sort((a, b) => a - b);

/** One tab's own counts, for where storage can't be shared. */
export function memoryRateStore(now: () => number): RateStore {
  const sent = new Map<string, number[]>();
  const cooldowns = new Map<string, number>();
  const cooling = (keys: string[]) =>
    keys.some((key) => now() < (cooldowns.get(key) ?? 0));
  return {
    // Synchronous inside: requests take slots in the order they ask.
    async take(group, limit, keys, claim) {
      if (cooling(keys)) return null;
      const at = now();
      const times = recent(sent.get(group) ?? [], at);
      sent.set(group, times);
      if (times.length >= limit) return times[0] + RATE_WINDOW - at;
      claim();
      times.push(at);
      return 0;
    },
    cooling,
    cool: (key, until) =>
      cooldowns.set(key, Math.max(until, cooldowns.get(key) ?? 0)),
    watch: () => () => {},
  };
}

const PREFIX = "counterlock.api.";

// What the store needs of the browser's LockManager.
export interface Locks {
  request<T>(name: string, callback: () => T): Promise<T>;
}

/** Runs each request in turn: a lock within this tab only. */
export function serialLocks(): Locks {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    request<T>(_name: string, callback: () => T) {
      const run = queue.then(callback);
      queue = run.catch(() => {});
      return run;
    },
  };
}

/**
 * Counts and cooldowns in `storage`, which every tab and window of the app
 * shares, taken under a lock so two can't both claim the last slot.
 */
export function sharedRateStore(
  storage: Storage,
  locks: Locks,
  now: () => number,
  events: EventTarget,
): RateStore {
  const read = (key: string): unknown => {
    try {
      return JSON.parse(storage.getItem(PREFIX + key) ?? "null");
    } catch {
      return null;
    }
  };
  const until = (key: string) => {
    const value = read(`cooldown.${key}`);
    return typeof value === "number" ? value : 0;
  };
  const cooling = (keys: string[]) => keys.some((key) => now() < until(key));
  return {
    take: (group, limit, keys, claim) =>
      locks.request(`${PREFIX}lock`, () => {
        if (cooling(keys)) return null;
        const at = now();
        const stored = read(`sent.${group}`);
        const times = recent(
          Array.isArray(stored)
            ? stored.filter((t): t is number => typeof t === "number")
            : [],
          at,
        );
        if (times.length >= limit) return times[0] + RATE_WINDOW - at;
        claim();
        storage.setItem(
          `${PREFIX}sent.${group}`,
          JSON.stringify([...times, at]),
        );
        return 0;
      }),
    cooling,
    cool: (key, value) =>
      storage.setItem(
        `${PREFIX}cooldown.${key}`,
        JSON.stringify(Math.max(value, until(key))),
      ),
    // Storage events reach every other tab and window, not this one.
    watch(listener) {
      const changed = (event: Event) => {
        const key = (event as StorageEvent).key;
        if (key === null || key.startsWith(`${PREFIX}cooldown.`)) listener();
      };
      events.addEventListener("storage", changed);
      return () => events.removeEventListener("storage", changed);
    },
  };
}

/**
 * Shared counts where the browser has storage: every tab of the website and
 * every Overwolf window of the app. Without Web Locks (they need a secure
 * context) the lock only orders this tab's own requests, so two tabs could
 * claim a group's last slot at the same moment. Without storage, this tab's
 * own counts.
 */
export function defaultRateStore(now: () => number): RateStore {
  if (typeof window === "undefined") return memoryRateStore(now);
  try {
    // Storage can be there but refuse writes (blocked, or full).
    const storage = window.localStorage;
    storage.setItem(`${PREFIX}probe`, "1");
    storage.removeItem(`${PREFIX}probe`);
    return sharedRateStore(
      storage,
      navigator.locks ?? serialLocks(),
      now,
      window,
    );
  } catch {
    return memoryRateStore(now);
  }
}
