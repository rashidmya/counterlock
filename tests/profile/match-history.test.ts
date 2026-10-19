import { describe, expect, it } from "vitest";
import {
  form,
  heroBreakdown,
  isSummaryMatch,
  isWin,
  kda,
  matchesFilter,
  modeLabel,
  parseHistory,
  rankedSummary,
  soulsPerMin,
  summarize,
  topHeroes,
} from "@/features/profile/utils/match-history";
import type { HistoryMatch } from "@/features/profile/types";

const row = (overrides: Record<string, unknown> = {}) => ({
  account_id: 156735156,
  match_id: 61341252,
  hero_id: 6,
  hero_level: 24,
  start_time: 1771856990,
  game_mode: 1,
  match_mode: 1,
  player_team: 1,
  player_kills: 1,
  player_deaths: 9,
  player_assists: 5,
  denies: 1,
  net_worth: 27375,
  last_hits: 107,
  abandoned_time_s: null,
  match_duration_s: 2047,
  match_result: 0,
  player_match_outcome: 0,
  ranked_display_badge: null,
  ...overrides,
});
const match = (overrides: Partial<HistoryMatch> = {}): HistoryMatch => ({
  matchId: 1,
  heroId: 6,
  startTime: 100,
  gameMode: 1,
  matchMode: 1,
  team: 0,
  result: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  netWorth: 0,
  lastHits: 0,
  denies: 0,
  durationS: 600,
  heroLevel: 1,
  ...overrides,
});

describe("parseHistory", () => {
  it("maps API rows and sorts newest first", () => {
    const parsed = parseHistory([
      row({ match_id: 2, start_time: 100 }),
      row({ match_id: 3, start_time: 300 }),
      row({ match_id: 1, start_time: 200 }),
    ]);
    expect(parsed.map((m) => m.matchId)).toEqual([3, 1, 2]);
    expect(parsed[0]).toEqual({
      matchId: 3,
      heroId: 6,
      startTime: 300,
      gameMode: 1,
      matchMode: 1,
      team: 1,
      result: 0,
      kills: 1,
      deaths: 9,
      assists: 5,
      netWorth: 27375,
      lastHits: 107,
      denies: 1,
      durationS: 2047,
      heroLevel: 24,
    });
  });

  it("drops invalid rows", () => {
    const parsed = parseHistory([
      row(),
      null,
      "x",
      {},
      row({ match_id: undefined }),
      row({ match_id: 5, hero_id: "6" }),
      row({ match_id: 6, start_time: null }),
      row({ match_id: 7, match_result: null }),
    ]);
    expect(parsed).toHaveLength(1);
  });

  it("returns [] for non-array input", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory({ error: "forbidden" })).toEqual([]);
  });

  it("defaults missing optional numeric stats to 0", () => {
    const parsed = parseHistory([
      row({ denies: null, last_hits: undefined, net_worth: null }),
    ]);
    expect(parsed[0]).toMatchObject({ denies: 0, lastHits: 0, netWorth: 0 });
  });
});

describe("isWin", () => {
  it("is true when match_result equals player_team", () => {
    expect(isWin(match({ team: 0, result: 0 }))).toBe(true);
    expect(isWin(match({ team: 1, result: 1 }))).toBe(true);
    expect(isWin(match({ team: 0, result: 1 }))).toBe(false);
    expect(isWin(match({ team: 1, result: 0 }))).toBe(false);
  });
});

describe("filters", () => {
  const ranked = match({ gameMode: 1, matchMode: 4 });
  const normal = match({ gameMode: 1, matchMode: 1 });
  const brawl = match({ gameMode: 4, matchMode: 1 });
  const bot = match({ gameMode: 1, matchMode: 3 });
  const all = [ranked, normal, brawl, bot];

  it("applies each filter to the right modes", () => {
    expect(all.filter((m) => matchesFilter(m, "all"))).toEqual(all);
    expect(all.filter((m) => matchesFilter(m, "ranked"))).toEqual([ranked]);
    expect(all.filter((m) => matchesFilter(m, "normal"))).toEqual([normal]);
    expect(all.filter((m) => matchesFilter(m, "street_brawl"))).toEqual([
      brawl,
    ]);
  });

  it("labels modes", () => {
    expect(all.map(modeLabel)).toEqual([
      "Ranked",
      "Normal",
      "Street Brawl",
      "Other",
    ]);
  });

  it("limits summaries to normal-mode ranked and unranked games", () => {
    expect(all.filter(isSummaryMatch)).toEqual([ranked, normal]);
  });
});

