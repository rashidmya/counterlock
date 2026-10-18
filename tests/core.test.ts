import { describe, expect, it, vi } from "vitest";
import {
  accountId,
  applyInfo,
  initialState,
  splitTeams,
  winRate,
} from "../src/game";
import { recommend } from "../src/counters";
import { StatsClient } from "../src/api";
import catalog from "../src/data/catalog.json";
import { demoState } from "../src/demo";
import { buildPhase, recommendedBuild } from "../src/builds";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Hero } from "../src/types";

const roster = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    player_name: "Player",
    steam_id: "76561198060265728",
    hero_id: 13,
    hero_name: "Haze",
    team_id: 3,
    is_local: false,
    ...patch,
  });

describe("game event integration", () => {
  it("converts exact Steam IDs and rejects rounded or invalid IDs", () => {
    expect(accountId("76561198060265728")).toBe(100000000);
    expect(accountId("[U:1:100000000]")).toBe(100000000);
    for (const input of [
      "",
      "0",
      "-1",
      "name",
      "4294967296",
      76561198060265728,
      null,
    ])
      expect(accountId(input)).toBeNull();
  });
  it("preserves a numeric SteamID64 inside stringified roster data", () => {
    const input = '{"hero_id":13,"steam_id":76561198060265729,"team_id":3}';
    expect(
      applyInfo(initialState(), { info: { match_info: { roster_0: input } } })
        .players[0].accountId,
    ).toBe(100000001);
  });
  it("merges both event forms, supports local ID arriving first, and derives teams", () => {
    let state = applyInfo(initialState(), {
      feature: "game_info",
      category: "game_info",
      key: "steam_id",
      value: "76561198060265730",
    });
    state = applyInfo(state, {
      info: {
        match_info: {
          roster_1: roster({ is_local: true, team_id: 2, steam_id: "" }),
          roster_2: roster(),
        },
      },
    });
    state = applyInfo(state, {
      category: "match_info",
      key: "roster_2",
      data: JSON.stringify({ kills: 5 }),
    });
    expect(splitTeams(state.players).allies[0].accountId).toBe(100000002);
    expect(splitTeams(state.players).enemies[0].kills).toBe(5);
    expect(state.players[1].heroId).toBe(13);
  });
  it("keeps unknown teams unclassified until the local player arrives", () => {
    const state = applyInfo(initialState(), {
      match_info: { roster_0: roster() },
    });
    expect(splitTeams(state.players).enemies).toEqual([]);
    expect(splitTeams(state.players).team).toBeUndefined();
  });
  it("resets roster and stats on a different match, handles deletions and malformed rows", () => {
    let state = applyInfo(initialState(), {
      match_info: { match_id: "1", roster_0: roster() },
    });
    state = { ...state, stats: { 100000000: { fetchedAt: 1 } } };
    state = applyInfo(state, {
      match_info: { match_id: "2", roster_1: roster(), roster_9: "invalid" },
    });
    expect(state.players.map((p) => p.slot)).toEqual(["roster_1"]);
    expect(state.stats).toEqual({});
    state = applyInfo(state, {
      category: "match_info",
      key: "roster_1",
      data: null,
    });
    expect(state.players).toEqual([]);
  });
  it("clears the previous roster on entering a new lobby", () => {
    const state = { ...demoState(), mode: "live" as const };
    const next = applyInfo(state, {
      game_info: { phase: "WaitingForPlayersToJoin" },
    });
    expect(next.players).toHaveLength(0);
    expect(next.clock).toBe("00:00");
  });
  it("maps inventory by exact identity and accepts stringified item payloads", () => {
    let state = applyInfo(initialState(), {
      match_info: { roster_1: roster() },
    });
    state = applyInfo(state, {
      match_info: {
        items_9: JSON.stringify({
          steam_id: "100000000",
          items: [{ id: 1378931225 }],
        }),
      },
    });
    expect(state.players[0].items).toEqual([1378931225]);
  });
  it("separates game-mode history and handles no matches", () => {
    const state = applyInfo(demoState(), {
      game_info: { game_mode: '{"game_mode":"StreetBrawl"}' },
    });
    expect(state.gameMode).toBe("street_brawl");
    expect(state.stats).toEqual({});
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(0, 4)).toBe(0);
    expect(winRate(7, 5)).toBeNull();
    expect(winRate(5, 10)).toBe(50);
  });
});

