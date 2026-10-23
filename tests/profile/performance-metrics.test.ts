import { describe, expect, it } from "vitest";
import { metricById } from "@/features/match-report/utils/metrics";
import {
  averageAt,
  parseCurve,
  rankBand,
} from "@/features/match-report/utils/rank-curve";
import type { HistoryMatch } from "@/features/profile/types";
import { parseMatchTotals } from "@/features/profile/utils/match-totals";
import {
  MIN_TREND_GAMES,
  PERFORMANCE_METRICS,
  criticalT,
  gameAverage,
  gameTotals,
  gamesInRange,
  heroChoices,
  summarizeMetric,
  trend,
  type GameAverage,
  type PerformanceMetricId,
} from "@/features/profile/utils/performance-metrics";
import { rankCurveRows } from "../fixtures/match-report";
import { bulkMatch } from "../fixtures/performance";

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

const metric = (id: PerformanceMetricId) =>
  PERFORMANCE_METRICS.find((m) => m.id === id)!;

describe("gamesInRange", () => {
  const history = [
    ...Array.from({ length: 30 }, (_, i) =>
      match({ matchId: i + 1, startTime: 1000 + i, heroId: i % 2 ? 7 : 6 }),
    ),
    match({ matchId: 100, startTime: 5000, gameMode: 4 }),
    match({ matchId: 101, startTime: 5001, matchMode: 3 }),
  ];

  it("keeps the newest normal and ranked games, oldest first", () => {
    const games = gamesInRange(history, 20, null);
    expect(games.map((g) => g.matchId)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 11),
    );
  });

  it("takes the range from one hero's games", () => {
    const games = gamesInRange(history, 20, 7);
    expect(games).toHaveLength(15);
    expect(games.every((g) => g.heroId === 7)).toBe(true);
    expect(games.at(-1)!.matchId).toBe(30);
  });
});

describe("heroChoices", () => {
  it("counts normal and ranked games per hero, most played first", () => {
    expect(
      heroChoices([
        match({ heroId: 3 }),
        match({ heroId: 9 }),
        match({ heroId: 9 }),
        match({ heroId: 5, gameMode: 4 }),
      ]),
    ).toEqual([
      { heroId: 9, games: 2 },
      { heroId: 3, games: 1 },
    ]);
  });
});

describe("gameAverage", () => {
  const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

  it("reads each stat's rank average at the game's length", () => {
    const average = gameAverage(curve, 1800, "game");
    expect(average.band.label).toBe("Emissary");
    expect(average.source).toBe("game");
    // The fixture curve: 1,000 souls and 500 hero damage per minute.
    expect(average.values.souls).toBe(30000);
    expect(average.values.heroDamage).toBe(15000);
    expect(average.values.deaths).toBe(
      averageAt(curve, metricById.get("deaths")!, 1800)!.avg,
    );
    expect(Object.keys(average.values).sort()).toEqual([
      "assists",
      "creepKills",
      "deaths",
      "healing",
      "heroDamage",
      "kills",
      "objectiveDamage",
      "souls",
    ]);
  });

  it("has no values past the curve's end or without a length", () => {
    expect(gameAverage(curve, 9000, "none").values).toEqual({});
    expect(gameAverage(curve, 0, "game").values).toEqual({});
  });
});

describe("gameTotals", () => {
  const players = parseMatchTotals([bulkMatch(1, 77)]).get(1);

  it("adds up the player's team", () => {
    const totals = gameTotals(players, 77)!;
    expect(totals.own.accountId).toBe(77);
    expect(totals.teamKills).toBe(10 + 5 * 4);
    expect(totals.teamHeroDamage).toBe(30000 + 5 * 15000);
    expect(totals.teamObjectiveDamage).toBe(6000 + 5 * 1500);
    expect(totals.teamHealing).toBe(4000 + 5 * 3000);
  });

  it("is undefined when the player isn't in the match", () => {
    expect(gameTotals(players, 5)).toBeUndefined();
    expect(gameTotals(undefined, 77)).toBeUndefined();
  });
});

