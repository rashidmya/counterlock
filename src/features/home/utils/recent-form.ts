import type { HistoryMatch } from "@/features/profile/types";
import { isSummaryMatch, isWin } from "@/features/profile/utils/match-history";

export interface RecentForm {
  /** Oldest first, so the newest game is last and renders on the right. */
  results: boolean[];
  wins: number;
  losses: number;
}

const GAMES = 10;

export function recentForm(newestFirst: HistoryMatch[]): RecentForm {
  const results = newestFirst
    .filter(isSummaryMatch)
    .slice(0, GAMES)
    .map(isWin)
    .reverse();
  const wins = results.filter(Boolean).length;
  return { results, wins, losses: results.length - wins };
}

export const formLabel = ({ results, wins, losses }: RecentForm) =>
  `${wins}W ${losses}L · last ${results.length === 1 ? "game" : `${results.length} games`}`;
