import { describe, expect, it } from "vitest";
import catalog from "@/shared/catalog/catalog.json";
import {
  buildPhase,
  recommendedBuild,
} from "@/features/builds/utils/recommendations";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Hero } from "@/shared/catalog/types";

describe("recommended hero builds", () => {
  it("provides distinct phase picks for every catalog hero and preserves the source data", () => {
    const before = JSON.stringify(catalog.heroes);
    for (const hero of catalog.heroes) {
      const stages = recommendedBuild(hero, catalog.items);
      expect(
        stages.every((stage) => stage.items.length === 8),
        hero.name,
      ).toBe(true);
      const ids = stages.flatMap((stage) =>
        stage.items.map((pick) => pick.item.id),
      );
      expect(new Set(ids).size, hero.name).toBe(ids.length);
      expect(stages[0].items.every((pick) => pick.item.cost <= 1600)).toBe(
        true,
      );
      expect(
        stages[1].items.every(
          (pick) => pick.item.cost >= 1600 && pick.item.cost <= 3200,
        ),
      ).toBe(true);
      expect(stages[2].items.every((pick) => pick.item.cost >= 3200)).toBe(
        true,
      );
    }
    expect(JSON.stringify(catalog.heroes)).toBe(before);
  });
  it("ranks by phase popularity, skips removed and invalid picks, and marks owned items", () => {
    const items = catalog.items.filter((item) => item.cost === 800).slice(0, 3);
    const hero: Hero = {
      id: 999,
      name: "Fixture",
      tags: [],
      popularItems: {
        early_game: [
          { item_id: items[0].id, pick_pct: 10, winrate_pct: 99 },
          { item_id: items[1].id, pick_pct: 60, winrate_pct: 30 },
          { item_id: items[1].id, pick_pct: 60, winrate_pct: 30 },
          { item_id: items[2].id, pick_pct: NaN, winrate_pct: 80 },
          { item_id: 999999, pick_pct: 100, winrate_pct: 100 },
        ],
        mid_game: [],
        late_game: [],
      },
    };
    const result = recommendedBuild(hero, items, [items[1].id]);
    expect(result[0].items.map((p) => p.item.id)).toEqual([
      items[1].id,
      items[0].id,
    ]);
    expect(result[0].items[0].owned).toBe(true);
    expect(
      recommendedBuild(undefined, items).every((s) => s.items.length === 0),
    ).toBe(true);
  });
  it("bundles actual shop artwork for every available item", () => {
    for (const item of catalog.items) {
      expect(item.image, item.name).toContain("/images/items/");
      expect(item.localImage, item.name).toMatch(
        /^\.\/items\/\d+\.(webp|png)$/,
      );
      expect(existsSync(resolve("public", item.localImage)), item.name).toBe(
        true,
      );
    }
  });
});

describe("build phase timing", () => {
  it.each([
    ["00:00", "early_game"],
    ["09:59", "early_game"],
    ["10:00", "mid_game"],
    ["19:59", "mid_game"],
    ["20:00", "late_game"],
    ["75:30", "late_game"],
    ["", null],
    ["-1:00", null],
    ["10:60", null],
    ["unknown", null],
  ])("maps %s to %s", (clock, phase) => expect(buildPhase(clock)).toBe(phase));
  it("labels sparse-phase additions using their real source phase", () => {
    const calico = catalog.heroes.find((hero) => hero.name === "Calico")!;
    const early = recommendedBuild(calico, catalog.items)[0];
    expect(early.items).toHaveLength(8);
    expect(
      early.items.filter((item) => item.sourcePhase !== "early_game"),
    ).toHaveLength(1);
  });
});
