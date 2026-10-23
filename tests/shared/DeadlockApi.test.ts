import { describe, expect, it, vi } from "vitest";
import {
  DeadlockApi,
  RATE_LIMITS,
  RATE_WINDOW,
  TTL,
  endpointGroup,
} from "@/shared/api/DeadlockApi";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);

describe("DeadlockApi", () => {
  it("caches by path until ttl", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({ ok: true }));
    let now = 0;
    const api = new DeadlockApi(request, () => now);
    await api.get("/v1/x", 1000);
    await api.get("/v1/x", 1000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toBe(
      "https://api.deadlock-api.com/v1/x",
    );
    await api.get("/v1/y", 1000);
    expect(request).toHaveBeenCalledTimes(2);
    now += 1001;
    await api.get("/v1/x", 1000);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("deduplicates in-flight requests", async () => {
    let release!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const api = new DeadlockApi(request, () => 0);
    const both = Promise.all([api.get("/v1/x", 1000), api.get("/v1/x", 1000)]);
    release(json({ n: 1 }));
    const [a, b] = await both;
    expect(request).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ n: 1 });
    expect(b).toBe(a);
  });

  it("cools down the refused endpoint group after 429 with Retry-After", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "60" } }),
      )
      .mockImplementation(async () => json([]));
    let now = 1_000;
    const api = new DeadlockApi(request, () => now);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    await expect(api.get("/v1/x?page=2", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    expect(request).toHaveBeenCalledTimes(1);
    // Other endpoints have limits of their own.
    await expect(api.get("/v1/other", 1000)).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
    now += 60_001;
    await expect(api.get("/v1/x?page=2", 1000)).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("groups paths as the API's rate limits do", () => {
    expect(endpointGroup("/v1/analytics/hero-stats?x=1")).toBe("/v1/analytics");
    expect(endpointGroup("/v1/analytics/player-performance-curve")).toBe(
      "/v1/analytics",
    );
    expect(endpointGroup("/v1/matches/metadata?match_ids=1,2")).toBe(
      "/v1/matches/metadata",
    );
    expect(endpointGroup("/v1/matches/1001/metadata")).toBe(
      "/v1/matches/{id}/metadata",
    );
    expect(endpointGroup("/v1/players/77/match-history")).toBe(
      "/v1/players/{id}/match-history",
    );
    expect(RATE_LIMITS).toEqual({
      "/v1/analytics": 200,
      "/v1/matches/metadata": 30,
      "/v1/players/rank": 20,
    });
  });

  it("waits for room in a group's rate limit rather than going over it", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json([]));
    let now = 0;
    const waits: number[] = [];
    const api = new DeadlockApi(
      request,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    );
    const rank = (id: number) =>
      api.get(`/v1/players/rank?account_ids=${id}`, 1);
    await Promise.all(Array.from({ length: 20 }, (_, i) => rank(i)));
    now += 5_000;
    await rank(20);
    expect(waits).toEqual([RATE_WINDOW - 5_000]);
    expect(request).toHaveBeenCalledTimes(21);
    // Endpoints without a tight limit don't wait.
    await api.get("/v1/players/77/match-history", 1);
    expect(waits).toHaveLength(1);
  });

  it("drops responses that outlived their ttl", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({ ok: true }));
    let now = 0;
    const api = new DeadlockApi(request, () => now);
    await api.get("/v1/x", 1000);
    now += 60_000;
    // Storing another response sweeps the expired one out...
    await api.get("/v1/y", 1000);
    // ...so a longer ttl can't serve it any more.
    await api.get("/v1/x", TTL.analytics);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("uses a 30s cooldown on 503 without Retry-After", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockImplementation(async () => json([]));
    let now = 0;
    const api = new DeadlockApi(request, () => now);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    now += 29_999;
    await expect(api.get("/v1/x", 1000)).rejects.toThrow("API busy");
    now += 2;
    await expect(api.get("/v1/x", 1000)).resolves.toEqual([]);
  });

  it("keeps the 30s minimum when Retry-After is shorter", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "1" } }),
      )
      .mockImplementation(async () => json([]));
    let now = 0;
    const api = new DeadlockApi(request, () => now);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    now += 5_000;
    await expect(api.get("/v1/x", 1000)).rejects.toThrow("API busy");
  });

  it("maps 403 and other errors, and does not cache failures", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 403 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockImplementation(async () => json({ ok: 1 }));
    const api = new DeadlockApi(request, () => 0);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      "Data unavailable or profile protected.",
    );
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      "Deadlock API unavailable (500).",
    );
    await expect(api.get("/v1/x", 1000)).resolves.toEqual({ ok: 1 });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("clears the in-flight entry after a failure so retries re-request", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementation(async () => json(1));
    const api = new DeadlockApi(request, () => 0);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow("network down");
    await expect(api.get("/v1/x", 1000)).resolves.toBe(1);
  });

  it("reports a timed-out request in plain words", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("signal timed out", "TimeoutError"));
    const api = new DeadlockApi(request, () => 0);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      new Error("Deadlock API timed out."),
    );
  });

  it("reports a timeout while reading the body in plain words", async () => {
    const body = new ReadableStream({
      start: (controller) =>
        controller.error(new DOMException("signal timed out", "TimeoutError")),
    });
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(body));
    const api = new DeadlockApi(request, () => 0);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      new Error("Deadlock API timed out."),
    );
  });

  it("reports a network failure in plain words", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const api = new DeadlockApi(request, () => 0);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      new Error("Deadlock API unreachable."),
    );
  });

  it("exposes ttl presets", () => {
    expect(TTL).toEqual({
      analytics: 600_000,
      profile: 300_000,
      history: 120_000,
    });
  });
});