describe("metrics", () => {
  const game = match({ durationS: 1800, netWorth: 36000 });
  const totals = gameTotals(parseMatchTotals([bulkMatch(1, 77)]).get(1), 77);
  const values: GameAverage["values"] = {
    souls: 30000,
    heroDamage: 15000,
    kills: 6,
    deaths: 5,
    assists: 9,
  };
  const value = (id: PerformanceMetricId) => {
    const fraction = metric(id).value(game, totals);
    return fraction && fraction.num / fraction.den;
  };
  const average = (id: PerformanceMetricId) => {
    const fraction = metric(id).average?.(game, values);
    return fraction ? fraction.num / fraction.den : null;
  };

  it("are the ten in the spec, in order", () => {
    expect(PERFORMANCE_METRICS.map((m) => m.label)).toEqual([
      "Souls / min",
      "K/D/A ratio",
      "Hero damage / min",
      "Objective damage / min",
      "Healing / min",
      "Creep kills / min",
      "Kill participation",
      "Hero damage share",
      "Objective damage share",
      "Healing share",
    ]);
  });

  it("souls and K/D/A come from the history row", () => {
    expect(value("soulsPerMin")).toBe(1200);
    expect(average("soulsPerMin")).toBe(1000);
    expect(value("kda")).toBe((4 + 2) / 2);
    expect(average("kda")).toBe((6 + 9) / 5);
    // Deaths count as at least one when dividing, not in the fraction.
    expect(metric("kda").value(match({ deaths: 0 }), undefined)).toEqual({
      num: 6,
      den: 0,
    });
    expect(metric("kda").minDenominator).toBe(1);
  });

  it("the rest need the match's totals", () => {
    expect(value("heroDamagePerMin")).toBe(1000);
    expect(average("heroDamagePerMin")).toBe(500);
    expect(value("objectiveDamagePerMin")).toBe(200);
    expect(value("healingPerMin")).toBe(4000 / 30);
    expect(value("creepKillsPerMin")).toBe(3);
    expect(average("creepKillsPerMin")).toBeNull();
    expect(value("killParticipation")).toBe(17 / 30);
    expect(value("damageShare")).toBe(30000 / 105000);
    expect(value("objectiveShare")).toBe(6000 / 13500);
    expect(value("healingShare")).toBe(4000 / 19000);
    expect(metric("damageShare").average).toBeUndefined();
    expect(metric("objectiveShare").average).toBeUndefined();
    expect(metric("healingShare").average).toBeUndefined();
    expect(metric("heroDamagePerMin").value(game, undefined)).toBeNull();
  });

  it("skip games without a length or a team total", () => {
    const short = match({ durationS: 0 });
    expect(metric("soulsPerMin").value(short, totals)).toBeNull();
    expect(metric("soulsPerMin").average!(short, values)).toBeNull();
    const alone = {
      ...totals!,
      teamKills: 0,
      teamObjectiveDamage: 0,
      teamHealing: 0,
    };
    expect(metric("killParticipation").value(game, alone)).toBeNull();
    expect(metric("objectiveShare").value(game, alone)).toBeNull();
    expect(metric("healingShare").value(game, alone)).toBeNull();
    // Healing nothing while the team heals is a share of 0, still a game.
    const noHeals = { ...totals!, own: { ...totals!.own, healing: 0 } };
    expect(metric("healingShare").value(game, noHeals)).toEqual({
      num: 0,
      den: 19000,
    });
  });
});

describe("trend", () => {
  it("needs MIN_TREND_GAMES games", () => {
    expect(MIN_TREND_GAMES).toBe(6);
    expect(trend([1, 2, 3, 4, 5])).toBeNull();
  });

  it("reads 95% critical values of t, the stricter row between rows", () => {
    expect(criticalT(4)).toBe(2.78);
    expect(criticalT(4.9)).toBe(2.78);
    expect(criticalT(18)).toBe(2.13);
    expect(criticalT(1000)).toBe(1.98);
    expect(criticalT(0.5)).toBe(12.71);
  });

  it("is flat unless Welch's t-test finds the halves differ at 95%", () => {
    // Means 1.0 and 1.1: t ≈ 1.22.
    expect(trend([0.9, 1.1, 1.0, 1.0, 1.2, 1.1])).toBe("flat");
    // Means 1.0 and 1.2: t ≈ 2.45, short of 2.78 on 4 degrees of freedom.
    expect(trend([0.9, 1.0, 1.1, 1.1, 1.2, 1.3])).toBe("flat");
    expect(trend([1, 1, 1, 1, 1, 1])).toBe("flat");
  });

  it("improves or slips beyond that", () => {
    expect(trend([0.9, 1.0, 1.1, 1.4, 1.5, 1.6])).toBe("improving");
    expect(trend([1.6, 1.5, 1.4, 1.1, 1.0, 0.9])).toBe("slipping");
    // The same 0.2 step over 20 games: t ≈ 5.5 on 18 degrees of freedom.
    const earlier = [0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 1.0];
    expect(trend([...earlier, ...earlier.map((v) => v + 0.2)])).toBe(
      "improving",
    );
    // No spread at all: any change counts.
    expect(trend([1, 1, 1, 2, 2, 2])).toBe("improving");
  });

  it("puts the middle game in the earlier half", () => {
    // Earlier [1, 1, 1, 2] and recent [2, 2, 2]: t = 3, short of 3.18 on 3
    // degrees of freedom. With the middle game in the recent half both
    // halves would be constant, a sure change.
    expect(trend([1, 1, 1, 2, 2, 2, 2])).toBe("flat");
  });
});

