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
