import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog } from "@/shared/catalog";
import { analyticsParams } from "@/features/heroes/utils/analytics";
import { counterItemsVs } from "@/features/counters/utils/matchup-items";
import { fetchCounterData } from "@/features/counters/services/matchup-items";

const [A, B, L] = catalog.items
  .filter((item) => item.cost > 0)
  .map((item) => item.id);
const row = (itemId: number, rate: number, matches = 3000) => ({
  item_id: itemId,
  wins: matches * rate,
  losses: matches * (1 - rate),
  matches,
});
const baseline = [row(A, 0.5, 10000), row(B, 0.5, 10000), row(L, 0.5, 10000)];
const X = 101;
const Y = 102;
// Both enemies average 50%, so the matchup shift is 0 and lifts are raw.
const vsX = { heroId: X, rows: [row(A, 0.6), row(B, 0.5), row(L, 0.4)] };
const vsY = { heroId: Y, rows: [row(A, 0.5), row(B, 0.56), row(L, 0.44)] };

describe("counterItemsVs", () => {
  it("ranks by average lift and names the enemies each item beats", () => {
    const picks = counterItemsVs(baseline, [vsX, vsY]);
    expect(picks.map((p) => p.itemId)).toEqual([A, B]);
    expect(picks[0].lift).toBeCloseTo(0.05);
    expect(picks[0].winRate).toBeCloseTo(0.55);
    expect(picks[0].matches).toBe(6000);
    expect(picks[0].against).toEqual([X]);
    expect(picks[1].lift).toBeCloseTo(0.03);
    expect(picks[1].against).toEqual([Y]);
  });
  it("corrects for an enemy that is easy to beat overall", () => {
    const easy = { heroId: X, rows: [row(A, 0.7), row(B, 0.6), row(L, 0.5)] };
    const [top, ...rest] = counterItemsVs(baseline, [easy]);
    expect(top.itemId).toBe(A);
    expect(top.lift).toBeCloseTo(0.1);
    expect(rest).toEqual([]);
  });
  it("counts a missing item as no lift against that enemy", () => {
    const withoutA = { heroId: Y, rows: [row(B, 0.56), row(L, 0.44)] };
    const [top] = counterItemsVs(baseline, [vsX, withoutA]);
    expect(top.itemId).toBe(A);
    expect(top.lift).toBeCloseTo(0.05);
  });
  it("needs enough matches and leaves out excluded items", () => {
    const thin = {
      heroId: X,
      rows: [row(A, 0.9, 199), row(B, 0.6), row(L, 0.4)],
    };
    expect(counterItemsVs(baseline, [thin]).map((p) => p.itemId)).toEqual([B]);
    expect(
      counterItemsVs(baseline, [vsX, vsY], new Set([A])).map((p) => p.itemId),
    ).toEqual([B]);
  });
  it("returns at most n items and nothing without data", () => {
    expect(counterItemsVs(baseline, [vsX, vsY], new Set(), 1)).toHaveLength(1);
    expect(counterItemsVs(baseline, [])).toEqual([]);
    expect(counterItemsVs([], [vsX])).toEqual([]);
  });
});

describe("fetchCounterData", () => {
  it("fetches the hero baseline and one request per enemy", async () => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return [];
      },
    } as unknown as DeadlockApi;
    const q = { minBadge: 0 };
    const data = await fetchCounterData(13, [7, 8], q, api);
    const base = `/v1/analytics/item-stats?${analyticsParams(q)}&hero_id=13`;
    expect(calls).toEqual([
      base,
      `${base}&enemy_hero_ids=7`,
      `${base}&enemy_hero_ids=8`,
    ]);
    expect(data.versus.map((v) => v.heroId)).toEqual([7, 8]);
  });
});
