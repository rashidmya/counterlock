# Redesign phase 4 — Performance tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The profile's Performance tab follows a player's recent normal and ranked games against the average player on the same hero at the same rank. It has eight cards:
- souls / min and the K/D/A ratio;
- hero damage, objective damage, healing and creep kills per minute;
- kill participation and hero damage share.

Each card shows one point per game (win or loss dot) with the dashed rank average, the value over the range, and **▲ Improving / – Flat / ▼ Slipping**. The range is Last 20, 50 or 100, for all heroes or one. The desktop app and the website share it.

**Architecture:**
- **Pure modules in `src/features/profile/utils/` do the deciding.**
  - `match-totals.ts` reads each player's final totals from bulk match metadata.
  - `performance-metrics.ts` holds the games in range, the eight metrics as fractions, each game's rank average from the match report's curve, the range values and the trend rule.
- **A thin service, `performance-api.ts`, fetches through the shared `DeadlockApi` client.**
  - Match totals come in batches of 50, kept per match.
  - Rank curves come per game through phase 3's `fetchRankCurve`, so games share them.
- **React renders it in a rewritten `PerformanceTab`.** It has a hand-drawn SVG `Sparkline` per card, measured to its real width with a shared `useElementWidth` hook (taken out of the match report's Graph). No chart library is added.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8 (web), plain global CSS with the noir tokens, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md`: "Performance tab", "Profile" and phase 4 of "Delivery phases". Visual reference: `docs/superpowers/specs/2026-10-21-redesign-prototype.html` (open "Performance"; tick "Show as website" for web sizes). Where this plan and the prototype differ, this plan wins.

**Every code block in this plan was built and run before the plan was written.** The full result:
- `npm test` 369 passed;
- `npm run test:browser` 130 passed;
- `npm run test:web` 74 passed;
- both type checks, `npm run build`, `npm run web:build` and `npm run validate:manifest` passed.

Each task's end state was also checked on its own: type check and unit tests after every task (334, 339, 363, 375, 379, 379 and 369 tests), and both browser suites after Tasks 5 and 6. Copy the code as given. If something fails, fix the cause rather than the test.

## Decisions made while planning (verified against the live API on 2026-10-22)

Checked on account 400239835 (Eternus 6, 5,699 games) and three Archon–Arcanist accounts (97165455, 138033625, 54311456).

- **Per-game totals come from bulk metadata, not one metadata request per game.**
  - **Request:** `GET /v1/matches/metadata?match_ids=…&include_player_kda=true&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills&limit=N`.
  - **What it returns:** every player of each match with K/D/A and each stat's snapshots as an array (`stats_player_damage: [1205, …, 31217]`). The last value is the final total.
  - **Size:** 50 games is 250 KB (59 KB gzipped) and about 5.5 s. Full metadata is about 1 MB per game, so 20 games would be 20 MB. `include_player_final_stats` is about 36 KB per game, mostly custom stats, and isn't needed.
  - **Limits and fields:** 30 requests per minute per IP, and CORS is open. Teams are `"Team0"` / `"Team1"` here, against `0` / `1` in single-match metadata. The endpoint's default `match_mode` is `ranked,unranked`, which is all the tab asks for.
  - **Batches and caching:** at most 50 games per request (`TOTALS_BATCH`). The service keeps totals per match (per client, so tests start empty), so Last 20 → Last 50 asks only for the 30 new games. A game the API hasn't stored yet is left out, asked for again next time, and counted in a note.
  - **Retry delay (Task 4 review):** bulk responses are cached by the client for `TTL.history` (2 min), so a game the API stores after it was first asked for shows up within two minutes.
  - **Unreadable players (Task 2 review):** a match with any player that can't be read (no snapshots, no team) is left out whole, as if not stored yet. Dropping just that player would shrink the team totals, inflate kill participation and damage share, and cache the wrong numbers.
- **Each game's rank.**
  - **Ranked games:** match history's `ranked_display_badge`, which phase 3 found equals `initial_display_rank` at match start. It is now kept as `HistoryMatch.badge`.
  - **Unranked games:** they have none. All 4,762 unranked rows of the test account are null, and bulk metadata for unranked matches has no badges and a null `average_badge`. As the spec says ("or the player's current rank"), they use `/v1/players/rank`, which is asked only when some game lacks a badge and is already cached by the header. With no current rank, all ranks are used.
  - **Notes:** both cases have one. (The match report uses the lobby's rank instead, which is all ranks for unranked games; see follow-ups.)
- **The rank average is the match report's curve read at the game's length**, through `fetchRankCurve(hero, badge, durationS)` and `averageAt`.
  - **Why the curve:**
    - it gives the same numbers as the report's verdicts for the same game;
    - it allows for match length (per-minute rates rise in longer games);
    - it has sample counts, so thin bands widen as in phase 3.
  - **Rejected alternative:** `/v1/analytics/player-stats/metrics?hero_ids=…&min_average_badge=…` averages each match's per-minute values. It has no sample counts and ignores match length.
  - **Cost:** one request per hero and band (31 KB, about 7 s uncached, cached for an hour server-side), shared between games by the client.
- **K/D/A without inflating anyone.**
  - **The problem:** a mean of per-game K/D/A ratios runs far above a ratio of averages. Haze at Eternus has a mean per-game K/D/A of 5.8, a median of 3.6 and a ratio of average kills, deaths and assists of 3.5. Comparing the first with the curve's ratio would put nearly every player above average.
  - **Range value:** (Σkills + Σassists) ÷ max(1, Σdeaths), as the Overview's K/D/A does. Deaths are added up before the floor at one (`minDenominator`), so deathless games aren't counted as a death each (Task 3 review).
  - **Rank average:** (k̄ + ā) ÷ max(1, d̄) per game from the curve, and over the range (Σk̄ + Σā) ÷ max(1, Σd̄). A single game's ratio is compared with it directly, since the median game sits near it.
- **Every range value adds up fractions.** Each metric gives each game a numerator and a denominator (souls and minutes, damage and team damage…). The range value is Σnumerators ÷ Σdenominators: a time-weighted rate, so longer games count for more. The rank average adds up the same way, over the games that have both a value and an average. When those are fewer (games longer than the curve), the card compares like with like: "20 games · 18 with a rank average: 1,060 vs 1,000", where 1,060 is the player over those 18 games (`comparedValue`, Task 3 review). The left-out games are the longest, where rates run highest, so comparing all games with the subset's average would flatter the player.
- **"Last hits" becomes "Creep kills / min" (deviation, as in phase 3).** The curve has creep kills, not last hits, and the two counts differ. The note says so.
- **Kill participation and hero damage share have no rank average.**
  - **Source:** bulk K/D/A and hero damage of the player's team.
  - **No average:** the curve has no team totals. The prototype's "rank avg 55%" and "17%" weren't real numbers, so these cards say "no rank average".
- **Improving / Flat / Slipping.**
  - **Method:** the recent half of the games against the earlier half; with an odd count, the middle game goes to the earlier half. Each game counts as its value ÷ its own rank average, so changing hero or rank doesn't read as a change in form. The two shares use their values.
  - **Threshold:** improving or slipping only when Welch's t-test finds the halves differ at the 95% level (Welch–Satterthwaite degrees of freedom, `criticalT(df)` from a t-table), with at least `MIN_TREND_GAMES = 6` games.
  - **Why:** on the four live accounts, a threshold of 1 standard error flagged about four of eight metrics per account, mostly noise. The Task 3 review then simulated a fixed 2 on data with no change: 12% of cards flagged at 6 games and 6% at 20, because a 3-vs-3 split has only about 4 degrees of freedom (critical t 2.78). The t-table keeps the false-alarm rate near 5% at any range.
  - **States:** no badge while the needed data loads or failed, and "Too few games" otherwise.
- **Ranges and hero.**
  - **Ranges:** Last 20 (default), Last 50 and Last 100. "All" is dropped, because thousands of games of metadata is too much (the test account has 5,699).
  - **Hero:** a "Hero" select lists "All heroes" and each hero with normal or ranked games ("Haze · 181 games"). It is hidden with only one hero. The range applies after the hero is picked, so you get the last 20 games on that hero.
- **Requests when opening the tab:**
  - one bulk request per 50 games;
  - one curve per hero and band, plus one when it widens;
  - `/v1/players/rank` only if a game has no badge.

  Switching range or hero asks only for what's new. `useAsync` is keyed on the game ids, so a slow response for an old range is dropped.
- **The old tab goes.** It had a KDA chart, a souls chart, the form strip, and four stat cards (accuracy and damage per minute from hero stats, last hits, deaths). The code that only it used goes with it: `LineChart`, `performanceSeries`, `combatAverages`, `fetchSummaryHeroStats`, `SUMMARY_HERO_STATS`, `form` and the `.chart-card` styles. Win/loss dots on every card replace the form strip.
- **Layout.**
  - **Columns:** four, two when the cards' container is narrower than 900 px, one below 480 px (container queries).
  - **Sparklines:** 80 px tall, drawn at their measured width.
  - **Checked by eye** on live data at 1260 px, 900 px and 375 px, with no horizontal scroll.

- **Follow-ups for the owner (not built):**
  - **Clicking a game:** a point could open that game's match report.
  - **Unranked games:** the tab compares them with the player's current rank, while the match report uses the lobby's rank (all ranks for unranked). Pick one rule for both.
  - **Rate limit:** switching heroes quickly on Last 100 could pass bulk metadata's 30 requests per minute. The client's cooldown then pauses every request for 30 s.
  - **All-or-nothing averages:** one failed or timed-out curve blanks every card's rank average until Retry (successful curves stay cached). On Last 100 a player with many heroes fires every uncached curve at once (about 7 s each against the client's 15 s timeout); catching per game, or limiting how many run together, would be more forgiving (Task 4 review).
  - **Point details:** they are SVG `<title>` tooltips, which only show on hover.
  - **Tab state:** the tab and its range reset when coming back from a match report (the existing profile follow-up).

## Global Constraints

- Every colour comes from `src/app/styles/tokens.css` (`var(--token)` or `rgb(from var(--token) r g b / a)`). `tests/app/theme.test.ts` fails on any hex literal in `src/**/*.css`, `web/app/**/*.css` or `src/**/*.tsx`.
- Fonts and components are as in phases 1–3: Rajdhani uppercase for labels, buttons and numbers, DM Sans for body text, `SectionHeader` for the section title, `.filter-buttons` for the ranges and `.select-field` for the hero select.
- **Constants (exported; tests import them):** `RANGES = [20, 50, 100]`, `MIN_TREND_GAMES = 6`, `TOTALS_BATCH = 50`; `criticalT(df)` gives the two-sided 95% t.
- **Copy strings fixed by this plan (tests assert them):**
  - **Controls:** buttons "Last 20", "Last 50" and "Last 100"; the select "Hero" with "All heroes" and options like "Haze · 181 games" ("1 game" for one).
  - **Legend:** "Game by game", "Average for that hero at that rank", "Win" and "Loss".
  - **Card titles:** "Souls / min", "K/D/A ratio", "Hero damage / min", "Objective damage / min", "Healing / min", "Creep kills / min", "Kill participation" and "Hero damage share".
  - **Trends:** "▲ Improving", "– Flat", "▼ Slipping" and "Too few games".
  - **Card numbers:**
    - the value (`1,238`, `3.7` below 100, `54%` for shares, "—" without one);
    - then "{n} games · rank avg {x}", or, when fewer games have an average, "{n} games · {m} with a rank average: {player over those m} vs {x}";
    - otherwise " · no rank average", " · loading rank average…" or " · no rank average for these games";
    - or "Loading match details…" or "No match details" instead.
  - **Point tooltip:** "{Hero} · Win · 3d ago: 1,254 (rank avg 1,213)".
  - **States:** "Loading match history…", "Match history unavailable" with Retry, "No recorded normal or ranked matches", "Match details unavailable: {error}" with Retry, and "Rank averages unavailable: {error}" with Retry.
  - **Notes (always):**
    - "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days."
    - "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat."
    - "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and hero damage share have no rank average."
  - **Notes (when they apply):**
    - "Games without a recorded rank use the player's current rank."
    - "Games without a recorded rank are compared with all ranks: the player's current rank is unknown."
    - "Where a hero has too few games at one rank, its average covers the ranks either side."
    - "{n} of {total} games have no match details yet, so they're missing from damage, healing, creep kills and shares."
- No fake data in production. Every derived number carries its one-line "how it's derived" note.
- One shared copy of the feature code for the app and the website.
- **Before every commit**, run `npm test`, `npx tsc --noEmit` and `npm run web:typecheck`.
- **Browser suites:** `npm run test:browser` (desktop) and `npm run test:web` (website).
- **Formatting:** format touched files with `npx prettier --write <files>`.
- **Commits:** plain conventional commits (`feat(profile): …`) with **no AI attribution lines or trailers** (owner rule).

## Review Focus

1. **Honest numbers.**
   - **Range values** add up fractions; they never average per-game ratios.
   - **The rank average** covers only games that have both a value and an average; when they are fewer, the card compares the player over the same games.
   - **Trends** follow each game against its own average; the two shares are the only metrics that use raw values.
   - **Notes** cover the current-rank fallback, widening and missing details.

   Tests: `weights games by length, not each game equally`, `compares like with like when some games have no rank average`, `adds up deaths before counting them as at least one`, `follows each game against its own rank average`, `is flat unless Welch's t-test finds the halves differ at 95%`, `performance tab compares each metric with the rank average`, `performance tab compares like with like when a game outlasts the rank average`.
2. **Requests.**
   - **Bulk metadata:** asked once per new game, in batches of 50, with in-flight requests shared.
   - **Curves:** shared per hero and band.
   - **Current rank:** asked only when needed.

   Tests: `only asks for games it doesn't have yet`, `shares one curve request per hero and rank between games`, and the bulk-request count in the desktop test.
3. **Failure.** When totals or averages fail, the history-based values still show, each failure gets its own Retry, and no trend is claimed. Test: `performance tab keeps history values when details and averages fail`.
4. **Widths.** Desktop at 850 px and 1260 px, and the website at 1600 px and 375 px: no horizontal page scroll; cards in four, two or one columns.

## File structure

| File | Responsibility |
|---|---|
| `src/features/profile/types.ts` | `HistoryMatch` gains `badge` (rank at match start, 0 when none) |
| `src/features/profile/utils/match-history.ts` | `parseHistory()` reads `ranked_display_badge`; `form` goes |
| `src/features/profile/utils/match-totals.ts` | `PlayerTotals`, `TOTALS_BATCH`, `totalsPath()`, `parseMatchTotals()` for bulk metadata |
| `src/features/profile/utils/performance-metrics.ts` | Ranges, games in range, hero choices, `gameAverage()`, `gameTotals()`, the eight metrics, `trend()`, `summarizeMetric()` |
| `src/features/profile/services/performance-api.ts` | `fetchMatchTotals()` (batched, kept per match), `fetchGameAverages()` (curve per game, current-rank fallback) |
| `src/shared/ui/useElementWidth.ts` | An element's measured width, updated on resize (shared by the Graph and the sparkline) |
| `src/features/profile/components/Sparkline.tsx` | One card's SVG: the value line, win/loss dots with tooltips, the dashed rank average |
| `src/features/profile/components/PerformanceTab.tsx` | Range and hero controls, legend, the eight cards, error notices and notes |
| `src/features/profile/styles/profile.css` | Performance styles (the `.chart-card` styles go) |
| `tests/fixtures/performance.ts` | Synthetic bulk metadata shared by the unit, desktop and website tests |

Removed: `src/shared/ui/LineChart.tsx`, `src/features/profile/utils/performance.ts`, `tests/profile/performance.test.ts`.

---
### Task 1: Each game's rank badge

**Files:**
- Modify: `src/features/profile/types.ts`
- Modify: `src/features/profile/utils/match-history.ts`
- Test: `tests/profile/match-history.test.ts`, `tests/home/home.test.ts`, `tests/profile/performance.test.ts`

Match history has `ranked_display_badge` for ranked games (null otherwise). Keep it as `badge`, 0 when missing.

- [ ] **Step 1: Write the failing test**

In `tests/profile/match-history.test.ts`, add this test at the end of `describe("parseHistory", …)`, after "defaults missing optional numeric stats to 0":

```ts
  it("keeps the rank badge at match start, 0 when none is recorded", () => {
    const parsed = parseHistory([
      row({ match_id: 1, start_time: 2, ranked_display_badge: 116 }),
      row({ match_id: 2, start_time: 1 }),
    ]);
    expect(parsed.map((m) => m.badge)).toEqual([116, 0]);
  });
```

In the same file's "maps API rows and sorts newest first" test, add `badge: 0,` after `heroLevel: 24,` in the expected object.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/profile/match-history.test.ts`
Expected: FAIL. `badge` is `undefined`, and the expected object has an extra key.

- [ ] **Step 3: Add the field and read it**

In `src/features/profile/types.ts`, in `HistoryMatch`, after `heroLevel: number;`:

```ts
  // Rank badge at match start (tier × 10 + subrank); 0 when the game
  // recorded none, as in unranked games.
  badge: number;
```

In `src/features/profile/utils/match-history.ts`, in `parseHistory()`, after `heroLevel: count(r.hero_level),`:

```ts
      badge: count(r.ranked_display_badge),
```

- [ ] **Step 4: Give the other test factories the field**

`tsc` covers `tests/`. Add `badge: 0,` after `heroLevel: 1,` in each `HistoryMatch` factory:
- `match()` in `tests/profile/match-history.test.ts`;
- `game()` in `tests/home/home.test.ts`;
- `match()` in `tests/profile/performance.test.ts` (that file goes in Task 7).

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS (334 tests).

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile tests/profile tests/home
git add src/features/profile tests/profile tests/home
git commit -m "feat(profile): keep each game's rank badge"
```

---
### Task 2: Match totals from bulk metadata

**Files:**
- Create: `tests/fixtures/performance.ts`
- Create: `src/features/profile/utils/match-totals.ts`
- Test: `tests/profile/match-totals.test.ts`

The fixture is the test data for the whole phase. One bulk-metadata match has the account on Team0 (slot 1), five teammates and six enemies. The account's default totals give round results:
- 30,000 hero damage in 30 minutes, so 1,000 a minute;
- kill participation 17 / 30 and a damage share of 30,000 / 105,000.

It uses relative imports only, because Playwright loads it too.

- [ ] **Step 1: Create the shared fixture**

`tests/fixtures/performance.ts`:

```ts
// Synthetic bulk match metadata (`GET /v1/matches/metadata`) for the
// Performance tab tests (unit, desktop and website). Relative imports only:
// Playwright loads this file too.

export interface OwnTotals {
  kills: number;
  assists: number;
  heroDamage: number;
  objectiveDamage: number;
  healing: number;
  creepKills: number;
}

// The account's totals unless a test says otherwise. With five teammates at
// 4 kills and 15,000 hero damage each, kill participation is 17 / 30 and the
// damage share 30,000 / 105,000.
export const OWN: OwnTotals = {
  kills: 10,
  assists: 7,
  heroDamage: 30000,
  objectiveDamage: 6000,
  healing: 4000,
  creepKills: 90,
};
const OTHER: OwnTotals = {
  kills: 4,
  assists: 6,
  heroDamage: 15000,
  objectiveDamage: 3000,
  healing: 2000,
  creepKills: 60,
};

// Snapshots run up to the final total, which is the last value.
const player = (accountId: number, slot: number, totals: OwnTotals) => ({
  account_id: accountId,
  hero_id: 1,
  player_slot: slot,
  team: slot <= 6 ? "Team0" : "Team1",
  kills: totals.kills,
  deaths: 5,
  assists: totals.assists,
  stats_player_damage: [totals.heroDamage / 2, totals.heroDamage],
  stats_boss_damage: [0, totals.objectiveDamage],
  stats_player_healing: [totals.healing / 2, totals.healing],
  stats_creep_kills: [totals.creepKills / 2, totals.creepKills],
});

/** One match: the account on Team0 (slot 1), five teammates and six enemies. */
export function bulkMatch(
  matchId: number,
  accountId: number,
  own: Partial<OwnTotals> = {},
) {
  return {
    match_id: matchId,
    duration_s: 1800,
    players: [
      player(accountId, 1, { ...OWN, ...own }),
      ...Array.from({ length: 11 }, (_, index) =>
        player(9000 + index, index + 2, OTHER),
      ),
    ],
  };
}

/** A bulk response for the `match_ids` a request URL asks for. */
export function bulkMetadata(url: URL, accountId: number) {
  return (url.searchParams.get("match_ids") ?? "")
    .split(",")
    .filter(Boolean)
    .map((id) => bulkMatch(Number(id), accountId));
}
```

- [ ] **Step 2: Write the failing tests**

`tests/profile/match-totals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  TOTALS_BATCH,
  parseMatchTotals,
  totalsPath,
} from "@/features/profile/utils/match-totals";
import { OWN, bulkMatch } from "../fixtures/performance";

