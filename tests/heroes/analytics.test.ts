import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog, itemByClass, itemById } from "@/shared/catalog";
import {
  analyticsParams,
  assignTiers,
  bestItems,
  bestWith,
  buildsFrom,
  buildsInto,
  counterItems,
  itemTable,
  matchups,
  mostCommonOrder,
  rankFilterOptions,
  summarizeHeroes,
} from "@/features/heroes/utils/analytics";
import {
  fetchAbilityOrder,
  fetchHeroSummaries,
  fetchItemStats,
  fetchMatchups,
  fetchSynergy,
  heuristicCounterItems,
} from "@/features/heroes/services/hero-analytics";

const hero = (heroId: number, wins: number, matches: number) => ({
  hero_id: heroId,
  wins,
  losses: matches - wins,
  matches,
  total_kills: 5 * matches,
  total_deaths: 2 * matches,
  total_assists: 5 * matches,
});
const [shopA, shopB, shopC, shopD] = [...itemById.keys()];
const itemRow = (id: number, wins: number, matches: number, buy = 300) => ({
  item_id: id,
  wins,
  losses: matches - wins,
  matches,
  avg_buy_time_s: buy,
});

function fakeApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const api = {
    get: async (path: string) => {
      calls.push(path);
      if (!(path in routes)) throw new Error(`unexpected ${path}`);
      return routes[path];
    },
  } as unknown as DeadlockApi;
  return { api, calls };
}

describe("analyticsParams", () => {
  const now = Date.UTC(2026, 9, 19, 15);
  it("windows to the start of the UTC day 30 days ago", () => {
    const params = analyticsParams({ minBadge: 0 }, now);
    expect(params).toContain("game_mode=normal");
    expect(params).toContain("match_mode=ranked,unranked");
    expect(params).toContain(
      `min_unix_timestamp=${Date.UTC(2026, 8, 19) / 1000}`,
    );
    expect(params).not.toContain("min_average_badge");
  });
  it("adds the badge filter", () => {
    expect(analyticsParams({ minBadge: 51 }, now)).toContain(
      "min_average_badge=51",
    );
  });
});

describe("rankFilterOptions", () => {
  it("lists all ranks then each tier from 1 up", () => {
    const options = rankFilterOptions([
      { tier: 0, name: "Obscurus" },
      { tier: 1, name: "Initiate" },
      { tier: 5, name: "Mystic" },
    ]);
    expect(options).toEqual([
      { value: 0, label: "All ranks" },
      { value: 11, label: "Initiate+" },
      { value: 51, label: "Mystic+" },
    ]);
  });
});

describe("assignTiers", () => {
  const rates = Array.from({ length: 20 }, (_, i) => ({
    heroId: i + 1,
    winRate: 0.4 + i * 0.01,
  }));
  it("splits 20 heroes into S2 A4 B6 C5 D3", () => {
    const tiers = assignTiers(rates);
    const counts: Record<string, number> = {};
    for (const tier of tiers.values()) counts[tier] = (counts[tier] ?? 0) + 1;
    expect(counts).toEqual({ S: 2, A: 4, B: 6, C: 5, D: 3 });
    expect(tiers.get(20)).toBe("S");
    expect(tiers.get(1)).toBe("D");
  });
  it("handles no heroes", () => {
    expect(assignTiers([]).size).toBe(0);
  });
});

describe("summarizeHeroes", () => {
  it("derives pick rate, kda, tier and position", () => {
    const [first, second] = summarizeHeroes([
      hero(1, 300, 600),
      hero(2, 250, 400),
    ]);
    expect(first.heroId).toBe(2);
    expect(first.position).toBe(1);
    expect(first.winRate).toBeCloseTo(0.625);
    expect(first.kda).toBe(5);
    expect(second.heroId).toBe(1);
    expect(second.position).toBe(2);
    expect(second.pickRate).toBeCloseTo(600 / (1000 / 12));
    expect(first.tier).toBe("S");
  });
  it("sums bucketed rows for the same hero", () => {
    const [only] = summarizeHeroes([hero(1, 30, 60), hero(1, 10, 40)]);
    expect(only.matches).toBe(100);
    expect(only.wins).toBe(40);
  });
  it("skips malformed and empty rows so nothing is NaN", () => {
    const list = summarizeHeroes([
      hero(1, 5, 10),
      { ...hero(2, 5, 10), total_kills: Number.NaN },
      { ...hero(3, 0, 0) },
      { hero_id: 4 } as never,
      null as never,
    ]);
    expect(list.map((row) => row.heroId)).toEqual([1]);
    expect(
      Object.values(list[0]).every(
        (v) => Number.isFinite(v) || typeof v === "string",
      ),
    ).toBe(true);
    expect(summarizeHeroes([])).toEqual([]);
  });
  it("keeps kda finite with zero deaths", () => {
    const [row] = summarizeHeroes([{ ...hero(1, 5, 10), total_deaths: 0 }]);
    expect(row.kda).toBe(100);
  });
});

