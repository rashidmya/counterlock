import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import {
  fetchMatchReport,
  fetchPlayerNames,
  fetchCurrentBadges,
  fetchRankCurve,
} from "@/features/match-report/services/match-report";
import { METRICS } from "@/features/match-report/utils/metrics";
import {
  finalValue,
  parseMatchReport,
  teamOf,
} from "@/features/match-report/utils/report";
import {
  BADGE,
  DURATION_S,
  TIMES,
  bigItem,
  heroes,
  matchMetadata,
  rankCurveRows,
  smallItem,
} from "../fixtures/match-report";

const ACCOUNT = 100000000;

describe("parseMatchReport", () => {
  const report = parseMatchReport(matchMetadata(ACCOUNT), 1001);
  const lead = report.players[0];

  it("reads the match and sorts players Amber first, then by slot", () => {
    expect(report).toMatchObject({
      matchId: 1001,
      durationS: DURATION_S,
      gameMode: 1,
      winningTeam: 0,
    });
    expect(report.players.map((p) => p.slot)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(teamOf(report, 1).map((p) => p.heroId)).toEqual(
      heroes.slice(6).map((hero) => hero.id),
    );
  });

  it("reads each player's totals, rank badge and snapshot times", () => {
    expect(lead).toMatchObject({
      accountId: ACCOUNT,
      team: 0,
      heroId: heroes[0].id,
      kills: 8,
      deaths: 4,
      assists: 6,
      netWorth: 32400,
      lastHits: 110,
      badge: BADGE,
      times: TIMES,
    });
    for (const metric of METRICS)
      expect(lead.values[metric.id]).toHaveLength(TIMES.length);
  });

  it("derives accuracy, headshots by name and permanent buffs from pickups", () => {
    expect(finalValue(lead, "souls")).toBe(32400);
    expect(finalValue(lead, "accuracy")).toBeCloseTo(60);
    expect(finalValue(lead, "headshots")).toBe(60);
    expect(lead.values.permanentBuffs).toEqual([0, 1, 1, 2, 2, 2, 3, 3]);
    expect(lead.buffTimes).toEqual([200, 700, 1300]);
    expect(lead.buffCount).toBe(3);
    expect(report.buffsTimed).toBe(true);
  });

  it("keeps shop purchases only, deaths and destroyed objectives in time order", () => {
    expect(lead.purchases).toEqual([
      { timeS: 100, itemId: smallItem.id },
      { timeS: 900, itemId: bigItem.id },
    ]);
    expect(lead.deathTimes).toEqual([400, 1300, 1400, 1500]);
    expect(report.objectives).toEqual([
      { timeS: 600, team: 1 },
      { timeS: 1500, team: 0 },
    ]);
    expect(report.midBoss).toEqual([{ timeS: 1700, team: 0 }]);
  });

  it("treats a missing badge as 0 and skips snapshots at 0:00", () => {
    const data = matchMetadata(ACCOUNT);
    const player = data.match_info.players[0] as Record<string, unknown>;
    delete player.player_rank_data;
    (player.stats as { time_stamp_s: number }[])[0].time_stamp_s = 0;
    const parsed = parseMatchReport(data, 1001).players[0];
    expect(parsed.badge).toBe(0);
    expect(parsed.times).toEqual(TIMES.slice(1));
  });

  it("counts permanent buffs from their values when the game recorded no pickup times", () => {
    const data = matchMetadata(ACCOUNT);
    for (const p of data.match_info.players)
      (p as Record<string, unknown>).power_up_buffs = [
        { is_permanent: true, value: 3, pickup_times_s: [] },
      ];
    const old = parseMatchReport(data, 1001);
    const first = old.players[0];
    expect(first.buffCount).toBe(3);
    expect(first.buffTimes).toEqual([]);
    expect(first.values.permanentBuffs.every((v) => v === 0)).toBe(true);
    expect(old.buffsTimed).toBe(false);
  });

  it("sorts snapshots and drops duplicate times", () => {
    const data = matchMetadata(ACCOUNT);
    const player = data.match_info.players[0];
    player.stats.reverse();
    player.stats.push({ ...player.stats[0] });
    expect(parseMatchReport(data, 1001).players[0].times).toEqual(TIMES);
  });

  it("has no headshots when the match has no headshot stat", () => {
    const data = matchMetadata(ACCOUNT);
    delete (data.match_info as Record<string, unknown>).custom_user_stats;
    const parsed = parseMatchReport(data, 1001).players[0];
    expect(finalValue(parsed, "headshots")).toBe(0);
  });

  it("drops a death without a time", () => {
    const data = matchMetadata(ACCOUNT);
    (data.match_info.players[0].death_details as object[]).push({});
    expect(parseMatchReport(data, 1001).players[0].deathTimes).toEqual([
      400, 1300, 1400, 1500,
    ]);
  });

  it("uses the game's final kills, deaths, assists and souls at the match end", () => {
    const data = matchMetadata(ACCOUNT);
    const stats = data.match_info.players[0].stats;
    // One kill more than the scoreboard's 8 in the last two snapshots.
    stats.at(-1)!.kills = 9;
    stats.at(-2)!.kills = 9;
    const parsed = parseMatchReport(data, 1001).players[0];
    expect(finalValue(parsed, "kills")).toBe(8);
    expect(Math.max(...parsed.values.kills)).toBe(8);
    expect(finalValue(parsed, "souls")).toBe(32400);
  });

  it("has no buff count when the match has no buff data", () => {
    const data = matchMetadata(ACCOUNT);
    delete (data.match_info.players[0] as Record<string, unknown>)
      .power_up_buffs;
    expect(parseMatchReport(data, 1001).players[0].buffCount).toBeNull();
  });

  it("throws when the metadata has no match or no players", () => {
    expect(() => parseMatchReport({}, 1)).toThrow(/unavailable/i);
    expect(() =>
      parseMatchReport({ match_info: { winning_team: 0, players: [] } }, 1),
    ).toThrow(/unavailable/i);
  });
});

describe("match report services", () => {
  it("forwards the report's signal through metadata, names and current rank requests", async () => {
    const signal = new AbortController().signal;
    const calls: { path: string; signal?: AbortSignal }[] = [];
    const api = {
      get: async (path: string, _ttl: number, passed?: AbortSignal) => {
        calls.push({ path, signal: passed });
        if (path.endsWith("/metadata")) return matchMetadata(ACCOUNT, 42);
        if (path.includes("/steam?"))
          return [{ account_id: 7, personaname: "Seven" }];
        return [{ account_id: 7, badge: 73 }];
      },
    } as unknown as DeadlockApi;
    expect((await fetchMatchReport(42, api, signal)).matchId).toBe(42);
    expect(await fetchPlayerNames([7], api, signal)).toEqual(
      new Map([[7, "Seven"]]),
    );
    expect(await fetchCurrentBadges([7], api, signal)).toEqual(
      new Map([[7, 73]]),
    );
    expect(calls.map((call) => call.signal)).toEqual([signal, signal, signal]);
  });

  it("preserves cancellation when the report is waiting for a wider rank curve", async () => {
    const left = new AbortController();
    const reason = new Error("Report player changed");
    let asked = 0;
    const api = {
      get: async (_path: string, _ttl: number, signal?: AbortSignal) => {
        if (++asked === 1)
          return rankCurveRows(5000).map((row, index) => ({
            ...row,
            samples: index === 0 ? 50 : row.samples,
          }));
        // First curve has usable points; cancelling the wider request must
        // still reject rather than using those points as an error fallback.
        left.abort(reason);
        signal?.throwIfAborted();
        throw new Error("Signal missing");
      },
    } as unknown as DeadlockApi;
    await expect(fetchRankCurve(7, 73, 0, api, left.signal)).rejects.toBe(
      reason,
    );
    expect(asked).toBe(2);
  });

  it("preserves cancellation rather than treating a names lookup as an ordinary failure", async () => {
    const left = new AbortController();
    const reason = new Error("Report left");
    const api = {
      get: async (_path: string, _ttl: number, signal?: AbortSignal) => {
        left.abort(reason);
        signal?.throwIfAborted();
        throw new Error("Signal missing");
      },
    } as unknown as DeadlockApi;
    await expect(fetchPlayerNames([7], api, left.signal)).rejects.toBe(reason);
  });

  it("fetches the metadata path", async () => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return matchMetadata(ACCOUNT, 42);
      },
    } as unknown as DeadlockApi;
    const report = await fetchMatchReport(42, api);
    expect(calls).toEqual(["/v1/matches/42/metadata"]);
    expect(report.matchId).toBe(42);
  });

  it("names players by account, and gives an empty map when Steam fails", async () => {
    const ok = {
      get: async (path: string) => {
        expect(path).toBe("/v1/players/steam?account_ids=7,8");
        return [{ account_id: 7, personaname: "Seven" }];
      },
    } as unknown as DeadlockApi;
    expect([...(await fetchPlayerNames([7, 0, 8], ok))]).toEqual([
      [7, "Seven"],
    ]);
    const failing = {
      get: async () => {
        throw new Error("down");
      },
    } as unknown as DeadlockApi;
    expect((await fetchPlayerNames([7], failing)).size).toBe(0);
  });
});