describe("totalsPath", () => {
  it("asks for K/D/A and four stat columns of exactly these matches", () => {
    expect(totalsPath([3, 1])).toBe(
      "/v1/matches/metadata?match_ids=3,1&include_player_kda=true" +
        "&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills" +
        "&limit=2",
    );
    expect(TOTALS_BATCH).toBe(50);
  });
});

describe("parseMatchTotals", () => {
  it("reads each player's final values and team", () => {
    const totals = parseMatchTotals([bulkMatch(5, 77)]);
    const players = totals.get(5)!;
    expect(players).toHaveLength(12);
    expect(players[0]).toEqual({ accountId: 77, team: 0, ...OWN });
    expect(players[11]).toMatchObject({ accountId: 9010, team: 1 });
  });

  it("accepts numeric teams too", () => {
    const match = bulkMatch(5, 77);
    const players = [{ ...match.players[0], team: 1 }];
    expect(parseMatchTotals([{ ...match, players }]).get(5)![0].team).toBe(1);
  });

  it("leaves out a match with a player it can't read, and matches without players", () => {
    const noSnapshots = bulkMatch(5, 77);
    noSnapshots.players[3].stats_player_damage = [];
    const noTeam = bulkMatch(6, 77);
    noTeam.players[1].team = "Spectator";
    const empty = { ...bulkMatch(7, 77), players: [] };
    const totals = parseMatchTotals([
      noSnapshots,
      noTeam,
      empty,
      bulkMatch(8, 77),
      null,
      { match_id: "9" },
    ]);
    expect([...totals.keys()]).toEqual([8]);
  });

  it("is empty for anything but an array", () => {
    expect(parseMatchTotals({ error: "busy" }).size).toBe(0);
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run tests/profile/match-totals.test.ts`
Expected: FAIL, because `@/features/profile/utils/match-totals` doesn't exist.

- [ ] **Step 4: Write the module**

`src/features/profile/utils/match-totals.ts`:

```ts
// Each player's final totals in a match, read from bulk match metadata
// (`GET /v1/matches/metadata`). It returns every stat as its snapshots over
// the match (`stats_player_damage: [...]`); the last one is the final total.

export interface PlayerTotals {
  accountId: number;
  // 0 or 1, as in match history's `player_team`.
  team: number;
  kills: number;
  assists: number;
  heroDamage: number;
  objectiveDamage: number;
  healing: number;
  creepKills: number;
}

// Matches per bulk request.
export const TOTALS_BATCH = 50;

const STATS = {
  heroDamage: "player_damage",
  objectiveDamage: "boss_damage",
  healing: "player_healing",
  creepKills: "creep_kills",
} as const;

export const totalsPath = (matchIds: number[]) =>
  `/v1/matches/metadata?match_ids=${matchIds.join(",")}` +
  `&include_player_kda=true&extra_player_columns=${Object.values(STATS)
    .map((field) => `stats.${field}`)
    .join(",")}&limit=${matchIds.length}`;

type Row = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) => (isNumber(value) ? value : 0);
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === "object")
    : [];

// Bulk metadata names the teams "Team0" and "Team1".
const parseTeam = (value: unknown) =>
  value === "Team0" || value === 0
    ? 0
    : value === "Team1" || value === 1
      ? 1
      : null;

const final = (player: Row, field: string) => {
  const series = player[`stats_${field}`];
  const last = Array.isArray(series) ? series.at(-1) : undefined;
  return isNumber(last) ? last : null;
};

function parsePlayer(player: Row): PlayerTotals | null {
  const team = parseTeam(player.team);
  if (!isNumber(player.account_id) || team === null) return null;
  const heroDamage = final(player, STATS.heroDamage);
  const objectiveDamage = final(player, STATS.objectiveDamage);
  const healing = final(player, STATS.healing);
  const creepKills = final(player, STATS.creepKills);
  // A player without snapshots has no totals to show.
  if (
    heroDamage === null ||
    objectiveDamage === null ||
    healing === null ||
    creepKills === null
  )
    return null;
  return {
    accountId: player.account_id,
    team,
    kills: count(player.kills),
    assists: count(player.assists),
    heroDamage,
    objectiveDamage,
    healing,
    creepKills,
  };
}

/**
 * Players' totals by match id. A match with a player that can't be read is
 * left out, as if not stored yet: its team totals would be wrong.
 */
export function parseMatchTotals(data: unknown): Map<number, PlayerTotals[]> {
  const matches = new Map<number, PlayerTotals[]>();
  for (const match of rows(data)) {
    if (!isNumber(match.match_id)) continue;
    const players = rows(match.players).map(parsePlayer);
    if (players.length && players.every((p): p is PlayerTotals => !!p))
      matches.set(match.match_id, players);
  }
  return matches;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/match-totals.test.ts`
Expected: PASS (5 tests). `npm test`: 339 tests.

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile/utils/match-totals.ts tests/fixtures/performance.ts tests/profile/match-totals.test.ts
git add src/features/profile/utils/match-totals.ts tests/fixtures/performance.ts tests/profile/match-totals.test.ts
git commit -m "feat(profile): read match totals from bulk metadata"
```

---
### Task 3: Metrics, rank averages and trends

**Files:**
- Create: `src/features/profile/utils/performance-metrics.ts`
- Test: `tests/profile/performance-metrics.test.ts`

The new module sits next to the old `utils/performance.ts`. The old tab still uses that file until Task 6, and Task 7 deletes it.

**How the pieces fit:**
- **Metrics:** each `PerformanceMetric` turns a game into a fraction, from its history row and, for six metrics, its `GameTotals`. Metrics the curve covers also turn the game's `GameAverage` into a fraction.
- **`summarizeMetric()`:** builds the per-game points, the range value and the rank average by adding up the fractions, and the trend.
- **`trend()`:** Welch's t-test at 95% on the earlier and recent halves, with `criticalT(df)` from a t-table.

**Test data:**
- `gameAverage()` reads the phase 3 fixture curve (`rankCurveRows()`: 1,000 souls and 500 hero damage per minute).
- `gameTotals()` reads the Task 2 fixture.

- [ ] **Step 1: Write the failing tests**

`tests/profile/performance-metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { metricById } from "@/features/match-report/utils/metrics";
import {
  averageAt,
  parseCurve,
  rankBand,
} from "@/features/match-report/utils/rank-curve";
import type { HistoryMatch } from "@/features/profile/types";
import { parseMatchTotals } from "@/features/profile/utils/match-totals";
import {
  MIN_TREND_GAMES,
  PERFORMANCE_METRICS,
  criticalT,
  gameAverage,
  gameTotals,
  gamesInRange,
  heroChoices,
  summarizeMetric,
  trend,
  type GameAverage,
  type PerformanceMetricId,
} from "@/features/profile/utils/performance-metrics";
import { rankCurveRows } from "../fixtures/match-report";
import { bulkMatch } from "../fixtures/performance";

const match = (overrides: Partial<HistoryMatch> = {}): HistoryMatch => ({
  matchId: 1,
  heroId: 6,
  startTime: 100,
  gameMode: 1,
  matchMode: 1,
  team: 0,
  result: 0,
  kills: 4,
  deaths: 2,
  assists: 2,
  netWorth: 12000,
  lastHits: 100,
  denies: 0,
  durationS: 600,
  heroLevel: 1,
  badge: 0,
  ...overrides,
});

const metric = (id: PerformanceMetricId) =>
  PERFORMANCE_METRICS.find((m) => m.id === id)!;

describe("gamesInRange", () => {
  const history = [
    ...Array.from({ length: 30 }, (_, i) =>
      match({ matchId: i + 1, startTime: 1000 + i, heroId: i % 2 ? 7 : 6 }),
    ),
    match({ matchId: 100, startTime: 5000, gameMode: 4 }),
    match({ matchId: 101, startTime: 5001, matchMode: 3 }),
  ];

  it("keeps the newest normal and ranked games, oldest first", () => {
    const games = gamesInRange(history, 20, null);
    expect(games.map((g) => g.matchId)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 11),
    );
  });

  it("takes the range from one hero's games", () => {
    const games = gamesInRange(history, 20, 7);
    expect(games).toHaveLength(15);
    expect(games.every((g) => g.heroId === 7)).toBe(true);
    expect(games.at(-1)!.matchId).toBe(30);
  });
});

describe("heroChoices", () => {
  it("counts normal and ranked games per hero, most played first", () => {
    expect(
      heroChoices([
        match({ heroId: 3 }),
        match({ heroId: 9 }),
        match({ heroId: 9 }),
        match({ heroId: 5, gameMode: 4 }),
      ]),
    ).toEqual([
      { heroId: 9, games: 2 },
      { heroId: 3, games: 1 },
    ]);
  });
});

describe("gameAverage", () => {
  const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

  it("reads each stat's rank average at the game's length", () => {
    const average = gameAverage(curve, 1800, "game");
    expect(average.band.label).toBe("Emissary");
    expect(average.source).toBe("game");
    // The fixture curve: 1,000 souls and 500 hero damage per minute.
    expect(average.values.souls).toBe(30000);
    expect(average.values.heroDamage).toBe(15000);
    expect(average.values.deaths).toBe(
      averageAt(curve, metricById.get("deaths")!, 1800)!.avg,
    );
    expect(Object.keys(average.values).sort()).toEqual([
      "assists",
      "creepKills",
      "deaths",
      "healing",
      "heroDamage",
      "kills",
      "objectiveDamage",
      "souls",
    ]);
  });

  it("has no values past the curve's end", () => {
    expect(gameAverage(curve, 9000, "none").values).toEqual({});
  });
});

describe("gameTotals", () => {
  const players = parseMatchTotals([bulkMatch(1, 77)]).get(1);

  it("adds up the player's team", () => {
    const totals = gameTotals(players, 77)!;
    expect(totals.own.accountId).toBe(77);
    expect(totals.teamKills).toBe(10 + 5 * 4);
    expect(totals.teamHeroDamage).toBe(30000 + 5 * 15000);
  });

  it("is undefined when the player isn't in the match", () => {
    expect(gameTotals(players, 5)).toBeUndefined();
    expect(gameTotals(undefined, 77)).toBeUndefined();
  });
});

describe("metrics", () => {
  const game = match({ durationS: 1800, netWorth: 36000 });
  const totals = gameTotals(parseMatchTotals([bulkMatch(1, 77)]).get(1), 77);
  const values: GameAverage["values"] = {
    souls: 30000,
    heroDamage: 15000,
    kills: 6,
    deaths: 5,
    assists: 9,
  };
  const value = (id: PerformanceMetricId) => {
    const fraction = metric(id).value(game, totals);
    return fraction && fraction.num / fraction.den;
  };
  const average = (id: PerformanceMetricId) => {
    const fraction = metric(id).average?.(game, values);
    return fraction ? fraction.num / fraction.den : null;
  };

  it("are the eight in the spec, in order", () => {
    expect(PERFORMANCE_METRICS.map((m) => m.label)).toEqual([
      "Souls / min",
      "K/D/A ratio",
      "Hero damage / min",
      "Objective damage / min",
      "Healing / min",
      "Creep kills / min",
      "Kill participation",
      "Hero damage share",
    ]);
  });

  it("souls and K/D/A come from the history row", () => {
    expect(value("soulsPerMin")).toBe(1200);
    expect(average("soulsPerMin")).toBe(1000);
    expect(value("kda")).toBe((4 + 2) / 2);
    expect(average("kda")).toBe((6 + 9) / 5);
    // Deaths count as at least one when dividing, not in the fraction.
    expect(metric("kda").value(match({ deaths: 0 }), undefined)).toEqual({
      num: 6,
      den: 0,
    });
    expect(metric("kda").minDenominator).toBe(1);
  });

  it("the rest need the match's totals", () => {
    expect(value("heroDamagePerMin")).toBe(1000);
    expect(average("heroDamagePerMin")).toBe(500);
    expect(value("objectiveDamagePerMin")).toBe(200);
    expect(value("healingPerMin")).toBe(4000 / 30);
    expect(value("creepKillsPerMin")).toBe(3);
    expect(average("creepKillsPerMin")).toBeNull();
    expect(value("killParticipation")).toBe(17 / 30);
    expect(value("damageShare")).toBe(30000 / 105000);
    expect(metric("damageShare").average).toBeUndefined();
    expect(metric("heroDamagePerMin").value(game, undefined)).toBeNull();
  });

  it("skip games without a length or a team total", () => {
    const short = match({ durationS: 0 });
    expect(metric("soulsPerMin").value(short, totals)).toBeNull();
    expect(metric("soulsPerMin").average!(short, values)).toBeNull();
    const alone = { ...totals!, teamKills: 0 };
    expect(metric("killParticipation").value(game, alone)).toBeNull();
  });
});

describe("trend", () => {
  it("needs MIN_TREND_GAMES games", () => {
    expect(MIN_TREND_GAMES).toBe(6);
    expect(trend([1, 2, 3, 4, 5])).toBeNull();
  });

  it("reads 95% critical values of t, the stricter row between rows", () => {
    expect(criticalT(4)).toBe(2.78);
    expect(criticalT(4.9)).toBe(2.78);
    expect(criticalT(18)).toBe(2.13);
    expect(criticalT(1000)).toBe(1.98);
    expect(criticalT(0.5)).toBe(12.71);
  });

  it("is flat unless Welch's t-test finds the halves differ at 95%", () => {
    // Means 1.0 and 1.1: t ≈ 1.22.
    expect(trend([0.9, 1.1, 1.0, 1.0, 1.2, 1.1])).toBe("flat");
    // Means 1.0 and 1.2: t ≈ 2.45, short of 2.78 on 4 degrees of freedom.
    expect(trend([0.9, 1.0, 1.1, 1.1, 1.2, 1.3])).toBe("flat");
    expect(trend([1, 1, 1, 1, 1, 1])).toBe("flat");
  });

  it("improves or slips beyond that", () => {
    expect(trend([0.9, 1.0, 1.1, 1.4, 1.5, 1.6])).toBe("improving");
    expect(trend([1.6, 1.5, 1.4, 1.1, 1.0, 0.9])).toBe("slipping");
    // The same 0.2 step over 20 games: t ≈ 5.5 on 18 degrees of freedom.
    const earlier = [0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 1.0];
    expect(trend([...earlier, ...earlier.map((v) => v + 0.2)])).toBe(
      "improving",
    );
    // No spread at all: any change counts.
    expect(trend([1, 1, 1, 2, 2, 2])).toBe("improving");
  });

  it("puts the middle game in the earlier half", () => {
    // Earlier [1, 1, 1, 2] and recent [2, 2, 2]: t = 3, short of 3.18 on 3
    // degrees of freedom. With the middle game in the recent half both
    // halves would be constant, a sure change.
    expect(trend([1, 1, 1, 2, 2, 2, 2])).toBe("flat");
  });
});

describe("summarizeMetric", () => {
  // Six games, 30 minutes each: souls/min climbs from 900 to 1,400 while
  // the rank average stays at 1,000.
  const games = [900, 950, 1000, 1300, 1350, 1400].map((rate, i) =>
    match({
      matchId: i + 1,
      startTime: i,
      durationS: 1800,
      netWorth: rate * 30,
      result: i % 2,
    }),
  );
  const average: GameAverage = {
    band: rankBand(73),
    source: "game",
    values: { souls: 30000 },
  };

  it("adds up the range and compares it with the rank average", () => {
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      games,
      () => undefined,
      () => average,
    );
    expect(summary.points.map((p) => p.value)).toEqual([
      900, 950, 1000, 1300, 1350, 1400,
    ]);
    expect(summary.points.map((p) => p.won)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(summary.value).toBe(1150);
    expect(summary.games).toBe(6);
    expect(summary.average).toBe(1000);
    expect(summary.compared).toBe(6);
    expect(summary.trend).toBe("improving");
  });

  it("weights games by length, not each game equally", () => {
    const long = [
      match({ matchId: 1, durationS: 600, netWorth: 6000 }),
      match({ matchId: 2, durationS: 3000, netWorth: 60000 }),
    ];
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      long,
      () => undefined,
      () => undefined,
    );
    // 66,000 souls over 60 minutes, not the mean of 600 and 1,200.
    expect(summary.value).toBe(1100);
    expect(summary.average).toBeNull();
    expect(summary.compared).toBe(0);
  });

  it("compares like with like when some games have no rank average", () => {
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      games,
      () => undefined,
      (id) => (id <= 4 ? average : undefined),
    );
    expect(summary.value).toBe(1150);
    expect(summary.games).toBe(6);
    expect(summary.average).toBe(1000);
    expect(summary.compared).toBe(4);
    expect(summary.comparedValue).toBe((900 + 950 + 1000 + 1300) / 4);
    // Four games to compare are too few for a trend.
    expect(summary.trend).toBeNull();
  });

  it("adds up deaths before counting them as at least one", () => {
    const summary = summarizeMetric(
      metric("kda"),
      [0, 0, 4].map((deaths, i) => match({ matchId: i + 1, deaths })),
      () => undefined,
      () => undefined,
    );
    expect(summary.points.map((p) => p.value)).toEqual([6, 6, 1.5]);
    // 18 kills and assists over 4 deaths, not over 1 + 1 + 4.
    expect(summary.value).toBe(4.5);
  });

  it("has no trend for a rank-averaged metric until the averages load", () => {
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      games,
      () => undefined,
      () => undefined,
    );
    expect(summary.trend).toBeNull();
    expect(summary.points.every((p) => p.average === null)).toBe(true);
  });

  it("follows each game against its own rank average", () => {
    // The player swaps to a hero whose average is 40% higher: the raw
    // values climb, but against each game's average nothing changed.
    const averages = (id: number): GameAverage => ({
      ...average,
      values: { souls: id > 3 ? 42000 : 30000 },
    });
    const swapped = [900, 950, 1000, 1260, 1330, 1400].map((rate, i) =>
      match({ matchId: i + 1, durationS: 1800, netWorth: rate * 30 }),
    );
    const summary = summarizeMetric(
      metric("soulsPerMin"),
      swapped,
      () => undefined,
      averages,
    );
    expect(summary.trend).toBe("flat");
  });

  it("uses the values themselves for metrics without a rank average", () => {
    const totals = (id: number) =>
      gameTotals(
        parseMatchTotals([
          bulkMatch(id, 77, { kills: id > 3 ? 20 : 2, assists: 0 }),
        ]).get(id),
        77,
      );
    const summary = summarizeMetric(
      metric("killParticipation"),
      games,
      totals,
      () => average,
    );
    expect(summary.points.map((p) => p.average)).toEqual(Array(6).fill(null));
    expect(summary.trend).toBe("improving");
  });

  it("leaves out games without totals", () => {
    const summary = summarizeMetric(
      metric("heroDamagePerMin"),
      games,
      (id) =>
        id === 1
          ? gameTotals(parseMatchTotals([bulkMatch(1, 77)]).get(1), 77)
          : undefined,
      () => average,
    );
    expect(summary.games).toBe(1);
    expect(summary.points.map((p) => p.value)).toEqual([
      1000,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(summary.trend).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/performance-metrics.test.ts`
Expected: FAIL, because `@/features/profile/utils/performance-metrics` doesn't exist.

- [ ] **Step 3: Write the module**

`src/features/profile/utils/performance-metrics.ts`:

```ts
import {
  metricById,
  type MetricId,
} from "@/features/match-report/utils/metrics";
import {
  averageAt,
  type RankBand,
  type RankCurve,
} from "@/features/match-report/utils/rank-curve";
import type { HistoryMatch } from "../types";
import { isSummaryMatch, isWin } from "./match-history";
import type { PlayerTotals } from "./match-totals";

export const RANGES = [20, 50, 100] as const;
export type PerformanceRange = (typeof RANGES)[number];
// Fewer games than this to compare (with a rank average, where the metric
// has one) and there is no trend. Six keeps each half at three games or more.
export const MIN_TREND_GAMES = 6;

/** The newest `range` normal and ranked games, of one hero or all, oldest first. */
export function gamesInRange(
  history: HistoryMatch[],
  range: PerformanceRange,
  heroId: number | null,
): HistoryMatch[] {
  return history
    .filter(
      (m) => isSummaryMatch(m) && (heroId === null || m.heroId === heroId),
    )
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, range)
    .reverse();
}

/** Heroes with normal or ranked games, most played first. */
export function heroChoices(history: HistoryMatch[]) {
  const games = new Map<number, number>();
  for (const m of history)
    if (isSummaryMatch(m)) games.set(m.heroId, (games.get(m.heroId) ?? 0) + 1);
  return [...games]
    .map(([heroId, count]) => ({ heroId, games: count }))
    .sort((a, b) => b.games - a.games || a.heroId - b.heroId);
}

// The rank-average stats the metrics compare with.
const AVERAGED: MetricId[] = [
  "souls",
  "heroDamage",
  "objectiveDamage",
  "healing",
  "creepKills",
  "kills",
  "deaths",
  "assists",
];

export interface GameAverage {
  band: RankBand;
  // The tier the game was in, when the band had to be widened.
  widenedFrom?: string;
  // The game's own rank, the player's current rank (the game recorded
  // none), or neither (all ranks).
  source: "game" | "current" | "none";
  // Each stat's rank average at the game's length; missing past the
  // curve's end.
  values: Partial<Record<MetricId, number>>;
}

export function gameAverage(
  curve: RankCurve,
  durationS: number,
  source: GameAverage["source"],
): GameAverage {
  const values: GameAverage["values"] = {};
  for (const id of AVERAGED) {
    const at = averageAt(curve, metricById.get(id)!, durationS);
    if (at) values[id] = at.avg;
  }
  return { band: curve.band, widenedFrom: curve.widenedFrom, source, values };
}

/** The player's totals in one game, with their team's. */
export interface GameTotals {
  own: PlayerTotals;
  teamKills: number;
  teamHeroDamage: number;
}

export function gameTotals(
  players: PlayerTotals[] | undefined,
  accountId: number,
): GameTotals | undefined {
  const own = players?.find((p) => p.accountId === accountId);
  if (!players || !own) return undefined;
  const team = players.filter((p) => p.team === own.team);
  return {
    own,
    teamKills: team.reduce((sum, p) => sum + p.kills, 0),
    teamHeroDamage: team.reduce((sum, p) => sum + p.heroDamage, 0),
  };
}

// A game's value as a fraction. Over a range the numerators and the
// denominators are added up (a time-weighted rate) rather than averaging
// each game's value.
export interface Fraction {
  num: number;
  den: number;
}

export type PerformanceMetricId =
  | "soulsPerMin"
  | "kda"
  | "heroDamagePerMin"
  | "objectiveDamagePerMin"
  | "healingPerMin"
  | "creepKillsPerMin"
  | "killParticipation"
  | "damageShare";

export interface PerformanceMetric {
  id: PerformanceMetricId;
  label: string;
  // Needs the match's totals, not just the match-history row.
  needsTotals: boolean;
  percent: boolean;
  // Never divide by less than this, in a game or over the range: deaths
  // count as at least one.
  minDenominator?: number;
  value(game: HistoryMatch, totals: GameTotals | undefined): Fraction | null;
  // The rank average for the game; absent for metrics the curve can't give.
  average?(game: HistoryMatch, values: GameAverage["values"]): Fraction | null;
}

const minutes = (game: HistoryMatch) => game.durationS / 60;

/** A running total per minute, against the same stat's rank average. */
const perMinute = (
  id: PerformanceMetricId,
  label: string,
  stat: MetricId,
  own: (totals: PlayerTotals) => number,
): PerformanceMetric => ({
  id,
  label,
  needsTotals: true,
  percent: false,
  value: (game, totals) =>
    totals && game.durationS > 0
      ? { num: own(totals.own), den: minutes(game) }
      : null,
  average: (game, values) =>
    values[stat] !== undefined && game.durationS > 0
      ? { num: values[stat], den: minutes(game) }
      : null,
});

/** A share of the team's total; there is no rank average for it. */
const share = (
  id: PerformanceMetricId,
  label: string,
  of: (totals: GameTotals) => Fraction,
): PerformanceMetric => ({
  id,
  label,
  needsTotals: true,
  percent: true,
  value: (_, totals) => {
    if (!totals) return null;
    const { num, den } = of(totals);
    return den > 0 ? { num: Math.min(num, den), den } : null;
  },
});

export const PERFORMANCE_METRICS: PerformanceMetric[] = [
  {
    id: "soulsPerMin",
    label: "Souls / min",
    needsTotals: false,
    percent: false,
    value: (game) =>
      game.durationS > 0 ? { num: game.netWorth, den: minutes(game) } : null,
    average: (game, values) =>
      values.souls !== undefined && game.durationS > 0
        ? { num: values.souls, den: minutes(game) }
        : null,
  },
  {
    id: "kda",
    label: "K/D/A ratio",
    needsTotals: false,
    percent: false,
    minDenominator: 1,
    value: (game) => ({ num: game.kills + game.assists, den: game.deaths }),
    average: (_, { kills, deaths, assists }) =>
      kills === undefined || deaths === undefined || assists === undefined
        ? null
        : { num: kills + assists, den: deaths },
  },
  perMinute(
    "heroDamagePerMin",
    "Hero damage / min",
    "heroDamage",
    (t) => t.heroDamage,
  ),
  perMinute(
    "objectiveDamagePerMin",
    "Objective damage / min",
    "objectiveDamage",
    (t) => t.objectiveDamage,
  ),
  perMinute("healingPerMin", "Healing / min", "healing", (t) => t.healing),
  perMinute(
    "creepKillsPerMin",
    "Creep kills / min",
    "creepKills",
    (t) => t.creepKills,
  ),
  share("killParticipation", "Kill participation", (t) => ({
    num: t.own.kills + t.own.assists,
    den: t.teamKills,
  })),
  share("damageShare", "Hero damage share", (t) => ({
    num: t.own.heroDamage,
    den: t.teamHeroDamage,
  })),
];

export interface GamePoint {
  matchId: number;
  heroId: number;
  startTime: number;
  won: boolean;
  // Null when the game has no value (no totals yet) or no rank average.
  value: number | null;
  average: number | null;
}

export type Trend = "improving" | "flat" | "slipping";

export interface MetricSummary {
  metric: PerformanceMetric;
  // One per game in range, oldest first.
  points: GamePoint[];
  // Over the games with a value.
  value: number | null;
  games: number;
  // The rank average, and the player's value, over the games that have
  // both; the same games as `value` unless some have no rank average.
  average: number | null;
  comparedValue: number | null;
  compared: number;
  // Null with fewer than MIN_TREND_GAMES games to compare.
  trend: Trend | null;
}

const ratio = (parts: Fraction[], minDenominator = 0) => {
  if (!parts.length) return null;
  const den = Math.max(
    minDenominator,
    parts.reduce((sum, part) => sum + part.den, 0),
  );
  return den > 0 ? parts.reduce((sum, part) => sum + part.num, 0) / den : null;
};

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const variance = (values: number[]) => {
  const m = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - m) ** 2, 0) /
    Math.max(1, values.length - 1)
  );
};

// Two-sided 95% critical values of Student's t by degrees of freedom,
// most first; between rows, the row below (the stricter value).
const T_95: [number, number][] = [
  [120, 1.98],
  [60, 2.0],
  [40, 2.02],
  [30, 2.04],
  [20, 2.09],
  [15, 2.13],
  [12, 2.18],
  [10, 2.23],
  [9, 2.26],
  [8, 2.31],
  [7, 2.36],
  [6, 2.45],
  [5, 2.57],
  [4, 2.78],
  [3, 3.18],
  [2, 4.3],
  [1, 12.71],
];
export const criticalT = (df: number) =>
  T_95.find(([rows]) => rows <= df)?.[1] ?? T_95.at(-1)![1];

/**
 * Compares the recent half of the games with the earlier half (the middle
 * game goes to the earlier half) with Welch's t-test: improving or slipping
 * only when the halves differ at the 95% level, otherwise flat.
 */
export function trend(values: number[]): Trend | null {
  if (values.length < MIN_TREND_GAMES) return null;
  const split = Math.ceil(values.length / 2);
  const earlier = values.slice(0, split);
  const recent = values.slice(split);
  const diff = mean(recent) - mean(earlier);
  const a = variance(earlier) / earlier.length;
  const b = variance(recent) / recent.length;
  // Without any spread, every change is a sure one.
  const t = a + b > 0 ? Math.abs(diff) / Math.sqrt(a + b) : diff ? Infinity : 0;
  const df =
    a + b > 0
      ? (a + b) ** 2 /
        (a ** 2 / (earlier.length - 1) + b ** 2 / (recent.length - 1))
      : Infinity;
  if (t < criticalT(df)) return "flat";
  return diff > 0 ? "improving" : "slipping";
}

/**
 * One metric over the games in range. The trend follows each game against
 * its rank average when the metric has one, so changing hero or rank
 * doesn't read as a change in form; otherwise the values themselves.
 */
export function summarizeMetric(
  metric: PerformanceMetric,
  games: HistoryMatch[],
  totals: (matchId: number) => GameTotals | undefined,
  averages: (matchId: number) => GameAverage | undefined,
): MetricSummary {
  const floor = metric.minDenominator ?? 0;
  const divide = (part: Fraction) => part.num / Math.max(floor, part.den);
  const rows = games.map((game) => {
    const value = metric.value(game, totals(game.matchId));
    const values = averages(game.matchId)?.values;
    const average = value && values && metric.average?.(game, values);
    return { game, value, average: average || null };
  });
  const valued = rows.filter((row) => row.value);
  const compared = valued.filter((row) => row.average);
  const samples = metric.average
    ? compared.flatMap(({ value, average }) => {
        const avg = divide(average!);
        return avg > 0 ? [divide(value!) / avg] : [];
      })
    : valued.map(({ value }) => divide(value!));
  return {
    metric,
    points: rows.map(({ game, value, average }) => ({
      matchId: game.matchId,
      heroId: game.heroId,
      startTime: game.startTime,
      won: isWin(game),
      value: value ? divide(value) : null,
      average: average ? divide(average) : null,
    })),
    value: ratio(
      valued.map((row) => row.value!),
      floor,
    ),
    games: valued.length,
    average: ratio(
      compared.map((row) => row.average!),
      floor,
    ),
    comparedValue: ratio(
      compared.map((row) => row.value!),
      floor,
    ),
    compared: compared.length,
    trend: trend(samples),
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/performance-metrics.test.ts`
Expected: PASS (24 tests). `npm test`: 363 tests.

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile/utils/performance-metrics.ts tests/profile/performance-metrics.test.ts
git add src/features/profile/utils/performance-metrics.ts tests/profile/performance-metrics.test.ts
git commit -m "feat(profile): performance metrics, rank averages and trends"
```

---
### Task 4: Fetching totals and rank averages

**Files:**
- Create: `src/features/profile/services/performance-api.ts`
- Test: `tests/profile/performance-api.test.ts`

**`fetchMatchTotals(matchIds)`:**
- **Cache:** a promise per match id, kept in a `WeakMap` per `DeadlockApi` client, so tests with their own fake client start empty.
- **Requests:** only missing ids are asked for, in batches of `TOTALS_BATCH`.
- **Retries:** a game missing from the response, or a failed request, drops out of the cache so the next call asks again. The client keeps each bulk response for `TTL.history` (2 minutes, the same as match history), so a game the API stores later appears within two minutes (Task 4 review: with `TTL.analytics` the client's path cache answered such a retry from a stale empty response for 10 minutes).

**`fetchGameAverages(accountId, games)`:**
- **Current rank:** asked for only when a game has no badge.
- **Curves:** each game calls phase 3's `fetchRankCurve`. The client's path cache and in-flight sharing mean one request per hero and band. A test with a real `DeadlockApi` checks this.
- **Failures:** a failed current-rank lookup falls back to all ranks; a failed curve rejects the whole call, so the tab shows one "Rank averages unavailable" notice with Retry (successful curves stay cached).

- [ ] **Step 1: Write the failing tests**

`tests/profile/performance-api.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
import {
  fetchGameAverages,
  fetchMatchTotals,
} from "@/features/profile/services/performance-api";
import type { HistoryMatch } from "@/features/profile/types";
import { totalsPath } from "@/features/profile/utils/match-totals";
import { DeadlockApi, TTL } from "@/shared/api/DeadlockApi";
import { rankCurveRows } from "../fixtures/match-report";
import { bulkMatch } from "../fixtures/performance";

/** Answers bulk metadata for the ids asked, minus `unstored`; records each path. */
function bulkApi(unstored: number[] = [], fail = false) {
  const calls: string[] = [];
  const api = {
    get: async (path: string) => {
      calls.push(path);
      if (fail) throw new Error("API busy. Retry after the cooldown.");
      const ids = new URL(path, "https://x").searchParams
        .get("match_ids")!
        .split(",")
        .map(Number);
      return ids
        .filter((id) => !unstored.includes(id))
        .map((id) => bulkMatch(id, 77));
    },
  } as unknown as DeadlockApi;
  return { api, calls };
}

/** A real client whose fetch answers bulk metadata for `stored` matches only. */
function realBulkApi(stored: number[], now: () => number) {
  const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const ids = new URL(String(url)).searchParams
      .get("match_ids")!
      .split(",")
      .map(Number);
    return new Response(
      JSON.stringify(
        ids.filter((id) => stored.includes(id)).map((id) => bulkMatch(id, 77)),
      ),
    );
  });
  return { api: new DeadlockApi(request, now), request };
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("fetchMatchTotals", () => {
  it("asks in batches of 50", async () => {
    const { api, calls } = bulkApi();
    const totals = await fetchMatchTotals(range(1, 120), api);
    expect(calls).toEqual([
      totalsPath(range(1, 50)),
      totalsPath(range(51, 100)),
      totalsPath(range(101, 120)),
    ]);
    expect(totals.size).toBe(120);
    expect(totals.get(7)![0].accountId).toBe(77);
  });

  it("only asks for games it doesn't have yet", async () => {
    const { api, calls } = bulkApi();
    await fetchMatchTotals(range(1, 20), api);
    const totals = await fetchMatchTotals(range(1, 30), api);
    expect(calls).toEqual([
      totalsPath(range(1, 20)),
      totalsPath(range(21, 30)),
    ]);
    expect(totals.size).toBe(30);
  });

  it("shares a request still in flight", async () => {
    const { api, calls } = bulkApi();
    await Promise.all([
      fetchMatchTotals([1, 2], api),
      fetchMatchTotals([2, 1], api),
    ]);
    expect(calls).toHaveLength(1);
  });

  it("leaves out games the API hasn't stored and asks again next time", async () => {
    const { api, calls } = bulkApi([2]);
    const totals = await fetchMatchTotals([1, 2], api);
    expect([...totals.keys()]).toEqual([1]);
    await fetchMatchTotals([1, 2], api);
    expect(calls).toEqual([totalsPath([1, 2]), totalsPath([2])]);
  });

  it("fails as a whole, and asks again after a failure", async () => {
    const failing = bulkApi([], true);
    await expect(fetchMatchTotals([1, 2], failing.api)).rejects.toThrow(
      "API busy",
    );
    await expect(fetchMatchTotals([1, 2], failing.api)).rejects.toThrow();
    expect(failing.calls).toHaveLength(2);
  });

  it("sees a newly stored game once the client's answer is two minutes old", async () => {
    let now = 0;
    const stored = [1];
    const { api, request } = realBulkApi(stored, () => now);
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(1);
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(1);
    stored.push(2);
    now += 60_000;
    // The client still holds the empty answer for game 2.
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(1);
    now += TTL.history;
    expect((await fetchMatchTotals([1, 2], api)).size).toBe(2);
    expect(
      request.mock.calls.map(([url]) =>
        new URL(String(url)).searchParams.get("match_ids"),
      ),
    ).toEqual(["1,2", "2", "2"]);
  });
});

describe("fetchGameAverages", () => {
  const game = (overrides: Partial<HistoryMatch>): HistoryMatch => ({
    matchId: 1,
    heroId: 6,
    startTime: 100,
    gameMode: 1,
    matchMode: 4,
    team: 0,
    result: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    netWorth: 0,
    lastHits: 0,
    denies: 0,
    durationS: 1800,
    heroLevel: 1,
    badge: 73,
    ...overrides,
  });

  /**
   * Curves for any hero and band (or a failure); the player's current rank
   * is `badge`, none, or a failure.
   */
  function curveApi(badge: number | null | Error, failCurves = false) {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        if (path.startsWith("/v1/players/rank")) {
          if (badge instanceof Error) throw badge;
          return badge === null
            ? []
            : [
                {
                  account_id: 77,
                  badge,
                  rank: Math.floor(badge / 10),
                  subrank: badge % 10,
                },
              ];
        }
        if (failCurves) throw new Error("Deadlock API unavailable (500).");
        return rankCurveRows();
      },
    } as unknown as DeadlockApi;
    return { api, calls };
  }

  it("shares one curve request per hero and rank between games", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify(rankCurveRows())),
      );
    const averages = await fetchGameAverages(
      77,
      [
        game({ matchId: 1 }),
        game({ matchId: 2, durationS: 1500 }),
        game({ matchId: 3, heroId: 7 }),
      ],
      new DeadlockApi(request),
    );
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      `https://api.deadlock-api.com${curvePath(6, rankBand(73))}`,
      `https://api.deadlock-api.com${curvePath(7, rankBand(73))}`,
    ]);
    expect(averages.get(1)!.values.souls).toBe(30000);
    expect(averages.get(2)!.values.souls).toBe(25000);
    expect(averages.get(3)!.source).toBe("game");
  });

  it("uses the current rank for games that recorded none", async () => {
    const { api, calls } = curveApi(116);
    const averages = await fetchGameAverages(
      77,
      [game({ matchId: 1, badge: 0, matchMode: 1 })],
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(116)));
    expect(averages.get(1)!.source).toBe("current");
    expect(averages.get(1)!.band.label).toBe("Eternus");
  });

  it("falls back to all ranks without a current rank", async () => {
    const { api, calls } = curveApi(null);
    const averages = await fetchGameAverages(
      77,
      [game({ matchId: 1, badge: 0 })],
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.get(1)!.source).toBe("none");
  });

  it("falls back to all ranks when the current rank fails to load", async () => {
    const { api, calls } = curveApi(new Error("Deadlock API timed out."));
    const averages = await fetchGameAverages(
      77,
      [game({ matchId: 1, badge: 0 })],
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.get(1)!.source).toBe("none");
  });

  it("fails as a whole when a curve fails, so the tab can offer Retry", async () => {
    const { api } = curveApi(116, true);
    await expect(
      fetchGameAverages(77, [game({ matchId: 1 })], api),
    ).rejects.toThrow("Deadlock API unavailable (500).");
  });

  it("doesn't ask for the current rank when every game has one", async () => {
    const { api, calls } = curveApi(116);
    await fetchGameAverages(77, [game({ matchId: 1 })], api);
    expect(calls.some((path) => path.startsWith("/v1/players/rank"))).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/performance-api.test.ts`
Expected: FAIL, because `@/features/profile/services/performance-api` doesn't exist.

- [ ] **Step 3: Write the service**

`src/features/profile/services/performance-api.ts`:

```ts
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HistoryMatch } from "../types";
import {
  TOTALS_BATCH,
  parseMatchTotals,
  totalsPath,
  type PlayerTotals,
} from "../utils/match-totals";
import { gameAverage, type GameAverage } from "../utils/performance-metrics";
import { fetchRank } from "./profile-api";

// Kept per match and per client (tests bring their own), so a wider range
// only asks for the games it adds.
type Entries = Map<number, Promise<PlayerTotals[] | undefined>>;
const totalsCache = new WeakMap<DeadlockApi, Entries>();

/**
 * Every player's final totals for each match, by match id, from bulk match
 * metadata in batches of TOTALS_BATCH. A match the API hasn't stored yet is
 * missing from the result and asked for again next time; the client keeps
 * each response for TTL.history (two minutes, as match history), so a game
 * just played appears soon after the API stores it.
 */
export async function fetchMatchTotals(
  matchIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, PlayerTotals[]>> {
  const known: Entries = totalsCache.get(api) ?? new Map();
  totalsCache.set(api, known);
  const missing = [...new Set(matchIds)].filter((id) => !known.has(id));
  for (let start = 0; start < missing.length; start += TOTALS_BATCH) {
    const batch = missing.slice(start, start + TOTALS_BATCH);
    const request = api
      .get<unknown>(totalsPath(batch), TTL.history)
      .then(parseMatchTotals);
    for (const id of batch) {
      const entry = request.then((matches) => matches.get(id));
      known.set(id, entry);
      // Not stored yet, or the request failed: ask again next time.
      const forget = () => {
        if (known.get(id) === entry) known.delete(id);
      };
      entry.then((players) => {
        if (!players) forget();
      }, forget);
    }
  }
  const entries = await Promise.all(
    matchIds.map(async (id) => [id, await known.get(id)] as const),
  );
  return new Map(
    entries.filter((entry): entry is [number, PlayerTotals[]] => !!entry[1]),
  );
}

/**
 * Each game's rank averages by match id: the hero's curve for the game's
 * rank, or the player's current rank when the game recorded none. Games
 * share curve requests through the client's cache.
 */
export async function fetchGameAverages(
  accountId: number,
  games: HistoryMatch[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, GameAverage>> {
  const current = games.some((game) => !game.badge)
    ? ((await fetchRank(accountId, api).catch(() => null))?.badge ?? 0)
    : 0;
  const averages = await Promise.all(
    games.map(async (game) => {
      const badge = game.badge || current;
      const curve = await fetchRankCurve(
        game.heroId,
        badge,
        game.durationS,
        api,
      );
      const source = game.badge ? "game" : badge ? "current" : "none";
      return [
        game.matchId,
        gameAverage(curve, game.durationS, source),
      ] as const;
    }),
  );
  return new Map(averages);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/performance-api.test.ts`
Expected: PASS (12 tests). `npm test`: 375 tests.

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile/services/performance-api.ts tests/profile/performance-api.test.ts
git add src/features/profile/services/performance-api.ts tests/profile/performance-api.test.ts
git commit -m "feat(profile): fetch match totals and rank averages for a range of games"
```

---
### Task 5: Sparkline drawn at its real width

**Files:**
- Create: `src/shared/ui/useElementWidth.ts`
- Create: `src/features/profile/components/Sparkline.tsx`
- Modify: `src/features/match-report/components/ReportGraph.tsx`
- Test: `tests/profile/sparkline.test.ts`

**The width hook:** the Graph measures its chart with a `ResizeObserver`. That code moves into a shared hook, which the sparkline uses too. The Graph's behaviour is unchanged; its browser tests cover it.

**The sparkline:**
- **Size:** the measured width, 80 px tall.
- **Lines:** a gold value line and a dashed rank-average line, both broken at games without a value. The exported `linePath()` builds them; a value with no neighbour gets a 4 px tick centred on it (one dash of the dashed average), so a lone game's average still shows (Task 5 review).
- **Dots:** one per game with a value, filled by win or loss, each with a `<title>` tooltip. The radius shrinks with the spacing (3 px down to 1.25 px), so the gold line stays readable at Last 50 and Last 100, where points sit 2–5 px apart (Task 5 review).

Nothing renders the sparkline until Task 6.

- [ ] **Step 1: Write the hook**

`src/shared/ui/useElementWidth.ts`:

```ts
import { useLayoutEffect, useState, type RefObject } from "react";

/** The element's width in whole pixels, updated as it resizes; 0 until measured. */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(Math.round(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
```

- [ ] **Step 2: Use it in the Graph**

In `src/features/match-report/components/ReportGraph.tsx`:
- Change the first import to `import { useRef, useState } from "react";`.
- After the `Picture` import, add `import { useElementWidth } from "@/shared/ui/useElementWidth";`.
- Replace:

```ts
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const measure = () => setWidth(Math.round(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
```

with:

```ts
  const width = useElementWidth(chartRef);
```

- [ ] **Step 3: Write the sparkline**

`src/features/profile/components/Sparkline.tsx`:

```tsx
import { useRef } from "react";
import { useElementWidth } from "@/shared/ui/useElementWidth";
import type { GamePoint } from "../utils/performance-metrics";

const HEIGHT = 80;
const PAD_X = 6;
const PAD_Y = 8;

/**
 * A path through the values, broken at games without one. A value with no
 * neighbour on either side gets a 4 px tick centred on it (one dash of the
 * dashed average), so it still shows.
 */
export function linePath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
) {
  return values
    .map((value, index) => {
      if (value === null) return "";
      const before = values[index - 1] ?? null;
      const after = values[index + 1] ?? null;
      if (before === null && after === null)
        return `M${(x(index) - 2).toFixed(1)},${y(value).toFixed(1)}h4`;
      return `${before === null ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    })
    .join("");
}

/**
 * One point per game, oldest on the left: the player's line with a win or
 * loss dot per game, and the dashed rank average. Drawn at its real width.
 */
export function Sparkline({
  points,
  label,
  title,
}: {
  points: GamePoint[];
  label: string;
  title(point: GamePoint): string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const values = points.flatMap((p) =>
    [p.value, p.average].filter((v): v is number => v !== null),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : PAD_X + (index * (width - 2 * PAD_X)) / (points.length - 1);
  const y = (value: number) =>
    max === min
      ? HEIGHT / 2
      : PAD_Y + ((max - value) * (HEIGHT - 2 * PAD_Y)) / (max - min);
  // Dots shrink as games crowd together, so the line stays visible.
  const step =
    points.length > 1 ? (width - 2 * PAD_X) / (points.length - 1) : width;
  const radius = Math.min(3, Math.max(1.25, step * 0.4));
  return (
    <div className="sparkline" ref={box}>
      {width > 0 && values.length > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label}>
          <path
            className="spark-average"
            d={linePath(
              points.map((p) => p.average),
              x,
              y,
            )}
          />
          <path
            className="spark-value"
            d={linePath(
              points.map((p) => p.value),
              x,
              y,
            )}
          />
          {points.map((p, index) =>
            p.value === null ? null : (
              <circle
                key={p.matchId}
                className={p.won ? "win" : "loss"}
                cx={x(index)}
                cy={y(p.value)}
                r={radius}
              >
                <title>{title(p)}</title>
              </circle>
            ),
          )}
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Test the path builder**

`tests/profile/sparkline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linePath } from "@/features/profile/components/Sparkline";

const x = (index: number) => index * 10;
const y = (value: number) => value;

describe("linePath", () => {
  it("joins consecutive values", () => {
    expect(linePath([1, 2, 3], x, y)).toBe("M0.0,1.0L10.0,2.0L20.0,3.0");
    // Zero is a value, not a missing game.
    expect(linePath([0, 0], x, y)).toBe("M0.0,0.0L10.0,0.0");
  });

  it("breaks at games without a value", () => {
    expect(linePath([1, 2, null, 4, 5], x, y)).toBe(
      "M0.0,1.0L10.0,2.0M30.0,4.0L40.0,5.0",
    );
  });

  it("draws a short tick for a value with no neighbour", () => {
    expect(linePath([null, 2, null], x, y)).toBe("M8.0,2.0h4");
    expect(linePath([7], x, y)).toBe("M-2.0,7.0h4");
    expect(linePath([1, null, 3], x, y)).toBe("M-2.0,1.0h4M18.0,3.0h4");
  });

  it("is empty without values", () => {
    expect(linePath([null, null], x, y)).toBe("");
  });
});
```

- [ ] **Step 5: Check that nothing broke**

Run: `npx tsc --noEmit && npm test && npx playwright test tests/browser/match-report.spec.ts`
Expected: PASS. 379 unit tests (4 new), and every match report browser test (the Graph still sizes and redraws).

- [ ] **Step 6: Check and commit**

```bash
npm run web:typecheck
npx prettier --write src/shared/ui/useElementWidth.ts src/features/profile/components/Sparkline.tsx src/features/match-report/components/ReportGraph.tsx tests/profile/sparkline.test.ts
git add src/shared/ui/useElementWidth.ts src/features/profile/components/Sparkline.tsx src/features/match-report/components/ReportGraph.tsx tests/profile/sparkline.test.ts
git commit -m "feat(profile): sparkline drawn at its real width"
```

---
### Task 6: The Performance tab

**Files:**
- Modify (replace): `src/features/profile/components/PerformanceTab.tsx`
- Modify: `src/features/profile/styles/profile.css`
- Modify: `web/app/styles/phone.css`
- Test: `tests/browser/home.spec.ts`, `tests/web-browser/fixtures.ts`, `tests/web-browser/mobile.spec.ts`

The tab keeps its props (`accountId`, `history`), so `ProfileView` doesn't change.

**Its parts:**
- **Requests:** two `useAsync` requests keyed on the game ids in range, one for totals and one for averages.
- **Cards:** eight `PerformanceCard`s.
- **Errors:** a notice with Retry for each failed request.
- **Notes:** chosen from the loaded data.

**What the desktop tests use:** the history has 60 normal and ranked games alternating two heroes, with every third game lost. The newest ten earn 1,200 souls a minute and the rest 1,000. So Last 20 reads "1,100 · rank avg 1,000 · ▲ Improving", and the other cards come out at:
- K/D/A 3.4 against 2.7;
- hero damage 1,000 against 500;
- kill participation 57%;
- damage share 29%.

The rows have no `ranked_display_badge`, so the current-rank note shows.

- [ ] **Step 1: Write the failing desktop tests**

In `tests/browser/home.spec.ts`:
- Replace the import `import { matchMetadata } from "../fixtures/match-report";` with:

```ts
import { matchMetadata, rankCurveRows } from "../fixtures/match-report";
import { bulkMetadata } from "../fixtures/performance";
```

- In `interface Fixtures`, after `heroStats?: unknown[];`, add:

```ts
  failTotals?: boolean;
  failCurve?: boolean;
```

- In `routeApi`, put these lines **before** `if (url.pathname.endsWith("/metadata"))`. Bulk metadata's path also ends in `/metadata`.

```ts
    if (url.pathname === "/v1/matches/metadata")
      return fixtures.failTotals
        ? json({}, 500)
        : json(bulkMetadata(url, ACCOUNT));
    if (url.pathname === "/v1/analytics/player-performance-curve")
      return fixtures.failCurve ? json({}, 500) : json(rankCurveRows());
```

- Replace a whole block: it starts at the comment `// 60 summary games, newest first; every third one is lost. The newest ten
// earn 1,200 souls a minute, the rest 1,000. Street Brawl, bot and
// private-lobby games sit between them and must stay out of the cards.
const performanceHistory = [
  ...Array.from({ length: 60 }, (_, index) => ({
    ...historyRow(
      3000 + index,
      heroes[index % 2],
      1,
      index % 2 ? 4 : 1,
      index % 3 !== 0,
      now - 3600 * (index + 1),
    ),
    net_worth: index < 10 ? 36000 : 30000,
  })),
  historyRow(3100, heroes[2], 4, 1, true, now - 60),
  historyRow(3101, heroes[3], 2, 3, true, now - 120),
];

const card = (page: Page, label: string) =>
  view(page).getByRole("region", { name: label, exact: true });
const dots = (page: Page, label: string) => card(page, label).locator("circle");

test("performance tab compares each metric with the rank average", async ({
  page,
}) => {
  const bulk: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/matches/metadata")
      bulk.push(url.searchParams.get("match_ids")!);
  });
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();

  await expect(view(page).locator(".perf-card h3")).toHaveText([
    "Souls / min",
    "K/D/A ratio",
    "Hero damage / min",
    "Objective damage / min",
    "Healing / min",
    "Creep kills / min",
    "Kill participation",
    "Hero damage share",
  ]);
  // Last 20: ten games at 1,000 souls a minute, then ten at 1,200.
  const souls = card(page, "Souls / min");
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "1,10020 games · rank avg 1,000",
  );
  await expect(souls.locator(".perf-trend")).toHaveText("▲ Improving");
  await expect(
    card(page, "K/D/A ratio").locator(".perf-card-numbers"),
  ).toHaveText("3.420 games · rank avg 2.7");
  await expect(card(page, "K/D/A ratio").locator(".perf-trend")).toHaveText(
    "– Flat",
  );
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("1,00020 games · rank avg 500");
  await expect(
    card(page, "Kill participation").locator(".perf-card-numbers"),
  ).toHaveText("57%20 games · no rank average");
  await expect(
    card(page, "Hero damage share").locator(".perf-card-numbers"),
  ).toHaveText("29%20 games · no rank average");

  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
    card(page, "Souls / min").locator(".spark-average"),
  ).toHaveAttribute("d", /^M[^M]+$/);
  // Oldest on the left: index 19 is a win (19 % 3 ≠ 0), the newest a loss.
  await expect(dots(page, "Souls / min").first()).toHaveCSS(
    "fill",
    "rgb(127, 211, 154)",
  );
  await expect(dots(page, "Souls / min").last()).toHaveCSS(
    "fill",
    "rgb(224, 122, 95)",
  );
  await expect(
    view(page).getByText(
      "Games without a recorded rank use the player's current rank.",
    ),
  ).toBeVisible();
  expect(bulk.map((ids) => ids.split(",").length)).toEqual([20]);

  // Last 50 asks only for the 30 games it adds.
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect(dots(page, "Hero damage / min")).toHaveCount(50);
  expect(bulk.map((ids) => ids.split(",").length)).toEqual([20, 30]);
  await page.getByRole("button", { name: "Last 100", exact: true }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(60);

  // One hero: its 30 games, the newest 20 of them.
  await page
    .getByRole("combobox", { name: "Hero" })
    .selectOption({ label: `${heroName(heroes[1])} · 30 games` });
  await page.getByRole("button", { name: "Last 20", exact: true }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(souls.locator(".perf-card-numbers")).toContainText("20 games");
});

test("performance tab says so with too few games", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
    history: [historyRow(1, heroes[0], 1, 4, true, now)],
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toContainText("1 game · rank avg 1,000");
  await expect(view(page).locator(".perf-trend")).toHaveText(
    Array(8).fill("Too few games"),
  );
  await expect(dots(page, "Souls / min")).toHaveCount(1);
  await expect(view(page).getByRole("combobox", { name: "Hero" })).toHaveCount(
    0,
  );
});

test("performance tab compares like with like when a game outlasts the rank average", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, {
    history: [
      historyRow(1, heroes[0], 1, 4, true, now - 7200),
      {
        ...historyRow(2, heroes[0], 1, 4, false, now - 3600),
        match_duration_s: 3000,
      },
    ],
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  // The fixture's average stops at 40:00, so only the 30-minute game has
  // one: 60,000 souls over 80 minutes overall, 1,000 a minute in that game.
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("7502 games · 1 with a rank average: 1,000 vs 1,000");
});

test("performance tab keeps history values when details and averages fail", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    failTotals: true,
    failCurve: true,
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByText(
      /^Match details unavailable: Deadlock API unavailable \(500\)\./,
    ),
  ).toBeVisible();
  await expect(
    view(page).getByText(
      /^Rank averages unavailable: Deadlock API unavailable \(500\)\./,
    ),
  ).toBeVisible();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("1,10020 games");
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("—No match details");
  await expect(card(page, "Hero damage / min").locator("svg")).toHaveCount(0);
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
});

test("performance tab degrades without match history", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403 });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(view(page).getByText("Match history unavailable")).toBeVisible();
  await expect(view(page).locator(".perf-card")).toHaveCount(0);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/home.spec.ts -g "performance"`
Expected: FAIL, because there are no `.perf-card` regions yet.

- [ ] **Step 3: Write the tab**

Replace `src/features/profile/components/PerformanceTab.tsx` with:

```tsx
import { useState } from "react";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
  fetchGameAverages,
  fetchMatchTotals,
} from "../services/performance-api";
import type { HistoryMatch } from "../types";
import { timeAgo } from "../utils/format";
import type { PlayerTotals } from "../utils/match-totals";
import {
  PERFORMANCE_METRICS,
  RANGES,
  gameTotals,
  gamesInRange,
  heroChoices,
  summarizeMetric,
  type GameAverage,
  type GamePoint,
  type MetricSummary,
  type PerformanceMetric,
  type PerformanceRange,
} from "../utils/performance-metrics";
import { Sparkline } from "./Sparkline";

const heroName = (heroId: number) =>
  heroById.get(heroId)?.name ?? `Hero ${heroId}`;

const count = (games: number) => `${games} ${games === 1 ? "game" : "games"}`;

const format = (metric: PerformanceMetric, value: number) =>
  metric.percent
    ? `${Math.round(value * 100)}%`
    : value >= 100
      ? Math.round(value).toLocaleString("en-US")
      : value.toFixed(1);

const TRENDS = {
  improving: "▲ Improving",
  flat: "– Flat",
  slipping: "▼ Slipping",
};

function PerformanceCard({
  summary,
  totals,
  averages,
}: {
  summary: MetricSummary;
  totals: AsyncState<unknown>;
  averages: AsyncState<unknown>;
}) {
  const { metric, value, games, average, comparedValue, compared, trend } =
    summary;
  // What the card still waits for, or lacks because a request failed.
  const waiting =
    (metric.needsTotals && totals.loading) ||
    (!!metric.average && averages.loading);
  const failed =
    (metric.needsTotals && !!totals.error) ||
    (!!metric.average && !!averages.error);
  const detail =
    metric.needsTotals && totals.loading
      ? "Loading match details…"
      : !games
        ? "No match details"
        : count(games) +
          (!metric.average
            ? " · no rank average"
            : averages.loading
              ? " · loading rank average…"
              : average === null
                ? averages.error
                  ? ""
                  : " · no rank average for these games"
                : compared < games
                  ? // Like with like: the player over the same games.
                    ` · ${compared} with a rank average: ${format(metric, comparedValue!)} vs ${format(metric, average)}`
                  : ` · rank avg ${format(metric, average)}`);
  const title = (p: GamePoint) =>
    `${heroName(p.heroId)} · ${p.won ? "Win" : "Loss"} · ${timeAgo(p.startTime * 1000)}: ` +
    format(metric, p.value!) +
    (p.average === null ? "" : ` (rank avg ${format(metric, p.average)})`);
  return (
    <section className="perf-card" aria-label={metric.label}>
      <div className="perf-card-head">
        <h3>{metric.label}</h3>
        {trend ? (
          <span className={`perf-trend ${trend}`}>{TRENDS[trend]}</span>
        ) : (
          !waiting &&
          !failed &&
          games > 0 && <span className="perf-trend">Too few games</span>
        )}
      </div>
      <div className="perf-card-numbers">
        <b>{value === null ? "—" : format(metric, value)}</b>
        <span>{detail}</span>
      </div>
      {games > 0 && (
        <Sparkline
          points={summary.points}
          label={`${metric.label}, game by game`}
          title={title}
        />
      )}
    </section>
  );
}

/** The one-line notes on how the numbers are made, as they apply. */
function notes(
  games: HistoryMatch[],
  totals: Map<number, PlayerTotals[]> | undefined,
  averages: Map<number, GameAverage> | undefined,
) {
  const lines = [
    "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days.",
    "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat.",
    "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and hero damage share have no rank average.",
  ];
  const sources = new Set([...(averages?.values() ?? [])].map((a) => a.source));
  if (sources.has("current"))
    lines.push("Games without a recorded rank use the player's current rank.");
  if (sources.has("none"))
    lines.push(
      "Games without a recorded rank are compared with all ranks: the player's current rank is unknown.",
    );
  if ([...(averages?.values() ?? [])].some((a) => a.widenedFrom))
    lines.push(
      "Where a hero has too few games at one rank, its average covers the ranks either side.",
    );
  const missing = totals
    ? games.filter((g) => !totals.has(g.matchId)).length
    : 0;
  if (missing)
    lines.push(
      `${missing} of ${games.length} games have no match details yet, so they're missing from damage, healing, creep kills and shares.`,
    );
  return lines;
}

export function PerformanceTab({
  accountId,
  history,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
}) {
  const [range, setRange] = useState<PerformanceRange>(20);
  const [heroId, setHeroId] = useState<number | null>(null);
  const matches = history.data ?? [];
  const heroes = heroChoices(matches);
  const games = gamesInRange(matches, range, heroId);
  const key = games.map((g) => g.matchId).join(",");
  const totals = useAsync(
    games.length ? () => fetchMatchTotals(games.map((g) => g.matchId)) : null,
    [key],
  );
  const averages = useAsync(
    games.length ? () => fetchGameAverages(accountId, games) : null,
    [accountId, key],
  );
  const summaries = PERFORMANCE_METRICS.map((metric) =>
    summarizeMetric(
      metric,
      games,
      (id) => gameTotals(totals.data?.get(id), accountId),
      (id) => averages.data?.get(id),
    ),
  );
  return (
    <div className="performance">
      <SectionHeader title="Performance" />
      <div className="section-head">
        <div className="filter-buttons" role="group" aria-label="Range">
          {RANGES.map((value) => (
            <button
              key={value}
              className={range === value ? "active" : ""}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              Last {value}
            </button>
          ))}
        </div>
        {heroes.length > 1 && (
          <label className="select-field">
            Hero
            <select
              value={heroId ?? ""}
              onChange={(event) =>
                setHeroId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">All heroes</option>
              {heroes.map((hero) => (
                <option key={hero.heroId} value={hero.heroId}>
                  {heroName(hero.heroId)} · {count(hero.games)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {history.loading && <p className="muted">Loading match history…</p>}
      {history.error && (
        <p className="notice warning" role="status">
          Match history unavailable
          <button type="button" onClick={history.retry}>
            Retry
          </button>
        </p>
      )}
      {history.data && !games.length && (
        <p className="muted">No recorded normal or ranked matches</p>
      )}
      {!!games.length && (
        <>
          <div className="performance-legend" aria-hidden="true">
            <span>
              <i className="value" />
              Game by game
            </span>
            <span>
              <i className="average" />
              Average for that hero at that rank
            </span>
            <span>
              <i className="win" />
              Win
            </span>
            <span>
              <i className="loss" />
              Loss
            </span>
          </div>
          <div className="perf-cards">
            {summaries.map((summary) => (
              <PerformanceCard
                key={summary.metric.id}
                {...{ summary, totals, averages }}
              />
            ))}
          </div>
          {totals.error && (
            <p className="notice warning" role="status">
              Match details unavailable: {totals.error}
              <button type="button" onClick={totals.retry}>
                Retry
              </button>
            </p>
          )}
          {averages.error && (
            <p className="notice warning" role="status">
              Rank averages unavailable: {averages.error}
              <button type="button" onClick={averages.retry}>
                Retry
              </button>
            </p>
          )}
          {notes(games, totals.data, averages.data).map((line) => (
            <p key={line} className="data-note">
              {line}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Styles**

In `src/features/profile/styles/profile.css`, replace everything from `.performance {` to the end of the file. That covers `.performance`, `.chart-card`, `.line-chart` and the form squares. The new rules:

```css
.performance {
  display: grid;
  gap: 12px;
}
.performance .section-head {
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 0;
}
.performance .data-note {
  margin: 0;
}
.performance-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12px;
  color: var(--muted);
}
.performance-legend i {
  display: inline-block;
  width: 18px;
  height: 3px;
  margin-right: 6px;
  vertical-align: middle;
  background: var(--gold);
}
.performance-legend i.average {
  height: 0;
  border-top: 2px dashed rgb(from var(--cream) r g b / 0.6);
  background: none;
}
.performance-legend i.win,
.performance-legend i.loss {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--good);
}
.performance-legend i.loss {
  background: var(--bad);
}
.perf-cards {
  container-type: inline-size;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@container (max-width: 900px) {
  .perf-card {
    grid-column: span 2;
  }
}
@container (max-width: 480px) {
  .perf-card {
    grid-column: 1 / -1;
  }
}
.perf-card {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.perf-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.perf-card-head h3 {
  margin: 0;
  font: 600 11px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.perf-trend {
  flex-shrink: 0;
  font: 700 12px var(--font-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.perf-trend.improving {
  color: var(--good);
}
.perf-trend.slipping {
  color: var(--bad);
}
.perf-card-numbers b {
  margin-right: 6px;
  font: 700 26px var(--font-label);
}
.perf-card-numbers span {
  font-size: 11.5px;
  color: var(--dim);
}
.sparkline {
  height: 80px;
  margin-top: 6px;
}
.sparkline svg {
  display: block;
}
.spark-value {
  fill: none;
  stroke: var(--gold);
  stroke-width: 2;
  stroke-linejoin: round;
}
.spark-average {
  fill: none;
  stroke: rgb(from var(--cream) r g b / 0.45);
  stroke-dasharray: 4 4;
  stroke-width: 1.5;
}
.sparkline circle.win {
  fill: var(--good);
}
.sparkline circle.loss {
  fill: var(--bad);
}
```

In `web/app/styles/phone.css`, the phone rule for small labels drops `.chart-card small`. Replace:

```css
  .app.web .stat-card small,
  .app.web .chart-card small {
    font-size: 10px;
  }
```

with:

```css
  .app.web .stat-card small {
    font-size: 10px;
  }
```

- [ ] **Step 5: Website tests**

In `tests/web-browser/fixtures.ts`:
- After the `match-report` fixture import, add `import { bulkMetadata } from "../fixtures/performance";`.
- In `mockApi`'s `switch`, after `case "/v1/matches/1001/metadata": return json(matchMetadata(FARGO));`, add:

```ts
      case "/v1/matches/metadata":
        return json(bulkMetadata(url, FARGO));
```

In `tests/web-browser/mobile.spec.ts`, in the phone-width profile test, replace:

```ts
    await expect(page.locator(".chart-card").first()).toBeVisible();
```

with:

```ts
    await expect(page.locator(".perf-card .sparkline svg")).toHaveCount(8);
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/home.spec.ts -g "performance"`
Expected: PASS (5 tests).

Then run `npm test`, `npm run test:browser` and `npm run test:web`.
Expected: PASS (379, 130 and 74).

- [ ] **Step 7: Look at it**

Run `npm run web:build && npm run web:preview`, then open `http://127.0.0.1:5187/players/400239835` → Performance. Check these with live data:
- **Cards:** eight cards in four columns at 1260 px, two at 900 px and one at 375 px, with no horizontal scroll.
- **Lines:** dashed averages on six cards.
- **Switching:** Last 50 and a hero.

The API rejects Playwright's default headless user agent with 403. For screenshots, set a desktop Chrome `userAgent`.

- [ ] **Step 8: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile web/app/styles tests/browser/home.spec.ts tests/web-browser
git add src/features/profile/components/PerformanceTab.tsx src/features/profile/styles/profile.css web/app/styles/phone.css tests/browser/home.spec.ts tests/web-browser/fixtures.ts tests/web-browser/mobile.spec.ts
git commit -m "feat(profile): Performance tab against the rank average"
```

---
### Task 7: Remove what the old tab used

**Files:**
- Delete: `src/shared/ui/LineChart.tsx`, `src/features/profile/utils/performance.ts`, `tests/profile/performance.test.ts`
- Modify: `src/features/profile/services/profile-api.ts`, `src/features/profile/utils/match-history.ts`
- Test: `tests/profile/profile-api.test.ts`, `tests/profile/match-history.test.ts`

Nothing imports these any more. `tsc` doesn't flag unused exports, so they would otherwise stay.

- [ ] **Step 1: Delete the old chart and series**

```bash
git rm src/shared/ui/LineChart.tsx src/features/profile/utils/performance.ts tests/profile/performance.test.ts
```

- [ ] **Step 2: Remove the summary hero-stats request**

In `src/features/profile/services/profile-api.ts`, delete:

```ts
export const SUMMARY_HERO_STATS = "game_mode=normal&match_mode=ranked,unranked";
```

and:

```ts
export const fetchSummaryHeroStats = (
  id: number,
  api: DeadlockApi = deadlockApi,
) => fetchHeroStats(id, [SUMMARY_HERO_STATS], api);
```

`PlayerHeroStat` and `fetchPlayerHeroStats` stay; the Heroes tab uses them.

In `tests/profile/profile-api.test.ts`:
- Remove `SUMMARY_HERO_STATS` and `fetchSummaryHeroStats` from the import.
- Delete the `expect(SUMMARY_HERO_STATS).toBe(…)` assertion at the end of the `heroStatsQueries` test.
- Delete the whole `describe("fetchSummaryHeroStats", …)` block.

- [ ] **Step 3: Remove `form`**

In `src/features/profile/utils/match-history.ts`, delete:

```ts
export const form = (ms: HistoryMatch[], n = 20) =>
  [...ms]
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, n)
    .map(isWin);
```

In `tests/profile/match-history.test.ts`, remove `form` from the import and delete the whole `describe("form", …)` block. Home's recent form has its own helper in `src/features/home/utils/recent-form.ts`.

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npm run web:typecheck && npm test`
Expected: PASS (369 tests).

Run: `grep -rn "LineChart\|fetchSummaryHeroStats\|SUMMARY_HERO_STATS\|performanceSeries\|combatAverages\|chart-card" src web/app tests`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/features/profile tests/profile
git add -A src tests
git commit -m "refactor(profile): remove what the old Performance tab used"
```

---
### Task 8: Docs and final check

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-21-redesign-design.md`

- [ ] **Step 1: README**

**"What it does":** in the **Profile** bullet, after "Click a match for its match report.", add:

```markdown
**Performance** follows the last 20, 50 or 100 normal and ranked games, for all heroes or one, against the average player on the same hero at the same rank.
```

**After the "Match report" section** (after its "Copy link" bullet), add:

```markdown
### Performance tab

Eight cards, each with one point per game (oldest on the left, dotted by win or loss), the dashed rank average and the value over the range. A range adds up the games rather than averaging each game's value, so longer games count for more.

- **From match history:** souls / min and the K/D/A ratio, (kills + assists) ÷ deaths, with deaths counted as at least one after adding up the games.
- **From each game's totals:** hero damage, objective damage, healing and creep kills per minute, kill participation and hero damage share. They come from `GET /v1/matches/metadata?match_ids=…&include_player_kda=true&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills` (bulk metadata, every player's stat snapshots; the last one is the final total), at most 50 games per request and kept per match, so a wider range only asks for the games it adds. Bulk metadata allows 30 requests per minute per IP. Games the API hasn't stored yet are left out and the note says how many.
- **Rank average:** the match report's curve, one request per hero and rank (shared between games), read at each game's length: the tier of the game's rank (match history's `ranked_display_badge`), the player's current rank for games without one, such as unranked games, or all ranks when neither is known. It widens as in the match report. As there, **creep kills** stand in for last hits. Kill participation and hero damage share have no rank average.
- **Improving / Flat / Slipping** compares the recent half of the games with the earlier half (at least 6 games), each game as its value ÷ its rank average, so changing hero or rank doesn't read as a change in form; the two shares use their values. It says improving or slipping only when Welch's t-test finds the halves differ at the 95% level, and flat otherwise. When some games run past the end of the rank average, the card compares the player and the average over the games that have one.
```

**"Project map":** in the `src/features/profile/` row, change "heroes, charts" to "heroes, trends". Pad the cell with spaces so the table's columns stay aligned and prettier leaves the table alone.

**"API endpoints":** replace `` - `/v1/matches/{id}/metadata` and `/v1/analytics/player-performance-curve` (match report) `` with:

```markdown
- `/v1/matches/{id}/metadata` and `/v1/analytics/player-performance-curve` (match report; the curve also for the Performance tab)
- `/v1/matches/metadata` (bulk; the Performance tab's per-game totals)
```

- [ ] **Step 2: Spec**

In `docs/superpowers/specs/2026-10-21-redesign-design.md`:
- Under "Delivery phases", change item 4 to `4. **Performance tab (done).**`.
- At the end of "### Performance tab", add:

```markdown
Built in phase 4: eight metrics (souls / min, K/D/A ratio, hero damage, objective damage, healing and creep kills per minute, kill participation and hero damage share) over the last 20, 50 or 100 normal and ranked games, for all heroes or one. Damage, healing, creep kills and shares come from bulk metadata (`GET /v1/matches/metadata`, 50 games per request) rather than one metadata request per game. The rank average is the match report's curve at each game's length, using the game's rank, or the player's current rank for unranked games. As in the match report, creep kills stand in for last hits. The two shares have no rank average. Improving or slipping needs Welch's t-test to find the recent half of the games different from the earlier half at the 95% level, each game against its own rank average.
```

- [ ] **Step 3: Final check**

Run all of these; every one must pass:
- `npm test` (369)
- `npx tsc --noEmit`
- `npm run web:typecheck`
- `npm run test:browser` (130)
- `npm run test:web` (74)
- `npm run build`
- `npm run web:build`
- `npm run validate:manifest`

- [ ] **Step 4: Commit**

```bash
npx prettier --check README.md docs/superpowers/specs/2026-10-21-redesign-design.md
git add README.md docs/superpowers/specs/2026-10-21-redesign-design.md
git commit -m "docs: Performance tab"
```
