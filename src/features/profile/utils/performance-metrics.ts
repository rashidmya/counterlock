import {
  metricById,
  type MetricId,
} from "@/features/match-report/utils/metrics";
import {
  averageAt,
  type RankBand,
  type RankCurve,
} from "@/features/match-report/utils/rank-curve";
import type { HistoryMatch } from "../types";
import { isSummaryMatch, isWin } from "./match-history";
import type { PlayerTotals } from "./match-totals";

export const RANGES = [20, 50, 100] as const;
export type PerformanceRange = (typeof RANGES)[number];
// Fewer games than this with a value and there is no trend.
export const MIN_TREND_GAMES = 6;
// The recent half must differ from the earlier half by this many standard
// errors to count as improving or slipping; anything less is flat.
export const TREND_T = 2;

/** The newest `range` normal and ranked games, of one hero or all, oldest first. */
export function gamesInRange(
  history: HistoryMatch[],
  range: PerformanceRange,
  heroId: number | null,
): HistoryMatch[] {
  return history
    .filter(
      (m) => isSummaryMatch(m) && (heroId === null || m.heroId === heroId),
    )
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, range)
    .reverse();
}

/** Heroes with normal or ranked games, most played first. */
export function heroChoices(history: HistoryMatch[]) {
  const games = new Map<number, number>();
  for (const m of history)
    if (isSummaryMatch(m)) games.set(m.heroId, (games.get(m.heroId) ?? 0) + 1);
  return [...games]
    .map(([heroId, count]) => ({ heroId, games: count }))
    .sort((a, b) => b.games - a.games || a.heroId - b.heroId);
}

// The rank-average stats the metrics compare with.
const AVERAGED: MetricId[] = [
  "souls",
  "heroDamage",
  "objectiveDamage",
  "healing",
  "creepKills",
  "kills",
  "deaths",
  "assists",
];

export interface GameAverage {
  band: RankBand;
  // The tier the game was in, when the band had to be widened.
  widenedFrom?: string;
  // The game's own rank, the player's current rank (the game recorded
  // none), or neither (all ranks).
  source: "game" | "current" | "none";
  // Each stat's rank average at the game's length; missing past the
  // curve's end.
  values: Partial<Record<MetricId, number>>;
}

export function gameAverage(
  curve: RankCurve,
  durationS: number,
  source: GameAverage["source"],
): GameAverage {
  const values: GameAverage["values"] = {};
  for (const id of AVERAGED) {
    const at = averageAt(curve, metricById.get(id)!, durationS);
    if (at) values[id] = at.avg;
  }
  return { band: curve.band, widenedFrom: curve.widenedFrom, source, values };
}

/** The player's totals in one game, with their team's. */
export interface GameTotals {
  own: PlayerTotals;
  teamKills: number;
  teamHeroDamage: number;
}

export function gameTotals(
  players: PlayerTotals[] | undefined,
  accountId: number,
): GameTotals | undefined {
  const own = players?.find((p) => p.accountId === accountId);
  if (!players || !own) return undefined;
  const team = players.filter((p) => p.team === own.team);
  return {
    own,
    teamKills: team.reduce((sum, p) => sum + p.kills, 0),
    teamHeroDamage: team.reduce((sum, p) => sum + p.heroDamage, 0),
  };
}

// A game's value as a fraction. Over a range the numerators and the
// denominators are added up (a time-weighted rate) rather than averaging
// each game's value.
interface Fraction {
  num: number;
  den: number;
}

export type PerformanceMetricId =
  | "soulsPerMin"
  | "kda"
  | "heroDamagePerMin"
  | "objectiveDamagePerMin"
  | "healingPerMin"
  | "creepKillsPerMin"
  | "killParticipation"
  | "damageShare";

export interface PerformanceMetric {
  id: PerformanceMetricId;
  label: string;
  // Needs the match's totals, not just the match-history row.
  totals: boolean;
  percent: boolean;
  value(game: HistoryMatch, totals: GameTotals | undefined): Fraction | null;
  // The rank average for the game; absent for metrics the curve can't give.
  average?(game: HistoryMatch, values: GameAverage["values"]): Fraction | null;
}

const minutes = (game: HistoryMatch) => game.durationS / 60;

/** A running total per minute, against the same stat's rank average. */
const perMinute = (
  id: PerformanceMetricId,
  label: string,
  stat: MetricId,
  own: (totals: PlayerTotals) => number,
): PerformanceMetric => ({
  id,
  label,
  totals: true,
  percent: false,
  value: (game, totals) =>
    totals && game.durationS > 0
      ? { num: own(totals.own), den: minutes(game) }
      : null,
  average: (game, values) =>
    values[stat] !== undefined && game.durationS > 0
      ? { num: values[stat], den: minutes(game) }
      : null,
});

/** A share of the team's total; there is no rank average for it. */
const share = (
  id: PerformanceMetricId,
  label: string,
  of: (totals: GameTotals) => Fraction,
): PerformanceMetric => ({
  id,
  label,
  totals: true,
  percent: true,
  value: (_, totals) => {
    if (!totals) return null;
    const { num, den } = of(totals);
    return den > 0 ? { num: Math.min(num, den), den } : null;
  },
});

