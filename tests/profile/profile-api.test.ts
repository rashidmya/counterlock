import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { itemById } from "@/shared/catalog";
import {
  SUMMARY_HERO_STATS,
  fetchMatchHistory,
  fetchMates,
  fetchPlayerHeroStats,
  fetchRank,
  fetchScoreboard,
  fetchSummaryHeroStats,
  fetchSteamProfiles,
  heroStatsQueries,
  searchSteamAccounts,
} from "@/features/profile/services/profile-api";

function fakeApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const api = {
    get: async (path: string) => {
      calls.push(path);
      if (!(path in routes)) throw new Error(`unexpected ${path}`);
      const value = routes[path];
      if (value instanceof Error) throw value;
      return value;
    },
  } as unknown as DeadlockApi;
  return { api, calls };
}

const [itemA, itemB, itemC] = [...itemById.keys()];

describe("heroStatsQueries", () => {
  it("builds one query per mode and two for all", () => {
    expect(heroStatsQueries("all")).toHaveLength(2);
    expect(heroStatsQueries("all")).toContain("game_mode=street_brawl");
    expect(heroStatsQueries("ranked")).toEqual([
      "game_mode=normal&match_mode=ranked",
    ]);
    expect(heroStatsQueries("normal")).toEqual([
      "game_mode=normal&match_mode=unranked",
    ]);
    expect(heroStatsQueries("street_brawl")).toEqual([
      "game_mode=street_brawl",
    ]);
    expect(SUMMARY_HERO_STATS).toBe(
      "game_mode=normal&match_mode=ranked,unranked",
    );
  });
});

describe("fetchSummaryHeroStats", () => {
  it("requests only normal ranked and unranked games", async () => {
    const { api, calls } = fakeApi({
      "/v1/players/hero-stats?account_ids=7&game_mode=normal&match_mode=ranked,unranked":
        [
          {
            hero_id: 1,
            matches_played: 2,
            accuracy: 0.5,
            damage_per_min: 100,
          },
        ],
    });
    const rows = await fetchSummaryHeroStats(7, api);
    expect(calls).toEqual([
      "/v1/players/hero-stats?account_ids=7&game_mode=normal&match_mode=ranked,unranked",
    ]);
    expect(rows).toEqual([
      { heroId: 1, matches: 2, accuracy: 0.5, damagePerMin: 100 },
    ]);
  });
});

describe("fetchPlayerHeroStats", () => {
  it("weights accuracy and damage by matches across queries", async () => {
    const { api, calls } = fakeApi({
      "/v1/players/hero-stats?account_ids=7&game_mode=normal&match_mode=ranked,unranked":
        [
          {
            account_id: 7,
            hero_id: 1,
            matches_played: 10,
            accuracy: 0.5,
            damage_per_min: 100,
          },
          {
            account_id: 7,
            hero_id: 2,
            matches_played: 4,
            accuracy: 0.4,
            damage_per_min: 50,
          },
          {
            account_id: 7,
            hero_id: 3,
            matches_played: "x",
            accuracy: 0.4,
            damage_per_min: 50,
          },
          {
            account_id: 7,
            hero_id: 4,
            matches_played: 2,
            accuracy: null,
            damage_per_min: 50,
          },
        ],
      "/v1/players/hero-stats?account_ids=7&game_mode=street_brawl": [
        {
          account_id: 7,
          hero_id: 1,
          matches_played: 30,
          accuracy: 0.7,
          damage_per_min: 200,
        },
      ],
    });
    const rows = await fetchPlayerHeroStats(7, "all", api);
    expect(calls).toHaveLength(2);
    expect(rows).toHaveLength(2);
    const hero1 = rows.find((r) => r.heroId === 1)!;
    expect(hero1.matches).toBe(40);
    expect(hero1.accuracy).toBeCloseTo(0.65);
    expect(hero1.damagePerMin).toBeCloseTo(175);
    expect(rows.find((r) => r.heroId === 2)).toMatchObject({ matches: 4 });
  });

  it("returns [] for non-array responses", async () => {
    const { api } = fakeApi({
      "/v1/players/hero-stats?account_ids=7&game_mode=normal&match_mode=ranked":
        {},
    });
    expect(await fetchPlayerHeroStats(7, "ranked", api)).toEqual([]);
  });
});

