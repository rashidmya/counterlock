import { describe, expect, it } from "vitest";
import { demoState } from "../fixtures/demo";
import {
  clockSeconds,
  localComparison,
  meterRows,
} from "@/features/overlay/utils/meters";
import type { RankCurve } from "@/features/match-report/utils/rank-curve";

const curve: RankCurve = {
  band: { min: 71, max: 76, label: "Oracle" },
  points: [
    {
      t: 300,
      samples: 1000,
      avg: { kills: 2, deaths: 2, assists: 2 },
      std: {},
    },
    {
      t: 900,
      samples: 1000,
      avg: { kills: 6, deaths: 4, assists: 6 },
      std: {},
    },
  ],
};
describe("overlay meters", () => {
  it("sorts known measurements, scales bars and retains every player's identity", () => {
    const players = demoState().players;
    players[0].heroDamage = null;
    players[1].heroDamage = 0;
    const rows = meterRows(players, "heroDamage");
    expect(rows).toHaveLength(12);
    expect(rows[0].player.slot).toBe("roster_2");
    expect(rows[0].fraction).toBe(1);
    expect(rows.at(-1)).toMatchObject({
      player: { slot: "roster_0" },
      value: null,
      fraction: 0,
      tone: "local",
    });
    expect(rows.find((r) => r.player.slot === "roster_1")).toMatchObject({
      value: 0,
      fraction: 0,
      tone: "ally",
    });
    expect(rows.find((r) => r.player.slot === "roster_6")?.tone).toBe("enemy");
  });
  it("orders tied slots numerically and never divides an all-zero meter by zero", () => {
    const players = demoState()
      .players.map((p) => ({ ...p, healing: 0 }))
      .reverse();
    expect(meterRows(players, "healing").map((r) => r.player.slot)).toEqual(
      Array.from({ length: 12 }, (_, i) => `roster_${i}`),
    );
    expect(meterRows(players, "healing").every((r) => r.fraction === 0)).toBe(
      true,
    );
    players[0].healing = 100;
    players[1].healing = 50;
    expect(
      meterRows(players, "healing")
        .slice(0, 2)
        .map((r) => r.fraction),
    ).toEqual([1, 0.5]);
  });
  it("does not guess team colors without a unique local player on a known team", () => {
    const players = demoState().players.map((p) => ({ ...p, local: false }));
    expect(
      meterRows(players, "healing").every((r) => r.tone === "unknown"),
    ).toBe(true);
    players[0].local = true;
    players[0].team = 0;
    expect(
      meterRows(players, "healing").find((r) => r.player.slot === "roster_1")
        ?.tone,
    ).toBe("unknown");
    players[1].local = true;
    expect(localComparison({ ...demoState(), players }, curve)).toBeNull();
  });
});
describe("live comparisons", () => {
  it("interpolates individual K/D/A counts, with lower deaths favorable", () => {
    const result = localComparison({ ...demoState(), clock: "10:00" }, curve)!;
    expect(result.kda).toEqual({
      kills: { value: 3, average: 4, delta: -1, favorable: false },
      deaths: { value: 2, average: 3, delta: -1, favorable: true },
      assists: { value: 5, average: 4, delta: 1, favorable: true },
    });
    expect(result.level).toBe(10);
    expect(result.soulsPerMinute).toBeNull();
    expect(result.killParticipation).toBeCloseTo(0.4705882353);
  });
  it("has no deltas for missing values or after the curve ends", () => {
    const state = demoState();
    state.players[0].kills = null;
    expect(
      localComparison({ ...state, clock: "10:00" }, curve)!.kda.kills,
    ).toEqual({ value: null, average: 4, delta: null, favorable: null });
    expect(
      localComparison({ ...state, clock: "20:00" }, curve)!.kda.deaths.average,
    ).toBeNull();
    expect(
      localComparison({ ...state, clock: "—" }, curve)!.kda.deaths.average,
    ).toBeNull();
    expect(localComparison(state, null)!.kda.assists.delta).toBeNull();
    expect(localComparison({ ...state, players: [] }, curve)).toBeNull();
  });
  it("requires a full known team and positive team kills for kill participation", () => {
    const state = demoState();
    state.players = state.players
      .slice(0, 6)
      .map((p) => ({ ...p, kills: 1, assists: 1 }));
    expect(localComparison(state, null)!.killParticipation).toBeCloseTo(1 / 3);
    state.players[1].kills = null;
    expect(localComparison(state, null)!.killParticipation).toBeNull();
    state.players = state.players.map((p) => ({ ...p, kills: 0 }));
    expect(localComparison(state, null)!.killParticipation).toBeNull();
    state.players = state.players
      .slice(0, 4)
      .map((p) => ({ ...p, kills: 1, assists: 10 }));
    expect(localComparison(state, null)!.killParticipation).toBeNull();
    state.gameMode = "street_brawl";
    expect(localComparison(state, null)!.killParticipation).toBe(1);
  });
});
it.each([
  ["0:00", 0],
  ["12:34", 754],
  ["123:45", 7425],
  ["—", null],
  ["-0:10", null],
  ["1:60", null],
  ["bad", null],
])("parses match clock %s", (clock, expected) => {
  expect(clockSeconds(String(clock))).toBe(expected);
});
