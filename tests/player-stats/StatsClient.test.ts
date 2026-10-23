import { describe, expect, it, vi } from "vitest";
import { StatsClient } from "@/features/player-stats/services/StatsClient";
import { DeadlockApi } from "@/shared/api/DeadlockApi";

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
  it("waits out cooldowns as the app's other requests do", async () => {
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
