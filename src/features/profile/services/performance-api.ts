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
// only asks for the games it adds: a match's totals once known, or the batch
// request still out for it.
type Entry = PlayerTotals[] | { path: string; batch: number[] };
const totalsCache = new WeakMap<DeadlockApi, Map<number, Entry>>();

/**
 * Every player's final totals for each match, by match id, from bulk match
 * metadata in batches of TOTALS_BATCH. A match the API hasn't stored yet is
 * missing from the result and asked for again next time; the client keeps
 * each response for TTL.history (two minutes, as match history), so a game
 * just played appears soon after the API stores it.
 *
 * A batch another call already asked for is asked for again: the client
 * shares the request while it's out, and drops it only once no call waits
 * for it, so a call that leaves (`signal`) never takes another's games
 * with it.
 */
export async function fetchMatchTotals(
  matchIds: number[],
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<Map<number, PlayerTotals[]>> {
  const known = totalsCache.get(api) ?? new Map<number, Entry>();
  totalsCache.set(api, known);
  const missing = [...new Set(matchIds)].filter((id) => !known.has(id));
  for (let start = 0; start < missing.length; start += TOTALS_BATCH) {
    const batch = missing.slice(start, start + TOTALS_BATCH);
    const entry = { path: totalsPath(batch), batch };
    for (const id of batch) known.set(id, entry);
  }
  const waiting = new Map<string, number[]>();
  for (const id of matchIds) {
    const entry = known.get(id);
    if (entry && !Array.isArray(entry)) waiting.set(entry.path, entry.batch);
  }
  await Promise.all(
    [...waiting].map(async ([path, batch]) => {
      const matches = parseMatchTotals(
        await api.get<unknown>(path, TTL.history, signal),
      );
      for (const id of batch) {
        const players = matches.get(id);
        const entry = known.get(id);
        if (players) known.set(id, players);
        // Not stored yet: ask again next time.
        else if (entry && !Array.isArray(entry) && entry.path === path)
          known.delete(id);
      }
    }),
  );
  return new Map(
    matchIds.flatMap((id) => {
      const entry = known.get(id);
      return Array.isArray(entry) ? [[id, entry] as const] : [];
    }),
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

/**
 * Runs `run` over the items, at most `limit` at a time, starting no more
 * once `signal` aborts; `run` must not reject.
 */
async function eachLimited<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
  signal?: AbortSignal,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length && !signal?.aborted) await run(items[next++]);
    }),
  );
}

/**
 * Each game's rank averages: the hero's curve for the game's rank, or the
 * player's current rank when the game recorded none. Games of one hero and
 * rank tier share their curve requests; a few groups load at a time, and a
 * failed curve only leaves its own games without an average. It fails as a
 * whole only when no game gets one. Once `signal` aborts it starts no more
 * groups and fails.
 */
export async function fetchGameAverages(
  accountId: number,
  games: HistoryMatch[],
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<GameAverages> {
  const current = games.some((game) => !game.badge)
    ? ((await fetchRank(accountId, api, signal).catch(() => null))?.badge ?? 0)
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
  const load = async (group: HistoryMatch[]) => {
    const results = await Promise.allSettled(
      group.map(async (game) => {
        const curve = await fetchRankCurve(
          game.heroId,
          badge(game),
          game.durationS,
          api,
          signal,
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
  };
  await eachLimited([...groups.values()], CURVE_CONCURRENCY, load, signal);
  signal?.throwIfAborted();
  if (failed.size && !byMatch.size) throw new Error(error);
  return { byMatch, failed, error };
}
