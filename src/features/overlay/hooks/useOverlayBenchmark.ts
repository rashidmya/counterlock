import type { MatchState } from "@/features/match/types";
import { useAsync, type AsyncState } from "@/shared/api/useAsync";
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import {
  rankBand,
  type RankCurve,
} from "@/features/match-report/utils/rank-curve";
import { uniqueLocalPlayer } from "../utils/meters";

export function useOverlayBenchmark(state: MatchState): AsyncState<RankCurve> {
  const local = uniqueLocalPlayer(state.players);
  const entry = local?.accountId ? state.stats[local.accountId] : undefined;
  // StatsClient publishes the entry after both lookup halves settle. A
  // successful lookup with no rank row is also settled (compare all ranks).
  const waiting = !!local?.accountId && !entry;
  const badge = entry?.rank?.badge ?? 0;
  const tier = rankBand(badge).min;
  const heroId = local?.heroId ?? 0;
  const enabled =
    state.phase === "GameInProgress" &&
    state.gameMode === "normal" &&
    heroId > 0 &&
    !waiting;
  return useAsync(
    enabled
      ? (signal) => fetchRankCurve(heroId, badge, 0, undefined, signal)
      : null,
    [state.matchId, heroId, tier, enabled],
  );
}
