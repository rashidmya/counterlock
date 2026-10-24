import { describe, expect, it, vi } from "vitest";
import { LiveStore } from "@/features/match/store/LiveStore";
import { StatsClient } from "@/features/player-stats/services/StatsClient";
import { DeadlockApi, RATE_WINDOW } from "@/shared/api/DeadlockApi";

const roster = (id: number) => ({
  match_info: {
    roster_0: {
      steam_id: String(id),
      hero_id: 13,
      player_name: `Player ${id}`,
    },
  },
});

describe("Live roster statistics", () => {
  it("starts a replacement roster while the old rank lookup waits for a slot", async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response("[]"));
      const api = new DeadlockApi(request, Date.now);
      await Promise.all(
        Array.from({ length: 20 }, (_, id) =>
          api.get(`/v1/players/rank?account_ids=${100 + id}`, 1),
        ),
      );
      const store = new LiveStore();
      Object.assign(store, { client: new StatsClient(api, Date.now) });
      store.ingest(roster(1));
      await vi.advanceTimersByTimeAsync(750);
      expect(store.getSnapshot().loading).toBe(true);
      store.ingest(roster(2));
      await vi.advanceTimersByTimeAsync(750);
      expect(
        request.mock.calls
          .slice(20)
          .map(([url]) => new URL(String(url)).searchParams.get("account_ids")),
      ).toEqual(["1", "2"]);
      expect(store.getSnapshot().loading).toBe(true);
      await vi.advanceTimersByTimeAsync(RATE_WINDOW);
      expect(
        request.mock.calls
          .slice(22)
          .map(([url]) => new URL(String(url)).searchParams.get("account_ids")),
      ).toEqual(["2"]);
      expect(Object.keys(store.getSnapshot().stats)).toEqual(["2"]);
      expect(store.getSnapshot().loading).toBe(false);
      store.reset();
    } finally {
      vi.useRealTimers();
    }
  });
});
