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
    expect(picks.map((p) => p.scope)).toEqual(["team", "team"]);
    expect(picks[0].lift).toBeCloseTo(0.05);
    expect(picks[0].matches).toBe(3000);
    expect(picks[0].against).toEqual([X]);
    expect(picks[1].lift).toBeCloseTo(0.03);
    expect(picks[1].against).toEqual([Y]);
  });
  it("lists an item that clearly beats one enemy after the team-wide ones", () => {
    // B gains 4.5 points against X alone: clear against X, too little
    // averaged over three enemies.
    const Z = 103;
    const x = { heroId: X, rows: [row(A, 0.6), row(B, 0.545), row(L, 0.355)] };
    const y = { heroId: Y, rows: [row(A, 0.6), row(B, 0.5), row(L, 0.4)] };
    const z = { heroId: Z, rows: [row(A, 0.6), row(B, 0.5), row(L, 0.4)] };
    const picks = counterItemsVs(baseline, [x, y, z]);
    expect(picks.map((p) => [p.itemId, p.scope])).toEqual([
      [A, "team"],
      [B, "hero"],
    ]);
    expect(picks[1].lift).toBeCloseTo(0.045);
    expect(picks[1].matches).toBe(3000);
    expect(picks[1].against).toEqual([X]);
    expect(
      counterItemsVs(baseline, [x, y, z], new Set(), 1).map((p) => p.itemId),
    ).toEqual([A]);
  });
  it("an item that does worse against the team overall is not listed for beating one enemy", () => {
    const x = { heroId: X, rows: [row(A, 0.6), row(B, 0.545), row(L, 0.355)] };
    const worse = (heroId: number) => ({
      heroId,
      rows: [row(A, 0.6), row(B, 0.44), row(L, 0.46)],
    });
    expect(
      counterItemsVs(baseline, [x, worse(Y), worse(103)]).map((p) => p.itemId),
    ).toEqual([A]);
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
  it("a small lift on a small sample is not a counter, the same lift on a large one is", () => {
    const enemy = (matches: number) => ({
      heroId: X,
      rows: [row(A, 0.53, matches), row(L, 0.47, matches)], // overall 50%: no shift
    });
    expect(counterItemsVs(baseline, [enemy(300)])).toEqual([]);
    const [top] = counterItemsVs(baseline, [enemy(30000)]);
    expect(top.itemId).toBe(A);
    expect(top.lift).toBeCloseTo(0.03);
  });
  it("an enemy with only small samples does not dilute the lift", () => {
    const tiny = { heroId: 103, rows: [row(A, 0.9, 100), row(B, 0.1, 100)] };
    const picks = counterItemsVs(baseline, [vsX, vsY, tiny]);
    expect(picks.map((p) => p.itemId)).toEqual([A, B]);
    expect(picks[0].lift).toBeCloseTo(0.05);
  });
  it("exactly minMatches qualifies", () => {
    const edge = { heroId: X, rows: [row(A, 0.8, 200), row(L, 0.2, 200)] };
    expect(counterItemsVs(baseline, [edge]).map((p) => p.itemId)).toEqual([A]);
  });
  it("against lists only enemies where the item clearly does better", () => {
    const small = { heroId: Y, rows: [row(A, 0.52, 200), row(L, 0.48, 200)] };
    const [top] = counterItemsVs(baseline, [vsX, small]);
    expect(top.itemId).toBe(A);
    expect(top.lift).toBeCloseTo(0.06);
    expect(top.against).toEqual([X]);
  });
  it("ranks by the lower bound", () => {
    // P: lift 0.06 on 1,500 matches. Q: lift 0.05 on 40,000. R offsets the shift.
    const rate = (0.5 * 81500 - (0.56 * 1500 + 0.55 * 40000)) / 40000;
    const enemy = {
      heroId: X,
      rows: [row(A, 0.56, 1500), row(B, 0.55, 40000), row(L, rate, 40000)],
    };
    const picks = counterItemsVs(baseline, [enemy]);
    expect(picks.map((p) => p.itemId)).toEqual([B, A]);
    expect(picks[0].lift).toBeCloseTo(0.05);
    expect(picks[1].lift).toBeCloseTo(0.06);
  });
  it("reports the largest single-enemy sample as matches", () => {
    const big = { heroId: X, rows: [row(A, 0.6, 5000), row(L, 0.4, 5000)] };
    const small = { heroId: Y, rows: [row(A, 0.6, 2000), row(L, 0.4, 2000)] };
    const [top] = counterItemsVs(baseline, [small, big]);
    expect(top.itemId).toBe(A);
    expect(top.matches).toBe(5000);
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
