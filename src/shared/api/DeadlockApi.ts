import {
  MAX_COOLDOWN,
  RATE_WINDOW,
  defaultRateStore,
  type RateStore,
} from "./rate-store";

export { RATE_WINDOW };

const BASE = "https://api.deadlock-api.com";
const BUSY = "API busy. Retry after the cooldown.";
const MINUTE = 60_000;

export const TTL = {
  analytics: 10 * 60_000,
  profile: 5 * 60_000,
  history: 2 * 60_000,
  // Under the minute between the profile Live tab's checks, so each one
  // asks again.
  live: 30_000,
};

// Requests a minute per IP, from the API's OpenAPI docs, for the groups the
// app could reach; the other endpoints allow 100 a second.
export const RATE_LIMITS: Record<string, number> = {
  "/v1/analytics": 200,
  "/v1/matches/metadata": 30,
  "/v1/players/rank": 20,
};
/**
 * The group a path's rate limit belongs to: the analytics endpoints share
 * one limit; any other endpoint has its own.
 */
export function endpointGroup(path: string) {
  const pathname = path.split("?")[0];
  if (pathname.startsWith("/v1/analytics/")) return "/v1/analytics";
  return pathname.replace(/\/\d+(?=\/|$)/g, "/{id}");
}

// A 503 means the API is shedding load: its database-backed endpoints share
// one query queue, so every request waits out the cooldown.
const EVERYTHING = "*";

// What a 429 pauses: the group when the API limits it as a whole, otherwise
// only the refused path, as those endpoints' limits depend on where the data
// comes from (a match from the API's cache, or from Steam).
const refused = (path: string, group: string) =>
  RATE_LIMITS[group] ? group : path;

// The cooldowns that hold a group back, shared with the app's other tabs and
// windows, as the API counts per IP: everything's, and the group's own when
// the API limits it as a whole. A refused path's stays with this tab.
const sharedKeys = (group: string) =>
  RATE_LIMITS[group] ? [EVERYTHING, group] : [EVERYTHING];

// A request on its way: shared by everyone who asks for its path while it
// is out.
interface Pending {
  promise: Promise<unknown>;
  // Callers still waiting for it; Infinity once one came without a signal.
  callers: number;
  // Aborted when every caller has left before it claimed its slot.
  abandon: AbortController;
  // Until it claims its slot in the group's rate limit (at once where the
  // group has none): every caller leaving before then drops it, and once
  // claimed it goes out.
  queued: boolean;
}

/**
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree. Likewise, a path is always asked for
 * `fresh`, or never.
 */
