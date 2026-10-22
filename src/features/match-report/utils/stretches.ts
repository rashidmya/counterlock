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

// Souls against the rank average at one snapshot: r = souls ÷ average − 1.
// `side` is 1 above the normal range (average ± 1 standard deviation), −1
// below it and 0 inside it, so small wobbles around the average don't count.
interface Point {
  t: number;
  r: number;
  side: -1 | 0 | 1;
}

const level = (r: number) => Math.round(Math.abs(r) * 100) === 0;
const versus = (r: number, average: string) =>
  level(r)
    ? `level with ${average}`
    : `${percent(r)} ${r > 0 ? "more" : "fewer"} souls than ${average}`;

/**
 * Where the player ended up against the normal range, and since when.
 * `until` is set when the average stops before the match ends.
 */
function turningPoint(points: Point[], until: string) {
  const last = points.at(-1)!.side;
  let start = points.length - 1;
  while (start > 0 && points[start - 1].side === last) start--;
  if (start === 0) {
    const where = last === 1 ? "Ahead of" : last === -1 ? "Behind" : "Within";
    return `${where} the normal range ${until || "all game"}.`;
  }
  const at = clock(points[start].t);
  const moved =
    last === 1
      ? "Pulled ahead of the normal range"
      : last === -1
        ? "Fell behind the normal range"
        : "Back within the normal range";
  // A change at the last snapshot has no time after it to "stay" in.
  if (start === points.length - 1)
    return until
      ? `${moved} at ${at}, where the average stops.`
      : `${moved} by the end (${at}).`;
  const tail = until ? ` ${until}` : "";
  return last === 0
    ? `${moved} from ${at}${tail}.`
    : `${moved} at ${at} and stayed there${tail}.`;
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
 * each snapshot, plus the death times. With fewer than two snapshots to
 * compare, only deaths. When the average stops before the match does, the
 * sentences say until when.
 */
export function stretches(
  player: ReportPlayer,
  curve: RankCurve | null,
): Stretch[] {
  const souls = metricById.get("souls")!;
  const points: Point[] = curve
    ? player.times.flatMap((t, index) => {
        const at = averageAt(curve, souls, t);
        if (!at || at.avg <= 0) return [];
        const value = player.values.souls[index];
        const side =
          value > at.avg + at.std ? 1 : value < at.avg - at.std ? -1 : 0;
        return [{ t, r: value / at.avg - 1, side }];
      })
    : [];
  const result: Stretch[] = [];
  if (curve && points.length >= 2) {
    const end = points.at(-1)!.t;
    const until =
      end < player.times.at(-1)!
        ? `through ${clock(end)}, where the average stops`
        : "";
    const average =
      curve.band.min > 0
        ? `the ${curve.band.label} average`
        : "the all-ranks average";
    const best = points.reduce((a, b) => (b.r > a.r ? b : a));
    const worst = points.reduce((a, b) => (b.r < a.r ? b : a));
    result.push(
      {
        label: "Strongest",
        text: `Around ${clock(best.t)}: ${versus(best.r, average)}.`,
        // Coloured only outside the normal range, like the turning point.
        tone: best.side === 1 ? "good" : undefined,
      },
      {
        label: "Weakest",
        text: `Around ${clock(worst.t)}: ${versus(worst.r, "the average")}.`,
        tone: worst.side === -1 ? "bad" : undefined,
      },
      { label: "Turning point", text: turningPoint(points, until) },
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
