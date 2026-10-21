import { describe, expect, it } from "vitest";
import type { HistoryMatch } from "@/features/profile/types";
import { catalog } from "@/shared/catalog";
import { recentForm, formLabel } from "@/features/home/utils/recent-form";
import { topHeroCards } from "@/features/home/utils/top-heroes";
import type { HeroSummary } from "@/features/heroes/utils/analytics";

const game = (
  startTime: number,
  won: boolean,
  gameMode = 1,
  matchMode = 4,
): HistoryMatch => ({
  matchId: startTime,
  heroId: 1,
  startTime,
  gameMode,
  matchMode,
  team: 0,
  result: won ? 0 : 1,
  kills: 0,
  deaths: 0,
  assists: 0,
  netWorth: 0,
  lastHits: 0,
  denies: 0,
  durationS: 0,
  heroLevel: 1,
});

describe("recentForm", () => {
  it("keeps the last 10 normal and ranked games, oldest first so the newest is on the right", () => {
    const newestFirst = Array.from({ length: 12 }, (_, index) =>
      game(100 - index, index < 4),
    );
    const form = recentForm(newestFirst);
    expect(form.results).toHaveLength(10);
    expect(form.wins).toBe(4);
    expect(form.losses).toBe(6);
    expect(form.results.slice(-4)).toEqual([true, true, true, true]);
    expect(form.results[0]).toBe(false);
  });

  it("skips Street Brawl and bot games", () => {
    const form = recentForm([
      game(5, true, 4, 1),
      game(4, false, 2, 3),
      game(3, false),
    ]);
    expect(form.results).toEqual([false]);
  });

  it("is empty without history", () => {
    expect(recentForm([])).toEqual({ results: [], wins: 0, losses: 0 });
  });
});

describe("formLabel", () => {
  it("reads like '4W 6L · last 10 games'", () => {
    expect(
      formLabel({ results: Array(10).fill(true), wins: 4, losses: 6 }),
    ).toBe("4W 6L · last 10 games");
    expect(formLabel({ results: [false], wins: 0, losses: 1 })).toBe(
      "0W 1L · last game",
    );
  });
});

describe("topHeroCards", () => {
  const summary = (heroId: number, position: number): HeroSummary => ({
    heroId,
    matches: 100,
    wins: 55,
    winRate: 0.55,
    pickRate: 0.1,
    kda: 2,
    tier: "A",
    position,
  });

  it("returns the six best positions as cards", () => {
    const heroes = catalog.heroes.slice(0, 8);
    const summaries = heroes.map((hero, index) =>
      summary(hero.id, heroes.length - index),
    );
    const cards = topHeroCards(summaries);
    expect(cards).toHaveLength(6);
    expect(cards.map((card) => card.heroId)).toEqual(
      heroes
        .slice(2)
        .reverse()
        .map((hero) => hero.id),
    );
    expect(cards[0]).toMatchObject({
      name: heroes[7].name,
      winRate: 0.55,
      pickRate: 0.1,
      tier: "A",
    });
  });

  it("drops summaries for heroes missing from the catalog", () => {
    expect(topHeroCards([summary(-1, 1)])).toEqual([]);
  });
});
