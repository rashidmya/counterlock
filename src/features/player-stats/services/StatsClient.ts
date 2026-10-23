import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HeroStats, PlayerRank, StatsEntry } from "../types";

export class StatsClient {
  private cache = new Map<string, StatsEntry>();
  constructor(
    private api: DeadlockApi = deadlockApi,
    private now = Date.now,
  ) {}

  // Through the app's shared client, so these requests keep to the API's
  // rate limits along with every other, and wait out its cooldowns.
  private async get(path: string): Promise<unknown[]> {
    const body = await this.api.get<unknown>(`/v1${path}`, TTL.profile);
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
      return !saved || this.now() - saved.fetchedAt >= TTL.profile;
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
