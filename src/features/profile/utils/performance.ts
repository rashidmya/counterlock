import type { PlayerHeroStat } from "../services/profile-api";
import type { HistoryMatch, Summary } from "../types";
import {
  form,
  isSummaryMatch,
  kda,
  soulsPerMin,
  summarize,
} from "./match-history";

export type PerformanceRange = 20 | 50 | "all";

export function performanceSeries(
  ms: HistoryMatch[],
  range: PerformanceRange,
): {
  kda: number[];
  soulsPerMin: number[];
  form: boolean[];
  averages: Summary;
} {
  const summary = ms.filter(isSummaryMatch);
  const newest = [...summary].sort((a, b) => b.startTime - a.startTime);
  const inRange = range === "all" ? newest : newest.slice(0, range);
  const chronological = [...inRange].reverse();
  return {
    kda: chronological.map((m) => kda(m.kills, m.deaths, m.assists)),
    soulsPerMin: chronological.map((m) => soulsPerMin(m.netWorth, m.durationS)),
    form: form(summary),
    averages: summarize(inRange),
  };
}

export function combatAverages(stats: PlayerHeroStat[]) {
  const matches = stats.reduce((total, s) => total + s.matches, 0);
  if (matches <= 0) return null;
  const weighted = (pick: (s: PlayerHeroStat) => number) =>
    stats.reduce((total, s) => total + pick(s) * s.matches, 0) / matches;
  return {
    accuracy: weighted((s) => s.accuracy),
    damagePerMin: weighted((s) => s.damagePerMin),
  };
}
