import {
  overallRate,
  shopItems,
  type ItemStatsRow,
} from "@/features/heroes/utils/analytics";

export const MIN_VERSUS_MATCHES = 200;
export const COUNTER_ITEMS = 6;
export const MAX_ENEMIES = 6;
export const CONFIDENCE_Z = 3;

export interface VersusRows {
  heroId: number;
  rows: ItemStatsRow[];
}
export interface CounterPick {
  itemId: number;
  // "team": clears the bar on average over the counted enemies. lift is that
  // average, net of the matchup (missing counts as 0), and matches is the
  // largest single-enemy sample, a lower bound on games against these heroes.
  // "hero": clears it only against some of them; lift and matches are
  // against against[0].
  scope: "team" | "hero";
  lift: number;
  matches: number;
  against: number[]; // enemies where it clearly does better, strongest first
}

type Delta = {
  heroId: number;
  delta: number;
  variance: number;
  matches: number;
};
type Ranked = { pick: CounterPick; bound: number };

const lowerBound = (d: Delta) => d.delta - CONFIDENCE_Z * Math.sqrt(d.variance);
const byBound = (entries: Ranked[]) =>
  entries
    .sort((x, y) => y.bound - x.bound || x.pick.itemId - y.pick.itemId)
    .map((entry) => entry.pick);

export function counterItemsVs(
  baseline: ItemStatsRow[],
  versus: VersusRows[],
  exclude: ReadonlySet<number> = new Set(),
  n = COUNTER_ITEMS,
  minMatches = MIN_VERSUS_MATCHES,
): CounterPick[] {
  const base = shopItems(baseline);
  const totals = new Map<number, { deltas: Delta[]; matches: number }>();
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
        matches: item.matches,
      });
      total.matches = Math.max(total.matches, item.matches);
      totals.set(item.itemId, total);
    }
  }
  // Rank by a lower confidence bound so a big lift on a small sample
  // doesn't beat a solid one.
  const team: Ranked[] = [];
  const hero: Ranked[] = [];
  for (const [itemId, total] of totals) {
    const lift = total.deltas.reduce((sum, d) => sum + d.delta, 0) / enemies;
    const se =
      Math.sqrt(total.deltas.reduce((sum, d) => sum + d.variance, 0)) / enemies;
    const clear = total.deltas
      .filter((d) => lowerBound(d) > 0)
      .sort((x, y) => y.delta - x.delta || x.heroId - y.heroId);
    const against = clear.map((d) => d.heroId);
    const bound = lift - CONFIDENCE_Z * se;
    if (bound > 0)
      team.push({
        pick: { itemId, scope: "team", lift, matches: total.matches, against },
        bound,
      });
    // Clearly better against some enemies but not the team: listed after the
    // team-wide items, unless it does worse against the team overall.
    else if (clear.length && lift > 0)
      hero.push({
        pick: {
          itemId,
          scope: "hero",
          lift: clear[0].delta,
          matches: clear[0].matches,
          against,
        },
        bound: Math.max(...clear.map(lowerBound)),
      });
  }
  return [...byBound(team), ...byBound(hero)].slice(0, n);
}