export const PERFORMANCE_METRICS: PerformanceMetric[] = [
  {
    id: "soulsPerMin",
    label: "Souls / min",
    totals: false,
    percent: false,
    value: (game) =>
      game.durationS > 0 ? { num: game.netWorth, den: minutes(game) } : null,
    average: (game, values) =>
      values.souls !== undefined && game.durationS > 0
        ? { num: values.souls, den: minutes(game) }
        : null,
  },
  {
    id: "kda",
    label: "K/D/A ratio",
    totals: false,
    percent: false,
    value: (game) => ({
      num: game.kills + game.assists,
      den: Math.max(1, game.deaths),
    }),
    average: (_, { kills, deaths, assists }) =>
      kills === undefined || deaths === undefined || assists === undefined
        ? null
        : { num: kills + assists, den: Math.max(1, deaths) },
  },
  perMinute(
    "heroDamagePerMin",
    "Hero damage / min",
    "heroDamage",
    (t) => t.heroDamage,
  ),
  perMinute(
    "objectiveDamagePerMin",
    "Objective damage / min",
    "objectiveDamage",
    (t) => t.objectiveDamage,
  ),
  perMinute("healingPerMin", "Healing / min", "healing", (t) => t.healing),
  perMinute(
    "creepKillsPerMin",
    "Creep kills / min",
    "creepKills",
    (t) => t.creepKills,
  ),
  share("killParticipation", "Kill participation", (t) => ({
    num: t.own.kills + t.own.assists,
    den: t.teamKills,
  })),
  share("damageShare", "Hero damage share", (t) => ({
    num: t.own.heroDamage,
    den: t.teamHeroDamage,
  })),
];

export interface GamePoint {
  matchId: number;
  heroId: number;
  startTime: number;
  won: boolean;
  // Null when the game has no value (no totals yet) or no rank average.
  value: number | null;
  average: number | null;
}

export type Trend = "improving" | "flat" | "slipping";

export interface MetricSummary {
  metric: PerformanceMetric;
  // One per game in range, oldest first.
  points: GamePoint[];
  // Over the games with a value.
  value: number | null;
  games: number;
  // Over the games with both a value and a rank average.
  average: number | null;
  compared: number;
  // Null with fewer than MIN_TREND_GAMES games to compare.
  trend: Trend | null;
}

const ratio = (parts: Fraction[]) => {
  const den = parts.reduce((sum, part) => sum + part.den, 0);
  return den > 0 ? parts.reduce((sum, part) => sum + part.num, 0) / den : null;
};

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const variance = (values: number[]) => {
  const m = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - m) ** 2, 0) /
    Math.max(1, values.length - 1)
  );
};

/**
 * Compares the recent half of the games with the earlier half (the middle
 * game goes to the earlier half). Improving or slipping only when the
 * difference is at least TREND_T standard errors (Welch).
 */
export function trend(values: number[]): Trend | null {
  if (values.length < MIN_TREND_GAMES) return null;
  const split = Math.ceil(values.length / 2);
  const earlier = values.slice(0, split);
  const recent = values.slice(split);
  const diff = mean(recent) - mean(earlier);
  const error = Math.sqrt(
    variance(earlier) / earlier.length + variance(recent) / recent.length,
  );
  if (error === 0 ? diff === 0 : Math.abs(diff) < TREND_T * error)
    return "flat";
  return diff > 0 ? "improving" : "slipping";
}

/**
 * One metric over the games in range. The trend follows each game against
 * its rank average when the metric has one, so changing hero or rank
 * doesn't read as a change in form; otherwise the values themselves.
 */
export function summarizeMetric(
  metric: PerformanceMetric,
  games: HistoryMatch[],
  totals: (matchId: number) => GameTotals | undefined,
  averages: (matchId: number) => GameAverage | undefined,
): MetricSummary {
  const rows = games.map((game) => {
    const value = metric.value(game, totals(game.matchId));
    const values = averages(game.matchId)?.values;
    const average = value && values && metric.average?.(game, values);
    return { game, value, average: average || null };
  });
  const valued = rows.filter((row) => row.value);
  const compared = valued.filter((row) => row.average);
  const samples = metric.average
    ? compared.flatMap(({ value, average }) => {
        const avg = average!.num / average!.den;
        return avg > 0 ? [value!.num / value!.den / avg] : [];
      })
    : valued.map(({ value }) => value!.num / value!.den);
  return {
    metric,
    points: rows.map(({ game, value, average }) => ({
      matchId: game.matchId,
      heroId: game.heroId,
      startTime: game.startTime,
      won: isWin(game),
      value: value ? value.num / value.den : null,
      average: average ? average.num / average.den : null,
    })),
    value: ratio(valued.map((row) => row.value!)),
    games: valued.length,
    average: ratio(compared.map((row) => row.average!)),
    compared: compared.length,
    trend: trend(samples),
  };
}
