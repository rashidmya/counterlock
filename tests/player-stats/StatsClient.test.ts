import { describe, expect, it, vi } from "vitest";
import { StatsClient } from "@/features/player-stats/services/StatsClient";
import { DeadlockApi, TTL } from "@/shared/api/DeadlockApi";

const client = (request: typeof fetch, now = () => 0) =>
  new StatsClient(new DeadlockApi(request, now), now);

describe("stats API", () => {
  it("batches and caches IDs, with a distinct cache for each mode", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("hero-stats")
              ? [
                  {
                    account_id: 10,
                    hero_id: 13,
                    wins: 5,
                    matches_played: 10,
                    last_played: 0,
                  },
                ]
              : [{ account_id: 10, badge: 81, rank: 8, subrank: 1 }],
          ),
        ),
    );
    let now = 0;
    const stats = client(request, () => now);
    const first = await stats.load([10, 10, 11], "normal");
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[0][0])).toBe(
      "https://api.deadlock-api.com/v1/players/hero-stats?account_ids=10%2C11&game_mode=normal&match_mode=ranked,unranked",
    );
    expect(first[10].heroes?.[0].wins).toBe(5);
    expect(first[11].rank).toBeUndefined();
    await stats.load([10], "normal");
    expect(request).toHaveBeenCalledTimes(2);
    await stats.load([10], "street_brawl");
    expect(request).toHaveBeenCalledTimes(4);
    now = 300001;
    await stats.load([10], "normal");
    expect(request).toHaveBeenCalledTimes(6);
  });
  it("preserves independent results on failures and never fabricates zero matches", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Unavailable", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ account_id: 10, rank: 8, subrank: 1, badge: 81 }]),
        ),
      );
    const stats = await client(request).load([10], "normal");
    expect(stats[10].heroes).toBeUndefined();
    expect(stats[10].heroError).toContain("protected");
    expect(stats[10].rank?.badge).toBe(81);
  });
  it("fails at once during a cooldown, as the app's other requests do", async () => {
    let now = 0;
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Busy", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
    const stats = client(request, () => now);
    const busy = await stats.load([1], "normal");
    expect(busy[1].heroError).toBe("API busy. Retry after the cooldown.");
    expect(busy[1].rankError).toBe("API busy. Retry after the cooldown.");
    expect(request).toHaveBeenCalledTimes(2);
    // Rank lookups now pause for every account; another roster's hero
    // stats are a request of their own, which may still be answered.
    await stats.load([2], "normal");
    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[2][0])).toContain("/hero-stats?");
    now = 121_000;
    await stats.load([3], "normal");
    expect(request).toHaveBeenCalledTimes(5);
  });
  it("asks again for stats that failed, and keeps those that loaded", async () => {
    let now = 0;
    const heroes = [
      { account_id: 10, hero_id: 13, wins: 5, matches_played: 10 },
    ];
    const ranks = [{ account_id: 10, badge: 81, rank: 8, subrank: 1 }];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).includes("account_ids=99")
          ? new Response("Busy", { status: 429 })
          : new Response(
              JSON.stringify(
                String(url).includes("hero-stats") ? heroes : ranks,
              ),
            ),
      );
    const api = new DeadlockApi(request, () => now);
    const stats = new StatsClient(api, () => now);
    // Another view's rank lookup is refused: rank lookups pause for all.
    await expect(
      api.get("/v1/players/rank?account_ids=99", TTL.profile),
    ).rejects.toThrow("API busy");
    const busy = await stats.load([10], "normal");
    expect(busy[10].heroes?.[0].wins).toBe(5);
    expect(busy[10].rankError).toBe("API busy. Retry after the cooldown.");
    expect(request).toHaveBeenCalledTimes(2);
    // Once the cooldown is over, only the rank lookup goes out again.
    now = 30_000;
    const loaded = await stats.load([10], "normal");
    expect(loaded[10].rank?.badge).toBe(81);
    expect(loaded[10].rankError).toBeUndefined();
    expect(loaded[10].heroes?.[0].wins).toBe(5);
    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[2][0])).toContain("/players/rank?");
    // Retrying rank must not renew the hero stats' five-minute lifetime.
    now = TTL.profile - 1;
    await stats.load([10], "normal");
    expect(request).toHaveBeenCalledTimes(3);
    now = TTL.profile;
    await stats.load([10], "normal");
    expect(request).toHaveBeenCalledTimes(4);
    expect(String(request.mock.calls[3][0])).toContain("/hero-stats?");
    now = TTL.profile + 30_000;
    await stats.load([10], "normal");
    expect(request).toHaveBeenCalledTimes(5);
    expect(String(request.mock.calls[4][0])).toContain("/players/rank?");
  });
  it("drops a queued rank lookup without caching cancellation as a stats failure", async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response("[]"));
      const api = new DeadlockApi(request, Date.now);
      await Promise.all(
        Array.from({ length: 20 }, (_, id) =>
          api.get(`/v1/players/rank?account_ids=${100 + id}`, TTL.profile),
        ),
      );
      const stats = new StatsClient(api, Date.now);
      const left = new AbortController();
      const reason = new Error("Roster replaced");
      const leaving = stats.load([10], "normal", left.signal);
      leaving.catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
      left.abort(reason);
      let failure: unknown;
      leaving.catch((error: unknown) => {
        failure = error;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(failure).toBe(reason);
      await vi.advanceTimersByTimeAsync(61_000);
      expect(request).toHaveBeenCalledTimes(21);
      const loaded = await stats.load([10], "normal");
      expect(loaded[10]).toMatchObject({ heroes: [], rank: undefined });
      expect(loaded[10].heroError).toBeUndefined();
      expect(loaded[10].rankError).toBeUndefined();
      expect(request).toHaveBeenCalledTimes(22);
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps the stats that loaded when the roster changes during a cooldown", async () => {
    let now = 0;
    const heroes = [
      { account_id: 10, hero_id: 13, wins: 5, matches_played: 10 },
    ];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/players/rank")
          ? new Response("Busy", { status: 503 })
          : new Response(JSON.stringify(heroes)),
      );
    const stats = client(request, () => now);
    await stats.load([10], "normal");
    // A player joins during the 503's cooldown: the new roster's requests
    // fail at once, and player 10's hero stats stay.
    now = 1_000;
    const joined = await stats.load([10, 11], "normal");
    expect(request).toHaveBeenCalledTimes(2);
    expect(joined[10].heroes?.[0].wins).toBe(5);
    expect(joined[10].heroError).toBeUndefined();
    expect(joined[10].rankError).toBe("API busy. Retry after the cooldown.");
    expect(joined[11].heroError).toBe("API busy. Retry after the cooldown.");
    // Kept for TTL.profile from when they loaded, not longer: in a later
    // cooldown (player 12's rank lookup starts one), they are gone.
    now = TTL.profile;
    await stats.load([12], "normal");
    const stale = await stats.load([10, 11], "normal");
    expect(request).toHaveBeenCalledTimes(4);
    expect(stale[10].heroes).toBeUndefined();
    expect(stale[10].heroError).toBe("API busy. Retry after the cooldown.");
  });
  it("rejects malformed rows and non-array responses", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { account_id: 10, hero_id: 13, wins: 8, matches_played: 3 },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response("{}"));
    const stats = await client(request).load([10], "normal");
    expect(stats[10].heroes).toEqual([]);
    expect(stats[10].rankError).toContain("Unexpected");
  });
});