describe("kda and souls per minute", () => {
  it("computes kda with a floor of one death", () => {
    expect(kda(10, 2, 5)).toBe(7.5);
    expect(kda(3, 0, 2)).toBe(5);
  });

  it("is 0 souls/min for a zero or negative duration", () => {
    expect(soulsPerMin(27375, 0)).toBe(0);
    expect(soulsPerMin(27375, -5)).toBe(0);
    expect(soulsPerMin(6000, 600)).toBe(600);
  });
});

describe("summarize", () => {
  const win = match({
    matchId: 1,
    team: 0,
    result: 0,
    kills: 10,
    deaths: 2,
    assists: 5,
    netWorth: 6000,
    durationS: 600,
    lastHits: 100,
  });
  const loss = match({
    matchId: 2,
    team: 0,
    result: 1,
    kills: 2,
    deaths: 6,
    assists: 3,
    netWorth: 3000,
    durationS: 600,
    lastHits: 50,
  });

  it("derives totals-based stats for two matches", () => {
    expect(summarize([win, loss])).toEqual({
      games: 2,
      wins: 1,
      winRate: 0.5,
      kda: 2.5,
      soulsPerMin: 450,
      avgKills: 6,
      avgDeaths: 4,
      avgAssists: 4,
      avgLastHits: 75,
    });
  });

  it("returns finite zeros for an empty list", () => {
    const s = summarize([]);
    expect(s.games).toBe(0);
    expect(s.winRate).toBeNull();
    for (const v of [
      s.kda,
      s.soulsPerMin,
      s.avgKills,
      s.avgDeaths,
      s.avgAssists,
      s.avgLastHits,
    ])
      expect(v).toBe(0);
  });

  it("stays finite with a zero-duration match", () => {
    const abandoned = match({
      matchId: 3,
      durationS: 0,
      netWorth: 27375,
      deaths: 0,
    });
    const s = summarize([win, abandoned]);
    for (const v of Object.values(s))
      if (v !== null) expect(Number.isFinite(v)).toBe(true);
    expect(s.soulsPerMin).toBe(600);
  });

  it("ranked summary counts only ranked games", () => {
    const ranked = match({ matchMode: 4, team: 1, result: 1 });
    const rankedLoss = match({ matchMode: 4, team: 1, result: 0 });
    expect(rankedSummary([win, loss, ranked, rankedLoss])).toEqual({
      games: 2,
      winRate: 0.5,
    });
    expect(rankedSummary([win])).toEqual({ games: 0, winRate: null });
  });
});

describe("heroBreakdown", () => {
  const ms = [
    match({
      matchId: 1,
      heroId: 6,
      startTime: 100,
      team: 0,
      result: 0,
      kills: 10,
      deaths: 2,
      assists: 4,
      netWorth: 6000,
      durationS: 600,
      lastHits: 80,
      denies: 2,
    }),
    match({
      matchId: 2,
      heroId: 6,
      startTime: 300,
      team: 0,
      result: 1,
      kills: 2,
      deaths: 4,
      assists: 2,
      netWorth: 3000,
      durationS: 600,
      lastHits: 40,
      denies: 4,
    }),
    match({
      matchId: 3,
      heroId: 31,
      startTime: 200,
      team: 1,
      result: 1,
      kills: 1,
      deaths: 0,
      assists: 1,
      netWorth: 1200,
      durationS: 0,
    }),
  ];

  it("groups by hero, averages, and sorts by games desc", () => {
    const rows = heroBreakdown(ms);
    expect(rows.map((r) => r.heroId)).toEqual([6, 31]);
    expect(rows[0]).toEqual({
      heroId: 6,
      games: 2,
      wins: 1,
      losses: 1,
      winRate: 0.5,
      kills: 6,
      deaths: 3,
      assists: 3,
      kda: 3,
      soulsPerMin: 450,
      lastHits: 60,
      denies: 3,
      lastPlayed: 300,
    });
    expect(rows[1]).toMatchObject({
      games: 1,
      wins: 1,
      soulsPerMin: 0,
      lastPlayed: 200,
    });
  });

  it("returns top heroes limited to n", () => {
    expect(topHeroes(ms, 1).map((r) => r.heroId)).toEqual([6]);
    expect(topHeroes(ms).map((r) => r.heroId)).toEqual([6, 31]);
  });
});

describe("form", () => {
  it("returns results for the first n matches (newest first)", () => {
    const parsed = parseHistory([
      row({ match_id: 1, start_time: 100, player_team: 0, match_result: 0 }),
      row({ match_id: 2, start_time: 300, player_team: 0, match_result: 1 }),
      row({ match_id: 3, start_time: 200, player_team: 1, match_result: 1 }),
    ]);
    expect(form(parsed)).toEqual([false, true, true]);
    expect(form(parsed, 2)).toEqual([false, true]);
    expect(form([...parsed].reverse())).toEqual([false, true, true]);
  });
});
