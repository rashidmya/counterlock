import { describe, expect, it } from "vitest";
import { TTL, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchLiveMatch } from "@/features/profile/services/live-api";
import {
  elapsedS,
  parseLiveMatch,
  soulLead,
  standing,
} from "@/features/profile/utils/live-match";
import { modeLabel } from "@/features/profile/utils/match-history";
import {
  ALL_STANDING,
  LIVE_MATCH_ID,
  activeMatch,
  liveHeroes,
} from "../fixtures/live-match";

const ME = 42;

describe("parseLiveMatch", () => {
  it("reads the account's match: players, teams and modes", () => {
    const match = parseLiveMatch(
      [
        activeMatch(9, { matchId: 1 }),
        activeMatch(ME, {
          startTime: 1_792_770_000,
          netWorth: [90000, 95000],
          masks: [ALL_STANDING, 0b1111111111100101],
        }),
      ],
      ME,
    );
    expect(match).toMatchObject({
      matchId: LIVE_MATCH_ID,
      startTime: 1_792_770_000,
      durationS: null,
      gameMode: 1,
      matchMode: 4,
      teams: {
        0: { netWorth: 90000, objectives: ALL_STANDING, rounds: 0 },
        1: { netWorth: 95000, objectives: 0b1111111111100101, rounds: 0 },
      },
    });
    expect(match?.players).toHaveLength(12);
    expect(match?.players[0]).toEqual({
      accountId: ME,
      heroId: liveHeroes[0].id,
      team: 0,
    });
    expect(match?.players.filter((p) => p.team === 1)).toHaveLength(6);
    expect(modeLabel(match!)).toBe("Ranked");
  });

  it("reads Street Brawl's rounds", () => {
    const match = parseLiveMatch(
      [activeMatch(ME, { gameMode: 4, matchMode: 1, rounds: [2, 1] })],
      ME,
    );
    expect(match?.players).toHaveLength(8);
    expect(match?.teams[0].rounds).toBe(2);
    expect(match?.teams[1].rounds).toBe(1);
    expect(modeLabel(match!)).toBe("Street Brawl");
  });

  it("is null when the account isn't in any listed match", () => {
    expect(parseLiveMatch([activeMatch(9)], ME)).toBeNull();
    expect(parseLiveMatch([], ME)).toBeNull();
    expect(parseLiveMatch({ error: "busy" }, ME)).toBeNull();
  });

  it("leaves out players without an id, hero or team, and keeps one without an account", () => {
    const raw = activeMatch(ME);
    raw.players[1] = { ...raw.players[1], account_id: null as never };
    raw.players[2] = { ...raw.players[2], team: 2 };
    raw.players[3] = { ...raw.players[3], account_id: 0 };
    const players = parseLiveMatch([raw], ME)?.players;
    expect(players).toHaveLength(10);
    expect(players?.filter((p) => p.accountId === 0)).toHaveLength(1);
  });

  it("falls back to the match's own fields for a team without stats, and has nothing where neither has it", () => {
    const raw = activeMatch(ME, {
      netWorth: [90000, 95000],
      masks: [ALL_STANDING, 12345],
    });
    raw.team_stats = [raw.team_stats[0]];
    expect(parseLiveMatch([raw], ME)?.teams[1]).toEqual({
      netWorth: 95000,
      objectives: 12345,
      rounds: null,
    });
    const bare: Record<string, unknown> = { ...raw };
    delete bare.net_worth_team_1;
    delete bare.objectives_mask_team1;
    expect(parseLiveMatch([bare], ME)?.teams[1]).toEqual({
      netWorth: null,
      objectives: null,
      rounds: null,
    });
  });
});

describe("standing", () => {
  it("counts everything at the start", () => {
    expect(standing(ALL_STANDING)).toEqual({
      guardians: 3,
      walkers: 3,
      baseGuardians: 3,
      shrines: 2,
      patron: "standing",
    });
  });

  it("counts lanes 1, 3 and 4 only", () => {
    // 24 minutes in (a real mask): the three Guardians are down.
    expect(standing(0b1111111111100101)).toMatchObject({
      guardians: 0,
      walkers: 3,
    });
    // Lane 2's Guardian bit gone from a full mask changes nothing.
    expect(standing(ALL_STANDING & ~0b100).guardians).toBe(3);
  });

  it("has the Patron weakened once its first phase is down, and destroyed with the last", () => {
    // 51 minutes in (a real mask): only the last phase and lane 2's bits.
    expect(standing(0b10000001000101)).toEqual({
      guardians: 0,
      walkers: 0,
      baseGuardians: 0,
      shrines: 0,
      patron: "weakened",
    });
    expect(standing(0b10000001000100).patron).toBe("destroyed");
  });
});

describe("elapsedS", () => {
  it("counts from the start, or takes the API's duration when it has one", () => {
    const match = parseLiveMatch([activeMatch(ME, { startTime: 1000 })], ME)!;
    expect(elapsedS(match, 1_381_900)).toBe(381);
    expect(elapsedS(match, 0)).toBe(0);
    expect(elapsedS({ ...match, durationS: 600 }, 1_381_000)).toBe(600);
  });
});

describe("soulLead", () => {
  it("names the team ahead and by how many souls", () => {
    expect(soulLead(111527, 106101)).toEqual({ team: 0, souls: 5426 });
    expect(soulLead(90000, 95000)).toEqual({ team: 1, souls: 5000 });
    expect(soulLead(192000, 192000)).toBeNull();
  });
});

describe("fetchLiveMatch", () => {
  it("asks the Watch list for the account alone, past the browser's cache", async () => {
    const calls: unknown[][] = [];
    const api = {
      get: async (path: string, ttl: number, _: unknown, options: unknown) => {
        calls.push([path, ttl, options]);
        return [activeMatch(ME)];
      },
    } as unknown as DeadlockApi;
    const match = await fetchLiveMatch(ME, api);
    expect(calls).toEqual([
      [`/v1/matches/active?account_ids=${ME}`, TTL.live, { fresh: true }],
    ]);
    expect(match?.matchId).toBe(LIVE_MATCH_ID);
  });
});
