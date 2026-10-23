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
// Fewer games than this to compare (with a rank average, where the metric
// has one) and there is no trend. Six keeps each half at three games or more.
export const MIN_TREND_GAMES = 6;

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
  // curve's end or without a length.
  values: Partial<Record<MetricId, number>>;
}

export function gameAverage(
  curve: RankCurve,
  durationS: number,
  source: GameAverage["source"],
): GameAverage {
  const values: GameAverage["values"] = {};
  for (const id of AVERAGED) {
    const at =
      durationS > 0 && averageAt(curve, metricById.get(id)!, durationS);
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
export interface Fraction {
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
  needsTotals: boolean;
  percent: boolean;
  // Never divide by less than this, in a game or over the range: deaths
  // count as at least one.
  minDenominator?: number;
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
  needsTotals: true,
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
  needsTotals: true,
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
    needsTotals: false,
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
    needsTotals: false,
    percent: false,
    minDenominator: 1,
    value: (game) => ({ num: game.kills + game.assists, den: game.deaths }),
    average: (_, { kills, deaths, assists }) =>
      kills === undefined || deaths === undefined || assists === undefined
        ? null
        : { num: kills + assists, den: deaths },
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
  // The rank average, and the player's value, over the games that have
  // both; the same games as `value` unless some have no rank average.
  average: number | null;
  comparedValue: number | null;
  compared: number;
  // Null with fewer than MIN_TREND_GAMES games to compare.
  trend: Trend | null;
}

const ratio = (parts: Fraction[], minDenominator = 0) => {
  if (!parts.length) return null;
  const den = Math.max(
    minDenominator,
    parts.reduce((sum, part) => sum + part.den, 0),
  );
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

// Two-sided 95% critical values of Student's t by degrees of freedom,
// most first; between rows, the row below (the stricter value).
const T_95: [number, number][] = [
  [120, 1.98],
  [60, 2.0],
  [40, 2.02],
  [30, 2.04],
  [20, 2.09],
  [15, 2.13],
  [12, 2.18],
  [10, 2.23],
  [9, 2.26],
  [8, 2.31],
  [7, 2.36],
  [6, 2.45],
  [5, 2.57],
  [4, 2.78],
  [3, 3.18],
  [2, 4.3],
  [1, 12.71],
];
export const criticalT = (df: number) =>
  T_95.find(([rows]) => rows <= df)?.[1] ?? T_95.at(-1)![1];

/**
 * Compares the recent half of the games with the earlier half (the middle
 * game goes to the earlier half) with Welch's t-test: improving or slipping
 * only when the halves differ at the 95% level, otherwise flat.
 */
export function trend(values: number[]): Trend | null {
  if (values.length < MIN_TREND_GAMES) return null;
  const split = Math.ceil(values.length / 2);
  const earlier = values.slice(0, split);
  const recent = values.slice(split);
  const diff = mean(recent) - mean(earlier);
  const a = variance(earlier) / earlier.length;
  const b = variance(recent) / recent.length;
  // Without any spread, every change is a sure one.
  const t = a + b > 0 ? Math.abs(diff) / Math.sqrt(a + b) : diff ? Infinity : 0;
  const df =
    a + b > 0
      ? (a + b) ** 2 /
        (a ** 2 / (earlier.length - 1) + b ** 2 / (recent.length - 1))
      : Infinity;
  if (t < criticalT(df)) return "flat";
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
  const floor = metric.minDenominator ?? 0;
  const divide = (part: Fraction) => part.num / Math.max(floor, part.den);
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
        const avg = divide(average!);
        return avg > 0 ? [divide(value!) / avg] : [];
      })
    : valued.map(({ value }) => divide(value!));
  return {
    metric,
    points: rows.map(({ game, value, average }) => ({
      matchId: game.matchId,
      heroId: game.heroId,
      startTime: game.startTime,
      won: isWin(game),
      value: value ? divide(value) : null,
      average: average ? divide(average) : null,
    })),
    value: ratio(
      valued.map((row) => row.value!),
      floor,
    ),
    games: valued.length,
    average: ratio(
      compared.map((row) => row.average!),
      floor,
    ),
    comparedValue: ratio(
      compared.map((row) => row.value!),
      floor,
    ),
    compared: compared.length,
    trend: trend(samples),
  };
}
