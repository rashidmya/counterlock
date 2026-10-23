import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HistoryMatch } from "../types";
import {
  TOTALS_BATCH,
  parseMatchTotals,
  totalsPath,
  type PlayerTotals,
} from "../utils/match-totals";
import { gameAverage, type GameAverage } from "../utils/performance-metrics";
import { fetchRank } from "./profile-api";

// Kept per match and per client (tests bring their own), so a wider range
// only asks for the games it adds.
type Entries = Map<number, Promise<PlayerTotals[] | undefined>>;
const totalsCache = new WeakMap<DeadlockApi, Entries>();

/**
 * Every player's final totals for each match, by match id, from bulk match
 * metadata in batches of TOTALS_BATCH. A match the API hasn't stored yet is
 * missing from the result and asked for again next time; the client keeps
 * each response for TTL.history (two minutes, as match history), so a game
 * just played appears soon after the API stores it.
 */
export async function fetchMatchTotals(
  matchIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, PlayerTotals[]>> {
  const known: Entries = totalsCache.get(api) ?? new Map();
  totalsCache.set(api, known);
  const missing = [...new Set(matchIds)].filter((id) => !known.has(id));
  for (let start = 0; start < missing.length; start += TOTALS_BATCH) {
    const batch = missing.slice(start, start + TOTALS_BATCH);
    const request = api
      .get<unknown>(totalsPath(batch), TTL.history)
      .then(parseMatchTotals);
    for (const id of batch) {
      const entry = request.then((matches) => matches.get(id));
      known.set(id, entry);
      // Not stored yet, or the request failed: ask again next time.
      const forget = () => {
        if (known.get(id) === entry) known.delete(id);
      };
      entry.then((players) => {
        if (!players) forget();
      }, forget);
    }
  }
  const entries = await Promise.all(
    matchIds.map(async (id) => [id, await known.get(id)] as const),
  );
  return new Map(
    entries.filter((entry): entry is [number, PlayerTotals[]] => !!entry[1]),
  );
}

// Hero-and-rank groups whose curves load at once. An uncached curve takes
// seconds, and Last 100 can need a dozen; all at once, the slowest would run
// past the client's timeout.
export const CURVE_CONCURRENCY = 4;

export interface GameAverages {
  // By match id; games whose curve failed are missing.
  byMatch: Map<number, GameAverage>;
  // The games whose curve failed.
  failed: Set<number>;
  // A failure's message, for the notice.
  error?: string;
}

/** Runs `run` over the items, at most `limit` at a time; `run` must not reject. */
async function eachLimited<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}

/**
 * Each game's rank averages: the hero's curve for the game's rank, or the
 * player's current rank when the game recorded none. Games of one hero and
 * rank tier share their curve requests; a few groups load at a time, and a
 * failed curve only leaves its own games without an average. It fails as a
 * whole only when no game gets one.
 */
export async function fetchGameAverages(
  accountId: number,
  games: HistoryMatch[],
  api: DeadlockApi = deadlockApi,
): Promise<GameAverages> {
  const current = games.some((game) => !game.badge)
    ? ((await fetchRank(accountId, api).catch(() => null))?.badge ?? 0)
    : 0;
  const badge = (game: HistoryMatch) => game.badge || current;
  const groups = new Map<string, HistoryMatch[]>();
  for (const game of games) {
    // Games that ask for the same curve form a group.
    const key = curvePath(game.heroId, rankBand(badge(game)));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(game);
  }
  const byMatch = new Map<number, GameAverage>();
  const failed = new Set<number>();
  let error: string | undefined;
  await eachLimited([...groups.values()], CURVE_CONCURRENCY, async (group) => {
    const results = await Promise.allSettled(
      group.map(async (game) => {
        const curve = await fetchRankCurve(
          game.heroId,
          badge(game),
          game.durationS,
          api,
        );
        const source = game.badge ? "game" : badge(game) ? "current" : "none";
        byMatch.set(game.matchId, gameAverage(curve, game.durationS, source));
      }),
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      failed.add(group[index].matchId);
      error ??=
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
    });
  });
  if (failed.size && !byMatch.size) throw new Error(error);
  return { byMatch, failed, error };
}
