import { describe, expect, it } from "vitest";
import { splitTeams } from "@/features/match/utils/game";
import {
  heroThreats,
  recommend,
} from "@/features/counters/utils/recommendations";
import catalog from "@/shared/catalog/catalog.json";
import { demoState } from "../fixtures/demo";

// Nurse Harrow: heroThreats has no entry yet. Remove her id here when a profile is added.
const awaitingProfile = [87];

describe("recommendation constraints", () => {
  const enemies = splitTeams(demoState().players).enemies;
  it("only the heroes named as awaiting a profile lack a matchup profile", () => {
    expect(
      catalog.heroes.filter((hero) => !heroThreats[hero.id]).map((h) => h.id),
    ).toEqual(awaitingProfile);
  });
  it("provides starter suggestions for every active hero with a matchup profile", () => {
    for (const hero of catalog.heroes) {
      if (awaitingProfile.includes(hero.id)) continue;
      expect(
        recommend(
          [{ ...enemies[0], heroId: hero.id, heroName: hero.name }],
          catalog.items,
          6400,
          [],
        ).length,
        hero.name,
      ).toBeGreaterThan(0);
    }
  });
  it("uses catalog prices, deduplicates, respects the budget and excludes owned items", () => {
    const items = recommend(enemies, catalog.items, 1600, [2603935618]);
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every((r) => r.item.cost <= 1600 && r.item.id !== 2603935618),
    ).toBe(true);
    expect(new Set(items.map((r) => r.item.id)).size).toBe(items.length);
    expect(recommend(enemies, [], 6400, [])).toEqual([]);
  });
  it("focuses on the selected hero and provides a manual fallback for new heroes", () => {
    const haze = enemies.filter((p) => p.heroId === 13);
    const entries = recommend(haze, catalog.items, 6400, []);
    expect(entries.some((r) => r.item.name === "Metal Skin")).toBe(true);
    expect(entries.every((r) => r.targets.every((t) => t === "Haze"))).toBe(
      true,
    );
    const unknown = [{ ...enemies[0], heroId: 999 }];
    expect(recommend(unknown, catalog.items, 6400, [])).toEqual([]);
    expect(
      recommend(unknown, catalog.items, 6400, [], ["healing"]).length,
    ).toBeGreaterThan(0);
  });
  it("accepts hero references without full player rows", () => {
    const hero = catalog.heroes.find((h) => heroThreats[h.id])!;
    const list = recommend(
      [{ heroId: hero.id, heroName: hero.name }],
      catalog.items,
      6400,
      [],
    );
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].targets).toContain(hero.name);
  });
});
