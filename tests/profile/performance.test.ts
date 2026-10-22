import { describe, expect, it } from "vitest";
import type { PlayerHeroStat } from "@/features/profile/services/profile-api";
import type { HistoryMatch } from "@/features/profile/types";
import {
  combatAverages,
  performanceSeries,
} from "@/features/profile/utils/performance";

const match = (overrides: Partial<HistoryMatch> = {}): HistoryMatch => ({
  matchId: 1,
  heroId: 6,
  startTime: 100,
  gameMode: 1,
  matchMode: 1,
  team: 0,
  result: 0,
  kills: 4,
  deaths: 2,
  assists: 2,
  netWorth: 12000,
  lastHits: 100,
  denies: 0,
  durationS: 600,
  heroLevel: 1,
  badge: 0,
  ...overrides,
});

const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    match({ matchId: i + 1, startTime: 1000 + i, kills: i, result: i % 2 }),
  );

describe("performanceSeries", () => {
  it("keeps only normal and ranked games", () => {
    const series = performanceSeries(
      [
        match({ matchId: 1, startTime: 1 }),
        match({ matchId: 2, startTime: 2, matchMode: 4 }),
        match({ matchId: 3, startTime: 3, gameMode: 4 }),
        match({ matchId: 4, startTime: 4, matchMode: 3 }),
      ],
      "all",
    );
    expect(series.kda).toHaveLength(2);
    expect(series.form).toHaveLength(2);
    expect(series.averages.games).toBe(2);
  });

  it("returns at most N points oldest to newest", () => {
    const series = performanceSeries(many(30).reverse(), 20);
    expect(series.kda).toHaveLength(20);
    expect(series.soulsPerMin).toHaveLength(20);
    // kills = index, deaths 2, assists 2: kda = (i + 2) / 2, newest is i = 29.
    expect(series.kda[0]).toBe((10 + 2) / 2);
    expect(series.kda[19]).toBe((29 + 2) / 2);
    expect(performanceSeries(many(30), "all").kda).toHaveLength(30);
    expect(performanceSeries(many(30), 50).kda).toHaveLength(30);
  });

  it("returns form newest first, capped at 20, regardless of range", () => {
    const series = performanceSeries(many(30), 50);
    expect(series.form).toHaveLength(20);
    // i = 29 is newest: result 1, team 0 => loss; i = 28 => win.
    expect(series.form.slice(0, 2)).toEqual([false, true]);
  });

  it("stays finite with a zero-duration match", () => {
    const series = performanceSeries(
      [
        match({ matchId: 1, startTime: 1, durationS: 0 }),
        match({ matchId: 2, startTime: 2, deaths: 0 }),
      ],
      20,
    );
    for (const value of [...series.kda, ...series.soulsPerMin])
      expect(Number.isFinite(value)).toBe(true);
    expect(series.soulsPerMin[0]).toBe(0);
    expect(Number.isFinite(series.averages.soulsPerMin)).toBe(true);
  });

  it("handles an empty history", () => {
    const series = performanceSeries([], "all");
    expect(series.kda).toEqual([]);
    expect(series.form).toEqual([]);
    expect(series.averages.games).toBe(0);
  });

  it("averages cover the selected range only", () => {
    const series = performanceSeries(many(30), 20);
    expect(series.averages.games).toBe(20);
    expect(series.averages.avgDeaths).toBe(2);
  });
});

describe("combatAverages", () => {
  const stat = (
    matches: number,
    accuracy: number,
    damagePerMin: number,
  ): PlayerHeroStat => ({ heroId: 1, matches, accuracy, damagePerMin });

  it("weights by matches played across heroes", () => {
    expect(combatAverages([stat(3, 0.4, 1000), stat(1, 0.8, 2000)])).toEqual({
      accuracy: 0.5,
      damagePerMin: 1250,
    });
  });

  it("is null without hero stats", () => {
    expect(combatAverages([])).toBeNull();
  });
});
