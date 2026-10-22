import { describe, expect, it } from "vitest";
import {
  averageSeries,
  formatValue,
  leadSeries,
  minuteStep,
  playerSeries,
  rangeAvailable,
  rangeOf,
  ranking,
  rankingTitle,
  teamSeries,
  valueAt,
  yAxis,
} from "@/features/match-report/utils/graph";
import { metricById } from "@/features/match-report/utils/metrics";
import { parseCurve, rankBand } from "@/features/match-report/utils/rank-curve";
import { parseMatchReport } from "@/features/match-report/utils/report";
import { matchMetadata, rankCurveRows } from "../fixtures/match-report";

const report = parseMatchReport(matchMetadata(100000000), 1001);
const [lead] = report.players;
const souls = metricById.get("souls")!;
const deaths = metricById.get("deaths")!;
const accuracy = metricById.get("accuracy")!;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("series", () => {
  it("starts running totals at 0:00 and divides by minutes per minute", () => {
    const total = playerSeries(lead, souls, "total");
    expect(total[0]).toEqual([0, 0]);
    expect(total.at(-1)).toEqual([1800, 32400]);
    const rate = playerSeries(lead, souls, "perMinute");
    expect(rate[0]).toEqual([180, 900]);
    expect(rate.at(-1)).toEqual([1800, 1080]);
  });

  it("leaves rate stats as they are", () => {
    expect(playerSeries(lead, accuracy, "perMinute")).toEqual(
      playerSeries(lead, accuracy, "total"),
    );
    expect(playerSeries(lead, accuracy, "total")[0][0]).toBe(180);
  });

  it("interpolates and holds values beyond the ends", () => {
    const points: [number, number][] = [
      [0, 0],
      [100, 10],
    ];
    expect([
      valueAt(points, 50),
      valueAt(points, 500),
      valueAt([], 5),
      valueAt([[180, 5]], 0),
    ]).toEqual([5, 10, 0, 5]);
  });

  it("sums teams, averages rate stats, and leads Amber minus Sapphire", () => {
    expect(teamSeries(report.players, 0, souls, "total").at(-1)).toEqual([
      1800, 181800,
    ]);
    expect(teamSeries(report.players, 1, souls, "total").at(-1)).toEqual([
      1800, 210960,
    ]);
    expect(
      teamSeries(report.players, 0, accuracy, "total").at(-1)?.[1],
    ).toBeCloseTo(60);
    expect(leadSeries(report.players, souls, "total").at(-1)).toEqual([
      1800, -29160,
    ]);
  });

  it("leads by Amber's advantage: fewer deaths count as ahead", () => {
    // Amber died 9 times (4 + 5 × 1), Sapphire 6 times.
    expect(leadSeries(report.players, deaths, "total").at(-1)).toEqual([
      1800, -3,
    ]);
    expect(
      leadSeries(report.players, accuracy, "total").at(-1)?.[1],
    ).toBeCloseTo(0);
  });

  it("divides a team's total by minutes, even when someone's snapshots stop early", () => {
    const keep = 3;
    const early = {
      ...lead,
      times: lead.times.slice(0, keep),
      values: Object.fromEntries(
        Object.entries(lead.values).map(([id, v]) => [id, v.slice(0, keep)]),
      ) as typeof lead.values,
    };
    const players = [early, ...report.players.slice(1)];
    const total = teamSeries(players, 0, souls, "total").at(-1)!;
    const rate = teamSeries(players, 0, souls, "perMinute").at(-1)!;
    expect(rate[0]).toBe(1800);
    expect(rate[1]).toBeCloseTo(total[1] / 30);
  });

  it("leaves out players without snapshots", () => {
    const empty = {
      ...lead,
      times: [],
      values: Object.fromEntries(
        Object.keys(lead.values).map((id) => [id, []]),
      ) as unknown as typeof lead.values,
    };
    const players = [empty, ...report.players.slice(1)];
    expect(ranking(players, deaths, "total", 1800)).toHaveLength(11);
    expect(
      teamSeries(players, 0, metricById.get("level")!, "total").at(-1)?.[1],
    ).toBe(30);
  });

  it("gives the rank average up to match end, per minute too", () => {
    const avg = averageSeries(curve, souls, "total", 1800)!;
    expect(avg[0]).toEqual([0, 0, 0]);
    expect(avg.at(-1)).toEqual([1800, 30000, 3000]);
    const rate = averageSeries(curve, souls, "perMinute", 1800)!;
    expect(rate[0]).toEqual([180, 1000, 100]);
    const short = { ...curve, points: curve.points.filter((p) => p.t <= 900) };
    expect(averageSeries(short, souls, "total", 1800)!.at(-1)?.[0]).toBe(900);
    expect(averageSeries(null, souls, "total", 1800)).toBeNull();
    expect(averageSeries(curve, accuracy, "total", 1800)).toBeNull();
  });
});