describe("fetchScoreboard", () => {
  it("drops sold items and non-catalog ids, dedupes and keeps purchase order", async () => {
    const { api, calls } = fakeApi({
      "/v1/matches/99/metadata": {
        match_info: {
          match_id: 99,
          duration_s: 2047,
          winning_team: 1,
          players: [
            {
              account_id: 5,
              team: 0,
              hero_id: 6,
              kills: 3,
              deaths: 2,
              assists: 1,
              net_worth: 1000,
              last_hits: 50,
              denies: 4,
              level: 20,
              items: [
                { item_id: itemA, game_time_s: 10, sold_time_s: 0 },
                { item_id: 123456789, game_time_s: 20, sold_time_s: 0 },
                { item_id: itemB, game_time_s: 30, sold_time_s: 300 },
                { item_id: itemC, game_time_s: 40, sold_time_s: 0 },
                { item_id: itemA, game_time_s: 50, sold_time_s: 0 },
              ],
            },
            { account_id: "bad", team: 1 },
          ],
        },
      },
    });
    const board = await fetchScoreboard(99, api);
    expect(calls).toEqual(["/v1/matches/99/metadata"]);
    expect(board).toMatchObject({
      matchId: 99,
      durationS: 2047,
      winningTeam: 1,
    });
    expect(board.players).toHaveLength(1);
    expect(board.players[0]).toMatchObject({
      accountId: 5,
      heroId: 6,
      netWorth: 1000,
      level: 20,
      items: [itemA, itemC],
    });
  });

  it("rejects when metadata is missing", async () => {
    const { api } = fakeApi({ "/v1/matches/1/metadata": {} });
    await expect(fetchScoreboard(1, api)).rejects.toThrow(/unavailable/i);
  });
});

describe("fetchMatchHistory", () => {
  it("preserves the API message on 403", async () => {
    const { api } = fakeApi({
      "/v1/players/5/match-history": new Error(
        "Data unavailable or profile protected.",
      ),
    });
    await expect(fetchMatchHistory(5, api)).rejects.toThrow(
      "Data unavailable or profile protected.",
    );
  });

  it("returns [] for an empty history", async () => {
    const { api } = fakeApi({ "/v1/players/5/match-history": [] });
    expect(await fetchMatchHistory(5, api)).toEqual([]);
  });
});

describe("fetchMates", () => {
  it("filters games<3, sorts by games desc and keeps five", async () => {
    const mates = [2, 9, 3, 5, 12, 7, 4, 1, 20].map((games, i) => ({
      mate_id: 100 + i,
      wins: 1,
      matches_played: games,
    }));
    const { api } = fakeApi({
      "/v1/players/5/mate-stats?same_party=true": [
        ...mates,
        { mate_id: "x", wins: 1, matches_played: 50 },
      ],
    });
    const rows = await fetchMates(5, api);
    expect(rows.map((m) => m.games)).toEqual([20, 12, 9, 7, 5]);
    expect(rows[0]).toEqual({ accountId: 108, games: 20, wins: 1 });
  });
});

describe("fetchSteamProfiles and fetchRank", () => {
  it("maps persona name and avatar, skipping malformed rows", async () => {
    const { api, calls } = fakeApi({
      "/v1/players/steam?account_ids=1,2,3": [
        { account_id: 1, personaname: "A", avatarmedium: "http://a" },
        { account_id: 2, personaname: "B" },
        { account_id: 3 },
      ],
    });
    const rows = await fetchSteamProfiles([1, 2, 3], api);
    expect(calls).toEqual(["/v1/players/steam?account_ids=1,2,3"]);
    expect(rows).toEqual([
      { accountId: 1, name: "A", avatar: "http://a" },
      { accountId: 2, name: "B", avatar: undefined },
    ]);
  });

  it("skips the request for no ids", async () => {
    const { api, calls } = fakeApi({});
    expect(await fetchSteamProfiles([], api)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("returns the rank row for the id or null", async () => {
    const row = { account_id: 5, badge: 61, rank: 6, subrank: 1 };
    const { api } = fakeApi({
      "/v1/players/rank?account_ids=5": [
        { account_id: 9, badge: 1, rank: 1, subrank: 1 },
        row,
      ],
      "/v1/players/rank?account_ids=6": [],
    });
    expect(await fetchRank(5, api)).toEqual(row);
    expect(await fetchRank(6, api)).toBeNull();
  });
});

describe("searchSteamAccounts", () => {
  const path = "/v1/players/steam-search?search_query=fargareko";

  it("maps matching profiles", async () => {
    const { api, calls } = fakeApi({
      [path]: [
        { account_id: 5, personaname: "Fargareko", avatarmedium: "a.jpg" },
        { personaname: "No id" },
      ],
    });
    expect(await searchSteamAccounts("fargareko", api)).toEqual([
      { accountId: 5, name: "Fargareko", avatar: "a.jpg" },
    ]);
    expect(calls).toEqual([path]);
  });

  it("encodes the query and trims it", async () => {
    const { api, calls } = fakeApi({
      "/v1/players/steam-search?search_query=a%20b%26c": [],
    });
    await searchSteamAccounts("  a b&c ", api);
    expect(calls).toHaveLength(1);
  });

  it("does not request for queries shorter than 2 characters", async () => {
    const { api, calls } = fakeApi({});
    expect(await searchSteamAccounts(" a ", api)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("returns at most 10 results", async () => {
    const { api } = fakeApi({
      [path]: Array.from({ length: 15 }, (_, i) => ({
        account_id: i + 1,
        personaname: `P${i}`,
      })),
    });
    expect(await searchSteamAccounts("fargareko", api)).toHaveLength(10);
  });
});