describe("matchups", () => {
  const row = (
    hero_id: number,
    enemy: number,
    wins: number,
    played: number,
  ) => ({
    hero_id,
    enemy_hero_id: enemy,
    wins,
    matches_played: played,
  });
  const rows = [
    row(7, 1, 600, 1000),
    row(7, 2, 400, 1000),
    row(7, 3, 550, 1000),
    row(7, 4, 10, 50),
    row(8, 1, 999, 1000),
    row(7, 5, 450, 1000),
  ];
  it("splits strong and weak for the hero above the minimum", () => {
    const { strong, weak } = matchups(rows, 7);
    expect(strong.map((m) => m.heroId)).toEqual([1, 3, 5, 2]);
    expect(weak.map((m) => m.heroId)).toEqual([2, 5, 3, 1]);
    expect(strong[0]).toEqual({ heroId: 1, winRate: 0.6, matches: 1000 });
  });
  it("limits to n and honours minMatches", () => {
    expect(matchups(rows, 7, 200, 2).strong).toHaveLength(2);
    expect(matchups(rows, 7, 20, 5).strong.map((m) => m.heroId)).toContain(4);
  });
  it("is empty without data", () => {
    expect(matchups([], 7)).toEqual({ strong: [], weak: [] });
    expect(matchups([row(7, 1, Number.NaN, 1000)], 7)).toEqual({
      strong: [],
      weak: [],
    });
  });
});

describe("bestWith", () => {
  const row = (a: number, b: number, wins: number, played: number) => ({
    hero_id1: a,
    hero_id2: b,
    wins,
    matches_played: played,
  });
  it("resolves the partner from either side", () => {
    const result = bestWith(
      [
        row(7, 1, 520, 1000),
        row(2, 7, 600, 1000),
        row(3, 4, 900, 1000),
        row(7, 5, 900, 100),
      ],
      7,
    );
    expect(result).toEqual([
      { heroId: 2, winRate: 0.6, matches: 1000 },
      { heroId: 1, winRate: 0.52, matches: 1000 },
    ]);
  });
  it("is empty without data", () => {
    expect(bestWith([], 7)).toEqual([]);
  });
});

describe("mostCommonOrder", () => {
  it("picks the row with most matches", () => {
    expect(
      mostCommonOrder([
        { abilities: [1, 2], wins: 10, losses: 10, matches: 20 },
        { abilities: [2, 1], wins: 60, losses: 40, matches: 100 },
        { abilities: [3], wins: 1, losses: 0, matches: 1 },
      ]),
    ).toEqual({ abilities: [2, 1], winRate: 0.6, matches: 100 });
  });
  it("returns null without usable rows", () => {
    expect(mostCommonOrder([])).toBeNull();
    expect(
      mostCommonOrder([{ abilities: [], wins: 1, losses: 1, matches: 2 }]),
    ).toBeNull();
  });
});

