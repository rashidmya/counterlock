import { describe, expect, it, vi } from "vitest";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
import {
  fetchGameAverages,
  fetchMatchTotals,
} from "@/features/profile/services/performance-api";
import type { HistoryMatch } from "@/features/profile/types";
import { totalsPath } from "@/features/profile/utils/match-totals";
import { DeadlockApi, TTL } from "@/shared/api/DeadlockApi";
import { rankCurveRows } from "../fixtures/match-report";
import { bulkMatch } from "../fixtures/performance";

/** Answers bulk metadata for the ids asked, minus `unstored`; records each path. */
function bulkApi(unstored: number[] = [], fail = false) {
  const calls: string[] = [];
  const api = {
    get: async (path: string) => {
      calls.push(path);
      if (fail) throw new Error("API busy. Retry after the cooldown.");
      const ids = new URL(path, "https://x").searchParams
        .get("match_ids")!
        .split(",")
        .map(Number);
      return ids
        .filter((id) => !unstored.includes(id))
        .map((id) => bulkMatch(id, 77));
    },
  } as unknown as DeadlockApi;
  return { api, calls };
}

/** A real client whose fetch answers bulk metadata for `stored` matches only. */
function realBulkApi(stored: number[], now: () => number) {
  const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const ids = new URL(String(url)).searchParams
      .get("match_ids")!
      .split(",")
      .map(Number);
    return new Response(
      JSON.stringify(
        ids.filter((id) => stored.includes(id)).map((id) => bulkMatch(id, 77)),
      ),
    );
  });
  return { api: new DeadlockApi(request, now), request };
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("fetchMatchTotals", () => {
  it("asks in batches of 50", async () => {
    const { api, calls } = bulkApi();
    const totals = await fetchMatchTotals(range(1, 120), api);
    expect(calls).toEqual([
      totalsPath(range(1, 50)),
      totalsPath(range(51, 100)),
      totalsPath(range(101, 120)),
    ]);
    expect(totals.size).toBe(120);
    expect(totals.get(7)![0].accountId).toBe(77);
  });

  it("only asks for games it doesn't have yet", async () => {
    const { api, calls } = bulkApi();
    await fetchMatchTotals(range(1, 20), api);
    const totals = await fetchMatchTotals(range(1, 30), api);
    expect(calls).toEqual([
      totalsPath(range(1, 20)),
      totalsPath(range(21, 30)),
    ]);
    expect(totals.size).toBe(30);
  });

  it("shares a request still in flight", async () => {
    const { api, calls } = bulkApi();
    await Promise.all([
      fetchMatchTotals([1, 2], api),
      fetchMatchTotals([2, 1], api),
    ]);
    expect(calls).toHaveLength(1);
  });

  it("leaves out games the API hasn't stored and asks again next time", async () => {
    const { api, calls } = bulkApi([2]);
    const totals = await fetchMatchTotals([1, 2], api);
    expect([...totals.keys()]).toEqual([1]);
    await fetchMatchTotals([1, 2], api);
    expect(calls).toEqual([totalsPath([1, 2]), totalsPath([2])]);
  });

  it("fails as a whole, and asks again after a failure", async () => {
    const failing = bulkApi([], true);
    await expect(fetchMatchTotals([1, 2], failing.api)).rejects.toThrow(
      "API busy",
    );
    await expect(fetchMatchTotals([1, 2], failing.api)).rejects.toThrow();
    expect(failing.calls).toHaveLength(2);
  });

  it("sees a newly stored game once the client's answer is two minutes old", async () => {
    let now = 0;
    const stored = [1];
    const { api, request } = realBulkApi(stored, () => now);
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(1);
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(1);
    stored.push(2);
    now += 60_000;
    // The client still holds the empty answer for game 2.
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(1);
    now += TTL.history;
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(2);
    expect(
      request.mock.calls.map(([url]) =>
        new URL(String(url)).searchParams.get("match_ids"),
      ),
    ).toEqual(["1,2", "2", "2"]);
  });
});

describe("fetchGameAverages", () => {
  const game = (overrides: Partial<HistoryMatch>): HistoryMatch => ({
    matchId: 1,
    heroId: 6,
    startTime: 100,
    gameMode: 1,
    matchMode: 4,
    team: 0,
    result: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    netWorth: 0,
    lastHits: 0,
    denies: 0,
    durationS: 1800,
    heroLevel: 1,
    badge: 73,
    ...overrides,
  });

  /**
   * Curves for any hero and band (or a failure); the player's current rank
   * is `badge`, none, or a failure.
   */
  function curveApi(badge: number | null | Error, failCurves = false) {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        if (path.startsWith("/v1/players/rank")) {
          if (badge instanceof Error) throw badge;
          return badge === null
            ? []
            : [
                {
                  account_id: 77,
                  badge,
                  rank: Math.floor(badge / 10),
                  subrank: badge % 10,
                },
              ];
        }
        if (failCurves) throw new Error("Deadlock API unavailable (500).");
        return rankCurveRows();
      },
    } as unknown as DeadlockApi;
    return { api, calls };
  }

  it("shares one curve request per hero and rank between games", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify(rankCurveRows())),
      );
    const averages = await fetchGameAverages(
      77,
      [
        game({ matchId: 1 }),
        game({ matchId: 2, durationS: 1500 }),
        game({ matchId: 3, heroId: 7 }),
      ],
      new DeadlockApi(request),
    );
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      `https://api.deadlock-api.com${curvePath(6, rankBand(73))}`,
      `https://api.deadlock-api.com${curvePath(7, rankBand(73))}`,
    ]);
    expect(averages.get(1)!.values.souls).toBe(30000);
    expect(averages.get(2)!.values.souls).toBe(25000);
    expect(averages.get(3)!.source).toBe("game");
  });

  it("uses the current rank for games that recorded none", async () => {
    const { api, calls } = curveApi(116);
    const averages = await fetchGameAverages(
      77,
      [game({ matchId: 1, badge: 0, matchMode: 1 })],
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(116)));
    expect(averages.get(1)!.source).toBe("current");
    expect(averages.get(1)!.band.label).toBe("Eternus");
  });

  it("falls back to all ranks without a current rank", async () => {
    const { api, calls } = curveApi(null);
    const averages = await fetchGameAverages(
      77,
      [game({ matchId: 1, badge: 0 })],
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.get(1)!.source).toBe("none");
  });

  it("falls back to all ranks when the current rank fails to load", async () => {
    const { api, calls } = curveApi(new Error("Deadlock API timed out."));
    const averages = await fetchGameAverages(
      77,
      [game({ matchId: 1, badge: 0 })],
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.get(1)!.source).toBe("none");
  });

  it("fails as a whole when a curve fails, so the tab can offer Retry", async () => {
    const { api } = curveApi(116, true);
    await expect(
      fetchGameAverages(77, [game({ matchId: 1 })], api),
    ).rejects.toThrow("Deadlock API unavailable (500).");
  });

  it("doesn't ask for the current rank when every game has one", async () => {
    const { api, calls } = curveApi(116);
    await fetchGameAverages(77, [game({ matchId: 1 })], api);
    expect(calls.some((path) => path.startsWith("/v1/players/rank"))).toBe(
      false,
    );
  });
});
