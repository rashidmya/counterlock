import { describe, expect, it, vi } from "vitest";
import { StatsClient } from "@/features/player-stats/services/StatsClient";

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
    const client = new StatsClient(request, () => now);
    const stats = await client.load([10, 10, 11], "normal");
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[0][0])).toContain("account_ids=10%2C11");
    expect(stats[10].heroes?.[0].wins).toBe(5);
    expect(stats[11].rank).toBeUndefined();
    await client.load([10], "normal");
    expect(request).toHaveBeenCalledTimes(2);
    await client.load([10], "street_brawl");
    expect(request).toHaveBeenCalledTimes(4);
    now = 300001;
    await client.load([10], "normal");
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
    const stats = await new StatsClient(request).load([10], "normal");
    expect(stats[10].heroes).toBeUndefined();
    expect(stats[10].heroError).toContain("protected");
    expect(stats[10].rank?.badge).toBe(81);
  });
  it("honors Retry-After and prevents request storms from other IDs", async () => {
    let now = 0;
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Busy", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
    const client = new StatsClient(request, () => now);
    await client.load([1], "normal");
    await client.load([2], "normal");
    expect(request).toHaveBeenCalledTimes(1);
    now = 121000;
    await client.load([3], "normal");
    expect(request).toHaveBeenCalledTimes(2);
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
    const stats = await new StatsClient(request).load([10], "normal");
    expect(stats[10].heroes).toEqual([]);
    expect(stats[10].rankError).toContain("Unexpected");
  });
});
