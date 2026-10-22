import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import {
  fetchMatchReport,
  fetchPlayerNames,
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

  it("throws when the metadata has no match or no players", () => {
    expect(() => parseMatchReport({}, 1)).toThrow(/unavailable/i);
    expect(() =>
      parseMatchReport({ match_info: { winning_team: 0, players: [] } }, 1),
    ).toThrow(/unavailable/i);
  });
});

describe("match report services", () => {
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
