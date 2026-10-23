const BASE = "https://api.deadlock-api.com";
const BUSY = "API busy. Retry after the cooldown.";
const MINUTE = 60_000;

export const TTL = {
  analytics: 10 * 60_000,
  profile: 5 * 60_000,
  history: 2 * 60_000,
};

// Requests a minute per IP, from the API's OpenAPI docs, for the groups the
// app could reach; the other endpoints allow 100 a second.
export const RATE_LIMITS: Record<string, number> = {
  "/v1/analytics": 200,
  "/v1/matches/metadata": 30,
  "/v1/players/rank": 20,
};
// A second's margin, so latency can't put a minute's last request into the
// API's next window early.
export const RATE_WINDOW = MINUTE + 1000;

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

/**
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree.
 */
export class DeadlockApi {
  private cache = new Map<
    string,
    { data: unknown; fetchedAt: number; ttl: number }
  >();
  private inFlight = new Map<string, Promise<unknown>>();
  private cooldowns = new Map<string, number>();
  private sent = new Map<string, number[]>();
  private sweptAt = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  get<T>(path: string, ttlMs: number): Promise<T> {
    const saved = this.cache.get(path);
    if (saved && this.now() - saved.fetchedAt < ttlMs)
      return Promise.resolve(saved.data as T);
    const pending = this.inFlight.get(path);
    if (pending) return pending as Promise<T>;
    const group = endpointGroup(path);
    if (this.cooling(path, group)) return Promise.reject(new Error(BUSY));
    const run = this.send<T>(path, group)
      .then((data) => {
        this.store(path, data, ttlMs);
        return data;
      })
      .finally(() => this.inFlight.delete(path));
    this.inFlight.set(path, run);
    return run;
  }

  private cooling(path: string, group: string) {
    const now = this.now();
    return [EVERYTHING, refused(path, group)].some(
      (key) => now < (this.cooldowns.get(key) ?? 0),
    );
  }

  /** Sends at once, or when the group's rate limit has room. */
  private async send<T>(path: string, group: string): Promise<T> {
    const limit = RATE_LIMITS[group];
    if (limit) await this.throttle(path, group, limit);
    return this.fetchJson<T>(path, group);
  }

  /**
   * Waits until the group has had fewer than `limit` requests in the window,
   * then counts this one. A cooldown that started while it waited fails it
   * before it takes a slot.
   */
  private async throttle(path: string, group: string, limit: number) {
    const sent = this.sent.get(group) ?? [];
    this.sent.set(group, sent);
    for (;;) {
      if (this.cooling(path, group)) throw new Error(BUSY);
      const now = this.now();
      while (sent.length && now - sent[0] >= RATE_WINDOW) sent.shift();
      if (sent.length < limit) {
        sent.push(now);
        return;
      }
      await this.wait(sent[0] + RATE_WINDOW - now);
    }
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

  private async fetchJson<T>(path: string, group: string): Promise<T> {
    let response: Response;
    try {
      response = await this.request(`${BASE}${path}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error("Deadlock API unreachable.");
      throw this.mapTimeout(error);
    }
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get("Retry-After");
      const seconds = header ? Number(header) : NaN;
      const until = Number.isFinite(seconds)
        ? this.now() + seconds * 1000
        : Date.parse(header ?? "");
      this.cooldowns.set(
        response.status === 503 ? EVERYTHING : refused(path, group),
        Math.max(this.now() + 30_000, Number.isFinite(until) ? until : 0),
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
