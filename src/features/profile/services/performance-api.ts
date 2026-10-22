import { fetchRankCurve } from "@/features/match-report/services/match-report";
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
const stored = new WeakMap<
  DeadlockApi,
  Map<number, Promise<PlayerTotals[] | undefined>>
>();

/**
 * Every player's final totals for each match, by match id, from bulk match
 * metadata in batches of TOTALS_BATCH. A match the API hasn't stored yet is
 * missing from the result and asked for again next time.
 */
export async function fetchMatchTotals(
  matchIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, PlayerTotals[]>> {
  let cache = stored.get(api);
  if (!cache) stored.set(api, (cache = new Map()));
  const known = cache;
  const missing = [...new Set(matchIds)].filter((id) => !known.has(id));
  for (let start = 0; start < missing.length; start += TOTALS_BATCH) {
    const batch = missing.slice(start, start + TOTALS_BATCH);
    const request = api
      .get<unknown>(totalsPath(batch), TTL.analytics)
      .then(parseMatchTotals);
    for (const id of batch) {
      const totals = request.then((found) => found.get(id));
      known.set(id, totals);
      // Not stored yet, or the request failed: ask again next time.
      totals.then(
        (found) => {
          if (!found) known.delete(id);
        },
        () => known.delete(id),
      );
    }
  }
  const found = await Promise.all(
    matchIds.map(async (id) => [id, await known.get(id)] as const),
  );
  return new Map(
    found.filter((entry): entry is [number, PlayerTotals[]] => !!entry[1]),
  );
}

/**
 * Each game's rank averages by match id: the hero's curve for the game's
 * rank, or the player's current rank when the game recorded none. Games
 * share curve requests through the client's cache.
 */
export async function fetchGameAverages(
  accountId: number,
  games: HistoryMatch[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, GameAverage>> {
  const current = games.some((game) => !game.badge)
    ? ((await fetchRank(accountId, api).catch(() => null))?.badge ?? 0)
    : 0;
  const averages = await Promise.all(
    games.map(async (game) => {
      const badge = game.badge || current;
      const curve = await fetchRankCurve(
        game.heroId,
        badge,
        game.durationS,
        api,
      );
      const source = game.badge ? "game" : badge ? "current" : "none";
      return [
        game.matchId,
        gameAverage(curve, game.durationS, source),
      ] as const;
    }),
  );
  return new Map(averages);
}
