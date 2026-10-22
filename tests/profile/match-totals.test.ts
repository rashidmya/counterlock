import { describe, expect, it } from "vitest";
import {
  TOTALS_BATCH,
  parseMatchTotals,
  totalsPath,
} from "@/features/profile/utils/match-totals";
import { OWN, bulkMatch } from "../fixtures/performance";

describe("totalsPath", () => {
  it("asks for K/D/A and four stat columns of exactly these matches", () => {
    expect(totalsPath([3, 1])).toBe(
      "/v1/matches/metadata?match_ids=3,1&include_player_kda=true" +
        "&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills" +
        "&limit=2",
    );
    expect(TOTALS_BATCH).toBe(50);
  });
});

describe("parseMatchTotals", () => {
  it("reads each player's final values and team", () => {
    const totals = parseMatchTotals([bulkMatch(5, 77)]);
    const players = totals.get(5)!;
    expect(players).toHaveLength(12);
    expect(players[0]).toEqual({ accountId: 77, team: 0, ...OWN });
    expect(players[11]).toMatchObject({ accountId: 9010, team: 1 });
  });

  it("accepts numeric teams too", () => {
    const match = bulkMatch(5, 77);
    const players = [{ ...match.players[0], team: 1 }];
    expect(parseMatchTotals([{ ...match, players }]).get(5)![0].team).toBe(1);
  });

  it("leaves out a match with a player it can't read, and matches without players", () => {
    const noSnapshots = bulkMatch(5, 77);
    noSnapshots.players[3].stats_player_damage = [];
    const noTeam = bulkMatch(6, 77);
    noTeam.players[1].team = "Spectator";
    const empty = { ...bulkMatch(7, 77), players: [] };
    const totals = parseMatchTotals([
      noSnapshots,
      noTeam,
      empty,
      bulkMatch(8, 77),
      null,
      { match_id: "9" },
    ]);
    expect([...totals.keys()]).toEqual([8]);
  });

  it("is empty for anything but an array", () => {
    expect(parseMatchTotals({ error: "busy" }).size).toBe(0);
  });
});
