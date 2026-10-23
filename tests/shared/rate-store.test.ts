import { describe, expect, it, vi } from "vitest";
import { DeadlockApi, RATE_WINDOW } from "@/shared/api/DeadlockApi";
import {
  defaultRateStore,
  serialLocks,
  sharedRateStore,
  type Locks,
  type RateStore,
} from "@/shared/api/rate-store";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);

/** The localStorage that two tabs of one browser share. */
function sharedStorage() {
  const items = new Map<string, string>();
  return {
    items,
    storage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    } as Storage,
  };
}

/** Two tabs: their own clients, one storage and one lock manager. */
function twoTabs(request: typeof fetch) {
  const { items, storage } = sharedStorage();
  // One lock for both, as the browser's Web Locks are.
  const locks = serialLocks();
  const tab = () => {
    const events = new EventTarget();
    const store = sharedRateStore(storage, locks, Date.now, events);
    return {
      api: new DeadlockApi(request, Date.now, undefined, store),
      events,
    };
  };
  return { items, a: tab(), b: tab() };
}

// What a browser fires in the other tabs when one writes a key.
const storageEvent = (key: string) =>
  Object.assign(new Event("storage"), { key });

describe("rate limits shared by every tab", () => {
  it("keeps two tabs together within one limit", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const sentAt: number[] = [];
      const request = vi.fn<typeof fetch>().mockImplementation(async () => {
        sentAt.push(Date.now() - start);
        return json([]);
      });
      const { a, b } = twoTabs(request);
      const rank = (api: DeadlockApi, id: number) =>
        api.get(`/v1/players/rank?account_ids=${id}`, 1);
      const all = Promise.all(
        Array.from({ length: 15 }, (_, i) => [
          rank(a.api, i),
          rank(b.api, 100 + i),
        ]).flat(),
      );
      await vi.advanceTimersByTimeAsync(RATE_WINDOW);
      await all;
      expect(sentAt).toEqual([
        ...Array(20).fill(0),
        ...Array(10).fill(RATE_WINDOW),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds every tab back during a cooldown one of them was given", async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response("", { status: 429, headers: { "Retry-After": "3600" } }),
        )
        .mockImplementation(async () => json([]));
      const { items, a, b } = twoTabs(request);
      await expect(a.api.get("/v1/analytics/hero-stats", 1)).rejects.toThrow(
        "API busy",
      );
      // The other tab doesn't ask, as the API would refuse it too.
      await expect(b.api.get("/v1/analytics/item-stats", 1)).rejects.toThrow(
        "API busy",
      );
      expect(request).toHaveBeenCalledTimes(1);
      expect([...items.keys()]).toEqual([
        "counterlock.api.sent./v1/analytics",
        "counterlock.api.cooldown./v1/analytics",
      ]);
      // Endpoints the API doesn't limit as a whole keep going.
      await expect(
        b.api.get("/v1/players/7/match-history", 1),
      ).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails another tab's waiting requests as soon as a cooldown starts", async () => {
    vi.useFakeTimers();
    try {
      let refuse!: () => void;
      let sent = 0;
      const request = vi.fn<typeof fetch>().mockImplementation(async () => {
        if (++sent < 20) return json([]);
        // The 20th is refused, once tab b has a request waiting.
        await new Promise<void>((resolve) => (refuse = resolve));
        return new Response("", {
          status: 429,
          headers: { "Retry-After": "3600" },
        });
      });
      const { a, b } = twoTabs(request);
      const rank = (api: DeadlockApi, id: number) =>
        api.get(`/v1/players/rank?account_ids=${id}`, 1);
      await Promise.all(Array.from({ length: 19 }, (_, i) => rank(a.api, i)));
      const refused = rank(a.api, 19);
      refused.catch(() => {});
      let settled = false;
      const waiting = rank(b.api, 100).finally(() => (settled = true));
      waiting.catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      // The browser tells tab b of tab a's cooldown; b gives up at once.
      refuse();
      await expect(refused).rejects.toThrow("API busy");
      b.events.dispatchEvent(
        storageEvent("counterlock.api.cooldown./v1/players/rank"),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(true);
      await expect(waiting).rejects.toThrow("API busy");
      expect(request).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it("neither sends nor counts a request every caller left before the lock was granted", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json([]));
    const { items, a } = twoTabs(request);
    const rank = (signal: AbortSignal) =>
      a.api.get("/v1/players/rank?account_ids=1", 1, signal);
    const first = new AbortController();
    const left = rank(first.signal);
    first.abort();
    // Asked for again at once, as React's StrictMode does.
    const again = rank(new AbortController().signal);
    await expect(left).rejects.toThrow(/abort/i);
    await expect(again).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(items.get("counterlock.api.sent./v1/players/rank")!),
    ).toHaveLength(1);
  });

  it("sends a request whose callers left once its slot was claimed, for whoever asks next", async () => {
    const answers: (() => void)[] = [];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        () =>
          new Promise<Response>((resolve) =>
            answers.push(() => resolve(json([{ account_id: 1 }]))),
          ),
      );
    const { items, storage } = sharedStorage();
    const serial = serialLocks();
    const caller = new AbortController();
    const locks: Locks = {
      request: (name, callback) =>
        serial.request(name, () => {
          const taken = callback();
          // The caller leaves after the slot is claimed, before the
          // request is sent.
          caller.abort();
          return taken;
        }),
    };
    const store = sharedRateStore(storage, locks, Date.now, new EventTarget());
    const api = new DeadlockApi(request, Date.now, undefined, store);
    const path = "/v1/players/rank?account_ids=1";
    await expect(api.get(path, 60_000, caller.signal)).rejects.toThrow(
      /abort/i,
    );
    // A new caller shares it while it is out...
    const again = api.get(path, 60_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalledTimes(1);
    for (const answer of answers) answer();
    await expect(again).resolves.toEqual([{ account_id: 1 }]);
    // ...and its answer is kept.
    await expect(api.get(path, 60_000)).resolves.toEqual([{ account_id: 1 }]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(items.get("counterlock.api.sent./v1/players/rank")!),
    ).toHaveLength(1);
  });

  it("reads damaged entries as empty", async () => {
    const { storage } = sharedStorage();
    storage.setItem("counterlock.api.sent./v1/players/rank", "{not json");
    storage.setItem("counterlock.api.cooldown.*", '"soon"');
    const store: RateStore = sharedRateStore(
      storage,
      serialLocks(),
      () => 1000,
      new EventTarget(),
    );
    expect(store.cooling(["*"])).toBe(false);
    await expect(
      store.take("/v1/players/rank", 20, ["*"], () => {}),
    ).resolves.toBe(0);
    expect(storage.getItem("counterlock.api.sent./v1/players/rank")).toBe(
      "[1000]",
    );
  });

  it("counts per tab where nothing can be shared", async () => {
    // As in Node, with no window, storage or locks.
    const store = defaultRateStore(() => 0);
    await expect(store.take("/v1/players/rank", 1, [], () => {})).resolves.toBe(
      0,
    );
    await expect(store.take("/v1/players/rank", 1, [], () => {})).resolves.toBe(
      RATE_WINDOW,
    );
  });
});
