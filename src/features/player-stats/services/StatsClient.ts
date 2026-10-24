import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HeroStats, PlayerRank, StatsEntry } from "../types";

interface CachedStats {
  entry: StatsEntry;
  heroesAt?: number;
  rankAt?: number;
}

export class StatsClient {
  private cache = new Map<string, CachedStats>();
  constructor(
    private api: DeadlockApi = deadlockApi,
    private now = Date.now,
  ) {}

  private async get(path: string, signal?: AbortSignal): Promise<unknown[]> {
    const body = await this.api.get<unknown>(`/v1${path}`, TTL.profile, signal);
    if (!Array.isArray(body)) throw new Error("Unexpected stats response.");
    return body;
  }

  async load(
    ids: number[],
    mode: "normal" | "street_brawl",
    signal?: AbortSignal,
  ): Promise<Record<number, StatsEntry>> {
    signal?.throwIfAborted();
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const key = (id: number) => `${mode}:${id}`;
    const fresh = (at: number | undefined) =>
      at !== undefined && this.now() - at < TTL.profile;
    const pendingHeroes = unique.filter(
      (id) => !fresh(this.cache.get(key(id))?.heroesAt),
    );
    const pendingRanks = unique.filter(
      (id) => !fresh(this.cache.get(key(id))?.rankAt),
    );
    const params = (pending: number[]) =>
      new URLSearchParams({ account_ids: pending.join(",") });
    const save = (
      id: number,
      patch: Partial<StatsEntry>,
      half: "heroesAt" | "rankAt",
      at?: number,
    ) => {
      const saved = this.cache.get(key(id)) ?? {
        entry: { fetchedAt: this.now() },
      };
      const next = {
        ...saved,
        [half]: at,
        entry: { ...saved.entry, ...patch },
      };
      // Each successful half keeps its own age, including through retries of
      // the other half and the shared client's cached responses.
      next.entry.fetchedAt = Math.min(
        next.heroesAt ?? Infinity,
        next.rankAt ?? Infinity,
        this.now(),
      );
      this.cache.set(key(id), next);
    };
    // Batch only the halves that need loading, one query at a time to avoid
    // database pressure. Save a completed half before starting the next, so
    // a roster that leaves a queued rank request retains its hero data.
    if (pendingHeroes.length) {
      let heroes: HeroStats[] = [];
      let heroError: string | undefined;
      try {
        heroes = (
          await this.get(
            `/players/hero-stats?${params(pendingHeroes)}&game_mode=${mode}&match_mode=ranked,unranked`,
            signal,
          )
        ).filter(validHeroStats);
      } catch (error) {
        signal?.throwIfAborted();
        heroError =
          error instanceof Error ? error.message : "Hero stats unavailable.";
      }
      signal?.throwIfAborted();
      const at = this.now();
      for (const id of pendingHeroes)
        save(
          id,
          {
            heroes: heroError
              ? undefined
              : heroes.filter((hero) => hero.account_id === id),
            heroError,
          },
          "heroesAt",
          heroError ? undefined : at,
        );
    }
    if (pendingRanks.length) {
      let ranks: PlayerRank[] = [];
      let rankError: string | undefined;
      try {
        ranks = (
          await this.get(`/players/rank?${params(pendingRanks)}`, signal)
        ).filter(validRank);
      } catch (error) {
        signal?.throwIfAborted();
        rankError =
          error instanceof Error ? error.message : "Rank unavailable.";
      }
      signal?.throwIfAborted();
      const at = this.now();
      for (const id of pendingRanks)
        save(
          id,
          {
            rank: ranks.find((rank) => rank.account_id === id),
            rankError,
          },
          "rankAt",
          rankError ? undefined : at,
        );
    }
    return Object.fromEntries(
      unique.map((id) => [id, this.cache.get(key(id))!.entry]),
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
