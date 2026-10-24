import { expect, it, vi } from "vitest";
import { initialState } from "@/features/match/utils/game";
import { scheduledSpawns } from "@/features/overlay/utils/spawn-timers";
const active = { ...initialState(), phase: "GameInProgress" };
it.each([
  ["09:59", 600, 1],
  ["10:00", 600, 0],
  ["10:01", 900, 299],
  ["27:00", 1800, 180],
])("finds the next scheduled Urn at %s", (clock, atS, remainingS) => {
  expect(scheduledSpawns({ ...active, clock: String(clock) })).toEqual([
    { id: "soul-urn", label: "Soul Urn", atS, remainingS },
  ]);
});
it("uses the GEP clock while paused and when joining or resuming late", () => {
  vi.useFakeTimers();
  try {
    const paused = { ...active, clock: "09:59", paused: true };
    vi.advanceTimersByTime(100_000);
    expect(scheduledSpawns(paused)[0].remainingS).toBe(1);
    expect(
      scheduledSpawns({ ...paused, clock: "10:20", paused: false })[0]
        .remainingS,
    ).toBe(280);
  } finally {
    vi.useRealTimers();
  }
});
it("has no normal schedule before play, without a clock, after the match or in Brawl", () => {
  for (const patch of [
    { clock: "—" },
    { clock: "-0:10" },
    { phase: "PostGame" },
    { phase: "Init" },
    { phase: "WaitingForPlayersToJoin" },
    { gameMode: "street_brawl" as const },
  ]) {
    expect(scheduledSpawns({ ...active, clock: "12:00", ...patch })).toEqual(
      [],
    );
  }
});
