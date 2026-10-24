import { describe, expect, it } from "vitest";
import {
  accountId,
  applyInfo,
  initialState,
  splitTeams,
} from "@/features/match/utils/game";
import { winRate } from "@/features/player-stats/utils/winRate";
import { demoState } from "../fixtures/demo";

const roster = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    player_name: "Player",
    steam_id: "76561198060265728",
    hero_id: 13,
    hero_name: "Haze",
    team_id: 3,
    is_local: false,
    ...patch,
  });

describe("game event integration", () => {
  it("retains live telemetry and distinguishes missing values from real zero", () => {
    let state = applyInfo(initialState(), {
      match_info: {
        roster_0: roster({
          hero_damage: 1200,
          object_damage: 300,
          hero_healing: 0,
          souls: "741",
          level: 3,
          assist: 2,
        }),
      },
    });
    expect(state.players[0]).toMatchObject({
      heroDamage: 1200,
      objectiveDamage: 300,
      healing: 0,
      souls: 741,
      level: 3,
      assists: 2,
      kills: null,
      deaths: null,
    });
    state = applyInfo(state, {
      category: "match_info",
      key: "roster_0 ",
      data: JSON.stringify({ hero_damage: 1300 }),
    });
    expect(state.players[0]).toMatchObject({
      heroDamage: 1300,
      healing: 0,
      souls: 741,
      assists: 2,
    });
    state = applyInfo(state, {
      match_info: {
        roster_0: {
          hero_healing: null,
          souls: "",
          level: false,
          kills: "invalid",
          deaths: -1,
          assist: Infinity,
        },
      },
    });
    expect(state.players[0]).toMatchObject({
      healing: null,
      souls: null,
      level: null,
      kills: null,
      deaths: null,
      assists: null,
    });
  });
  it.each([null, "", "  ", true, false, -1, NaN, Infinity, "bad"])(
    "does not turn invalid telemetry %s into a measurement",
    (value) => {
      const state = applyInfo(initialState(), {
        match_info: {
          roster_0: { hero_id: 7, hero_damage: value, kills: value },
        },
      });
      expect(state.players[0]).toMatchObject({ heroDamage: null, kills: null });
    },
  );
  it("clears measurements for a different account or hero in a reused slot", () => {
    const before = applyInfo(initialState(), {
      match_info: { roster_0: roster({ hero_damage: 1200, kills: 4 }) },
    });
    for (const patch of [{ steam_id: "100000001" }, { hero_id: 7 }]) {
      const next = applyInfo(before, { match_info: { roster_0: patch } });
      expect(next.players[0]).toMatchObject({ heroDamage: null, kills: null });
    }
    const removed = applyInfo(before, { match_info: { roster_0: null } });
    expect(
      applyInfo(removed, { match_info: { roster_0: { hero_id: 13 } } })
        .players[0].kills,
    ).toBeNull();
  });
  it("keeps telemetry when an anonymous player's account arrives later", () => {
    const before = applyInfo(initialState(), {
      match_info: {
        roster_0: roster({ steam_id: "", hero_damage: 1200, kills: 4 }),
      },
    });
    expect(
      applyInfo(before, { match_info: { roster_0: { steam_id: "100000000" } } })
        .players[0],
    ).toMatchObject({ heroDamage: 1200, kills: 4 });
  });
  it("converts exact Steam IDs and rejects rounded or invalid IDs", () => {
    expect(accountId("76561198060265728")).toBe(100000000);
    expect(accountId("[U:1:100000000]")).toBe(100000000);
    for (const input of [
      "",
      "0",
      "-1",
      "name",
      "4294967296",
      76561198060265728,
      null,
    ])
      expect(accountId(input)).toBeNull();
  });
  it("preserves a numeric SteamID64 inside stringified roster data", () => {
    const input = '{"hero_id":13,"steam_id":76561198060265729,"team_id":3}';
    expect(
      applyInfo(initialState(), { info: { match_info: { roster_0: input } } })
        .players[0].accountId,
    ).toBe(100000001);
  });
  it("merges both event forms, supports local ID arriving first, and derives teams", () => {
    let state = applyInfo(initialState(), {
      feature: "game_info",
      category: "game_info",
      key: "steam_id",
      value: "76561198060265730",
    });
    state = applyInfo(state, {
      info: {
        match_info: {
          roster_1: roster({ is_local: true, team_id: 2, steam_id: "" }),
          roster_2: roster(),
        },
      },
    });
    state = applyInfo(state, {
      category: "match_info",
      key: "roster_2",
      data: JSON.stringify({ kills: 5 }),
    });
    expect(splitTeams(state.players).allies[0].accountId).toBe(100000002);
    expect(splitTeams(state.players).enemies[0].kills).toBe(5);
    expect(state.players[1].heroId).toBe(13);
  });
  it("keeps unknown teams unclassified until the local player arrives", () => {
    const state = applyInfo(initialState(), {
      match_info: { roster_0: roster() },
    });
    expect(splitTeams(state.players).enemies).toEqual([]);
    expect(splitTeams(state.players).team).toBeUndefined();
  });
  it("resets roster and stats on a different match, handles deletions and malformed rows", () => {
    let state = applyInfo(initialState(), {
      match_info: { match_id: "1", roster_0: roster() },
    });
    state = { ...state, stats: { 100000000: { fetchedAt: 1 } } };
    state = applyInfo(state, {
      match_info: { match_id: "2", roster_1: roster(), roster_9: "invalid" },
    });
    expect(state.players.map((p) => p.slot)).toEqual(["roster_1"]);
    expect(state.stats).toEqual({});
    state = applyInfo(state, {
      category: "match_info",
      key: "roster_1",
      data: null,
    });
    expect(state.players).toEqual([]);
  });
  it("clears the previous roster on entering a new lobby", () => {
    const state = { ...demoState(), mode: "live" as const };
    const next = applyInfo(state, {
      game_info: { phase: "WaitingForPlayersToJoin" },
    });
    expect(next.players).toHaveLength(0);
    expect(next.clock).toBe("—");
  });
  it("maps inventory by exact identity and accepts stringified item payloads", () => {
    let state = applyInfo(initialState(), {
      match_info: { roster_1: roster() },
    });
    state = applyInfo(state, {
      match_info: {
        items_9: JSON.stringify({
          steam_id: "100000000",
          items: [{ id: 1378931225 }],
        }),
      },
    });
    expect(state.players[0].items).toEqual([1378931225]);
  });
  it("separates game-mode history and handles no matches", () => {
    const state = applyInfo(demoState(), {
      game_info: { game_mode: '{"game_mode":"StreetBrawl"}' },
    });
    expect(state.gameMode).toBe("street_brawl");
    expect(state.stats).toEqual({});
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(0, 4)).toBe(0);
    expect(winRate(7, 5)).toBeNull();
    expect(winRate(5, 10)).toBe(50);
  });
});
