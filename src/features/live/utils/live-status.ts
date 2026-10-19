import type { MatchState } from "@/features/match/types";

export type LiveStatus = "not-running" | "waiting" | "in-match";

export function liveStatus(running: boolean, state: MatchState): LiveStatus {
  if (state.players.length > 0) return "in-match";
  return running ? "waiting" : "not-running";
}

export function matchKey(state: MatchState): string | null {
  return state.players.length ? (state.matchId ?? "pending") : null;
}

export function shouldAutoSwitch(
  prevKey: string | null,
  nextKey: string | null,
): boolean {
  if (nextKey === null) return false;
  if (prevKey === null) return true;
  return prevKey !== "pending" && nextKey !== "pending" && nextKey !== prevKey;
}
