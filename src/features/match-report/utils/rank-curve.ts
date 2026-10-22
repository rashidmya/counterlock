import { catalog } from "@/shared/catalog";
import type { Rank } from "@/shared/catalog/types";
import type { Metric } from "./metrics";
import type { ReportPlayer } from "./report";

// Fewer games than this at the first step and the band widens one tier
// each way; later steps with fewer than MIN_STEP_SAMPLES are dropped.
export const MIN_CURVE_SAMPLES = 100;
export const MIN_STEP_SAMPLES = 30;

export interface RankBand {
  // Average-badge bounds; 0 / 0 means all ranks.
  min: number;
  max: number;
  label: string;
}
export interface CurvePoint {
  t: number;
  samples: number;
  avg: Record<string, number>;
  std: Record<string, number>;
}
export interface RankCurve {
  band: RankBand;
  // The tier the player was in, when the band had to be widened.
  widenedFrom?: string;
  points: CurvePoint[];
}

const tierName = (tier: number, ranks: Rank[]) =>
  ranks.find((rank) => rank.tier === tier)?.name ?? `Tier ${tier}`;

/** The lobby's rank: the rounded mean of known badges, 0 when none are known. */
export function lobbyBadge(players: ReportPlayer[]): number {
  const known = players.map((p) => p.badge).filter((badge) => badge > 0);
  return known.length
    ? Math.round(known.reduce((sum, badge) => sum + badge, 0) / known.length)
    : 0;
}

/** All six sub-ranks of the badge's tier, `widen` tiers either side. */
export function rankBand(
  badge: number,
  widen = 0,
  ranks: Rank[] = catalog.ranks,
): RankBand {
  const tier = Math.floor(badge / 10);
  const top = Math.max(...ranks.map((rank) => rank.tier));
  if (tier < 1 || tier > top) return { min: 0, max: 0, label: "all ranks" };
  const low = Math.max(1, tier - widen);
  const high = Math.min(top, tier + widen);
  return {
    min: low * 10 + 1,
    max: high * 10 + 6,
    label:
      low === high
        ? tierName(low, ranks)
        : `${tierName(low, ranks)}–${tierName(high, ranks)}`,
  };
}

export const curvePath = (heroId: number, band: RankBand) =>
  `/v1/analytics/player-performance-curve?hero_ids=${heroId}&resolution=0` +
  (band.min > 0
    ? `&min_average_badge=${band.min}&max_average_badge=${band.max}`
    : "");

/** Every row with a time, sorted; nothing is dropped here. */
export function parseCurve(data: unknown): CurvePoint[] {
  if (!Array.isArray(data)) return [];
  return data
    .flatMap((row): CurvePoint[] => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      if (typeof r.game_time !== "number" || !Number.isFinite(r.game_time))
        return [];
      const avg: Record<string, number> = {};
      const std: Record<string, number> = {};
      for (const [key, value] of Object.entries(r)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (key.endsWith("_avg")) avg[key.slice(0, -4)] = value;
        else if (key.endsWith("_std")) std[key.slice(0, -4)] = value;
      }
      return [
        {
          t: r.game_time,
          samples: typeof r.samples === "number" ? r.samples : 0,
          avg,
          std,
        },
      ];
    })
    .sort((a, b) => a.t - b.t);
}

/**
 * The rank average and standard deviation at time `t`, interpolated between
 * steps. Running totals start from 0 at 0:00. Null past the last step, or
 * when the curve has no such stat.
 */
export function averageAt(
  curve: RankCurve,
  metric: Metric,
  t: number,
): { avg: number; std: number } | null {
  const field = metric.curve;
  if (!field) return null;
  const steps = curve.points
    .filter((p) => field in p.avg)
    .map((p) => ({ t: p.t, avg: p.avg[field], std: p.std[field] ?? 0 }));
  if (!metric.rate) steps.unshift({ t: 0, avg: 0, std: 0 });
  if (!steps.length || t < steps[0].t || t > steps.at(-1)!.t) return null;
  const next = steps.findIndex((step) => step.t >= t);
  const b = steps[next];
  if (b.t === t || next === 0) return { avg: b.avg, std: b.std };
  const a = steps[next - 1];
  const f = (t - a.t) / (b.t - a.t);
  return { avg: a.avg + f * (b.avg - a.avg), std: a.std + f * (b.std - a.std) };
}
