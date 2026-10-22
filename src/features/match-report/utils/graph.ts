import { clock, compact } from "./format";
import type { Metric } from "./metrics";
import { averageAt, type RankCurve } from "./rank-curve";
import type { ReportPlayer, Team } from "./report";

export type ShowMode = "player" | "teams" | "lead" | "everyone";
export type ValueMode = "total" | "perMinute";
export type TimeRange = "all" | "early" | "mid" | "late";
export type Point = [t: number, value: number];
export type BandPoint = [t: number, average: number, std: number];

export const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "all", label: "Whole match" },
  { id: "early", label: "0–10" },
  { id: "mid", label: "10–20" },
  { id: "late", label: "20+" },
];
// Item purchases at least this expensive get a marker.
export const ITEM_MARKER_COST = 3200;

const perMinute = (metric: Metric, mode: ValueMode) =>
  mode === "perMinute" && !metric.rate;

/** [t, value] at 0:00 (running totals) and every snapshot; per minute drops 0:00. */
export function playerSeries(
  player: ReportPlayer,
  metric: Metric,
  mode: ValueMode,
): Point[] {
  const points: Point[] = player.times.map((t, index) => [
    t,
    player.values[metric.id][index],
  ]);
  if (metric.rate) return points;
  if (perMinute(metric, mode))
    return points.map(([t, value]) => [t, value / (t / 60)]);
  return [[0, 0], ...points];
}

/** Linear interpolation, held flat beyond either end. */
export function valueAt(points: Point[], t: number): number {
  if (!points.length) return 0;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) {
      const [t0, v0] = points[i - 1];
      return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return points.at(-1)![1];
}

/**
 * A team's total at every snapshot time (an average for rate stats), over
 * the players who have snapshots. Per minute divides the team total by the
 * minutes, so a player whose snapshots stop early isn't credited with
 * earning at the same pace after that.
 */
export function teamSeries(
  players: ReportPlayer[],
  team: Team,
  metric: Metric,
  mode: ValueMode,
): Point[] {
  const members = players.filter((p) => p.team === team && p.times.length);
  const series = members.map((p) => playerSeries(p, metric, "total"));
  const times = [...new Set(series.flat().map(([t]) => t))].sort(
    (a, b) => a - b,
  );
  const totals = times.map((t): Point => {
    const sum = series.reduce((total, points) => total + valueAt(points, t), 0);
    return [t, metric.rate ? sum / members.length : sum];
  });
  return perMinute(metric, mode)
    ? totals.filter(([t]) => t > 0).map(([t, value]) => [t, value / (t / 60)])
    : totals;
}

/**
 * Amber's advantage at every snapshot time: Amber minus Sapphire, or the
 * other way round for stats where fewer is better (deaths), so above zero
 * always means Amber is ahead.
 */
export function leadSeries(
  players: ReportPlayer[],
  metric: Metric,
  mode: ValueMode,
): Point[] {
  const amber = teamSeries(players, 0, metric, mode);
  const sapphire = teamSeries(players, 1, metric, mode);
  const sign = metric.lowerBetter ? -1 : 1;
  const times = [...new Set([...amber, ...sapphire].map(([t]) => t))].sort(
    (a, b) => a - b,
  );
  return times.map((t) => [
    t,
    sign * (valueAt(amber, t) - valueAt(sapphire, t)),
  ]);
}

/**
 * The rank average and standard deviation up to the match end or the
 * curve's last step, whichever comes first; null without an average.
 */
export function averageSeries(
  curve: RankCurve | null,
  metric: Metric,
  mode: ValueMode,
  durationS: number,
): BandPoint[] | null {
  if (!curve || !metric.curve) return null;
  const times = [
    ...(metric.rate ? [] : [0]),
    ...curve.points.map((p) => p.t).filter((t) => t > 0 && t < durationS),
    durationS,
  ];
  const points = times.flatMap((t): BandPoint[] => {
    const at = averageAt(curve, metric, t);
    if (!at) return [];
    if (!perMinute(metric, mode)) return [[t, at.avg, at.std]];
    return t > 0 ? [[t, at.avg / (t / 60), at.std / (t / 60)]] : [];
  });
  return points.length >= 2 ? points : null;
}

export function rangeOf(range: TimeRange, durationS: number): [number, number] {
  if (range === "early") return [0, Math.min(600, durationS)];
  if (range === "mid") return [600, Math.min(1200, durationS)];
  if (range === "late") return [1200, durationS];
  return [0, durationS];
}

// A range needs at least a minute of match to be worth showing.
const MIN_RANGE_S = 60;

/** Whether the match is long enough for the range to show anything. */
export const rangeAvailable = (range: TimeRange, durationS: number) =>
  range === "all" ||
  durationS >=
    (range === "early" ? 0 : range === "mid" ? 600 : 1200) + MIN_RANGE_S;

/** Everyone with snapshots, best first (fewest first for deaths), ties by slot. */
export function ranking(
  players: ReportPlayer[],
  metric: Metric,
  mode: ValueMode,
  at: number,
) {
  return players
    .filter((player) => player.times.length)
    .map((player) => ({
      player,
      value: valueAt(playerSeries(player, metric, mode), at),
    }))
    .sort((a, b) =>
      metric.lowerBetter
        ? a.value - b.value || a.player.slot - b.player.slot
        : b.value - a.value || a.player.slot - b.player.slot,
    );
}

/** "Most souls", "Fewest deaths / min · at 10:00", "Highest accuracy %". */
export function rankingTitle(
  metric: Metric,
  mode: ValueMode,
  range: TimeRange,
  at: number,
) {
  const lead = metric.lowerBetter ? "Fewest" : metric.rate ? "Highest" : "Most";
  return (
    `${lead} ${metric.label.toLowerCase()}` +
    (perMinute(metric, mode) ? " / min" : "") +
    (range === "all" ? "" : ` · at ${clock(at)}`)
  );
}

/**
 * Axis and tooltip numbers: one decimal for rate stats, two for small
 * fractions (deaths per minute), otherwise compact.
 */
export function formatValue(value: number, metric: Metric) {
  const size = Math.abs(value);
  const small = size > 0 && size < 1 && !Number.isInteger(size);
  if (!metric.rate && !small) return compact(value);
  const digits = small && !metric.rate ? 2 : 1;
  const rounded = Number(size.toFixed(digits));
  if (rounded === 0) return "0";
  return `${value < 0 ? "−" : ""}${rounded.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}
