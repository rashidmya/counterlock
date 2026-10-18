import type { HeroStats, PlayerRank, StatsEntry } from "./types";

const BASE = "https://api.deadlock-api.com/v1";
const TTL = 5 * 60_000;
export class StatsClient {
  private cache = new Map<string, StatsEntry>();
  private cooldownUntil = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now = Date.now,
  ) {}

  private async get(path: string): Promise<unknown[]> {
    if (this.now() < this.cooldownUntil)
      throw new Error("API busy. Retry after the cooldown.");
    const response = await this.request(`${BASE}${path}`, {
      signal: AbortSignal.timeout(15_000),
    });
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
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Stats unavailable or profile protected."
          : `Stats API unavailable (${response.status}).`,
      );
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("Unexpected stats response.");
    return body;
  }

  async load(
    ids: number[],
    mode: "normal" | "street_brawl",
  ): Promise<Record<number, StatsEntry>> {
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const pending = unique.filter((id) => {
      const saved = this.cache.get(`${mode}:${id}`);
      return !saved || this.now() - saved.fetchedAt >= TTL;
    });
    if (pending.length) {
      const params = new URLSearchParams({ account_ids: pending.join(",") });
      // Batch the roster; keep the two upstream queries sequential to avoid database pressure.
      let heroes: HeroStats[] = [],
        ranks: PlayerRank[] = [];
      let heroError: string | undefined, rankError: string | undefined;
      try {
        heroes = (
          await this.get(
            `/players/hero-stats?${params}&game_mode=${mode}&match_mode=ranked,unranked`,
          )
        ).filter(validHeroStats);
      } catch (error) {
        heroError =
          error instanceof Error ? error.message : "Hero stats unavailable.";
      }
      try {
        ranks = (await this.get(`/players/rank?${params}`)).filter(validRank);
      } catch (error) {
        rankError =
          error instanceof Error ? error.message : "Rank unavailable.";
      }
      for (const id of pending) {
        this.cache.set(`${mode}:${id}`, {
          heroes: heroError
            ? undefined
            : heroes.filter((h) => h.account_id === id),
          rank: ranks.find((r) => r.account_id === id),
          heroError,
          rankError,
          fetchedAt: this.now(),
        });
      }
    }
    return Object.fromEntries(
      unique.map((id) => [id, this.cache.get(`${mode}:${id}`)!]),
    );
  }
}
function validHeroStats(row: unknown): row is HeroStats {
  if (!row || typeof row !== "object") return false;
  const r = row as HeroStats;
  return (
    [r.account_id, r.hero_id, r.matches_played, r.wins].every(
      (x) => Number.isSafeInteger(x) && x >= 0,
    ) && r.wins <= r.matches_played
  );
}
function validRank(row: unknown): row is PlayerRank {
  if (!row || typeof row !== "object") return false;
  const r = row as PlayerRank;
  return [r.account_id, r.badge, r.rank, r.subrank].every(
    (x) => Number.isSafeInteger(x) && x >= 0,
  );
}
