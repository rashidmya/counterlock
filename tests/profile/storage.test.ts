import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_KEY,
  readProfileAccount,
  recordDetectedAccount,
  subscribeProfileAccount,
  writeProfileAccount,
} from "@/features/profile/storage";
import { initialState } from "@/features/match/utils/game";
import type { MatchState, Player } from "@/features/match/types";

const MINUTE = 60_000;
let store: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = new Map();
  setItem = vi.fn((key: string, value: string) => void store.set(key, value));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem,
    removeItem: (key: string) => void store.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

const player = (overrides: Partial<Player>): Player => ({
  slot: "roster_0",
  name: "Me",
  heroId: 6,
  heroName: "Hero",
  team: 1,
  local: false,
  accountId: null,
  kills: 0,
  deaths: 0,
  assists: 0,
  heroDamage: null,
  objectiveDamage: null,
  healing: null,
  souls: null,
  level: null,
  items: [],
  ...overrides,
});
const state = (overrides: Partial<MatchState>): MatchState => ({
  ...initialState(),
  ...overrides,
});
const stored = () => JSON.parse(store.get(PROFILE_KEY) ?? "null");

describe("recordDetectedAccount", () => {
  it("writes the detected account from localAccountId", () => {
    recordDetectedAccount(state({ localAccountId: 156735156 }), 1000);
    expect(stored()).toEqual({
      accountId: 156735156,
      seenAt: 1000,
      source: "detected",
    });
  });

  it("falls back to the local roster player's account id", () => {
    recordDetectedAccount(
      state({
        players: [
          player({ slot: "roster_0", accountId: 5 }),
          player({ slot: "roster_1", local: true, accountId: 42 }),
        ],
      }),
      1000,
    );
    expect(stored()).toMatchObject({ accountId: 42, source: "detected" });
  });

  it("does not write when no account is known", () => {
    recordDetectedAccount(
      state({ players: [player({ local: false, accountId: 5 })] }),
      1000,
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not rewrite the same account within 5 minutes, but does after", () => {
    const s = state({ localAccountId: 7 });
    recordDetectedAccount(s, 0);
    recordDetectedAccount(s, 5 * MINUTE);
    expect(setItem).toHaveBeenCalledTimes(1);
    recordDetectedAccount(s, 5 * MINUTE + 1);
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(stored().seenAt).toBe(5 * MINUTE + 1);
  });

  it("rewrites immediately when the account differs", () => {
    recordDetectedAccount(state({ localAccountId: 7 }), 0);
    recordDetectedAccount(state({ localAccountId: 8 }), 1);
    expect(stored()).toMatchObject({ accountId: 8, seenAt: 1 });
  });

  it("replaces a manual account immediately, even the same id", () => {
    writeProfileAccount({ accountId: 7, seenAt: 0, source: "manual" });
    recordDetectedAccount(state({ localAccountId: 7 }), 1);
    expect(stored()).toEqual({ accountId: 7, seenAt: 1, source: "detected" });
  });

  it("does not throw when storage fails", () => {
    setItem.mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() =>
      recordDetectedAccount(state({ localAccountId: 7 }), 1),
    ).not.toThrow();
  });
});

describe("readProfileAccount", () => {
  it("returns null when nothing is stored", () => {
    expect(readProfileAccount()).toBeNull();
  });

  it("round-trips a valid account", () => {
    const account = { accountId: 9, seenAt: 3, source: "manual" as const };
    writeProfileAccount(account);
    expect(readProfileAccount()).toEqual(account);
  });

  it.each([
    "not json",
    "null",
    "[]",
    JSON.stringify({ accountId: 1, seenAt: 2 }),
    JSON.stringify({ accountId: "1", seenAt: 2, source: "manual" }),
    JSON.stringify({ accountId: 0, seenAt: 2, source: "manual" }),
    JSON.stringify({ accountId: 1, seenAt: 2, source: "other" }),
    JSON.stringify({ seenAt: 2, source: "manual" }),
  ])("returns null for malformed value %s", (value) => {
    store.set(PROFILE_KEY, value);
    expect(readProfileAccount()).toBeNull();
  });
});

describe("subscribeProfileAccount", () => {
  it("calls back for the profile key or a cleared store, and unsubscribes", () => {
    const listeners = new Set<(event: { key: string | null }) => void>();
    vi.stubGlobal("window", {
      addEventListener: (_: string, l: any) => listeners.add(l),
      removeEventListener: (_: string, l: any) => listeners.delete(l),
    });
    const callback = vi.fn();
    const unsubscribe = subscribeProfileAccount(callback);
    const fire = (key: string | null) => listeners.forEach((l) => l({ key }));
    fire("scout.overlay.opacity");
    expect(callback).not.toHaveBeenCalled();
    fire(PROFILE_KEY);
    fire(null);
    expect(callback).toHaveBeenCalledTimes(2);
    unsubscribe();
    fire(PROFILE_KEY);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