export class DeadlockApi {
  private cache = new Map<
    string,
    { data: unknown; fetchedAt: number; ttl: number }
  >();
  private inFlight = new Map<string, Pending>();
  // Refused paths' cooldowns.
  private cooldowns = new Map<string, number>();
  // Requests waiting for room: a cooldown wakes them to fail at once.
  private sleepers = new Set<() => void>();
  private sweptAt = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
    private wait: (ms: number, signal: AbortSignal) => Promise<void> = (
      ms,
      signal,
    ) =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      }),
    private limits: RateStore = defaultRateStore(now),
  ) {
    // A cooldown another tab started holds back this one's waiting requests.
    limits.watch(() => this.wake());
  }

  /**
   * The response for `path`, cached for `ttlMs`. A caller whose `signal`
   * aborts stops waiting at once; the request itself is dropped only if it
   * hasn't claimed its slot yet and no one else still wants it. `fresh`
   * asks past the browser's HTTP cache, for answers it would keep longer
   * than they stay true.
   */
  get<T>(
    path: string,
    ttlMs: number,
    signal?: AbortSignal,
    { fresh = false } = {},
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const saved = this.cache.get(path);
    if (saved && this.now() - saved.fetchedAt < ttlMs)
      return Promise.resolve(saved.data as T);
    let pending = this.inFlight.get(path);
    if (!pending) {
      const group = endpointGroup(path);
      if (this.cooling(path, group)) return Promise.reject(new Error(BUSY));
      pending = this.start(path, group, ttlMs, fresh);
    }
    return this.follow(path, pending, signal) as Promise<T>;
  }

  private start(path: string, group: string, ttlMs: number, fresh: boolean) {
    const pending: Pending = {
      promise: Promise.resolve(),
      callers: 0,
      abandon: new AbortController(),
      queued: true,
    };
    pending.promise = this.send(path, group, pending, fresh)
      .then((data) => {
        this.store(path, data, ttlMs);
        return data;
      })
      .finally(() => {
        if (this.inFlight.get(path) === pending) this.inFlight.delete(path);
      });
    this.inFlight.set(path, pending);
    return pending;
  }

  /** The request's answer, for one caller, who may leave early. */
  private follow(path: string, pending: Pending, signal?: AbortSignal) {
    if (!signal) {
      pending.callers = Infinity;
      return pending.promise;
    }
    pending.callers++;
    return new Promise((resolve, reject) => {
      const leave = () => {
        reject(signal.reason);
        if (--pending.callers || !pending.queued) return;
        // No one wants it any more, and it hasn't claimed its slot.
        pending.abandon.abort();
        if (this.inFlight.get(path) === pending) this.inFlight.delete(path);
      };
      signal.addEventListener("abort", leave, { once: true });
      pending.promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", leave));
    });
  }

  private cooling(path: string, group: string) {
    return (
      this.now() < (this.cooldowns.get(path) ?? 0) ||
      this.limits.cooling(sharedKeys(group))
    );
  }

  /** Sends at once, or when the group's rate limit has room. */
  private async send<T>(
    path: string,
    group: string,
    pending: Pending,
    fresh: boolean,
  ): Promise<T> {
    const limit = RATE_LIMITS[group];
    if (limit) await this.throttle(path, group, limit, pending);
    else pending.queued = false;
    return this.fetchJson<T>(path, group, fresh);
  }

  /**
   * Waits until the group has had fewer than `limit` requests in the window
   * (in every tab), then counts this one: from then on it goes out, even
   * if every caller leaves. A cooldown that starts while it waits fails it
   * at once, before it takes a slot, as does every caller leaving.
   */
  private async throttle(
    path: string,
    group: string,
    limit: number,
    pending: Pending,
  ) {
    const abandoned = pending.abandon.signal;
    // In the same step as the count, so no caller can leave between the two.
    const claim = () => {
      abandoned.throwIfAborted();
      pending.queued = false;
    };
    for (;;) {
      abandoned.throwIfAborted();
      const wait = await this.limits.take(
        group,
        limit,
        sharedKeys(group),
        claim,
      );
      if (wait === null) throw new Error(BUSY);
      if (!wait) return;
      await this.pause(wait, abandoned, () => this.cooling(path, group));
    }
  }

  /**
   * Waits `ms`, or less when a cooldown starts or every caller leaves;
   * at once if either happened while the slot was asked for.
   */
  private async pause(
    ms: number,
    abandoned: AbortSignal,
    cooling: () => boolean,
  ) {
    const woken = new AbortController();
    const wake = () => woken.abort();
    this.sleepers.add(wake);
    abandoned.addEventListener("abort", wake);
    try {
      if (abandoned.aborted || cooling()) return;
      await Promise.race([
        this.wait(ms, woken.signal),
        new Promise((resolve) =>
          woken.signal.addEventListener("abort", resolve),
        ),
      ]);
    } finally {
      this.sleepers.delete(wake);
      abandoned.removeEventListener("abort", wake);
    }
  }

  private wake() {
    for (const wake of [...this.sleepers]) wake();
  }

  private cool(key: string, until: number) {
    if (key === EVERYTHING || RATE_LIMITS[key]) this.limits.cool(key, until);
    else this.cooldowns.set(key, until);
    this.wake();
  }

  // Responses that have outlived their ttl are dropped, at most once a
  // minute, so a long session doesn't keep every response it has seen.
  private store(path: string, data: unknown, ttl: number) {
    const now = this.now();
    if (now - this.sweptAt >= MINUTE) {
      this.sweptAt = now;
      for (const [key, entry] of this.cache)
        if (now - entry.fetchedAt >= entry.ttl) this.cache.delete(key);
    }
    this.cache.set(path, { data, fetchedAt: now, ttl });
  }

  // The timeout covers both the request and reading the body.
  private mapTimeout(error: unknown) {
    return error instanceof Error && error.name === "TimeoutError"
      ? new Error("Deadlock API timed out.")
      : error;
  }

  private async fetchJson<T>(
    path: string,
    group: string,
    fresh: boolean,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.request(`${BASE}${path}`, {
        signal: AbortSignal.timeout(15_000),
        // Checked with the API rather than taken from the browser's cache.
        ...(fresh ? { cache: "no-cache" as const } : {}),
      });
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error("Deadlock API unreachable.");
      throw this.mapTimeout(error);
    }
    if (response.status === 429 || response.status === 503) {
      const now = this.now();
      const header = response.headers.get("Retry-After");
      const seconds = header ? Number(header) : NaN;
      const until = Number.isFinite(seconds)
        ? now + seconds * 1000
        : Date.parse(header ?? "");
      // At least 30 seconds, and at most MAX_COOLDOWN, whatever the header
      // says: the cooldown outlives a reload.
      this.cool(
        response.status === 503 ? EVERYTHING : refused(path, group),
        Math.min(
          now + MAX_COOLDOWN,
          Math.max(now + 30_000, Number.isFinite(until) ? until : 0),
        ),
      );
      throw new Error(BUSY);
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Data unavailable or profile protected."
          : `Deadlock API unavailable (${response.status}).`,
      );
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw this.mapTimeout(error);
    }
  }
}

export const deadlockApi = new DeadlockApi();