describe("item derivations", () => {
  it("bestItems drops rare and non-shop items and sorts by win rate", () => {
    const result = bestItems(
      [
        itemRow(shopA, 520, 1000),
        itemRow(shopB, 600, 1000),
        itemRow(shopC, 90, 100),
        itemRow(999999999, 900, 1000),
      ],
      10_000,
      6,
      0.05,
    );
    expect(result.map((r) => r.itemId)).toEqual([shopB, shopA]);
    expect(result[0].pickRate).toBeCloseTo(0.1);
    expect(result[0].winRate).toBeCloseTo(0.6);
  });
  it("bestItems is empty for zero hero matches", () => {
    expect(bestItems([itemRow(shopA, 5, 10)], 0)).toEqual([]);
  });
  it("counterItems keeps only positive deltas above the minimum", () => {
    const base = [
      itemRow(shopA, 500, 1000),
      itemRow(shopB, 500, 1000),
      itemRow(shopC, 500, 1000),
      itemRow(shopD, 500, 1000),
    ];
    const vs = [
      itemRow(shopA, 600, 1000),
      itemRow(shopB, 450, 1000),
      itemRow(shopC, 900, 100),
      itemRow(shopD, 550, 1000, 410),
      itemRow(123456789, 900, 1000),
    ];
    const result = counterItems(vs, base);
    expect(result.map((r) => r.itemId)).toEqual([shopA, shopD]);
    expect(result[0].delta).toBeCloseTo(0.1);
    expect(result[1].avgBuyS).toBe(410);
  });
  it("counterItems is empty when nothing qualifies", () => {
    expect(counterItems([], [itemRow(shopA, 5, 10)])).toEqual([]);
    expect(
      counterItems([itemRow(shopA, 400, 1000)], [itemRow(shopA, 500, 1000)]),
    ).toEqual([]);
  });
  it("itemTable computes pick rate from total player matches", () => {
    const table = itemTable(
      [
        itemRow(shopA, 60, 100, 250),
        { ...itemRow(shopB, 1, 1), wins: Number.NaN },
      ],
      1000,
    );
    expect(table.size).toBe(1);
    expect(table.get(shopA)).toEqual({
      itemId: shopA,
      winRate: 0.6,
      matches: 100,
      pickRate: 0.1,
      avgBuyS: 250,
    });
  });
  it("builds into / from use catalog components", () => {
    const rite = catalog.items.find((i) => i.name === "Healing Rite")!;
    const leech = catalog.items.find((i) => i.name === "Leech")!;
    const lifesteal = itemByClass.get(leech.components![0])!;
    expect(buildsInto(lifesteal).map((i) => i.id)).toContain(leech.id);
    expect(buildsFrom(leech).map((i) => i.id)).toContain(lifesteal.id);
    expect(buildsInto(rite).map((i) => i.name)).toContain("Rescue Beam");
    expect(buildsFrom({ ...leech, components: undefined })).toEqual([]);
    expect(buildsInto({ ...leech, className: undefined })).toEqual([]);
  });
});

describe("hero-analytics services", () => {
  const q = { minBadge: 0 };
  const now = Date.now();
  const params = (extra = "") => `${analyticsParams(q, now)}${extra}`;
  it("fetchHeroSummaries summarizes hero-stats", async () => {
    const { api, calls } = fakeApi({
      [`/v1/analytics/hero-stats?${params()}`]: [hero(1, 5, 10)],
    });
    const list = await fetchHeroSummaries(q, api);
    expect(list[0].heroId).toBe(1);
    expect(calls[0]).toMatch(/^\/v1\/analytics\/hero-stats\?game_mode=normal/);
  });
  it("fetchHeroSummaries ignores heroes missing from the catalog", async () => {
    const known = catalog.heroes.slice(0, 10).map((h) => h.id);
    const unknownId = Math.max(...catalog.heroes.map((h) => h.id)) + 1000;
    const rows = known.map((id, index) => hero(id, 500 + index * 10, 1000));
    const clean = fakeApi({
      [`/v1/analytics/hero-stats?${params()}`]: rows,
    });
    const mixed = fakeApi({
      [`/v1/analytics/hero-stats?${params()}`]: [
        hero(unknownId, 990, 1000),
        ...rows,
      ],
    });
    const expected = await fetchHeroSummaries(q, clean.api);
    const list = await fetchHeroSummaries(q, mixed.api);
    expect(list.map((row) => row.heroId)).not.toContain(unknownId);
    expect(list).toEqual(expected);
  });
  it("uses the documented endpoints", async () => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return { not: "an array" };
      },
    } as unknown as DeadlockApi;
    expect(await fetchMatchups(q, api)).toEqual([]);
    expect(await fetchSynergy(q, api)).toEqual([]);
    expect(await fetchAbilityOrder(5, q, api)).toEqual([]);
    expect(await fetchItemStats(q, "hero_id=5", api)).toEqual([]);
    expect(await fetchItemStats(q, undefined, api)).toEqual([]);
    expect(await fetchHeroSummaries(q, api)).toEqual([]);
    expect(calls[0]).toMatch(/hero-counter-stats\?.*&same_lane_filter=false$/);
    expect(calls[1]).toMatch(/hero-synergy-stats\?.*&same_lane_filter=false$/);
    expect(calls[2]).toMatch(/ability-order-stats\?hero_id=5&/);
    expect(calls[3]).toMatch(/item-stats\?.*&hero_id=5$/);
    expect(calls[4]).toMatch(/item-stats\?[^&]+(&[^&]+)*$/);
    expect(calls[4]).not.toContain("hero_id");
  });
  it("heuristicCounterItems returns shop items", () => {
    const items = heuristicCounterItems(13);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((item) => itemById.has(item.id))).toBe(true);
  });
});
