import type { PlayerRank } from "@/features/player-stats/types";
import { DeadlockApi, TTL, deadlockApi } from "@/shared/api/DeadlockApi";
import type { HistoryFilter, HistoryMatch } from "../types";
import { parseHistory } from "../utils/match-history";

export interface SteamProfile {
  accountId: number;
  name: string;
  avatar?: string;
}
export interface MateStat {
  accountId: number;
  games: number;
  wins: number;
}
export interface PlayerHeroStat {
  heroId: number;
  matches: number;
  accuracy: number;
  damagePerMin: number;
}

const MIN_MATE_GAMES = 3;
const MAX_MATES = 5;
const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 10;

type Row = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) => (isNumber(value) ? value : 0);
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === "object")
    : [];

export async function fetchSteamProfiles(
  ids: number[],
  api: DeadlockApi = deadlockApi,
): Promise<SteamProfile[]> {
  if (!ids.length) return [];
  return parseSteamProfiles(
    await api.get<unknown>(
      `/v1/players/steam?account_ids=${ids.join(",")}`,
      TTL.profile,
    ),
  );
}

export async function searchSteamAccounts(
  query: string,
  api: DeadlockApi = deadlockApi,
): Promise<SteamProfile[]> {
  const term = query.trim();
  if (term.length < MIN_SEARCH_LENGTH) return [];
  const data = await api.get<unknown>(
    `/v1/players/steam-search?search_query=${encodeURIComponent(term)}`,
    TTL.profile,
  );
  return parseSteamProfiles(data).slice(0, MAX_SEARCH_RESULTS);
}

const parseSteamProfiles = (data: unknown): SteamProfile[] =>
  rows(data).flatMap((row) =>
    isNumber(row.account_id) && typeof row.personaname === "string"
      ? [
          {
            accountId: row.account_id,
            name: row.personaname,
            avatar:
              typeof row.avatarmedium === "string"
                ? row.avatarmedium
                : undefined,
          },
        ]
      : [],
  );

export async function fetchRank(
  id: number,
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<PlayerRank | null> {
  const data = await api.get<unknown>(
    `/v1/players/rank?account_ids=${id}`,
    TTL.profile,
    signal,
  );
  const row = rows(data).find(
    (r) =>
      r.account_id === id &&
      isNumber(r.badge) &&
      isNumber(r.rank) &&
      isNumber(r.subrank),
  );
  return row ? (row as unknown as PlayerRank) : null;
}

/** Current rank badges by account id, in one request; unranked accounts are left out. */
export async function fetchRankBadges(
  ids: number[],
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<Map<number, number>> {
  const asked = [...new Set(ids.filter((id) => id > 0))].sort((a, b) => a - b);
  if (!asked.length) return new Map();
  const data = await api.get<unknown>(
    `/v1/players/rank?account_ids=${asked.join(",")}`,
    TTL.profile,
    signal,
  );
  return new Map(
    rows(data).flatMap((r) =>
      isNumber(r.account_id) &&
      asked.includes(r.account_id) &&
      isNumber(r.badge) &&
      r.badge > 0
        ? [[r.account_id, r.badge] as const]
        : [],
    ),
  );
}

export async function fetchMatchHistory(
  id: number,
  api: DeadlockApi = deadlockApi,
): Promise<HistoryMatch[]> {
  return parseHistory(
    await api.get<unknown>(`/v1/players/${id}/match-history`, TTL.history),
  );
}

export async function fetchMates(
  id: number,
  api: DeadlockApi = deadlockApi,
): Promise<MateStat[]> {
  const data = await api.get<unknown>(
    `/v1/players/${id}/mate-stats?same_party=true`,
    TTL.profile,
  );
  return rows(data)
    .flatMap((row) =>
      isNumber(row.mate_id) && isNumber(row.matches_played)
        ? [
            {
              accountId: row.mate_id,
              games: row.matches_played,
              wins: count(row.wins),
            },
          ]
        : [],
    )
    .filter((mate) => mate.games >= MIN_MATE_GAMES)
    .sort((a, b) => b.games - a.games)
    .slice(0, MAX_MATES);
}

export function heroStatsQueries(filter: HistoryFilter): string[] {
  const normal = "game_mode=normal";
  const brawl = "game_mode=street_brawl";
  if (filter === "normal") return [`${normal}&match_mode=unranked`];
  if (filter === "ranked") return [`${normal}&match_mode=ranked`];
  if (filter === "street_brawl") return [brawl];
  return [`${normal}&match_mode=ranked,unranked`, brawl];
}

export const fetchPlayerHeroStats = (
  id: number,
  filter: HistoryFilter,
  api: DeadlockApi = deadlockApi,
) => fetchHeroStats(id, heroStatsQueries(filter), api);

async function fetchHeroStats(
  id: number,
  queries: string[],
  api: DeadlockApi,
): Promise<PlayerHeroStat[]> {
  const responses = await Promise.all(
    queries.map((query) =>
      api.get<unknown>(
        `/v1/players/hero-stats?account_ids=${id}&${query}`,
        TTL.profile,
      ),
    ),
  );
  const totals = new Map<
    number,
    { matches: number; accuracy: number; damage: number }
  >();
  for (const row of responses.flatMap(rows)) {
    if (
      !isNumber(row.hero_id) ||
      !isNumber(row.matches_played) ||
      !isNumber(row.accuracy) ||
      !isNumber(row.damage_per_min) ||
      row.matches_played <= 0
    )
      continue;
    const total = totals.get(row.hero_id) ?? {
      matches: 0,
      accuracy: 0,
      damage: 0,
    };
    total.matches += row.matches_played;
    total.accuracy += row.accuracy * row.matches_played;
    total.damage += row.damage_per_min * row.matches_played;
    totals.set(row.hero_id, total);
  }
  return [...totals].map(([heroId, t]) => ({
    heroId,
    matches: t.matches,
    accuracy: t.accuracy / t.matches,
    damagePerMin: t.damage / t.matches,
  }));
}
