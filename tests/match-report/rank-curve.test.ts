import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { metricById } from "@/features/match-report/utils/metrics";
import {
  MIN_STEP_SAMPLES,
  averageAt,
  curvePath,
  lobbyBadge,
  parseCurve,
  rankBand,
} from "@/features/match-report/utils/rank-curve";
import { parseMatchReport } from "@/features/match-report/utils/report";
import { matchMetadata, rankCurveRows } from "../fixtures/match-report";

const souls = metricById.get("souls")!;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("rank band", () => {
  it("covers the badge's whole tier, wider on request, clamped to real tiers", () => {
    expect(rankBand(73)).toEqual({ min: 71, max: 76, label: "Emissary" });
    expect(rankBand(73, 1)).toEqual({
      min: 61,
      max: 86,
      label: "Ritualist–Oracle",
    });
    expect(rankBand(114, 1)).toEqual({
      min: 101,
      max: 116,
      label: "Ascendant–Eternus",
    });
    expect(rankBand(0)).toEqual({ min: 0, max: 0, label: "all ranks" });
  });

  it("takes the lobby's rank from the known badges", () => {
    const players = parseMatchReport(matchMetadata(1), 1).players;
    expect(lobbyBadge(players)).toBe(73);
    expect(lobbyBadge(players.map((p) => ({ ...p, badge: 0 })))).toBe(0);
  });

  it("builds the curve path with absolute time and the band", () => {
    expect(curvePath(7, rankBand(73))).toBe(
      "/v1/analytics/player-performance-curve?hero_ids=7&resolution=0&min_average_badge=71&max_average_badge=76",
    );
    expect(curvePath(7, rankBand(0))).toBe(
      "/v1/analytics/player-performance-curve?hero_ids=7&resolution=0",
    );
  });
});

describe("averageAt", () => {
  it("interpolates between steps, from 0 at 0:00 for running totals", () => {
    expect(averageAt(curve, souls, 90)).toEqual({ avg: 1500, std: 150 });
    expect(averageAt(curve, souls, 1800)).toEqual({ avg: 30000, std: 3000 });
    expect(averageAt(curve, souls, 1650)?.avg).toBeCloseTo(27500);
  });

  it("is null past the last step and for stats the curve lacks", () => {
    expect(averageAt(curve, souls, 2500)).toBeNull();
    expect(averageAt(curve, metricById.get("damageTaken")!, 600)).toBeNull();
    expect(averageAt(curve, metricById.get("level")!, 600)).toBeNull();
  });
});

describe("fetchRankCurve", () => {
  const recording = (samples: (path: string) => number) => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return rankCurveRows(samples(path)).map((row, index) => ({
          ...row,
          samples: index === 9 ? MIN_STEP_SAMPLES - 1 : row.samples,
        }));
      },
    } as unknown as DeadlockApi;
    return { calls, api };
  };

  it("uses the badge's tier and drops thin late steps", async () => {
    const { calls, api } = recording(() => 5000);
    const result = await fetchRankCurve(7, 73, api);
    expect(calls).toEqual([curvePath(7, rankBand(73))]);
    expect(result.band.label).toBe("Emissary");
    expect(result.widenedFrom).toBeUndefined();
    expect(result.points.map((p) => p.t).at(-1)).toBe(2100);
  });

  it("widens one tier each way when the tier has too few games", async () => {
    const { calls, api } = recording((path) =>
      path.includes("min_average_badge=71") ? 50 : 5000,
    );
    const result = await fetchRankCurve(7, 73, api);
    expect(calls).toEqual([
      curvePath(7, rankBand(73)),
      curvePath(7, rankBand(73, 1)),
    ]);
    expect(result.band.label).toBe("Ritualist–Oracle");
    expect(result.widenedFrom).toBe("Emissary");
  });
});