describe("ranges and ranking", () => {
  it("maps time ranges and checks they fit the match", () => {
    expect(rangeOf("all", 1800)).toEqual([0, 1800]);
    expect(rangeOf("early", 1800)).toEqual([0, 600]);
    expect(rangeOf("mid", 1800)).toEqual([600, 1200]);
    expect(rangeOf("late", 1800)).toEqual([1200, 1800]);
    expect(rangeAvailable("late", 1100)).toBe(false);
    expect(rangeAvailable("mid", 1100)).toBe(true);
    expect(rangeAvailable("mid", 630)).toBe(false);
    expect(rangeAvailable("mid", 660)).toBe(true);
  });

  it("ranks everyone at a time, fewest first for deaths", () => {
    const most = ranking(report.players, souls, "total", 1800);
    expect(most[0].player.slot).toBe(12);
    expect(most[0].value).toBe(37560);
    expect(most.findIndex((r) => r.player.slot === 1)).toBe(6);
    const fewest = ranking(report.players, deaths, "total", 1800);
    expect(fewest[0].value).toBe(1);
    // Eleven players died once; ties go by slot.
    expect(fewest.slice(0, 11).map((r) => r.player.slot)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(fewest.at(-1)?.player.slot).toBe(1);
  });

  it("titles the ranking for the stat, values and range", () => {
    expect(rankingTitle(souls, "total", "all", 1800)).toBe("Most souls");
    expect(rankingTitle(deaths, "perMinute", "early", 600)).toBe(
      "Fewest deaths / min · at 10:00",
    );
    expect(rankingTitle(accuracy, "perMinute", "all", 1800)).toBe(
      "Highest accuracy %",
    );
  });

  it("formats axis values", () => {
    expect(formatValue(32400, souls)).toBe("32.4K");
    expect(formatValue(62.6666, accuracy)).toBe("62.7");
    expect(formatValue(-2.66, accuracy)).toBe("−2.7");
    expect(formatValue(-0.04, accuracy)).toBe("0");
    expect(formatValue(0.067, deaths)).toBe("0.07");
    expect(formatValue(-0.25, deaths)).toBe("−0.25");
    expect(formatValue(0.004, deaths)).toBe("0");
    expect(formatValue(-29160, souls)).toBe("−29.2K");
  });
});

describe("axes", () => {
  it("puts the y-axis on round ticks from 0 up past the top", () => {
    expect(yAxis([0, 32400], false)).toEqual({
      low: 0,
      high: 40000,
      ticks: [0, 10000, 20000, 30000, 40000],
    });
    expect(yAxis([-5, 10], false).ticks).toEqual([-5, 0, 5, 10]);
    expect(yAxis([0, 0], false)).toMatchObject({ low: 0, high: 1 });
  });

  it("centres the team lead on a 0 tick", () => {
    expect(yAxis([-29160, 500], true)).toEqual({
      low: -40000,
      high: 40000,
      ticks: [-40000, -20000, 0, 20000, 40000],
    });
  });

  it("spaces minute ticks at least 60px apart", () => {
    expect(minuteStep(1800, 900)).toBe(300);
    expect(minuteStep(3600, 300)).toBe(900);
    expect(minuteStep(600, 100)).toBe(600);
  });
});
