const BASE = "https://api.deadlock-api.com";
const BUSY = "API busy. Retry after the cooldown.";

export const TTL = {
  analytics: 10 * 60_000,
  profile: 5 * 60_000,
  history: 2 * 60_000,
};

export class DeadlockApi {
  private cache = new Map<string, { data: unknown; fetchedAt: number }>();
  private inFlight = new Map<string, Promise<unknown>>();
  private cooldownUntil = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
  ) {}

  get<T>(path: string, ttlMs: number): Promise<T> {
    const saved = this.cache.get(path);
    if (saved && this.now() - saved.fetchedAt < ttlMs)
      return Promise.resolve(saved.data as T);
    const pending = this.inFlight.get(path);
    if (pending) return pending as Promise<T>;
    if (this.now() < this.cooldownUntil) return Promise.reject(new Error(BUSY));
    const run = this.fetchJson<T>(path)
      .then((data) => {
        this.cache.set(path, { data, fetchedAt: this.now() });
        return data;
      })
      .finally(() => this.inFlight.delete(path));
    this.inFlight.set(path, run);
    return run;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await this.request(`${BASE}${path}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new Error("Deadlock API timed out.");
      if (error instanceof TypeError)
        throw new Error("Deadlock API unreachable.");
      throw error;
    }
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get("Retry-After");
      const seconds = header ? Number(header) : NaN;
      const until = Number.isFinite(seconds)
        ? this.now() + seconds * 1000
        : Date.parse(header ?? "");
      this.cooldownUntil = Math.max(
        this.now() + 30_000,
        Number.isFinite(until) ? until : 0,
      );
      throw new Error(BUSY);
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Data unavailable or profile protected."
          : `Deadlock API unavailable (${response.status}).`,
      );
    return (await response.json()) as T;
  }
}

export const deadlockApi = new DeadlockApi();
