import { describe, expect, it } from "vitest";
import {
  liveStatus,
  matchKey,
  shouldAutoSwitch,
} from "@/features/live/utils/live-status";
import { initialState } from "@/features/match/utils/game";
import { demoState } from "../fixtures/demo";

const empty = initialState();
const withPlayers = (matchId: string | null) => ({
  ...demoState(),
  matchId,
});

describe("liveStatus", () => {
  it("is not-running when the game is closed and there is no roster", () => {
    expect(liveStatus(false, empty)).toBe("not-running");
  });
  it("is waiting when the game runs without a roster", () => {
    expect(liveStatus(true, empty)).toBe("waiting");
  });
  it("is in-match whenever players exist", () => {
    expect(liveStatus(false, withPlayers("1"))).toBe("in-match");
    expect(liveStatus(true, withPlayers("1"))).toBe("in-match");
  });
});

describe("matchKey", () => {
  it("is null without players, the match id with players, pending before the id", () => {
    expect(matchKey(empty)).toBeNull();
    expect(matchKey(withPlayers("42"))).toBe("42");
    expect(matchKey(withPlayers(null))).toBe("pending");
  });
});

describe("shouldAutoSwitch", () => {
  it.each([
    [null, "pending", true],
    ["pending", "123", false],
    ["123", "123", false],
    ["123", null, false],
    ["123", "456", true],
    [null, "123", true],
  ])("(%s, %s) -> %s", (prev, next, expected) => {
    expect(shouldAutoSwitch(prev, next)).toBe(expected);
  });
});