describe("summarizeMetric", () => {
  // Six games, 30 minutes each: souls/min climbs from 900 to 1,400 while
  // the rank average stays at 1,000.
  const games = [900, 950, 1000, 1300, 1350, 1400].map((rate, i) =>
    match({
      matchId: i + 1,
      startTime: i,
      durationS: 1800,
      netWorth: rate * 30,
      result: i % 2,
    }),
  );
  const average: GameAverage = {
    band: rankBand(73),
    source: "game",
    values: { souls: 30000 },
  };

  it("adds up the range and compares it with the rank average", () => {
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      games,
      () => undefined,
      () => average,
    );
    expect(summary.points.map((p) => p.value)).toEqual([
      900, 950, 1000, 1300, 1350, 1400,
    ]);
    expect(summary.points.map((p) => p.won)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(summary.value).toBe(1150);
    expect(summary.games).toBe(6);
    expect(summary.average).toBe(1000);
    expect(summary.compared).toBe(6);
    expect(summary.trend).toBe("improving");
  });

  it("weights games by length, not each game equally", () => {
    const long = [
      match({ matchId: 1, durationS: 600, netWorth: 6000 }),
      match({ matchId: 2, durationS: 3000, netWorth: 60000 }),
    ];
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      long,
      () => undefined,
      () => undefined,
    );
    // 66,000 souls over 60 minutes, not the mean of 600 and 1,200.
    expect(summary.value).toBe(1100);
    expect(summary.average).toBeNull();
    expect(summary.compared).toBe(0);
  });

  it("compares like with like when some games have no rank average", () => {
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      games,
      () => undefined,
      (id) => (id <= 4 ? average : undefined),
    );
    expect(summary.value).toBe(1150);
    expect(summary.games).toBe(6);
    expect(summary.average).toBe(1000);
    expect(summary.compared).toBe(4);
    expect(summary.comparedValue).toBe((900 + 950 + 1000 + 1300) / 4);
    // Four games to compare are too few for a trend.
    expect(summary.trend).toBeNull();
  });

  it("adds up deaths before counting them as at least one", () => {
    const summary = summarizeMetric(
      metric("kda"),
      [0, 0, 4].map((deaths, i) => match({ matchId: i + 1, deaths })),
      () => undefined,
      () => undefined,
    );
    expect(summary.points.map((p) => p.value)).toEqual([6, 6, 1.5]);
    // 18 kills and assists over 4 deaths, not over 1 + 1 + 4.
    expect(summary.value).toBe(4.5);
  });

  it("has no trend for a rank-averaged metric until the averages load", () => {
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      games,
      () => undefined,
      () => undefined,
    );
    expect(summary.trend).toBeNull();
    expect(summary.points.every((p) => p.average === null)).toBe(true);
  });

  it("follows each game against its own rank average", () => {
    // The player swaps to a hero whose average is 40% higher: the raw
    // values climb, but against each game's average nothing changed.
    const averages = (id: number): GameAverage => ({
      ...average,
      values: { souls: id > 3 ? 42000 : 30000 },
    });
    const swapped = [900, 950, 1000, 1260, 1330, 1400].map((rate, i) =>
      match({ matchId: i + 1, durationS: 1800, netWorth: rate * 30 }),
    );
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      swapped,
      () => undefined,
      averages,
    );
    expect(summary.trend).toBe("flat");
  });

  it("uses the values themselves for metrics without a rank average", () => {
    const totals = (id: number) =>
      gameTotals(
        parseMatchTotals([
          bulkMatch(id, 77, { kills: id > 3 ? 20 : 2, assists: 0 }),
        ]).get(id),
        77,
      );
    const summary = summarizeMetric(
      metric("killParticipation"),
      games,
      totals,
      () => average,
    );
    expect(summary.points.map((p) => p.average)).toEqual(Array(6).fill(null));
    expect(summary.trend).toBe("improving");
    expect(summary.heroMix).toBe(false);
  });

  it("has no share trend over games on more than one hero", () => {
    const totals = (id: number) =>
      gameTotals(
        parseMatchTotals([
          bulkMatch(id, 77, { kills: id > 3 ? 20 : 2, assists: 0 }),
        ]).get(id),
        77,
      );
    // The same games, the last three on another hero: from a support to a
    // carry, say, which alone could lift kill participation.
    const switched = games.map((game, i) =>
      i > 2 ? { ...game, heroId: 7 } : game,
    );
    const share = summarizeMetric(
      metric("killParticipation"),
      switched,
      totals,
      () => average,
    );
    expect(share.trend).toBeNull();
    expect(share.heroMix).toBe(true);
    // A rank average takes the hero out of the comparison.
    const souls = summarizeMetric(
      metric("soulsPerMin"),
      switched,
      () => undefined,
      () => average,
    );
    expect(souls.trend).toBe("improving");
    expect(souls.heroMix).toBe(false);
  });

  it("leaves out games without totals", () => {
    const summary = summarizeMetric(
      metric("heroDamagePerMin"),
      games,
      (id) =>
        id === 1
          ? gameTotals(parseMatchTotals([bulkMatch(1, 77)]).get(1), 77)
          : undefined,
      () => average,
    );
    expect(summary.games).toBe(1);
    expect(summary.points.map((p) => p.value)).toEqual([
      1000,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(summary.trend).toBeNull();
  });
});
