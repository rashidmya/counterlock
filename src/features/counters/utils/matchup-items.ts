import {
  overallRate,
  shopItems,
  type ItemStatsRow,
} from "@/features/heroes/utils/analytics";

export const MIN_VERSUS_MATCHES = 200;
export const COUNTER_ITEMS = 6;
export const MAX_ENEMIES = 6;
export const CONFIDENCE_Z = 2;

export interface VersusRows {
  heroId: number;
  rows: ItemStatsRow[];
}
export interface CounterPick {
  itemId: number;
  lift: number; // average over counted enemies, net of the matchup; missing counts as 0
  matches: number; // the item's versus matches summed over counted enemies
  against: number[]; // enemies where it clearly does better, strongest first
}

export function counterItemsVs(
  baseline: ItemStatsRow[],
  versus: VersusRows[],
  exclude: ReadonlySet<number> = new Set(),
  n = COUNTER_ITEMS,
  minMatches = MIN_VERSUS_MATCHES,
): CounterPick[] {
  const base = shopItems(baseline);
  const totals = new Map<
    number,
    {
      deltas: { heroId: number; delta: number; variance: number }[];
      matches: number;
    }
  >();
  let enemies = 0;
  for (const { heroId, rows } of versus) {
    const vs = shopItems(rows);
    if (![...vs.values()].some((item) => item.matches >= minMatches)) continue;
    enemies += 1;
    // Correct for the matchup itself: some enemies are simply easier to beat.
    const shift = overallRate(vs) - overallRate(base);
    for (const item of vs.values()) {
      const reference = base.get(item.itemId);
      if (!reference || item.matches < minMatches || exclude.has(item.itemId))
        continue;
      const total = totals.get(item.itemId) ?? {
        deltas: [],
        matches: 0,
      };
      total.deltas.push({
        heroId,
        delta: item.winRate - reference.winRate - shift,
        variance:
          (item.winRate * (1 - item.winRate)) / item.matches +
          (reference.winRate * (1 - reference.winRate)) / reference.matches,
      });
      total.matches += item.matches;
      totals.set(item.itemId, total);
    }
  }
  // Rank by a lower confidence bound so a big lift on a small sample
  // doesn't beat a solid one.
  return [...totals]
    .map(([itemId, total]) => {
      const lift = total.deltas.reduce((sum, d) => sum + d.delta, 0) / enemies;
      const se =
        Math.sqrt(total.deltas.reduce((sum, d) => sum + d.variance, 0)) /
        enemies;
      return {
        pick: {
          itemId,
          lift,
          matches: total.matches,
          against: total.deltas
            .filter((d) => d.delta - CONFIDENCE_Z * Math.sqrt(d.variance) > 0)
            .sort((x, y) => y.delta - x.delta || x.heroId - y.heroId)
            .map((d) => d.heroId),
        },
        bound: lift - CONFIDENCE_Z * se,
      };
    })
    .filter((entry) => entry.bound > 0)
    .sort((x, y) => y.bound - x.bound || x.pick.itemId - y.pick.itemId)
    .slice(0, n)
    .map((entry) => entry.pick);
}
