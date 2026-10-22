import {
  overallRate,
  shopItems,
  type ItemStatsRow,
} from "@/features/heroes/utils/analytics";

export const MIN_VERSUS_MATCHES = 200;
export const COUNTER_ITEMS = 6;
export const MAX_ENEMIES = 6;

export interface VersusRows {
  heroId: number;
  rows: ItemStatsRow[];
}
export interface CounterPick {
  itemId: number;
  lift: number; // average over enemies with data; missing counts as 0
  winRate: number; // pooled across the picked enemies
  matches: number;
  against: number[]; // enemy hero ids with lift > 0, strongest first
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
      deltas: { heroId: number; delta: number }[];
      wins: number;
      matches: number;
    }
  >();
  let enemies = 0;
  for (const { heroId, rows } of versus) {
    const vs = shopItems(rows);
    if (vs.size === 0) continue;
    enemies += 1;
    // Correct for the matchup itself: some enemies are simply easier to beat.
    const shift = overallRate(vs) - overallRate(base);
    for (const item of vs.values()) {
      const reference = base.get(item.itemId);
      if (!reference || item.matches < minMatches || exclude.has(item.itemId))
        continue;
      const total = totals.get(item.itemId) ?? {
        deltas: [],
        wins: 0,
        matches: 0,
      };
      total.deltas.push({
        heroId,
        delta: item.winRate - reference.winRate - shift,
      });
      total.wins += item.winRate * item.matches;
      total.matches += item.matches;
      totals.set(item.itemId, total);
    }
  }
  return [...totals]
    .map(([itemId, total]) => ({
      itemId,
      lift: total.deltas.reduce((sum, d) => sum + d.delta, 0) / enemies,
      winRate: total.wins / total.matches,
      matches: total.matches,
      against: total.deltas
        .filter((d) => d.delta > 0)
        .sort((x, y) => y.delta - x.delta || x.heroId - y.heroId)
        .map((d) => d.heroId),
    }))
    .filter((pick) => pick.lift > 0)
    .sort((x, y) => y.lift - x.lift || x.itemId - y.itemId)
    .slice(0, n);
}
