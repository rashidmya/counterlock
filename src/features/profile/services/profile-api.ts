import type { PlayerRank } from "@/features/player-stats/types";
import { DeadlockApi, TTL, deadlockApi } from "@/shared/api/DeadlockApi";
import { itemById } from "@/shared/catalog";
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
export interface ScoreboardPlayer {
  accountId: number;
  team: number;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  level: number;
  items: number[];
}
export interface Scoreboard {
  matchId: number;
  durationS: number;
  winningTeam: number;
  players: ScoreboardPlayer[];
}
export interface PlayerHeroStat {
  heroId: number;
  matches: number;
  accuracy: number;
  damagePerMin: number;
}

export const SUMMARY_HERO_STATS = "game_mode=normal&match_mode=ranked,unranked";

const MIN_MATE_GAMES = 3;
const MAX_MATES = 5;

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
  const data = await api.get<unknown>(
    `/v1/players/steam?account_ids=${ids.join(",")}`,
    TTL.profile,
  );
  return rows(data).flatMap((row) =>
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
}

export async function fetchRank(
  id: number,
  api: DeadlockApi = deadlockApi,
): Promise<PlayerRank | null> {
  const data = await api.get<unknown>(
    `/v1/players/rank?account_ids=${id}`,
    TTL.profile,
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

export async function fetchPlayerHeroStats(
  id: number,
  filter: HistoryFilter,
  api: DeadlockApi = deadlockApi,
): Promise<PlayerHeroStat[]> {
  const responses = await Promise.all(
    heroStatsQueries(filter).map((query) =>
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

function finalItems(value: unknown): number[] {
  const kept = rows(value)
    .filter(
      (item) =>
        item.sold_time_s === 0 &&
        isNumber(item.item_id) &&
        itemById.has(item.item_id),
    )
    .sort((a, b) => count(a.game_time_s) - count(b.game_time_s));
  return [...new Set(kept.map((item) => item.item_id as number))];
}

export async function fetchScoreboard(
  matchId: number,
  api: DeadlockApi = deadlockApi,
): Promise<Scoreboard> {
  const data = await api.get<{ match_info?: Row }>(
    `/v1/matches/${matchId}/metadata`,
    TTL.analytics,
  );
  const info = data?.match_info;
  if (!info || !isNumber(info.winning_team))
    throw new Error("Match details unavailable.");
  const players = rows(info.players).flatMap((p) =>
    isNumber(p.account_id) && isNumber(p.team) && isNumber(p.hero_id)
      ? [
          {
            accountId: p.account_id,
            team: p.team,
            heroId: p.hero_id,
            kills: count(p.kills),
            deaths: count(p.deaths),
            assists: count(p.assists),
            netWorth: count(p.net_worth),
            lastHits: count(p.last_hits),
            denies: count(p.denies),
            level: count(p.level),
            items: finalItems(p.items),
          },
        ]
      : [],
  );
  return {
    matchId: isNumber(info.match_id) ? info.match_id : matchId,
    durationS: count(info.duration_s),
    winningTeam: info.winning_team,
    players,
  };
}
