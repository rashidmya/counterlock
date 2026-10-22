import { clock, percent } from "./format";
import { metricById } from "./metrics";
import { averageAt, type RankCurve } from "./rank-curve";
import type { ReportPlayer } from "./report";

// Three or more deaths inside this window make a rough patch.
export const ROUGH_PATCH_S = 300;
export const ROUGH_PATCH_DEATHS = 3;

export interface Stretch {
  label: string;
  text: string;
  tone?: "good" | "bad";
}

const relative = (r: number) => (r >= 0 ? "ahead of" : "behind");

function turningPoint(points: { t: number; r: number }[]) {
  const ahead = points.map((p) => p.r >= 0);
  if (ahead.every(Boolean)) return "Ahead of the average all game.";
  if (!ahead.some(Boolean)) return "Never caught the average.";
  const flip = ahead.findIndex((value) => value !== ahead[0]);
  const at = clock(points[flip].t);
  const holds = ahead.slice(flip).every((value) => value === ahead[flip]);
  return ahead[0]
    ? holds
      ? `Fell behind the average at ${at} and stayed behind.`
      : `Fell behind the average at ${at}, then caught up again.`
    : holds
      ? `Pulled ahead of the average at ${at} and stayed there.`
      : `Pulled ahead of the average at ${at} and fell back later.`;
}

function roughPatch(deaths: number[]): Stretch | null {
  let best: number[] = [];
  for (const start of deaths) {
    const inside = deaths.filter(
      (t) => t >= start && t <= start + ROUGH_PATCH_S,
    );
    if (inside.length > best.length) best = inside;
  }
  return best.length >= ROUGH_PATCH_DEATHS
    ? {
        label: "Rough patch",
        text: `${best.length} deaths between ${clock(best[0])} and ${clock(best.at(-1)!)}.`,
        tone: "bad",
      }
    : null;
}

/**
 * Rule-based sentences from the souls curve against the rank average at
 * each snapshot, plus the death times. Without an average, only deaths.
 */
export function stretches(
  player: ReportPlayer,
  curve: RankCurve | null,
): Stretch[] {
  const souls = metricById.get("souls")!;
  const points = curve
    ? player.times.flatMap((t, index) => {
        const avg = averageAt(curve, souls, t)?.avg;
        return avg && avg > 0
          ? [{ t, r: player.values.souls[index] / avg - 1 }]
          : [];
      })
    : [];
  const result: Stretch[] = [];
  if (points.length) {
    const best = points.reduce((a, b) => (b.r > a.r ? b : a));
    const worst = points.reduce((a, b) => (b.r < a.r ? b : a));
    result.push(
      {
        label: "Strongest",
        text: `Around ${clock(best.t)}: ${percent(best.r)} ${relative(best.r)} the ${curve!.band.label} average.`,
        tone: "good",
      },
      {
        label: "Weakest",
        text: `Around ${clock(worst.t)}: ${percent(worst.r)} ${relative(worst.r)} the average.`,
        tone: "bad",
      },
      { label: "Turning point", text: turningPoint(points) },
    );
  }
  const deaths = player.deathTimes;
  result.push({
    label: "Deaths",
    text: deaths.length
      ? `${deaths.length} ${deaths.length === 1 ? "death" : "deaths"}: ${deaths.map(clock).join(", ")}.`
      : "No deaths.",
  });
  const patch = roughPatch(deaths);
  if (patch) result.push(patch);
  return result;
}
