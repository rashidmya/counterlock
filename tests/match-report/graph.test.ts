import { describe, expect, it } from "vitest";
import {
  averageSeries,
  formatValue,
  leadSeries,
  playerSeries,
  rangeAvailable,
  rangeOf,
  ranking,
  rankingTitle,
  teamSeries,
  valueAt,
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
    expect([valueAt(points, 50), valueAt(points, 500), valueAt([], 5)]).toEqual(
      [5, 10, 0],
    );
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

  it("gives the rank average up to match end, per minute too", () => {
    const avg = averageSeries(curve, souls, "total", 1800)!;
    expect(avg[0]).toEqual([0, 0, 0]);
    expect(avg.at(-1)).toEqual([1800, 30000, 3000]);
    const rate = averageSeries(curve, souls, "perMinute", 1800)!;
    expect(rate[0]).toEqual([180, 1000, 100]);
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
  });

  it("ranks everyone at a time, fewest first for deaths", () => {
    const most = ranking(report.players, souls, "total", 1800);
    expect(most[0].player.slot).toBe(12);
    expect(most[0].value).toBe(37560);
    expect(most.findIndex((r) => r.player.slot === 1)).toBe(6);
    const fewest = ranking(report.players, deaths, "total", 1800);
    expect(fewest[0].value).toBe(1);
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
  });
});