describe("recommendation constraints", () => {
  const enemies = splitTeams(demoState().players).enemies;
  it("provides starter suggestions for every active hero in the checked-in catalog", () => {
    for (const hero of catalog.heroes) {
      expect(
        recommend(
          [{ ...enemies[0], heroId: hero.id, heroName: hero.name }],
          catalog.items,
          6400,
          [],
        ).length,
        hero.name,
      ).toBeGreaterThan(0);
    }
  });
  it("uses catalog prices, deduplicates, respects the budget and excludes owned items", () => {
    const items = recommend(enemies, catalog.items, 1600, [2603935618]);
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every((r) => r.item.cost <= 1600 && r.item.id !== 2603935618),
    ).toBe(true);
    expect(new Set(items.map((r) => r.item.id)).size).toBe(items.length);
    expect(recommend(enemies, [], 6400, [])).toEqual([]);
  });
  it("focuses on the selected hero and provides a manual fallback for new heroes", () => {
    const haze = enemies.filter((p) => p.heroId === 13);
    const entries = recommend(haze, catalog.items, 6400, []);
    expect(entries.some((r) => r.item.name === "Metal Skin")).toBe(true);
    expect(entries.every((r) => r.targets.every((t) => t === "Haze"))).toBe(
      true,
    );
    const unknown = [{ ...enemies[0], heroId: 999 }];
    expect(recommend(unknown, catalog.items, 6400, [])).toEqual([]);
    expect(
      recommend(unknown, catalog.items, 6400, [], ["healing"]).length,
    ).toBeGreaterThan(0);
  });
});

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

describe("recommended hero builds", () => {
  it("provides distinct phase picks for every catalog hero and preserves the source data", () => {
    const before = JSON.stringify(catalog.heroes);
    for (const hero of catalog.heroes) {
      const stages = recommendedBuild(hero, catalog.items);
      expect(
        stages.every((stage) => stage.items.length === 8),
        hero.name,
      ).toBe(true);
      const ids = stages.flatMap((stage) =>
        stage.items.map((pick) => pick.item.id),
      );
      expect(new Set(ids).size, hero.name).toBe(ids.length);
      expect(stages[0].items.every((pick) => pick.item.cost <= 1600)).toBe(
        true,
      );
      expect(
        stages[1].items.every(
          (pick) => pick.item.cost >= 1600 && pick.item.cost <= 3200,
        ),
      ).toBe(true);
      expect(stages[2].items.every((pick) => pick.item.cost >= 3200)).toBe(
        true,
      );
    }
    expect(JSON.stringify(catalog.heroes)).toBe(before);
  });
  it("ranks by phase popularity, skips removed and invalid picks, and marks owned items", () => {
    const items = catalog.items.filter((item) => item.cost === 800).slice(0, 3);
    const hero: Hero = {
      id: 999,
      name: "Fixture",
      tags: [],
      popularItems: {
        early_game: [
          { item_id: items[0].id, pick_pct: 10, winrate_pct: 99 },
          { item_id: items[1].id, pick_pct: 60, winrate_pct: 30 },
          { item_id: items[1].id, pick_pct: 60, winrate_pct: 30 },
          { item_id: items[2].id, pick_pct: NaN, winrate_pct: 80 },
          { item_id: 999999, pick_pct: 100, winrate_pct: 100 },
        ],
        mid_game: [],
        late_game: [],
      },
    };
    const result = recommendedBuild(hero, items, [items[1].id]);
    expect(result[0].items.map((p) => p.item.id)).toEqual([
      items[1].id,
      items[0].id,
    ]);
    expect(result[0].items[0].owned).toBe(true);
    expect(
      recommendedBuild(undefined, items).every((s) => s.items.length === 0),
    ).toBe(true);
  });
  it("bundles actual shop artwork for every available item", () => {
    for (const item of catalog.items) {
      expect(item.image, item.name).toContain("/images/items/");
      expect(item.localImage, item.name).toMatch(
        /^\.\/items\/\d+\.(webp|png)$/,
      );
      expect(existsSync(resolve("public", item.localImage)), item.name).toBe(
        true,
      );
    }
  });
});

describe("build phase timing", () => {
  it.each([
    ["00:00", "early_game"],
    ["09:59", "early_game"],
    ["10:00", "mid_game"],
    ["19:59", "mid_game"],
    ["20:00", "late_game"],
    ["75:30", "late_game"],
    ["", null],
    ["-1:00", null],
    ["10:60", null],
    ["unknown", null],
  ])("maps %s to %s", (clock, phase) => expect(buildPhase(clock)).toBe(phase));
  it("labels sparse-phase additions using their real source phase", () => {
    const calico = catalog.heroes.find((hero) => hero.name === "Calico")!;
    const early = recommendedBuild(calico, catalog.items)[0];
    expect(early.items).toHaveLength(8);
    expect(
      early.items.filter((item) => item.sourcePhase !== "early_game"),
    ).toHaveLength(1);
  });
});
