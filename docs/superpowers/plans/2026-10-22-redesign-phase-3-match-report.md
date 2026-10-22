# Redesign phase 3 — match report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A match report for any match, for any player. It opens from match rows, from Home's latest match and from a shared link. It has these parts:
- a "Viewing as" selector with Copy link;
- a win/loss banner;
- verdicts against the average player on that hero at that rank;
- the Graph, with stat tabs, filters, markers, hover and a ranking;
- best and worst stretches, impact and permanent buffs;
- a two-team scoreboard.

The desktop app and the website share it, and the website gets a `/matches/:matchId` route.

**Architecture:**
- **Pure modules in `src/features/match-report/utils/` do the deciding.** They turn match metadata into a `MatchReport` with one series per stat per player. They read the rank-average curve, and produce verdicts, stretches, impact and graph series and rankings.
- **Thin services fetch through the shared `DeadlockApi` client.** The metadata, a batched Steam-name lookup and one curve per selected hero are all cached.
- **React components render it on a new `match` page** in the desktop shell and on the website route. The Graph is a hand-drawn SVG, measured to its real width and redrawn on resize. The app has no chart library, and none is added.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8 (web), plain global CSS with the noir tokens, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md`: "Match report", "The Graph" and phase 3 of "Delivery phases". Visual reference: `docs/superpowers/specs/2026-10-21-redesign-prototype.html` (open `#report`; tick "Show as website" for web sizes). Where this plan and the prototype differ, this plan wins.

**Every code block in this plan was built and run before the plan was written.** The full result:
- `npm test` 310 passed;
- `npm run test:browser` 113 passed;
- `npm run test:web` 70 passed;
- both type checks, `npm run build` and `npm run validate:manifest` passed.

The state after Task 5 was also rebuilt on its own and passed. Copy the code as given. If something fails, fix the cause rather than the test.

## Decisions made while planning (verified against the live API on 2026-10-22)

All checked on real ranked match 118590607 (`GET /v1/matches/118590607/metadata`, 1.1 MB) and `GET /v1/analytics/player-performance-curve?hero_ids=27&min_average_badge=71&max_average_badge=76&resolution=0`.

- **Snapshots.** `players[].stats` has snapshots at 180, 360, 540, 720 and 900 s, then 1200, 1500 and 1800 s, plus a final one at the match end (2066 s). There is **no 0:00 snapshot.** The graph starts running totals at 0 at 0:00. Level, powers, max health and accuracy are not running totals ("rate" stats), so they start at the first snapshot.
- **Benchmark curve.** With `resolution=0` the steps are 180–900 s every 180 s, then every 300 s up to 4200 s.
  - **What each step has:** `samples` and `*_avg` / `*_std` for:
    - `net_worth`, `kills`, `deaths` and `assists`;
    - `player_damage` and `boss_damage` (objectives);
    - `neutral_damage`, `creep_damage`, `creep_kills` and `denies`;
    - `player_healing` and `permanent_buffs`.
  - **What it lacks:** damage taken, hero hits, accuracy, level and power, so those stats have no rank average.
  - **Thin late steps:** later steps have very few games (22 at 60 min, 2 at 70 min).
    - Steps with fewer than **30** games are dropped (`MIN_STEP_SAMPLES`).
    - When the first step has fewer than **100** games (`MIN_CURVE_SAMPLES`), or the kept steps end before the match does, the band widens once, one tier each way, and the note says so. If the wider request fails, the tier's own curve is kept. (Review of Task 2: Warden at Eternus has 274 games at 3:00 but only 64 at 35:00, so first-step samples alone never trigger widening.)
  - **Game mode:** the endpoint defaults to `game_mode=normal`, so Street Brawl reports get no curve and say "Rank averages cover normal matches only."
- **"Last hits" becomes "Creep kills" in the graph and verdicts (deviation).**
  - **The numbers don't match:** match-level `last_hits` (267) is neither snapshot `creep_kills` (164) nor creep plus neutral kills (219).
  - **No source over time:** neither the snapshots nor the curve have last hits over time.
  - **So:** the stat tab and the verdict use **Creep kills** (`creep_kills` against `creep_kills_avg`). The banner and scoreboard keep the game's **Last hits** number. Each is labelled with what it is.
- **"Power-ups picked up" becomes "Permanent buffs" (deviation).**
  - **Why:** custom stat ids differ between matches. In the verified match, ids 33 and 46 are bullet-distance buckets, not power-ups. Its "PowerUp Permanent" custom stat is 4, while `power_up_buffs` lists 13 permanent pickups.
  - **What the graph shows:** the "Permanent buffs" stat counts permanent pickups from `power_up_buffs` over time. The curve has `permanent_buffs_avg`: about 30 at 34 min, which matches pickup counts like 26. So this stat gets a rank average, and the Permanent buffs section uses the same numbers.
  - **Headshots:** looked up by name: `Enemy Hero Accuracy##Headshots`.
- **Rank band.**
  - **Source:** each player's badge at match start is in the metadata as `player_rank_data.initial_display_rank`. For example, 83 is Oracle 3, and it equals match-history's `ranked_display_badge`. So no extra requests are needed.
  - **Band:** the badge's whole tier, `min_average_badge = tier·10+1`, `max_average_badge = tier·10+6`.
  - **Missing badge:** when a player's badge is 0, the lobby's badge is used (the rounded mean of the known badges). `average_badge_team0/1` were 0 in the verified match, so they are not used.
- **Teams.**
  - **Names:** API team 0 is **Amber** (the game's team 2, as `MatchOverview` already maps it) and team 1 is **Sapphire**.
  - **Everyone-mode colours (as the spec says):** blues for Amber (shades of `--ally`), reds for Sapphire (`--enemy`) and gold for the selected player.
- **Markers.**
  - **Objectives:** `objectives[].team` is the team that **owns** the destroyed objective. `destroyed_time_s: 0` means it is still standing. The marker takes the destroying (other) team's colour.
  - **Mid Boss:** coloured by `team_claimed`.
  - **Items:** a marker for each purchase costing 3,200 souls or more. `items` also holds ability upgrades, whose ids are not in the item catalog, and those are dropped.
- **Requests.**
  - **Opening a report:** one metadata request and one batched `GET /v1/players/steam`.
  - **Picking a perspective:** one curve request per selected hero and band, cached, plus one more when the band widens.
- **Copy link.**
  - **Desktop:** uses `overwolf.utils.placeOnClipboard`, which needs the manifest permission **"Clipboard"** (checked in the Overwolf docs; the official schema accepts it).
  - **Website:** uses `navigator.clipboard`.
  - **URL:** `${VITE_SITE_URL}/matches/:id?player=<account_id>`, or no parameter for the whole match. `SITE_URL` moves from `web/app/seo.tsx` to `src/shared/site.ts`, so both builds use it.
- **Default perspective.**
  - **Order:** the remembered "me" account if it played, then the player the viewer came from (the profile row, Home's latest match or the link's `?player=`), then the whole match.
  - **Profile rows** pass the profile's account id.
  - **Website timing:** until the viewer picks, the default is recomputed on every render, because the website learns `meId` after its first render.
- **Match rows open the report.** This replaces the inline scoreboard; `MatchDetail` and `fetchScoreboard` are deleted. Final item inventories are no longer listed: the prototype's scoreboard has none, and big purchases show as item markers. Flag this to the owner at the end.
- **Graph size.**
  - **Drawing:** the SVG is drawn at the measured width (`ResizeObserver`). The plot height is `clamp(190, 24% of width, 260)` plus 66 px of marker lanes.
  - **Ranking:** a 230 px panel beside the chart, stacked below it when the graph is narrower than 700 px (a container query).
  - **Result:** on a 1600 px browser, the whole Graph block is about 460 px tall.
- **Website route.** `/matches/:matchId` is not pre-rendered and not in the sitemap. It uses the SPA fallback, like `/players/*`: the `_redirects` line plus the preview server.

## Global Constraints

- Every colour comes from `src/app/styles/tokens.css` (`var(--token)`, `rgb(from var(--token) r g b / a)` or `color-mix(…)`). `tests/app/theme.test.ts` fails on any hex literal in `src/**/*.css`, `web/app/**/*.css` or `src/**/*.tsx`.
- Fonts and components are as in phases 1–2: Rajdhani uppercase for labels and tabs, Playfair Display SC for the result title, DM Sans for body text, and `SectionHeader` for section titles.
- **Constants (exported; tests import them):** `MIN_CURVE_SAMPLES = 100`, `MIN_STEP_SAMPLES = 30`, `ROUGH_PATCH_S = 300`, `ROUGH_PATCH_DEATHS = 3`, `ITEM_MARKER_COST = 3200`, `NORMAL_MODE = 1`, `LANES = 66`.
- **Copy strings fixed by this plan (tests assert them):**
  - **Top bar:**
    - "← Back to profile" / "← Home";
    - the label "Viewing as" with the option "Whole match (no player)" and options like "Amber · Haze · moealali777 (you)";
    - the "Copy link" button, which reads "Link copied" after a copy.
  - **Notes:** "This is your match.", "You're viewing {name}'s match. Labels and verdicts are from their point of view." and "Whole-match view. Nobody is highlighted."
  - **Banner:**
    - result "Victory" / "Defeat", or "{Team} won";
    - stat labels Player, Hero, K / D / A, Souls, Souls / min, Last hits and Duration, or for the whole match Duration, Amber souls, Sapphire souls and Kills (`28 – 24`);
    - eyebrow "Match {id} · {Tier}-level lobby · {time ago}".
  - **Verdicts:**
    - labels "Souls / min", "Hero damage" and "Creep kills";
    - change line "▲ 8% vs avg {Hero} at {Band}", or "No rank average";
    - note "Compared with the average {Hero} at {Band} at the same match length, over the last 30 days." plus, when widened, " Too few {Hero} games at {Tier} alone, so this covers {Band}.";
    - when the curve ends before the match does, the note adds " Too few {Hero} games at {Band} ran this long, so the average stops at {m:ss}."; with no usable steps it reads "Too few {Hero} games at {Band} in the last 30 days.";
    - other notes "Rank averages cover normal matches only.", "Loading the rank average…" and "Rank average unavailable: {error}" with Retry.
  - **Section titles:** "Graph", "Best & worst stretches", "Impact", "Permanent buffs" and "Scoreboard".
  - **Stretches:**
    - labels Strongest, Weakest, Turning point, Deaths and Rough patch;
    - texts like "Around 15:00: 20% more souls than the Emissary average.", "Around 3:00: 10% fewer souls than the average." (or "level with …"), "Back within the normal range from 20:00." (other turning points: "Ahead of / Behind / Within the normal range all game.", "Pulled ahead of / Fell behind the normal range at {m:ss} and stayed there.", each with " through {m:ss}, where the average stops" when it stops early; a change at the last snapshot reads "… by the end ({m:ss})."), "4 deaths: 6:40, 21:40, 23:20, 25:00." and "3 deaths between 21:40 and 25:00.";
    - the note under the stretches title, "Souls against the average {Hero} at {Band} at each snapshot · normal range = ±1 standard deviation", or "No rank average for this match, so only deaths are listed.";
    - verdicts that round to 0% read "Level with avg {Hero} at {Band}"
  - **Impact:** note "{Your|name's} share of the team's total · bars fill at half · the line marks an even 1/6 share"; kill participation "Kill participation 50% 14 of 28 team kills".
  - **Buffs:** "Picked up" and "Avg {Hero} at {Band}".
  - **Whole-match line:** "Pick a player in “Viewing as” to see their verdicts, best and worst stretches and impact."
  - **Scoreboard:**
    - team headings "Amber · winner" / "Sapphire";
    - columns Player, K / D / A, Souls, Hero dmg, Dmg taken, Obj. dmg, Healing and Last hits;
    - row buttons "View as" ("Viewing" on the selected row).
  - **Graph controls:**
    - groups Show (Player vs avg, Team totals, Team lead, Everyone), Values (Total, Per minute), Time (Whole match, 0–10, 10–20, 20+) and Markers (Deaths, Items, Objectives);
    - a "More stats…" select;
    - ranking titles like "Most souls", "Fewest deaths / min · at 10:00" and "Highest accuracy %";
    - lead labels "AMBER AHEAD" / "SAPPHIRE AHEAD";
    - legend buttons "Show all", "Amber only" and "Sapphire only";
    - the footnote ending "Snapshots every 3 min until 15:00, then every 5 min; lines connect them."
  - **Entry points:** row link text "Report →" and Home's "Open match report →".
  - **Errors:** "Match details unavailable" with Retry; the website's "That isn't a valid match ID."
- No fake data in production. Every derived number carries its one-line "how it's derived" note.
- One shared copy of the feature code for the app and the website.
- **Before every commit**, run `npm test`, `npx tsc --noEmit` and `npm run web:typecheck`.
- **Browser suites:** `npm run test:browser` (desktop) and `npm run test:web` (website).
- **Formatting:** format touched files with `npx prettier --write <files>`. Never run prettier on `public/manifest.json`; edit it by hand.
- **Commits:** plain conventional commits (`feat(match-report): …`) with **no AI attribution lines or trailers** (owner rule).

## Review Focus

1. **Perspective correctness.** These must all follow "Viewing as":
   - the banner, verdicts, stretches, impact and buffs;
   - the graph's focus line, average and markers;
   - the scoreboard highlight;
   - the Copy link URL.

   "You" may appear only for the remembered account. Tests: `Viewing as another player switches every perspective-dependent part`, `Copy link copies the website URL…`, `without a player the match opens whole, unless you played in it`.
2. **Request budget and stale results.** Switching perspective fetches at most one curve per hero and band, and the shared client caches it. `useAsync` ignores stale responses, so fast switching cannot show the previous hero's average.
3. **Widths.**
   - Desktop at 850 px and 1260 px, and the website at 1600 px and 375 px: no horizontal page scroll.
   - The scoreboard scrolls inside `.report-table-wrap`.
   - The graph stays 190–260 px tall plus 66 px of lanes, and redraws on resize.

## File structure

| File | Responsibility |
|---|---|
| `src/features/match-report/utils/metrics.ts` | The 24 graph stats (label, tab or "More stats", rate, lower-is-better, curve field) and how each is read from a snapshot |
| `src/features/match-report/utils/report.ts` | `parseMatchReport()`: metadata → `MatchReport` (players with per-stat series, deaths, purchases, buffs; objectives; Mid Boss); team names |
| `src/features/match-report/utils/rank-curve.ts` | Rank band from a badge, lobby badge, curve path and parsing, `averageAt()` interpolation |
| `src/features/match-report/utils/format.ts` | `clock()`, `compact()`, `percent()` |
| `src/features/match-report/utils/perspective.ts` | Default perspective, "You" vs names, option labels, the view note |
| `src/features/match-report/utils/insights.ts` | Verdicts, permanent buffs, impact |
| `src/features/match-report/utils/stretches.ts` | Rule-based best and worst stretches and death clusters |
| `src/features/match-report/utils/graph.ts` | Player, team, lead and average series; time ranges; ranking and its title; axis formatting |
| `src/features/match-report/services/match-report.ts` | `fetchMatchReport`, `fetchPlayerNames`, `fetchRankCurve` |
| `src/features/match-report/components/*.tsx` | `MatchReportPage`, `ReportBanner`, `Verdicts`, `PlayerInsights`, `Scoreboard`, `CopyLinkButton`, `ReportGraph`, `GraphChart` |
| `src/features/match-report/styles/match-report.css` | All report styles |
| `src/shared/site.ts` | `SITE_URL` (moved from the web app), `matchPath`, `matchUrl` |
| `src/shared/utils/clipboard.ts` | `copyText()`: Overwolf clipboard in the app, the browser's elsewhere |
| `web/app/routes/match.tsx` | Website route `/matches/:matchId?player=` |
| `tests/fixtures/match-report.ts` | Synthetic 12-player match and rank curve shared by the unit, desktop and website tests |

---

### Task 1: Match data — stats, parsing and fetch

**Files:**
- Create: `tests/fixtures/match-report.ts`
- Create: `src/features/match-report/utils/metrics.ts`
- Create: `src/features/match-report/utils/report.ts`
- Create: `src/features/match-report/services/match-report.ts`
- Test: `tests/match-report/report.test.ts`

The fixture is the one source of test data for the whole phase. It has one "lead" player (slot 1, Amber, `catalog.heroes[0]`) whose numbers are chosen to give round results against the curve:
- souls 0.9–1.2× the average, ending at 1.08× (32,400 souls, so 1,080 per minute against 1,000);
- 18,000 hero damage against 15,000;
- 90 creep kills against 120;
- deaths at 6:40, 21:40, 23:20 and 25:00.

Sapphire players have more souls, so the ranking isn't trivial. It uses relative imports only, because Playwright loads it too.

- [ ] **Step 1: Create the shared fixture**

`tests/fixtures/match-report.ts`:

```ts
// Synthetic match metadata and rank-average curve for the match report
// tests (unit, desktop and website). Relative imports only: Playwright
// loads this file too.
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

export const MATCH_ID = 1001;
export const DURATION_S = 1800;
export const TIMES = [180, 360, 540, 720, 900, 1200, 1500, 1800];
export const BADGE = 73; // Emissary 3
export const HEADSHOTS_ID = 7;
export const heroes = catalog.heroes.slice(0, 12);
export const bigItem = catalog.items.find((item) => item.cost >= 3200)!;
export const smallItem = catalog.items.find(
  (item) => item.cost > 0 && item.cost < 3200,
)!;

// The first player ("lead") is measured against the curve below:
// souls run 0.9–1.2× the average, ending at 1.08× (32,400 souls).
export const LEAD_SOULS_SHARE = [0.9, 0.95, 1.05, 1.1, 1.2, 1.1, 1.0, 1.08];
export const LEAD_DEATHS = [400, 1300, 1400, 1500];

const perMinute = (rate: number) => (t: number) => Math.round((rate * t) / 60);

function stats(index: number) {
  const souls =
    index === 0
      ? (t: number) =>
          Math.round(((1000 * t) / 60) * LEAD_SOULS_SHARE[TIMES.indexOf(t)])
      : perMinute(900 + 32 * index);
  const deaths = index === 0 ? LEAD_DEATHS : [600 + 60 * index];
  return TIMES.map((t) => ({
    time_stamp_s: t,
    net_worth: souls(t),
    player_damage: perMinute(index === 0 ? 600 : 400 + 20 * index)(t),
    player_damage_taken: perMinute(500 + 10 * index)(t),
    boss_damage: perMinute(index === 0 ? 100 : 50)(t),
    player_healing: perMinute(index === 0 ? 200 : 100)(t),
    creep_kills: perMinute(index === 0 ? 3 : 4)(t),
    kills: Math.floor((t / DURATION_S) * (index === 0 ? 8 : 4)),
    deaths: deaths.filter((time) => time <= t).length,
    assists: Math.floor((t / DURATION_S) * 6),
    hero_bullets_hit: perMinute(20)(t),
    shots_hit: perMinute(60)(t),
    shots_missed: perMinute(40)(t),
    damage_mitigated: perMinute(50)(t),
    creep_damage: perMinute(800)(t),
    neutral_damage: perMinute(300)(t),
    denies: Math.floor(t / 600),
    level: Math.min(31, Math.floor(t / 60)),
    tech_power: Math.floor(t / 20),
    weapon_power: Math.floor(t / 30),
    max_health: 800 + Math.floor(t),
    melee_kills: t >= 1500 ? 1 : 0,
    heal_prevented: perMinute(10)(t),
    teammate_healing: perMinute(index === 0 ? 50 : 0)(t),
    custom_user_stats: [
      { id: HEADSHOTS_ID, value: perMinute(2)(t) },
      { id: 99, value: 5 },
    ],
  }));
}

export function matchPlayer(index: number, accountId: number) {
  const last = stats(index).at(-1)!;
  const deaths = index === 0 ? LEAD_DEATHS : [600 + 60 * index];
  return {
    account_id: accountId,
    player_slot: index + 1,
    team: index < 6 ? 0 : 1,
    hero_id: heroes[index].id,
    kills: last.kills,
    deaths: deaths.length,
    assists: last.assists,
    net_worth: last.net_worth,
    last_hits: last.creep_kills + 20,
    denies: last.denies,
    level: 31,
    player_rank_data: { initial_display_rank: BADGE },
    stats: stats(index),
    death_details: deaths.map((game_time_s) => ({ game_time_s })),
    items: [
      { item_id: smallItem.id, game_time_s: 100, sold_time_s: 0 },
      { item_id: bigItem.id, game_time_s: 900, sold_time_s: 0 },
      { item_id: 1, game_time_s: 50, sold_time_s: 0 }, // an ability upgrade, not a shop item
    ],
    power_up_buffs: [
      {
        type: "hp_permanent_pickup",
        is_permanent: true,
        pickup_times_s: index === 0 ? [200, 700, 1300] : [500],
      },
      {
        type: "gun_powerup_pickup",
        is_permanent: false,
        pickup_times_s: [300],
      },
    ],
  };
}

/** Twelve players; the first has `accountId`, the others 5001–5011. */
export function matchMetadata(accountId: number, matchId = MATCH_ID) {
  return {
    match_info: {
      match_id: matchId,
      start_time: Math.floor(Date.now() / 1000) - 3600,
      duration_s: DURATION_S,
      game_mode: 1,
      match_mode: 4,
      winning_team: 0,
      custom_user_stats: [
        { name: "Enemy Hero Accuracy##Headshots", id: HEADSHOTS_ID },
      ],
      players: heroes.map((_, index) =>
        matchPlayer(index, index === 0 ? accountId : 5000 + index),
      ),
      objectives: [
        { team: 1, destroyed_time_s: 600 },
        { team: 0, destroyed_time_s: 1500 },
        { team: 0, destroyed_time_s: 0 },
      ],
      mid_boss: [{ team_claimed: 0, team_killed: 0, destroyed_time_s: 1700 }],
    },
  };
}

/** Rank-average curve: 1,000 souls/min, 500 hero damage/min, 4 creeps/min. */
export function rankCurveRows(samples = 5000) {
  return [180, 360, 540, 720, 900, 1200, 1500, 1800, 2100, 2400].map(
    (game_time) => {
      const m = game_time / 60;
      return {
        game_time,
        samples,
        net_worth_avg: 1000 * m,
        net_worth_std: 100 * m,
        player_damage_avg: 500 * m,
        player_damage_std: 50 * m,
        creep_kills_avg: 4 * m,
        creep_kills_std: 0.5 * m,
        boss_damage_avg: 80 * m,
        boss_damage_std: 10 * m,
        player_healing_avg: 150 * m,
        player_healing_std: 20 * m,
        kills_avg: m / 5,
        kills_std: 1,
        deaths_avg: m / 6,
        deaths_std: 1,
        assists_avg: m / 4,
        assists_std: 1,
        permanent_buffs_avg: m / 10,
        permanent_buffs_std: 1,
      };
    },
  );
}
```

- [ ] **Step 2: Write the failing tests**

`tests/match-report/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import {
  fetchMatchReport,
  fetchPlayerNames,
} from "@/features/match-report/services/match-report";
import { METRICS } from "@/features/match-report/utils/metrics";
import {
  finalValue,
  parseMatchReport,
  teamOf,
} from "@/features/match-report/utils/report";
import {
  BADGE,
  DURATION_S,
  TIMES,
  bigItem,
  heroes,
  matchMetadata,
  smallItem,
} from "../fixtures/match-report";

const ACCOUNT = 100000000;

describe("parseMatchReport", () => {
  const report = parseMatchReport(matchMetadata(ACCOUNT), 1001);
  const lead = report.players[0];

  it("reads the match and sorts players Amber first, then by slot", () => {
    expect(report).toMatchObject({
      matchId: 1001,
      durationS: DURATION_S,
      gameMode: 1,
      winningTeam: 0,
    });
    expect(report.players.map((p) => p.slot)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(teamOf(report, 1).map((p) => p.heroId)).toEqual(
      heroes.slice(6).map((hero) => hero.id),
    );
  });

  it("reads each player's totals, rank badge and snapshot times", () => {
    expect(lead).toMatchObject({
      accountId: ACCOUNT,
      team: 0,
      heroId: heroes[0].id,
      kills: 8,
      deaths: 4,
      assists: 6,
      netWorth: 32400,
      lastHits: 110,
      badge: BADGE,
      times: TIMES,
    });
    for (const metric of METRICS)
      expect(lead.values[metric.id]).toHaveLength(TIMES.length);
  });

  it("derives accuracy, headshots by name and permanent buffs from pickups", () => {
    expect(finalValue(lead, "souls")).toBe(32400);
    expect(finalValue(lead, "accuracy")).toBeCloseTo(60);
    expect(finalValue(lead, "headshots")).toBe(60);
    expect(lead.values.permanentBuffs).toEqual([0, 1, 1, 2, 2, 2, 3, 3]);
    expect(lead.buffTimes).toEqual([200, 700, 1300]);
  });

  it("keeps shop purchases only, deaths and destroyed objectives in time order", () => {
    expect(lead.purchases).toEqual([
      { timeS: 100, itemId: smallItem.id },
      { timeS: 900, itemId: bigItem.id },
    ]);
    expect(lead.deathTimes).toEqual([400, 1300, 1400, 1500]);
    expect(report.objectives).toEqual([
      { timeS: 600, team: 1 },
      { timeS: 1500, team: 0 },
    ]);
    expect(report.midBoss).toEqual([{ timeS: 1700, team: 0 }]);
  });

  it("treats a missing badge as 0 and skips snapshots at 0:00", () => {
    const data = matchMetadata(ACCOUNT);
    const player = data.match_info.players[0] as Record<string, unknown>;
    delete player.player_rank_data;
    (player.stats as { time_stamp_s: number }[])[0].time_stamp_s = 0;
    const parsed = parseMatchReport(data, 1001).players[0];
    expect(parsed.badge).toBe(0);
    expect(parsed.times).toEqual(TIMES.slice(1));
  });

  it("throws when the metadata has no match or no players", () => {
    expect(() => parseMatchReport({}, 1)).toThrow(/unavailable/i);
    expect(() =>
      parseMatchReport({ match_info: { winning_team: 0, players: [] } }, 1),
    ).toThrow(/unavailable/i);
  });
});

describe("match report services", () => {
  it("fetches the metadata path", async () => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return matchMetadata(ACCOUNT, 42);
      },
    } as unknown as DeadlockApi;
    const report = await fetchMatchReport(42, api);
    expect(calls).toEqual(["/v1/matches/42/metadata"]);
    expect(report.matchId).toBe(42);
  });

  it("names players by account, and gives an empty map when Steam fails", async () => {
    const ok = {
      get: async (path: string) => {
        expect(path).toBe("/v1/players/steam?account_ids=7,8");
        return [{ account_id: 7, personaname: "Seven" }];
      },
    } as unknown as DeadlockApi;
    expect([...(await fetchPlayerNames([7, 0, 8], ok))]).toEqual([
      [7, "Seven"],
    ]);
    const failing = {
      get: async () => {
        throw new Error("down");
      },
    } as unknown as DeadlockApi;
    expect((await fetchPlayerNames([7], failing)).size).toBe(0);
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run tests/match-report/report.test.ts`
Expected: FAIL. The modules `@/features/match-report/...` don't exist yet.

- [ ] **Step 4: Write the stats table**

`src/features/match-report/utils/metrics.ts`:

```ts
export type MetricId =
  | "souls"
  | "heroDamage"
  | "damageTaken"
  | "objectiveDamage"
  | "healing"
  | "creepKills"
  | "kills"
  | "deaths"
  | "heroHits"
  | "accuracy"
  | "headshots"
  | "assists"
  | "damageMitigated"
  | "creepDamage"
  | "neutralDamage"
  | "denies"
  | "level"
  | "spiritPower"
  | "weaponPower"
  | "maxHealth"
  | "meleeKills"
  | "healingPrevented"
  | "teammateHealing"
  | "permanentBuffs";

export interface Metric {
  id: MetricId;
  label: string;
  // A stat tab; the rest go under "More stats…".
  main: boolean;
  // A level rather than a running total: no per-minute view, and team
  // views average it instead of summing.
  rate: boolean;
  lowerBetter: boolean;
  // Field name in the rank-average curve (without `_avg` / `_std`).
  curve?: string;
}

const metric = (
  id: MetricId,
  label: string,
  options: Partial<Omit<Metric, "id" | "label">> = {},
): Metric => ({
  id,
  label,
  main: false,
  rate: false,
  lowerBetter: false,
  ...options,
});

export const METRICS: Metric[] = [
  metric("souls", "Souls", { main: true, curve: "net_worth" }),
  metric("heroDamage", "Hero damage", { main: true, curve: "player_damage" }),
  metric("damageTaken", "Damage taken", { main: true }),
  metric("objectiveDamage", "Objective damage", {
    main: true,
    curve: "boss_damage",
  }),
  metric("healing", "Healing", { main: true, curve: "player_healing" }),
  metric("creepKills", "Creep kills", { main: true, curve: "creep_kills" }),
  metric("kills", "Kills", { main: true, curve: "kills" }),
  metric("deaths", "Deaths", {
    main: true,
    lowerBetter: true,
    curve: "deaths",
  }),
  metric("heroHits", "Hero hits", { main: true }),
  metric("accuracy", "Accuracy %", { rate: true }),
  metric("headshots", "Headshots"),
  metric("assists", "Assists", { curve: "assists" }),
  metric("damageMitigated", "Damage mitigated"),
  metric("creepDamage", "Creep damage", { curve: "creep_damage" }),
  metric("neutralDamage", "Jungle (neutral) damage", {
    curve: "neutral_damage",
  }),
  metric("denies", "Denies", { curve: "denies" }),
  metric("level", "Level", { rate: true }),
  metric("spiritPower", "Spirit power", { rate: true }),
  metric("weaponPower", "Weapon power", { rate: true }),
  metric("maxHealth", "Max health", { rate: true }),
  metric("meleeKills", "Melee kills"),
  metric("healingPrevented", "Healing prevented"),
  metric("teammateHealing", "Healing to teammates"),
  metric("permanentBuffs", "Permanent buffs", { curve: "permanent_buffs" }),
];

export const metricById = new Map(METRICS.map((m) => [m.id, m]));

// Snapshot fields read as they are.
const FIELDS: Partial<Record<MetricId, string>> = {
  souls: "net_worth",
  heroDamage: "player_damage",
  damageTaken: "player_damage_taken",
  objectiveDamage: "boss_damage",
  healing: "player_healing",
  creepKills: "creep_kills",
  kills: "kills",
  deaths: "deaths",
  heroHits: "hero_bullets_hit",
  assists: "assists",
  damageMitigated: "damage_mitigated",
  creepDamage: "creep_damage",
  neutralDamage: "neutral_damage",
  denies: "denies",
  level: "level",
  spiritPower: "tech_power",
  weaponPower: "weapon_power",
  maxHealth: "max_health",
  meleeKills: "melee_kills",
  healingPrevented: "heal_prevented",
  teammateHealing: "teammate_healing",
};

// Custom stat ids differ between matches; look them up by name.
export const HEADSHOTS_STAT = "Enemy Hero Accuracy##Headshots";

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** One metric's value in one `stats` snapshot. `permanentBuffs` comes from pickups, not snapshots. */
export function snapshotValue(
  id: MetricId,
  stat: Record<string, unknown>,
  headshotsId: number | undefined,
  buffTimes: number[],
): number {
  const field = FIELDS[id];
  if (field) return num(stat[field]);
  if (id === "accuracy") {
    const hit = num(stat.shots_hit);
    const shots = hit + num(stat.shots_missed);
    return shots > 0 ? (hit / shots) * 100 : 0;
  }
  if (id === "headshots") {
    const custom = Array.isArray(stat.custom_user_stats)
      ? (stat.custom_user_stats as Record<string, unknown>[])
      : [];
    return num(custom.find((c) => c?.id === headshotsId)?.value);
  }
  const t = num(stat.time_stamp_s);
  return buffTimes.filter((time) => time <= t).length;
}
```

- [ ] **Step 5: Write the parser**

`src/features/match-report/utils/report.ts`:

```ts
import { itemById } from "@/shared/catalog";
import {
  HEADSHOTS_STAT,
  METRICS,
  snapshotValue,
  type MetricId,
} from "./metrics";

export type Team = 0 | 1;
// API team 0 is the game's team 2 ("Amber" in MatchOverview), team 1 is 3.
export const TEAM_NAMES: Record<Team, string> = { 0: "Amber", 1: "Sapphire" };
export const NORMAL_MODE = 1;

export interface ReportPlayer {
  accountId: number;
  slot: number;
  team: Team;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  // Rank badge at match start (tier × 10 + subrank); 0 when unknown.
  badge: number;
  // Snapshot times in seconds, ascending; values has one entry per time.
  times: number[];
  values: Record<MetricId, number[]>;
  deathTimes: number[];
  purchases: { timeS: number; itemId: number }[];
  buffTimes: number[];
}

export interface MatchReport {
  matchId: number;
  startTime: number;
  durationS: number;
  gameMode: number;
  winningTeam: Team;
  // Amber first, then by player slot.
  players: ReportPlayer[];
  // `team` owns the objective that was destroyed.
  objectives: { timeS: number; team: Team }[];
  // `team` claimed the Mid Boss.
  midBoss: { timeS: number; team: Team }[];
}

type Row = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const num = (value: unknown) => (isNumber(value) ? value : 0);
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === "object")
    : [];
const isTeam = (value: unknown): value is Team => value === 0 || value === 1;

function parsePlayer(
  p: Row,
  index: number,
  headshotsId: number | undefined,
): ReportPlayer {
  const buffTimes = rows(p.power_up_buffs)
    .filter((buff) => buff.is_permanent === true)
    .flatMap((buff) =>
      Array.isArray(buff.pickup_times_s)
        ? buff.pickup_times_s.filter(isNumber)
        : [],
    )
    .sort((a, b) => a - b);
  const stats = rows(p.stats)
    .filter((stat) => isNumber(stat.time_stamp_s) && stat.time_stamp_s > 0)
    .sort((a, b) => num(a.time_stamp_s) - num(b.time_stamp_s))
    .filter(
      (stat, index, all) =>
        index === 0 || stat.time_stamp_s !== all[index - 1].time_stamp_s,
    );
  const values = Object.fromEntries(
    METRICS.map((m) => [
      m.id,
      stats.map((stat) => snapshotValue(m.id, stat, headshotsId, buffTimes)),
    ]),
  ) as Record<MetricId, number[]>;
  const rank = p.player_rank_data as Row | undefined;
  return {
    accountId: num(p.account_id),
    slot: isNumber(p.player_slot) ? p.player_slot : index + 1,
    team: p.team as Team,
    heroId: num(p.hero_id),
    kills: num(p.kills),
    deaths: num(p.deaths),
    assists: num(p.assists),
    netWorth: num(p.net_worth),
    lastHits: num(p.last_hits),
    denies: num(p.denies),
    badge: num(rank?.initial_display_rank),
    times: stats.map((stat) => num(stat.time_stamp_s)),
    values,
    deathTimes: rows(p.death_details)
      .map((death) => num(death.game_time_s))
      .sort((a, b) => a - b),
    purchases: rows(p.items)
      .filter((item) => isNumber(item.item_id) && itemById.has(item.item_id))
      .map((item) => ({
        timeS: num(item.game_time_s),
        itemId: num(item.item_id),
      }))
      .sort((a, b) => a.timeS - b.timeS),
    buffTimes,
  };
}

/** Throws "Match details unavailable." when the metadata has no usable match. */
export function parseMatchReport(data: unknown, matchId: number): MatchReport {
  const info = (data as { match_info?: Row } | null)?.match_info;
  if (!info || !isTeam(info.winning_team))
    throw new Error("Match details unavailable.");
  const headshotsId = rows(info.custom_user_stats).find(
    (stat) => stat.name === HEADSHOTS_STAT,
  )?.id;
  const players = rows(info.players)
    .filter((p) => isTeam(p.team) && isNumber(p.hero_id))
    .map((p, index) =>
      parsePlayer(p, index, isNumber(headshotsId) ? headshotsId : undefined),
    )
    .sort((a, b) => a.team - b.team || a.slot - b.slot);
  if (!players.length) throw new Error("Match details unavailable.");
  return {
    matchId: isNumber(info.match_id) ? info.match_id : matchId,
    startTime: num(info.start_time),
    durationS: num(info.duration_s),
    gameMode: num(info.game_mode),
    winningTeam: info.winning_team,
    players,
    objectives: rows(info.objectives)
      .filter(
        (o) =>
          isTeam(o.team) &&
          isNumber(o.destroyed_time_s) &&
          o.destroyed_time_s > 0,
      )
      .map((o) => ({ timeS: num(o.destroyed_time_s), team: o.team as Team }))
      .sort((a, b) => a.timeS - b.timeS),
    midBoss: rows(info.mid_boss)
      .filter((b) => isTeam(b.team_claimed) && isNumber(b.destroyed_time_s))
      .map((b) => ({
        timeS: num(b.destroyed_time_s),
        team: b.team_claimed as Team,
      }))
      .sort((a, b) => a.timeS - b.timeS),
  };
}

/** A metric's value at the last snapshot (end of the match). */
export const finalValue = (player: ReportPlayer, id: MetricId) =>
  player.values[id].at(-1) ?? 0;

export const teamOf = (report: MatchReport, team: Team) =>
  report.players.filter((p) => p.team === team);
```

- [ ] **Step 6: Write the services (the rank curve comes in Task 2)**

`src/features/match-report/services/match-report.ts`:

```ts
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parseMatchReport, type MatchReport } from "../utils/report";

export async function fetchMatchReport(
  matchId: number,
  api: DeadlockApi = deadlockApi,
): Promise<MatchReport> {
  return parseMatchReport(
    await api.get<unknown>(`/v1/matches/${matchId}/metadata`, TTL.analytics),
    matchId,
  );
}

/** Steam names by account id; empty when the lookup fails, so the report still shows. */
export async function fetchPlayerNames(
  accountIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, string>> {
  try {
    const profiles = await fetchSteamProfiles(
      accountIds.filter((id) => id > 0),
      api,
    );
    return new Map(profiles.map((p) => [p.accountId, p.name]));
  } catch {
    return new Map();
  }
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run tests/match-report/report.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Check and commit**

Run `npm test` and `npx tsc --noEmit`; both must be clean.

```bash
npx prettier --write tests/fixtures/match-report.ts tests/match-report src/features/match-report
git add tests/fixtures/match-report.ts tests/match-report src/features/match-report
git commit -m "feat(match-report): parse match metadata into per-player stat series"
```

---

### Task 2: Rank-average curve

**Files:**
- Create: `src/features/match-report/utils/rank-curve.ts`
- Modify: `src/features/match-report/services/match-report.ts` (add `fetchRankCurve`)
- Test: `tests/match-report/rank-curve.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/match-report/rank-curve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { metricById } from "@/features/match-report/utils/metrics";
import {
  MIN_STEP_SAMPLES,
  averageAt,
  curvePath,
  lobbyBadge,
  parseCurve,
  rankBand,
} from "@/features/match-report/utils/rank-curve";
import { parseMatchReport } from "@/features/match-report/utils/report";
import { matchMetadata, rankCurveRows } from "../fixtures/match-report";

const souls = metricById.get("souls")!;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("rank band", () => {
  it("covers the badge's whole tier, wider on request, clamped to real tiers", () => {
    expect(rankBand(73)).toEqual({ min: 71, max: 76, label: "Emissary" });
    expect(rankBand(73, 1)).toEqual({
      min: 61,
      max: 86,
      label: "Ritualist–Oracle",
    });
    expect(rankBand(114, 1)).toEqual({
      min: 101,
      max: 116,
      label: "Ascendant–Eternus",
    });
    expect(rankBand(0)).toEqual({ min: 0, max: 0, label: "all ranks" });
  });

  it("takes the lobby's rank from the known badges", () => {
    const players = parseMatchReport(matchMetadata(1), 1).players;
    expect(lobbyBadge(players)).toBe(73);
    expect(lobbyBadge(players.map((p) => ({ ...p, badge: 0 })))).toBe(0);
  });

  it("builds the curve path with absolute time and the band", () => {
    expect(curvePath(7, rankBand(73))).toBe(
      "/v1/analytics/player-performance-curve?hero_ids=7&resolution=0&min_average_badge=71&max_average_badge=76",
    );
    expect(curvePath(7, rankBand(0))).toBe(
      "/v1/analytics/player-performance-curve?hero_ids=7&resolution=0",
    );
  });
});

describe("averageAt", () => {
  it("interpolates between steps, from 0 at 0:00 for running totals", () => {
    expect(averageAt(curve, souls, 90)).toEqual({ avg: 1500, std: 150 });
    expect(averageAt(curve, souls, 1800)).toEqual({ avg: 30000, std: 3000 });
    expect(averageAt(curve, souls, 1650)?.avg).toBeCloseTo(27500);
  });

  it("is null past the last step and for stats the curve lacks", () => {
    expect(averageAt(curve, souls, 2500)).toBeNull();
    expect(averageAt(curve, metricById.get("damageTaken")!, 600)).toBeNull();
    expect(averageAt(curve, metricById.get("level")!, 600)).toBeNull();
  });
});

describe("fetchRankCurve", () => {
  const recording = (samples: (path: string) => number) => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return rankCurveRows(samples(path)).map((row, index) => ({
          ...row,
          samples: index === 9 ? MIN_STEP_SAMPLES - 1 : row.samples,
        }));
      },
    } as unknown as DeadlockApi;
    return { calls, api };
  };

  it("uses the badge's tier and drops thin late steps", async () => {
    const { calls, api } = recording(() => 5000);
    const result = await fetchRankCurve(7, 73, api);
    expect(calls).toEqual([curvePath(7, rankBand(73))]);
    expect(result.band.label).toBe("Emissary");
    expect(result.widenedFrom).toBeUndefined();
    expect(result.points.map((p) => p.t).at(-1)).toBe(2100);
  });

  it("widens one tier each way when the tier has too few games", async () => {
    const { calls, api } = recording((path) =>
      path.includes("min_average_badge=71") ? 50 : 5000,
    );
    const result = await fetchRankCurve(7, 73, api);
    expect(calls).toEqual([
      curvePath(7, rankBand(73)),
      curvePath(7, rankBand(73, 1)),
    ]);
    expect(result.band.label).toBe("Ritualist–Oracle");
    expect(result.widenedFrom).toBe("Emissary");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/match-report/rank-curve.test.ts`
Expected: FAIL (`rank-curve` module and `fetchRankCurve` missing).

- [ ] **Step 3: Write the curve module**

`src/features/match-report/utils/rank-curve.ts`:

```ts
import { catalog } from "@/shared/catalog";
import type { Rank } from "@/shared/catalog/types";
import type { Metric } from "./metrics";
import type { ReportPlayer } from "./report";

// Fewer games than this at the first step and the band widens one tier
// each way; later steps with fewer than MIN_STEP_SAMPLES are dropped.
export const MIN_CURVE_SAMPLES = 100;
export const MIN_STEP_SAMPLES = 30;

export interface RankBand {
  // Average-badge bounds; 0 / 0 means all ranks.
  min: number;
  max: number;
  label: string;
}
export interface CurvePoint {
  t: number;
  samples: number;
  avg: Record<string, number>;
  std: Record<string, number>;
}
export interface RankCurve {
  band: RankBand;
  // The tier the player was in, when the band had to be widened.
  widenedFrom?: string;
  points: CurvePoint[];
}

const tierName = (tier: number, ranks: Rank[]) =>
  ranks.find((rank) => rank.tier === tier)?.name ?? `Tier ${tier}`;

/** The lobby's rank: the rounded mean of known badges, 0 when none are known. */
export function lobbyBadge(players: ReportPlayer[]): number {
  const known = players.map((p) => p.badge).filter((badge) => badge > 0);
  return known.length
    ? Math.round(known.reduce((sum, badge) => sum + badge, 0) / known.length)
    : 0;
}

/** All six sub-ranks of the badge's tier, `widen` tiers either side. */
export function rankBand(
  badge: number,
  widen = 0,
  ranks: Rank[] = catalog.ranks,
): RankBand {
  const tier = Math.floor(badge / 10);
  const top = Math.max(...ranks.map((rank) => rank.tier));
  if (tier < 1 || tier > top) return { min: 0, max: 0, label: "all ranks" };
  const low = Math.max(1, tier - widen);
  const high = Math.min(top, tier + widen);
  return {
    min: low * 10 + 1,
    max: high * 10 + 6,
    label:
      low === high
        ? tierName(low, ranks)
        : `${tierName(low, ranks)}–${tierName(high, ranks)}`,
  };
}

export const curvePath = (heroId: number, band: RankBand) =>
  `/v1/analytics/player-performance-curve?hero_ids=${heroId}&resolution=0` +
  (band.min > 0
    ? `&min_average_badge=${band.min}&max_average_badge=${band.max}`
    : "");

/** Every row with a time, sorted; nothing is dropped here. */
export function parseCurve(data: unknown): CurvePoint[] {
  if (!Array.isArray(data)) return [];
  return data
    .flatMap((row): CurvePoint[] => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      if (typeof r.game_time !== "number" || !Number.isFinite(r.game_time))
        return [];
      const avg: Record<string, number> = {};
      const std: Record<string, number> = {};
      for (const [key, value] of Object.entries(r)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (key.endsWith("_avg")) avg[key.slice(0, -4)] = value;
        else if (key.endsWith("_std")) std[key.slice(0, -4)] = value;
      }
      return [
        {
          t: r.game_time,
          samples: typeof r.samples === "number" ? r.samples : 0,
          avg,
          std,
        },
      ];
    })
    .sort((a, b) => a.t - b.t);
}

/**
 * The rank average and standard deviation at time `t`, interpolated between
 * steps. Running totals start from 0 at 0:00. Null past the last step, or
 * when the curve has no such stat.
 */
export function averageAt(
  curve: RankCurve,
  metric: Metric,
  t: number,
): { avg: number; std: number } | null {
  const field = metric.curve;
  if (!field) return null;
  const steps = curve.points
    .filter((p) => field in p.avg)
    .map((p) => ({ t: p.t, avg: p.avg[field], std: p.std[field] ?? 0 }));
  if (!metric.rate) steps.unshift({ t: 0, avg: 0, std: 0 });
  if (!steps.length || t < steps[0].t || t > steps.at(-1)!.t) return null;
  const next = steps.findIndex((step) => step.t >= t);
  const b = steps[next];
  if (b.t === t || next === 0) return { avg: b.avg, std: b.std };
  const a = steps[next - 1];
  const f = (t - a.t) / (b.t - a.t);
  return { avg: a.avg + f * (b.avg - a.avg), std: a.std + f * (b.std - a.std) };
}
```

- [ ] **Step 4: Add `fetchRankCurve` to the services**

Replace `src/features/match-report/services/match-report.ts` with:

```ts
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parseMatchReport, type MatchReport } from "../utils/report";
import {
  MIN_CURVE_SAMPLES,
  MIN_STEP_SAMPLES,
  curvePath,
  parseCurve,
  rankBand,
  type RankCurve,
} from "../utils/rank-curve";

export async function fetchMatchReport(
  matchId: number,
  api: DeadlockApi = deadlockApi,
): Promise<MatchReport> {
  return parseMatchReport(
    await api.get<unknown>(`/v1/matches/${matchId}/metadata`, TTL.analytics),
    matchId,
  );
}

/** Steam names by account id; empty when the lookup fails, so the report still shows. */
export async function fetchPlayerNames(
  accountIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, string>> {
  try {
    const profiles = await fetchSteamProfiles(
      accountIds.filter((id) => id > 0),
      api,
    );
    return new Map(profiles.map((p) => [p.accountId, p.name]));
  } catch {
    return new Map();
  }
}

/** The hero's rank-average curve for the badge's tier, one tier wider each way when thin. */
export async function fetchRankCurve(
  heroId: number,
  badge: number,
  api: DeadlockApi = deadlockApi,
): Promise<RankCurve> {
  const load = (band: ReturnType<typeof rankBand>) =>
    api.get<unknown>(curvePath(heroId, band), TTL.analytics).then(parseCurve);
  let band = rankBand(badge);
  let points = await load(band);
  let widenedFrom: string | undefined;
  if (band.min > 0 && (points[0]?.samples ?? 0) < MIN_CURVE_SAMPLES) {
    widenedFrom = band.label;
    band = rankBand(badge, 1);
    points = await load(band);
  }
  return {
    band,
    widenedFrom,
    points: points.filter((p) => p.samples >= MIN_STEP_SAMPLES),
  };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/match-report`
Expected: PASS (19 tests).

- [ ] **Step 6: Check and commit**

Run `npm test` and `npx tsc --noEmit`.

```bash
npx prettier --write src/features/match-report tests/match-report
git add src/features/match-report tests/match-report
git commit -m "feat(match-report): rank-average curve for a hero at a badge's tier"
```

---

### Task 3: Verdicts, stretches, impact and perspective

**Files:**
- Create: `src/features/match-report/utils/format.ts`
- Create: `src/features/match-report/utils/perspective.ts`
- Create: `src/features/match-report/utils/insights.ts`
- Create: `src/features/match-report/utils/stretches.ts`
- Test: `tests/match-report/insights.test.ts`

The rules for stretches (spec: "rule-based, never invented"):
- **Ratio:** at every snapshot with a rank average, `r = souls ÷ average souls − 1`.
- **Strongest and Weakest:** the highest and lowest `r`.
- **Turning point:** where `r` first changes sign. It reads one of these, depending on whether the player starts ahead or behind and whether the change holds:
  - "Ahead of the average all game.";
  - "Never caught the average.";
  - "Pulled ahead … and stayed there.";
  - "Pulled ahead … and fell back later.";
  - "Fell behind … and stayed behind.";
  - "Fell behind …, then caught up again."
- **Deaths:** lists every death time.
- **Rough patch:** the densest set of 3 or more deaths within 5 minutes.

- [ ] **Step 1: Write the failing tests**

`tests/match-report/insights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clock, compact, percent } from "@/features/match-report/utils/format";
import {
  buffs,
  impact,
  verdicts,
} from "@/features/match-report/utils/insights";
import {
  defaultPerspective,
  displayName,
  optionLabel,
  possessive,
  viewNote,
} from "@/features/match-report/utils/perspective";
import { parseCurve, rankBand } from "@/features/match-report/utils/rank-curve";
import { parseMatchReport } from "@/features/match-report/utils/report";
import { stretches } from "@/features/match-report/utils/stretches";
import {
  DURATION_S,
  heroes,
  matchMetadata,
  rankCurveRows,
} from "../fixtures/match-report";

const ACCOUNT = 100000000;
const report = parseMatchReport(matchMetadata(ACCOUNT), 1001);
const [lead, second] = report.players;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("format", () => {
  it("formats clock times, compact numbers and percentages", () => {
    expect([clock(0), clock(392), clock(2164)]).toEqual([
      "0:00",
      "6:32",
      "36:04",
    ]);
    expect([
      compact(59870),
      compact(906),
      compact(12.5),
      compact(-1500),
      compact(999.6),
      compact(99.96),
      compact(-0.04),
    ]).toEqual(["59.9K", "906", "12.5", "−1.5K", "1.0K", "100", "0"]);
    expect([percent(0.124), percent(-0.25)]).toEqual(["12%", "25%"]);
  });
});

describe("verdicts", () => {
  it("compares souls / min, hero damage and creep kills with the rank average at match end", () => {
    const [souls, damage, creeps] = verdicts(lead, DURATION_S, curve);
    expect(souls).toMatchObject({ label: "Souls / min", value: 1080 });
    expect(souls.change).toBeCloseTo(0.08);
    expect(damage).toMatchObject({ label: "Hero damage", value: 18000 });
    expect(damage.change).toBeCloseTo(0.2);
    expect(creeps).toMatchObject({ label: "Creep kills", value: 90 });
    expect(creeps.change).toBeCloseTo(-0.25);
  });

  it("has no change without a curve or past its last step", () => {
    expect(verdicts(lead, DURATION_S, null).map((v) => v.change)).toEqual([
      null,
      null,
      null,
    ]);
    expect(verdicts(lead, 9999, curve)[0].change).toBeNull();
  });

  it("counts permanent buffs against the average", () => {
    expect(buffs(lead, DURATION_S, curve)).toEqual({ count: 3, average: 3 });
    expect(buffs(lead, DURATION_S, null).average).toBeNull();
  });
});

describe("impact", () => {
  it("gives the player's share of their team's totals and kill participation", () => {
    const { rows, killParticipation } = impact(lead, report.players);
    expect(rows.map((row) => row.label)).toEqual([
      "Hero damage",
      "Objective damage",
      "Healing",
    ]);
    expect(rows[0].value).toBe(18000);
    expect(rows[0].share).toBeCloseTo(18000 / 87000);
    expect(rows[1].share).toBeCloseTo(3000 / 10500);
    expect(rows[2].share).toBeCloseTo(6000 / 21000);
    expect(killParticipation).toEqual({
      share: 0.5,
      involved: 14,
      teamKills: 28,
    });
  });
});

describe("stretches", () => {
  const withShares = (shares: number[]) => ({
    ...lead,
    values: {
      ...lead.values,
      souls: lead.times.map((t, i) => ((1000 * t) / 60) * shares[i]),
    },
  });
  const turn = (shares: number[], c = curve) =>
    stretches(withShares(shares), c).find((s) => s.label === "Turning point")
      ?.text;

  it("names the strongest and weakest moments, the turning point and deaths", () => {
    expect(stretches(lead, curve)).toEqual([
      {
        label: "Strongest",
        text: "Around 15:00: 20% more souls than the Emissary average.",
        tone: "good",
      },
      // The curve's normal range is ±10%. At 3:00 and 20:00 the lead sits
      // exactly on its edge, which counts as within: no tone at 3:00, and
      // back within from 20:00.
      {
        label: "Weakest",
        text: "Around 3:00: 10% fewer souls than the average.",
      },
      {
        label: "Turning point",
        text: "Back within the normal range from 20:00.",
      },
      { label: "Deaths", text: "4 deaths: 6:40, 21:40, 23:20, 25:00." },
      {
        label: "Rough patch",
        text: "3 deaths between 21:40 and 25:00.",
        tone: "bad",
      },
    ]);
  });

  it("describes where the player ended up against the normal range", () => {
    expect(turn([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2])).toBe(
      "Ahead of the normal range all game.",
    );
    expect(turn([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8])).toBe(
      "Behind the normal range all game.",
    );
    expect(turn([1, 1.05, 0.95, 1, 1, 1, 1, 1])).toBe(
      "Within the normal range all game.",
    );
    expect(turn([0.8, 0.8, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2])).toBe(
      "Pulled ahead of the normal range at 9:00 and stayed there.",
    );
    expect(turn([1.2, 1.2, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8])).toBe(
      "Fell behind the normal range at 9:00 and stayed there.",
    );
    expect(turn([1.2, 0.8, 1.2, 0.8, 1.2, 0.8, 1, 1])).toBe(
      "Back within the normal range from 25:00.",
    );
  });

  it("goes by how the match ended, not the first crossing, and ignores wobbles inside the range", () => {
    expect(turn([0.8, 1.2, 0.8, 1.2, 0.8, 1.2, 1.2, 1.2])).toBe(
      "Pulled ahead of the normal range at 20:00 and stayed there.",
    );
    expect(turn([1.2, 0.8, 1.2, 0.8, 1.2, 0.8, 0.8, 0.8])).toBe(
      "Fell behind the normal range at 20:00 and stayed there.",
    );
    expect(turn([1.2, 1.2, 1.2, 0.98, 1.2, 1.2, 1.2, 1.2])).toBe(
      "Pulled ahead of the normal range at 15:00 and stayed there.",
    );
  });

  it("a change at the last snapshot happened by the end", () => {
    expect(turn([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 0.8])).toBe(
      "Fell behind the normal range by the end (30:00).",
    );
  });

  it("colours strongest and weakest only outside the normal range", () => {
    const [strongest, weakest] = stretches(
      withShares([0.95, 0.97, 1, 1, 1, 1, 1, 1]),
      curve,
    );
    expect(strongest.tone).toBeUndefined();
    expect(weakest.tone).toBeUndefined();
    expect(weakest.text).toBe("Around 3:00: 5% fewer souls than the average.");
  });

  it("says through when when the average stops before the match ends", () => {
    const short = { ...curve, points: curve.points.filter((p) => p.t <= 900) };
    expect(turn([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2], short)).toBe(
      "Ahead of the normal range through 15:00, where the average stops.",
    );
    expect(turn([0.8, 0.8, 1.2, 1.2, 1.2, 0.5, 0.5, 0.5], short)).toBe(
      "Pulled ahead of the normal range at 9:00 and stayed there through 15:00, where the average stops.",
    );
    expect(turn([1.2, 1.2, 1.2, 1.2, 0.8, 0.5, 0.5, 0.5], short)).toBe(
      "Fell behind the normal range at 15:00, where the average stops.",
    );
  });

  it("reads level within half a percent, and names the all-ranks average", () => {
    const [strongest, weakest] = stretches(
      withShares([1.002, 1.001, 1, 1, 1, 1, 1, 1]),
      { ...curve, band: rankBand(0) },
    );
    expect(strongest).toEqual({
      label: "Strongest",
      text: "Around 3:00: level with the all-ranks average.",
    });
    expect(weakest).toEqual({
      label: "Weakest",
      text: "Around 9:00: level with the average.",
    });
  });

  it("needs two snapshots with an average to compare; otherwise only deaths", () => {
    const first = { ...curve, points: curve.points.slice(0, 1) };
    expect(stretches(lead, first).map((s) => s.label)).toEqual([
      "Deaths",
      "Rough patch",
    ]);
  });

  it("without an average lists only deaths; one death reads singular", () => {
    expect(stretches({ ...second, deathTimes: [720] }, null)).toEqual([
      { label: "Deaths", text: "1 death: 12:00." },
    ]);
    expect(stretches({ ...second, deathTimes: [] }, null)).toEqual([
      { label: "Deaths", text: "No deaths." },
    ]);
  });
});

describe("perspective", () => {
  const names = new Map([
    [ACCOUNT, "Fargo"],
    [5001, "somdr"],
  ]);

  it("opens as me if I played, else the player I came from, else the whole match", () => {
    expect(defaultPerspective(report, ACCOUNT, 5001)).toBe(1);
    expect(defaultPerspective(report, 42, 5001)).toBe(2);
    expect(defaultPerspective(report, null, undefined)).toBeNull();
    expect(defaultPerspective(report, 42, 43)).toBeNull();
  });

  it("says You only for the remembered account", () => {
    expect(displayName(lead, names, ACCOUNT)).toBe("You");
    expect(displayName(lead, names, null)).toBe("Fargo");
    expect(displayName(report.players[5], names, null)).toBe(heroes[5].name);
    expect(displayName(lead, new Map([[ACCOUNT, ""]]), null)).toBe(
      heroes[0].name,
    );
    expect([
      possessive("You", true),
      possessive("You", false),
      possessive("somdr", false),
    ]).toEqual(["Your", "You's", "somdr's"]);
  });

  it("labels options by team, hero and name, and notes whose match it is", () => {
    expect(optionLabel(lead, names, ACCOUNT)).toBe(
      `Amber · ${heroes[0].name} · Fargo (you)`,
    );
    expect(optionLabel(report.players[7], names, ACCOUNT)).toBe(
      `Sapphire · ${heroes[7].name}`,
    );
    expect(viewNote(lead, names, ACCOUNT)).toBe("This is your match.");
    expect(viewNote(second, names, ACCOUNT)).toBe(
      "You're viewing somdr's match. Labels and verdicts are from their point of view.",
    );
    expect(viewNote(undefined, names, ACCOUNT)).toBe(
      "Whole-match view. Nobody is highlighted.",
    );
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/match-report/insights.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write the formatters**

`src/features/match-report/utils/format.ts`:

```ts
/** Match clock, e.g. 6:32 or 36:04. */
export function clock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 59.9K, 906, 12.5 (fractions only below 100). */
export function compact(value: number) {
  const size = Math.abs(value);
  if (size < 0.05) return "0";
  const sign = value < 0 ? "−" : "";
  if (size >= 999.5) return `${sign}${(size / 1000).toFixed(1)}K`;
  if (size >= 99.95 || Number.isInteger(size))
    return `${sign}${Math.round(size)}`;
  return `${sign}${size.toFixed(1)}`;
}

/** "12%": a 0–1 share or change as a whole percent, without its sign. */
export const percent = (share: number) =>
  `${Math.round(Math.abs(share) * 100)}%`;
```

- [ ] **Step 4: Write perspective helpers**

`src/features/match-report/utils/perspective.ts`:

```ts
import { heroById } from "@/shared/catalog";
import { TEAM_NAMES, type MatchReport, type ReportPlayer } from "./report";

export const heroName = (heroId: number) =>
  heroById.get(heroId)?.name ?? `Hero ${heroId}`;

const slotOf = (report: MatchReport, accountId: number | null | undefined) =>
  accountId
    ? report.players.find((p) => p.accountId === accountId)?.slot
    : undefined;

/**
 * Whose point of view the report opens in: the remembered "me" account if it
 * played, otherwise the player the viewer came from (the profile, or the
 * link's ?player=), otherwise the whole match (null).
 */
export function defaultPerspective(
  report: MatchReport,
  meId: number | null,
  fromId?: number,
): number | null {
  return slotOf(report, meId) ?? slotOf(report, fromId) ?? null;
}

export const isMe = (player: ReportPlayer, meId: number | null) =>
  meId !== null && player.accountId === meId;

/** "You" for the remembered account, otherwise the Steam name or the hero. */
export function displayName(
  player: ReportPlayer,
  names: Map<number, string>,
  meId: number | null,
) {
  if (isMe(player, meId)) return "You";
  return names.get(player.accountId) || heroName(player.heroId);
}

/** "Your" for the remembered account, otherwise "somdr's". */
export const possessive = (name: string, me: boolean) =>
  me ? "Your" : `${name}'s`;

/** "Amber · Haze · moealali777 (you)". */
export function optionLabel(
  player: ReportPlayer,
  names: Map<number, string>,
  meId: number | null,
) {
  const name = names.get(player.accountId);
  return [
    TEAM_NAMES[player.team],
    heroName(player.heroId),
    ...(name ? [name] : []),
  ]
    .join(" · ")
    .concat(isMe(player, meId) ? " (you)" : "");
}

export function viewNote(
  player: ReportPlayer | undefined,
  names: Map<number, string>,
  meId: number | null,
) {
  if (!player) return "Whole-match view. Nobody is highlighted.";
  if (isMe(player, meId)) return "This is your match.";
  return `You're viewing ${displayName(player, names, meId)}'s match. Labels and verdicts are from their point of view.`;
}
```

- [ ] **Step 5: Write verdicts, buffs and impact**

`src/features/match-report/utils/insights.ts`:

```ts
import { metricById, type MetricId } from "./metrics";
import { averageAt, type RankCurve } from "./rank-curve";
import { finalValue, type ReportPlayer } from "./report";

export interface Verdict {
  label: string;
  value: number;
  // value ÷ rank average − 1; null when there is no average to compare with.
  change: number | null;
}

const average = (curve: RankCurve | null, id: MetricId, durationS: number) =>
  curve
    ? (averageAt(curve, metricById.get(id)!, durationS)?.avg ?? null)
    : null;

const change = (value: number, avg: number | null) =>
  avg && avg > 0 ? value / avg - 1 : null;

/** Souls / min, hero damage and creep kills at the end of the match, against the rank average then. */
export function verdicts(
  player: ReportPlayer,
  durationS: number,
  curve: RankCurve | null,
): Verdict[] {
  const minutes = durationS / 60;
  const soulsAvg = average(curve, "souls", durationS);
  const souls = minutes > 0 ? player.netWorth / minutes : 0;
  const damage = finalValue(player, "heroDamage");
  const creeps = finalValue(player, "creepKills");
  return [
    {
      label: "Souls / min",
      value: Math.round(souls),
      change: change(souls, soulsAvg === null ? null : soulsAvg / minutes),
    },
    {
      label: "Hero damage",
      value: damage,
      change: change(damage, average(curve, "heroDamage", durationS)),
    },
    {
      label: "Creep kills",
      value: creeps,
      change: change(creeps, average(curve, "creepKills", durationS)),
    },
  ];
}

/** Permanent buffs picked up, and the rank average at the same match length. */
export function buffs(
  player: ReportPlayer,
  durationS: number,
  curve: RankCurve | null,
) {
  return {
    count: player.buffCount,
    average: average(curve, "permanentBuffs", durationS),
  };
}

export interface ImpactRow {
  label: string;
  share: number;
  value: number;
}

/** The player's share of their team's totals, and their kill participation. */
export function impact(player: ReportPlayer, players: ReportPlayer[]) {
  const team = players.filter((p) => p.team === player.team);
  const share = (id: MetricId, label: string): ImpactRow => {
    const value = finalValue(player, id);
    const total = team.reduce((sum, p) => sum + finalValue(p, id), 0);
    return { label, value, share: total > 0 ? value / total : 0 };
  };
  const teamKills = team.reduce((sum, p) => sum + p.kills, 0);
  return {
    rows: [
      share("heroDamage", "Hero damage"),
      share("objectiveDamage", "Objective damage"),
      share("healing", "Healing"),
    ],
    killParticipation: {
      share:
        teamKills > 0
          ? Math.min(1, (player.kills + player.assists) / teamKills)
          : 0,
      involved: player.kills + player.assists,
      teamKills,
    },
  };
}
```

- [ ] **Step 6: Write stretches**

`src/features/match-report/utils/stretches.ts`:

```ts
import { clock, percent } from "./format";
import { metricById } from "./metrics";
import { averageAt, type RankCurve } from "./rank-curve";
import type { ReportPlayer } from "./report";

// Three or more deaths inside this window make a rough patch.
export const ROUGH_PATCH_S = 300;
export const ROUGH_PATCH_DEATHS = 3;

export interface Stretch {
  label: string;
  text: string;
  tone?: "good" | "bad";
}

// Souls against the rank average at one snapshot: r = souls ÷ average − 1.
// `side` is 1 above the normal range (average ± 1 standard deviation), −1
// below it and 0 inside it, so small wobbles around the average don't count.
interface Point {
  t: number;
  r: number;
  side: -1 | 0 | 1;
}

const level = (r: number) => Math.round(Math.abs(r) * 100) === 0;
const versus = (r: number, average: string) =>
  level(r)
    ? `level with ${average}`
    : `${percent(r)} ${r > 0 ? "more" : "fewer"} souls than ${average}`;

/**
 * Where the player ended up against the normal range, and since when.
 * `until` is set when the average stops before the match ends.
 */
function turningPoint(points: Point[], until: string) {
  const last = points.at(-1)!.side;
  let start = points.length - 1;
  while (start > 0 && points[start - 1].side === last) start--;
  if (start === 0) {
    const where = last === 1 ? "Ahead of" : last === -1 ? "Behind" : "Within";
    return `${where} the normal range ${until || "all game"}.`;
  }
  const at = clock(points[start].t);
  const moved =
    last === 1
      ? "Pulled ahead of the normal range"
      : last === -1
        ? "Fell behind the normal range"
        : "Back within the normal range";
  // A change at the last snapshot has no time after it to "stay" in.
  if (start === points.length - 1)
    return until
      ? `${moved} at ${at}, where the average stops.`
      : `${moved} by the end (${at}).`;
  const tail = until ? ` ${until}` : "";
  return last === 0
    ? `${moved} from ${at}${tail}.`
    : `${moved} at ${at} and stayed there${tail}.`;
}

function roughPatch(deaths: number[]): Stretch | null {
  let best: number[] = [];
  for (const start of deaths) {
    const inside = deaths.filter(
      (t) => t >= start && t <= start + ROUGH_PATCH_S,
    );
    if (inside.length > best.length) best = inside;
  }
  return best.length >= ROUGH_PATCH_DEATHS
    ? {
        label: "Rough patch",
        text: `${best.length} deaths between ${clock(best[0])} and ${clock(best.at(-1)!)}.`,
        tone: "bad",
      }
    : null;
}

/**
 * Rule-based sentences from the souls curve against the rank average at
 * each snapshot, plus the death times. With fewer than two snapshots to
 * compare, only deaths. When the average stops before the match does, the
 * sentences say until when.
 */
export function stretches(
  player: ReportPlayer,
  curve: RankCurve | null,
): Stretch[] {
  const souls = metricById.get("souls")!;
  const points: Point[] = curve
    ? player.times.flatMap((t, index) => {
        const at = averageAt(curve, souls, t);
        if (!at || at.avg <= 0) return [];
        const value = player.values.souls[index];
        const side =
          value > at.avg + at.std ? 1 : value < at.avg - at.std ? -1 : 0;
        return [{ t, r: value / at.avg - 1, side }];
      })
    : [];
  const result: Stretch[] = [];
  if (curve && points.length >= 2) {
    const end = points.at(-1)!.t;
    const until =
      end < player.times.at(-1)!
        ? `through ${clock(end)}, where the average stops`
        : "";
    const average =
      curve.band.min > 0
        ? `the ${curve.band.label} average`
        : "the all-ranks average";
    const best = points.reduce((a, b) => (b.r > a.r ? b : a));
    const worst = points.reduce((a, b) => (b.r < a.r ? b : a));
    result.push(
      {
        label: "Strongest",
        text: `Around ${clock(best.t)}: ${versus(best.r, average)}.`,
        // Coloured only outside the normal range, like the turning point.
        tone: best.side === 1 ? "good" : undefined,
      },
      {
        label: "Weakest",
        text: `Around ${clock(worst.t)}: ${versus(worst.r, "the average")}.`,
        tone: worst.side === -1 ? "bad" : undefined,
      },
      { label: "Turning point", text: turningPoint(points, until) },
    );
  }
  const deaths = player.deathTimes;
  result.push({
    label: "Deaths",
    text: deaths.length
      ? `${deaths.length} ${deaths.length === 1 ? "death" : "deaths"}: ${deaths.map(clock).join(", ")}.`
      : "No deaths.",
  });
  const patch = roughPatch(deaths);
  if (patch) result.push(patch);
  return result;
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run tests/match-report`
Expected: PASS (26 tests).

- [ ] **Step 8: Check and commit**

Run `npm test` and `npx tsc --noEmit`.

```bash
npx prettier --write src/features/match-report tests/match-report
git add src/features/match-report tests/match-report
git commit -m "feat(match-report): verdicts, stretches, impact and perspective rules"
```

---

### Task 4: Graph data

**Files:**
- Create: `src/features/match-report/utils/graph.ts`
- Test: `tests/match-report/graph.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/match-report/graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  averageSeries,
  formatValue,
  leadSeries,
  playerSeries,
  rangeAvailable,
  rangeOf,
  ranking,
  rankingTitle,
  teamSeries,
  valueAt,
} from "@/features/match-report/utils/graph";
import { metricById } from "@/features/match-report/utils/metrics";
import { parseCurve, rankBand } from "@/features/match-report/utils/rank-curve";
import { parseMatchReport } from "@/features/match-report/utils/report";
import { matchMetadata, rankCurveRows } from "../fixtures/match-report";

const report = parseMatchReport(matchMetadata(100000000), 1001);
const [lead] = report.players;
const souls = metricById.get("souls")!;
const deaths = metricById.get("deaths")!;
const accuracy = metricById.get("accuracy")!;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("series", () => {
  it("starts running totals at 0:00 and divides by minutes per minute", () => {
    const total = playerSeries(lead, souls, "total");
    expect(total[0]).toEqual([0, 0]);
    expect(total.at(-1)).toEqual([1800, 32400]);
    const rate = playerSeries(lead, souls, "perMinute");
    expect(rate[0]).toEqual([180, 900]);
    expect(rate.at(-1)).toEqual([1800, 1080]);
  });

  it("leaves rate stats as they are", () => {
    expect(playerSeries(lead, accuracy, "perMinute")).toEqual(
      playerSeries(lead, accuracy, "total"),
    );
    expect(playerSeries(lead, accuracy, "total")[0][0]).toBe(180);
  });

  it("interpolates and holds values beyond the ends", () => {
    const points: [number, number][] = [
      [0, 0],
      [100, 10],
    ];
    expect([
      valueAt(points, 50),
      valueAt(points, 500),
      valueAt([], 5),
      valueAt([[180, 5]], 0),
    ]).toEqual([5, 10, 0, 5]);
  });

  it("sums teams, averages rate stats, and leads Amber minus Sapphire", () => {
    expect(teamSeries(report.players, 0, souls, "total").at(-1)).toEqual([
      1800, 181800,
    ]);
    expect(teamSeries(report.players, 1, souls, "total").at(-1)).toEqual([
      1800, 210960,
    ]);
    expect(
      teamSeries(report.players, 0, accuracy, "total").at(-1)?.[1],
    ).toBeCloseTo(60);
    expect(leadSeries(report.players, souls, "total").at(-1)).toEqual([
      1800, -29160,
    ]);
  });

  it("leads by Amber's advantage: fewer deaths count as ahead", () => {
    // Amber died 9 times (4 + 5 × 1), Sapphire 6 times.
    expect(leadSeries(report.players, deaths, "total").at(-1)).toEqual([
      1800, -3,
    ]);
    expect(
      leadSeries(report.players, accuracy, "total").at(-1)?.[1],
    ).toBeCloseTo(0);
  });

  it("divides a team's total by minutes, even when someone's snapshots stop early", () => {
    const keep = 3;
    const early = {
      ...lead,
      times: lead.times.slice(0, keep),
      values: Object.fromEntries(
        Object.entries(lead.values).map(([id, v]) => [id, v.slice(0, keep)]),
      ) as typeof lead.values,
    };
    const players = [early, ...report.players.slice(1)];
    const total = teamSeries(players, 0, souls, "total").at(-1)!;
    const rate = teamSeries(players, 0, souls, "perMinute").at(-1)!;
    expect(rate[0]).toBe(1800);
    expect(rate[1]).toBeCloseTo(total[1] / 30);
  });

  it("leaves out players without snapshots", () => {
    const empty = {
      ...lead,
      times: [],
      values: Object.fromEntries(
        Object.keys(lead.values).map((id) => [id, []]),
      ) as unknown as typeof lead.values,
    };
    const players = [empty, ...report.players.slice(1)];
    expect(ranking(players, deaths, "total", 1800)).toHaveLength(11);
    expect(
      teamSeries(players, 0, metricById.get("level")!, "total").at(-1)?.[1],
    ).toBe(30);
  });

  it("gives the rank average up to match end, per minute too", () => {
    const avg = averageSeries(curve, souls, "total", 1800)!;
    expect(avg[0]).toEqual([0, 0, 0]);
    expect(avg.at(-1)).toEqual([1800, 30000, 3000]);
    const rate = averageSeries(curve, souls, "perMinute", 1800)!;
    expect(rate[0]).toEqual([180, 1000, 100]);
    const short = { ...curve, points: curve.points.filter((p) => p.t <= 900) };
    expect(averageSeries(short, souls, "total", 1800)!.at(-1)?.[0]).toBe(900);
    expect(averageSeries(null, souls, "total", 1800)).toBeNull();
    expect(averageSeries(curve, accuracy, "total", 1800)).toBeNull();
  });
});

describe("ranges and ranking", () => {
  it("maps time ranges and checks they fit the match", () => {
    expect(rangeOf("all", 1800)).toEqual([0, 1800]);
    expect(rangeOf("early", 1800)).toEqual([0, 600]);
    expect(rangeOf("mid", 1800)).toEqual([600, 1200]);
    expect(rangeOf("late", 1800)).toEqual([1200, 1800]);
    expect(rangeAvailable("late", 1100)).toBe(false);
    expect(rangeAvailable("mid", 1100)).toBe(true);
    expect(rangeAvailable("mid", 630)).toBe(false);
    expect(rangeAvailable("mid", 660)).toBe(true);
  });

  it("ranks everyone at a time, fewest first for deaths", () => {
    const most = ranking(report.players, souls, "total", 1800);
    expect(most[0].player.slot).toBe(12);
    expect(most[0].value).toBe(37560);
    expect(most.findIndex((r) => r.player.slot === 1)).toBe(6);
    const fewest = ranking(report.players, deaths, "total", 1800);
    expect(fewest[0].value).toBe(1);
    // Eleven players died once; ties go by slot.
    expect(fewest.slice(0, 11).map((r) => r.player.slot)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(fewest.at(-1)?.player.slot).toBe(1);
  });

  it("titles the ranking for the stat, values and range", () => {
    expect(rankingTitle(souls, "total", "all", 1800)).toBe("Most souls");
    expect(rankingTitle(deaths, "perMinute", "early", 600)).toBe(
      "Fewest deaths / min · at 10:00",
    );
    expect(rankingTitle(accuracy, "perMinute", "all", 1800)).toBe(
      "Highest accuracy %",
    );
  });

  it("formats axis values", () => {
    expect(formatValue(32400, souls)).toBe("32.4K");
    expect(formatValue(62.6666, accuracy)).toBe("62.7");
    expect(formatValue(-2.66, accuracy)).toBe("−2.7");
    expect(formatValue(-0.04, accuracy)).toBe("0");
    expect(formatValue(0.067, deaths)).toBe("0.07");
    expect(formatValue(-0.25, deaths)).toBe("−0.25");
    expect(formatValue(0.004, deaths)).toBe("0");
    expect(formatValue(-29160, souls)).toBe("−29.2K");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/match-report/graph.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the graph data module**

`src/features/match-report/utils/graph.ts`:

```ts
import { clock, compact } from "./format";
import type { Metric } from "./metrics";
import { averageAt, type RankCurve } from "./rank-curve";
import type { ReportPlayer, Team } from "./report";

export type ShowMode = "player" | "teams" | "lead" | "everyone";
export type ValueMode = "total" | "perMinute";
export type TimeRange = "all" | "early" | "mid" | "late";
export type Point = [t: number, value: number];
export type BandPoint = [t: number, average: number, std: number];

export const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "all", label: "Whole match" },
  { id: "early", label: "0–10" },
  { id: "mid", label: "10–20" },
  { id: "late", label: "20+" },
];
// Item purchases at least this expensive get a marker.
export const ITEM_MARKER_COST = 3200;

const perMinute = (metric: Metric, mode: ValueMode) =>
  mode === "perMinute" && !metric.rate;

/** [t, value] at 0:00 (running totals) and every snapshot; per minute drops 0:00. */
export function playerSeries(
  player: ReportPlayer,
  metric: Metric,
  mode: ValueMode,
): Point[] {
  const points: Point[] = player.times.map((t, index) => [
    t,
    player.values[metric.id][index],
  ]);
  if (metric.rate) return points;
  if (perMinute(metric, mode))
    return points.map(([t, value]) => [t, value / (t / 60)]);
  return [[0, 0], ...points];
}

/** Linear interpolation, held flat beyond either end. */
export function valueAt(points: Point[], t: number): number {
  if (!points.length) return 0;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) {
      const [t0, v0] = points[i - 1];
      return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return points.at(-1)![1];
}

/**
 * A team's total at every snapshot time (an average for rate stats), over
 * the players who have snapshots. Per minute divides the team total by the
 * minutes, so a player whose snapshots stop early isn't credited with
 * earning at the same pace after that.
 */
export function teamSeries(
  players: ReportPlayer[],
  team: Team,
  metric: Metric,
  mode: ValueMode,
): Point[] {
  const members = players.filter((p) => p.team === team && p.times.length);
  const series = members.map((p) => playerSeries(p, metric, "total"));
  const times = [...new Set(series.flat().map(([t]) => t))].sort(
    (a, b) => a - b,
  );
  const totals = times.map((t): Point => {
    const sum = series.reduce((total, points) => total + valueAt(points, t), 0);
    return [t, metric.rate ? sum / members.length : sum];
  });
  return perMinute(metric, mode)
    ? totals.filter(([t]) => t > 0).map(([t, value]) => [t, value / (t / 60)])
    : totals;
}

/**
 * Amber's advantage at every snapshot time: Amber minus Sapphire, or the
 * other way round for stats where fewer is better (deaths), so above zero
 * always means Amber is ahead.
 */
export function leadSeries(
  players: ReportPlayer[],
  metric: Metric,
  mode: ValueMode,
): Point[] {
  const amber = teamSeries(players, 0, metric, mode);
  const sapphire = teamSeries(players, 1, metric, mode);
  const sign = metric.lowerBetter ? -1 : 1;
  const times = [...new Set([...amber, ...sapphire].map(([t]) => t))].sort(
    (a, b) => a - b,
  );
  return times.map((t) => [
    t,
    sign * (valueAt(amber, t) - valueAt(sapphire, t)),
  ]);
}

/**
 * The rank average and standard deviation up to the match end or the
 * curve's last step, whichever comes first; null without an average.
 */
export function averageSeries(
  curve: RankCurve | null,
  metric: Metric,
  mode: ValueMode,
  durationS: number,
): BandPoint[] | null {
  if (!curve || !metric.curve) return null;
  const times = [
    ...(metric.rate ? [] : [0]),
    ...curve.points.map((p) => p.t).filter((t) => t > 0 && t < durationS),
    durationS,
  ];
  const points = times.flatMap((t): BandPoint[] => {
    const at = averageAt(curve, metric, t);
    if (!at) return [];
    if (!perMinute(metric, mode)) return [[t, at.avg, at.std]];
    return t > 0 ? [[t, at.avg / (t / 60), at.std / (t / 60)]] : [];
  });
  return points.length >= 2 ? points : null;
}

export function rangeOf(range: TimeRange, durationS: number): [number, number] {
  if (range === "early") return [0, Math.min(600, durationS)];
  if (range === "mid") return [600, Math.min(1200, durationS)];
  if (range === "late") return [1200, durationS];
  return [0, durationS];
}

// A range needs at least a minute of match to be worth showing.
const MIN_RANGE_S = 60;

/** Whether the match is long enough for the range to show anything. */
export const rangeAvailable = (range: TimeRange, durationS: number) =>
  range === "all" ||
  durationS >=
    (range === "early" ? 0 : range === "mid" ? 600 : 1200) + MIN_RANGE_S;

/** Everyone with snapshots, best first (fewest first for deaths), ties by slot. */
export function ranking(
  players: ReportPlayer[],
  metric: Metric,
  mode: ValueMode,
  at: number,
) {
  return players
    .filter((player) => player.times.length)
    .map((player) => ({
      player,
      value: valueAt(playerSeries(player, metric, mode), at),
    }))
    .sort((a, b) =>
      metric.lowerBetter
        ? a.value - b.value || a.player.slot - b.player.slot
        : b.value - a.value || a.player.slot - b.player.slot,
    );
}

/** "Most souls", "Fewest deaths / min · at 10:00", "Highest accuracy %". */
export function rankingTitle(
  metric: Metric,
  mode: ValueMode,
  range: TimeRange,
  at: number,
) {
  const lead = metric.lowerBetter ? "Fewest" : metric.rate ? "Highest" : "Most";
  return (
    `${lead} ${metric.label.toLowerCase()}` +
    (perMinute(metric, mode) ? " / min" : "") +
    (range === "all" ? "" : ` · at ${clock(at)}`)
  );
}

/**
 * Axis and tooltip numbers: one decimal for rate stats, two for small
 * fractions (deaths per minute), otherwise compact.
 */
export function formatValue(value: number, metric: Metric) {
  const size = Math.abs(value);
  const small = size > 0 && size < 1 && !Number.isInteger(size);
  if (!metric.rate && !small) return compact(value);
  const digits = small && !metric.rate ? 2 : 1;
  const rounded = Number(size.toFixed(digits));
  if (rounded === 0) return "0";
  return `${value < 0 ? "−" : ""}${rounded.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/match-report`
Expected: PASS (35 tests).

- [ ] **Step 5: Check and commit**

Run `npm test` and `npx tsc --noEmit`.

```bash
npx prettier --write src/features/match-report tests/match-report
git add src/features/match-report tests/match-report
git commit -m "feat(match-report): graph series, time ranges and rankings"
```

---

### Task 5: The report page in the desktop app (without the Graph)

**Files:**
- Modify: `src/app/navigation.ts`, `src/app/DesktopApp.tsx`, `src/app/styles/index.css`
- Create: `src/shared/site.ts`, `src/shared/utils/clipboard.ts`
- Modify: `web/app/seo.tsx` (import `SITE_URL` from the shared module)
- Modify: `public/manifest.json` (add the "Clipboard" permission)
- Create: `src/features/match-report/components/MatchReportPage.tsx`, `CopyLinkButton.tsx`, `ReportBanner.tsx`, `Verdicts.tsx`, `PlayerInsights.tsx`, `Scoreboard.tsx`
- Create: `src/features/match-report/styles/match-report.css`
- Modify: `src/features/home/components/YouCard.tsx`, `src/features/home/styles/home.css` (Home's "Open match report →")
- Test: `tests/browser/match-report.spec.ts` (create), `tests/browser/home.spec.ts` (one assertion)

> **Revision (code review of Task 5):**
> - **Shared hook:** `src/shared/api/useAsync.ts` now keys each result by the deps it was loaded for. For the one render after the deps change, it returns `{ loading: true }`, so a new player is never compared with the previous hero's average. New file content:
>
> ```ts
> import { useEffect, useState } from "react";
>
> type Settled<T> = { data?: T; error?: string; loading: boolean };
> export type AsyncState<T> = Settled<T> & { retry(): void };
>
> const same = (a: unknown[], b: unknown[]) =>
>   a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
>
> export function useAsync<T>(
>   load: (() => Promise<T>) | null,
>   deps: unknown[],
> ): AsyncState<T> {
>   // Each result remembers the deps it was loaded for.
>   const [state, setState] = useState<Settled<T> & { key?: unknown[] }>({
>     loading: !!load,
>   });
>   const [attempt, setAttempt] = useState(0);
>   const key = [...deps, attempt];
>   useEffect(() => {
>     if (!load) {
>       setState({ loading: false, key });
>       return;
>     }
>     let stale = false;
>     setState({ loading: true, key });
>     load().then(
>       (data) => {
>         if (!stale) setState({ data, loading: false, key });
>       },
>       (error: unknown) => {
>         if (!stale)
>           setState({
>             error: error instanceof Error ? error.message : String(error),
>             loading: false,
>             key,
>           });
>       },
>     );
>     return () => {
>       stale = true;
>     };
>   }, key);
>   const retry = () => setAttempt((count) => count + 1);
>   // Until the effect catches up with new deps, the last result belongs to the
>   // old ones: report loading rather than show it for a render.
>   if (!state.key || !same(state.key, key)) return { loading: !!load, retry };
>   return {
>     data: state.data,
>     error: state.error,
>     loading: state.loading,
>     retry,
>   };
> }
> ```
>
> - **Code and tests:** the component code, CSS and tests below are the reviewed versions.
>   - Scoped `.good` / `.bad` colours.
>   - Focus moves to "Viewing as" after "View as".
>   - Home's link has no origin player, so its Back link goes Home.
>   - Loading and failure states in the cards and notes.
>   - Copy link has a status message, a focused fallback field, and reads "Copy match link" for a player with no public account.
>   - Scoreboard rows have `height: auto`.
>   - Accessibility labels.
>   - Plus four extra tests.

The desktop app keeps each visited page mounted and hidden. The report is a new page `match`, keyed by match and origin, so opening another match starts fresh. Until Task 7, the website maps the `match` route to `/`. Nothing on the website links to it until Task 8.

- [ ] **Step 1: Add the route type**

Replace `src/app/navigation.ts` with:

```ts
export type Page =
  "home" | "live" | "tierlist" | "heroes" | "items" | "profile" | "match";
export interface Route {
  page: Page;
  heroId?: number;
  itemId?: number;
  // Profile: whose profile. Match: the player the viewer came from.
  accountId?: number;
  matchId?: number;
}
export type Navigate = (route: Route) => void;
```

- [ ] **Step 2: Add the shared site URL and clipboard helpers**

`src/shared/site.ts`:

```ts
// The public website's address. Both builds read VITE_SITE_URL, so links the
// desktop app copies point at the same site.
export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL?.trim() || "https://counterlock.example"
).replace(/\/+$/, "");

export const matchPath = (matchId: number, accountId?: number) =>
  `/matches/${matchId}${accountId ? `?player=${accountId}` : ""}`;

export const matchUrl = (matchId: number, accountId?: number) =>
  `${SITE_URL}${matchPath(matchId, accountId)}`;
```

`src/shared/utils/clipboard.ts`:

```ts
type OverwolfClipboard = {
  overwolf?: { utils?: { placeOnClipboard?: (data: string) => void } };
};

/** Overwolf's clipboard in the desktop app (needs the "Clipboard" permission), the browser's elsewhere. */
export async function copyText(text: string): Promise<void> {
  const utils = (globalThis as OverwolfClipboard).overwolf?.utils;
  if (utils?.placeOnClipboard) return utils.placeOnClipboard(text);
  if (!navigator.clipboard) throw new Error("Clipboard unavailable.");
  await navigator.clipboard.writeText(text);
}
```

In `web/app/seo.tsx`, replace:

```ts
import { routeToPath } from "./paths";

export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL?.trim() || "https://counterlock.example"
).replace(/\/+$/, "");
```

with:

```ts
import { SITE_URL } from "@/shared/site";
import { routeToPath } from "./paths";

export { SITE_URL };
```

In `public/manifest.json`, edit by hand (no prettier) and replace:

```json
    "Hotkeys",
    "Extensions"
  ],
```

with:

```json
    "Hotkeys",
    "Extensions",
    "Clipboard"
  ],
```

- [ ] **Step 3: Write the failing browser tests**

`tests/browser/match-report.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  MATCH_ID,
  heroes,
  matchMetadata,
  rankCurveRows,
} from "../fixtures/match-report";

const ACCOUNT = 100000000;
const STORAGE_KEY = "counterlock.profile.account";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const names: Record<number, string> = {
  [ACCOUNT]: "Fixture Persona",
  5001: "somdr",
};
const [lead, second] = heroes;
const cors = { "access-control-allow-origin": "*" };

async function routeApi(page: Page, curves: URLSearchParams[] = []) {
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ json: body, headers: cors });
    if (url.pathname.startsWith("/v1/assets/"))
      return route.fulfill({
        body: PNG,
        contentType: "image/png",
        headers: cors,
      });
    if (url.pathname === `/v1/matches/${MATCH_ID}/metadata`)
      return json(matchMetadata(ACCOUNT));
    if (url.pathname === "/v1/analytics/player-performance-curve") {
      curves.push(url.searchParams);
      return json(rankCurveRows());
    }
    if (url.pathname === "/v1/players/steam")
      return json(
        (url.searchParams.get("account_ids") ?? "")
          .split(",")
          .map(Number)
          .filter((id) => names[id])
          .map((id) => ({ account_id: id, personaname: names[id] })),
      );
    if (url.pathname === "/v1/players/rank")
      return json([{ account_id: ACCOUNT, badge: 73, rank: 7, subrank: 3 }]);
    if (url.pathname.endsWith("/match-history"))
      return json([
        {
          account_id: ACCOUNT,
          match_id: MATCH_ID,
          hero_id: lead.id,
          start_time: Math.floor(Date.now() / 1000) - 3600,
          game_mode: 1,
          match_mode: 4,
          player_team: 0,
          player_kills: 8,
          player_deaths: 4,
          player_assists: 6,
          denies: 3,
          last_hits: 110,
          net_worth: 32400,
          match_duration_s: 1800,
          match_result: 0,
        },
      ]);
    return json([]);
  });
}

async function storeAccount(page: Page) {
  await page.addInitScript(
    ({ key, accountId }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ accountId, seenAt: Date.now(), source: "manual" }),
      ),
    { key: STORAGE_KEY, accountId: ACCOUNT },
  );
}

const view = (page: Page) => page.locator(".page:not([hidden])");
const report = (page: Page) => view(page).locator(".match-report");
const viewingAs = (page: Page) =>
  report(page).getByRole("combobox", { name: "Viewing as" });

async function openReport(page: Page, curves: URLSearchParams[] = []) {
  await storeAccount(page);
  await routeApi(page, curves);
  await page.goto("/");
  await view(page)
    .locator(".latest-match")
    .getByRole("button", { name: "Open match report →" })
    .click();
  await expect(report(page).locator(".report-result")).toBeVisible();
}

test("Home's latest match opens its report as you, against your rank", async ({
  page,
}) => {
  const curves: URLSearchParams[] = [];
  await openReport(page, curves);
  const r = report(page);
  await expect(r.locator(".report-note")).toHaveText("This is your match.");
  await expect(viewingAs(page)).toHaveValue("1");
  await expect(viewingAs(page).locator("option:checked")).toHaveText(
    `Amber · ${lead.name} · Fixture Persona (you)`,
  );
  await expect(r.locator(".report-result")).toHaveText("Victory");
  await expect(r.locator(".report-banner .eyebrow")).toHaveText(
    /^Match 1001 · Emissary-level lobby · 1h ago$/,
  );
  await expect(r.locator(".report-banner .report-stats dd")).toHaveText([
    "You",
    lead.name,
    "8 / 4 / 6",
    "32.4K",
    "1,080",
    "110",
    "30:00",
  ]);
  await expect(r.locator(".verdict span")).toHaveText([
    `▲ 8% vs avg ${lead.name} at Emissary`,
    `▲ 20% vs avg ${lead.name} at Emissary`,
    `▼ 25% vs avg ${lead.name} at Emissary`,
  ]);
  await expect(r.locator(".report-verdicts + .data-note")).toHaveText(
    `Compared with the average ${lead.name} at Emissary at the same match length, over the last 30 days.`,
  );
  await expect(r.locator(".verdict span").first()).toHaveCSS(
    "color",
    "rgb(127, 211, 154)",
  );
  await expect(r.locator(".verdict span").nth(2)).toHaveCSS(
    "color",
    "rgb(224, 122, 95)",
  );
  // Home's latest match has no origin player, so Back goes Home.
  await expect(r.getByRole("button", { name: "← Home" })).toBeVisible();
  const curve = curves.at(-1)!;
  expect(curve.get("hero_ids")).toBe(String(lead.id));
  expect(curve.get("resolution")).toBe("0");
  expect(curve.get("min_average_badge")).toBe("71");
  expect(curve.get("max_average_badge")).toBe("76");
});

test("stretches, impact and buffs describe the selected player", async ({
  page,
}) => {
  await openReport(page);
  const r = report(page);
  await expect(r.locator(".stretch")).toHaveText([
    "StrongestAround 15:00: 20% more souls than the Emissary average.",
    "WeakestAround 3:00: 10% fewer souls than the average.",
    "Turning pointBack within the normal range from 20:00.",
    "Deaths4 deaths: 6:40, 21:40, 23:20, 25:00.",
    "Rough patch3 deaths between 21:40 and 25:00.",
  ]);
  await expect(r.getByText("Your share of the team's total")).toBeVisible();
  await expect(r.locator(".impact-row b")).toHaveText([
    "21% 18.0K",
    "29% 3.0K",
    "29% 6.0K",
  ]);
  await expect(r.locator(".impact-kp")).toHaveText(
    "Kill participation50%14 of 28 team kills",
  );
  await expect(r.locator(".report-stats.buffs dd")).toHaveText(["3", "3.0"]);
  await expect(r.locator(".report-stats.buffs dt").nth(1)).toHaveText(
    `Avg ${lead.name} at Emissary`,
  );
});

test("Viewing as another player switches every perspective-dependent part", async ({
  page,
}) => {
  const curves: URLSearchParams[] = [];
  await openReport(page, curves);
  const r = report(page);
  await viewingAs(page).selectOption("2");
  await expect(r.locator(".report-note")).toHaveText(
    "You're viewing somdr's match. Labels and verdicts are from their point of view.",
  );
  await expect(r.locator(".report-banner .report-stats dd").first()).toHaveText(
    "somdr",
  );
  await expect(r.getByText("somdr's share of the team's total")).toBeVisible();
  await expect(r.locator(".verdict span").first()).toContainText(
    `vs avg ${second.name} at Emissary`,
  );
  expect(curves.at(-1)!.get("hero_ids")).toBe(String(second.id));
  await expect(r.locator(".report-table tr.selected")).toContainText(
    second.name,
  );
});

test("the whole match has no player: team banner and no verdicts", async ({
  page,
}) => {
  await openReport(page);
  const r = report(page);
  await viewingAs(page).selectOption("all");
  await expect(r.locator(".report-note")).toHaveText(
    "Whole-match view. Nobody is highlighted.",
  );
  await expect(r.locator(".report-result")).toHaveText("Amber won");
  await expect(r.locator(".report-banner .report-stats dd")).toHaveText([
    "30:00",
    "181.8K",
    "211.0K",
    "28 – 24",
  ]);
  await expect(r.locator(".verdict")).toHaveCount(0);
  await expect(r.locator(".report-pick")).toHaveText(
    "Pick a player in “Viewing as” to see their verdicts, best and worst stretches and impact.",
  );
  await expect(r.locator(".report-table tr.selected")).toHaveCount(0);
});

test("scoreboard lists the winners first by souls; View as switches player", async ({
  page,
}) => {
  await openReport(page);
  const r = report(page);
  await expect(r.locator(".report-team-name")).toHaveText([
    "Amber · winner",
    "Sapphire",
  ]);
  const amber = r.locator(".report-team").first().locator("tbody tr");
  await expect(amber).toHaveCount(6);
  await expect(amber.first()).toContainText(lead.name);
  await expect(amber.first().locator("td")).toHaveText([
    `${lead.name}You`,
    "8 / 4 / 6",
    "32.4K",
    "18.0K",
    "15.0K",
    "3.0K",
    "6.0K",
    "110",
    "Viewing",
  ]);
  await expect(amber.first()).toHaveClass("selected");
  const sapphire = r.locator(".report-team").nth(1).locator("tbody tr");
  await expect(sapphire.first()).toContainText(heroes[11].name);
  await sapphire
    .first()
    .getByRole("button", { name: /^View as/ })
    .click();
  await expect(viewingAs(page)).toHaveValue("12");
  await expect(viewingAs(page)).toBeFocused();
  await expect(r.locator(".report-result")).toHaveText("Defeat");
});

test("Copy link copies the website URL for the current point of view", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string[] }).copied.push(text);
        },
      },
    });
    (window as unknown as { copied: string[] }).copied = [];
  });
  await openReport(page);
  const button = report(page).getByRole("button", { name: "Copy link" });
  await button.click();
  await expect(
    report(page).getByRole("button", { name: "Link copied" }),
  ).toBeVisible();
  await viewingAs(page).selectOption("all");
  await report(page).getByRole("button", { name: "Copy link" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copied: string[] }).copied,
    ),
  ).toEqual([
    `https://counterlock.example/matches/${MATCH_ID}?player=${ACCOUNT}`,
    `https://counterlock.example/matches/${MATCH_ID}`,
  ]);
});

test("switching player never compares against the previous hero's average", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await storeAccount(page);
  await routeApi(page);
  // The second hero's average is twice as high, and arrives late.
  await page.route(
    "https://api.deadlock-api.com/v1/analytics/player-performance-curve**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("hero_ids") !== String(second.id))
        return route.fallback();
      await gate;
      return route.fulfill({
        json: rankCurveRows().map((row) => ({
          ...row,
          net_worth_avg: row.net_worth_avg * 2,
        })),
        headers: cors,
      });
    },
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  const souls = report(page).locator(".verdict span").first();
  await expect(souls).toHaveText(`▲ 8% vs avg ${lead.name} at Emissary`);
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { seenVerdicts: seen });
    new MutationObserver(() =>
      document
        .querySelectorAll(".verdict span")
        .forEach((node) => seen.push(node.textContent ?? "")),
    ).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await viewingAs(page).selectOption("2");
  await expect(souls).toHaveText("Loading…");
  release();
  // 932 souls / min against 2,000, not against the first hero's 1,000.
  await expect(souls).toHaveText(`▼ 53% vs avg ${second.name} at Emissary`);
  const seen = await page.evaluate(
    () => (window as unknown as { seenVerdicts: string[] }).seenVerdicts,
  );
  expect(seen.filter((text) => text.startsWith("▼ 7%"))).toEqual([]);
});

test("a failed copy shows the link to copy by hand", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => Promise.reject(new Error("denied")) },
    });
  });
  await openReport(page);
  await report(page).getByRole("button", { name: "Copy link" }).click();
  await expect(report(page).getByRole("status")).toHaveText(
    "Couldn't copy the link. Copy it from here:",
  );
  const field = report(page).getByRole("textbox", { name: "Match link" });
  await expect(field).toHaveValue(
    `https://counterlock.example/matches/${MATCH_ID}?player=${ACCOUNT}`,
  );
  await expect(field).toBeFocused();
});

test("a player without a public account gets the whole-match link", async ({
  page,
}) => {
  const hidden = matchMetadata(ACCOUNT);
  hidden.match_info.players[1].account_id = 0;
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) => route.fulfill({ json: hidden, headers: cors }),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  await viewingAs(page).selectOption("2");
  await expect(
    report(page).getByRole("button", { name: "Copy match link" }),
  ).toBeVisible();
});

test("a failed match load says so and Retry recovers", async ({ page }) => {
  let fail = true;
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) =>
      fail
        ? route.fulfill({ status: 500, headers: cors, body: "" })
        : route.fallback(),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  await expect(report(page)).toContainText("Match details unavailable");
  fail = false;
  await report(page).getByRole("button", { name: "Retry" }).click();
  await expect(report(page).locator(".report-result")).toHaveText("Victory");
});
```

In `tests/browser/home.spec.ts`, inside the test `Home shows the You card and latest match for a stored account`, replace:

```ts
  await latest.getByRole("button", { name: "View profile →" }).click();
```

with:

```ts
  await expect(
    latest.getByRole("button", { name: "Open match report →" }),
  ).toBeVisible();
  await latest.getByRole("button", { name: "View profile →" }).click();
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `npx playwright test tests/browser/match-report.spec.ts`
Expected: FAIL. There is no "Open match report →" button yet.

- [ ] **Step 5: Write the components**

`src/features/match-report/components/CopyLinkButton.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { matchUrl } from "@/shared/site";
import { copyText } from "@/shared/utils/clipboard";

const COPIED_MS = 2500;

/** `accountId` 0 is a player without a public account: the link opens the whole match. */
export function CopyLinkButton({
  matchId,
  accountId,
}: {
  matchId: number;
  accountId?: number;
}) {
  const url = matchUrl(matchId, accountId);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => setState("idle"), [url]);
  useEffect(() => {
    if (state === "failed") field.current?.focus();
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), COPIED_MS);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <span className="copy-link">
      <button
        type="button"
        className="profile-action"
        onClick={() =>
          copyText(url).then(
            () => setState("copied"),
            () => setState("failed"),
          )
        }
      >
        {state === "copied"
          ? "Link copied"
          : accountId === 0
            ? "Copy match link"
            : "Copy link"}
      </button>
      <span
        role="status"
        className={state === "failed" ? "copy-link-note" : "visually-hidden"}
      >
        {state === "copied"
          ? "Link copied to the clipboard."
          : state === "failed"
            ? "Couldn't copy the link. Copy it from here:"
            : ""}
      </span>
      {state === "failed" && (
        <input
          ref={field}
          className="copy-link-fallback"
          aria-label="Match link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </span>
  );
}
```

`src/features/match-report/components/ReportBanner.tsx`:

```tsx
import { timeAgo } from "@/features/profile/utils/format";
import { catalog, heroById } from "@/shared/catalog";
import { OptionalImage } from "@/shared/ui/OptionalImage";
import { Picture } from "@/shared/ui/Picture";
import { clock, compact } from "../utils/format";
import { displayName, heroName } from "../utils/perspective";
import { lobbyBadge } from "../utils/rank-curve";
import {
  NORMAL_MODE,
  TEAM_NAMES,
  teamOf,
  type MatchReport,
  type ReportPlayer,
} from "../utils/report";

function eyebrow(report: MatchReport) {
  const tier = Math.floor(lobbyBadge(report.players) / 10);
  const rank = catalog.ranks.find((r) => r.tier === tier && tier > 0)?.name;
  const lobby =
    report.gameMode !== NORMAL_MODE
      ? "Street Brawl"
      : rank
        ? `${rank}-level lobby`
        : undefined;
  return [
    `Match ${report.matchId}`,
    ...(lobby ? [lobby] : []),
    ...(report.startTime ? [timeAgo(report.startTime * 1000)] : []),
  ].join(" · ");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ReportBanner({
  report,
  selected,
  names,
  meId,
}: {
  report: MatchReport;
  selected?: ReportPlayer;
  names: Map<number, string>;
  meId: number | null;
}) {
  if (!selected) {
    const souls = (team: 0 | 1) =>
      teamOf(report, team).reduce((sum, p) => sum + p.netWorth, 0);
    const kills = (team: 0 | 1) =>
      teamOf(report, team).reduce((sum, p) => sum + p.kills, 0);
    return (
      <div className="report-banner whole">
        <div className="report-banner-body">
          <p className="eyebrow">{eyebrow(report)} · whole match</p>
          <h1 className="report-result">
            {TEAM_NAMES[report.winningTeam]} won
          </h1>
          <dl className="report-stats">
            <Stat label="Duration" value={clock(report.durationS)} />
            <Stat label="Amber souls" value={compact(souls(0))} />
            <Stat label="Sapphire souls" value={compact(souls(1))} />
            <Stat label="Kills" value={`${kills(0)} – ${kills(1)}`} />
          </dl>
        </div>
      </div>
    );
  }
  const hero = heroById.get(selected.heroId);
  const won = selected.team === report.winningTeam;
  const minutes = report.durationS / 60;
  return (
    <div className={`report-banner ${won ? "won" : "lost"}`}>
      <div className="hero-art" key={selected.heroId}>
        <OptionalImage src={hero?.backgroundImage} className="hero-art-bg" />
      </div>
      <Picture
        key={selected.heroId}
        className="report-banner-portrait"
        src={hero?.cardImage ?? hero?.image}
        label={heroName(selected.heroId)}
      />
      <div className="report-banner-body">
        <p className="eyebrow">{eyebrow(report)}</p>
        <h1 className="report-result">{won ? "Victory" : "Defeat"}</h1>
        <dl className="report-stats">
          <Stat label="Player" value={displayName(selected, names, meId)} />
          <Stat label="Hero" value={heroName(selected.heroId)} />
          <Stat
            label="K / D / A"
            value={`${selected.kills} / ${selected.deaths} / ${selected.assists}`}
          />
          <Stat label="Souls" value={compact(selected.netWorth)} />
          <Stat
            label="Souls / min"
            value={
              minutes > 0
                ? Math.round(selected.netWorth / minutes).toLocaleString(
                    "en-US",
                  )
                : "—"
            }
          />
          <Stat label="Last hits" value={String(selected.lastHits)} />
          <Stat label="Duration" value={clock(report.durationS)} />
        </dl>
      </div>
    </div>
  );
}
```

`src/features/match-report/components/Verdicts.tsx`:

```tsx
import type { AsyncState } from "@/shared/api/useAsync";
import { clock, percent } from "../utils/format";
import { verdicts } from "../utils/insights";
import { heroName } from "../utils/perspective";
import type { RankCurve } from "../utils/rank-curve";
import type { ReportPlayer } from "../utils/report";

export function curveNote(
  hero: string,
  curve: AsyncState<RankCurve>,
  normal: boolean,
  durationS: number,
) {
  if (!normal) return "Rank averages cover normal matches only.";
  if (curve.loading) return "Loading the rank average…";
  if (!curve.data) return `Rank average unavailable: ${curve.error ?? ""}`;
  const { band, widenedFrom, points } = curve.data;
  if (!points.length)
    return `Too few ${hero} games at ${band.label} in the last 30 days.`;
  const end = points.at(-1)!.t;
  return (
    `Compared with the average ${hero} at ${band.label} at the same match length, over the last 30 days.` +
    (widenedFrom
      ? ` Too few ${hero} games at ${widenedFrom} alone, so this covers ${band.label}.`
      : "") +
    (end < durationS
      ? ` Too few ${hero} games at ${band.label} ran this long, so the average stops at ${clock(end)}.`
      : "")
  );
}

export function Verdicts({
  player,
  durationS,
  curve,
  normal,
}: {
  player: ReportPlayer;
  durationS: number;
  curve: AsyncState<RankCurve>;
  normal: boolean;
}) {
  const hero = heroName(player.heroId);
  const band = curve.data?.band.label;
  return (
    <>
      <div className="report-verdicts">
        {verdicts(player, durationS, curve.data ?? null).map((v) => (
          <div className="verdict" key={v.label}>
            <small>{v.label}</small>
            <b>{v.value.toLocaleString("en-US")}</b>
            {curve.loading ? (
              <span className="muted">Loading…</span>
            ) : v.change === null ? (
              <span className="muted">No rank average</span>
            ) : percent(v.change) === "0%" ? (
              <span className="muted">
                Level with avg {hero} at {band}
              </span>
            ) : (
              <span className={v.change > 0 ? "good" : "bad"}>
                {v.change > 0 ? "▲" : "▼"} {percent(v.change)} vs avg {hero} at{" "}
                {band}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="data-note">
        {curveNote(hero, curve, normal, durationS)}
        {curve.error && (
          <>
            {" "}
            <button type="button" className="retry" onClick={curve.retry}>
              Retry
            </button>
          </>
        )}
      </p>
    </>
  );
}
```

`src/features/match-report/components/PlayerInsights.tsx`:

```tsx
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { compact, percent } from "../utils/format";
import { buffs, impact } from "../utils/insights";
import { displayName, heroName, isMe, possessive } from "../utils/perspective";
import type { RankCurve } from "../utils/rank-curve";
import type { MatchReport, ReportPlayer } from "../utils/report";
import { stretches } from "../utils/stretches";

// Impact bars fill at half the team's total; an even share is 1/6.
const BAR_FULL_SHARE = 0.5;
const EVEN_SHARE = 1 / 6;

export function PlayerInsights({
  player,
  report,
  curve,
  curveLoading,
  curveFailed,
  names,
  meId,
}: {
  player: ReportPlayer;
  report: MatchReport;
  curve: RankCurve | null;
  curveLoading: boolean;
  curveFailed: boolean;
  names: Map<number, string>;
  meId: number | null;
}) {
  const name = displayName(player, names, meId);
  const hero = heroName(player.heroId);
  const { rows, killParticipation } = impact(player, report.players);
  const pickups = buffs(player, report.durationS, curve);
  const bar = (share: number) =>
    `${Math.min(share / BAR_FULL_SHARE, 1) * 100}%`;
  return (
    <div className="report-cols">
      <div>
        <SectionHeader title="Best & worst stretches" />
        <p className="data-note">
          {curve
            ? `Souls against the average ${hero} at ${curve.band.label} at each snapshot · normal range = ±1 standard deviation`
            : curveLoading
              ? "Loading the rank average…"
              : curveFailed
                ? "Rank average unavailable, so only deaths are listed."
                : "No rank average for this match, so only deaths are listed."}
        </p>
        <ul className="stretches">
          {stretches(player, curve).map((s) => (
            <li key={s.label} className="stretch">
              <b className={s.tone}>{s.label}</b>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <SectionHeader title="Impact" />
        <p className="data-note">
          {possessive(name, isMe(player, meId))} share of the team's total ·
          bars fill at half · the line marks an even 1/6 share
        </p>
        <div className="impact">
          {rows.map((row) => (
            <div className="impact-row" key={row.label}>
              <span>{row.label}</span>
              <span className="impact-track" aria-hidden="true">
                <i style={{ width: bar(row.share) }} />
                <u style={{ left: bar(EVEN_SHARE) }} />
              </span>
              <b>
                {percent(row.share)} <small>{compact(row.value)}</small>
              </b>
            </div>
          ))}
          <p className="impact-kp">
            <span>Kill participation</span>
            <b>{percent(killParticipation.share)}</b>
            <small>
              {killParticipation.involved} of {killParticipation.teamKills} team
              kills
            </small>
          </p>
        </div>
        <SectionHeader title="Permanent buffs" />
        <dl className="report-stats buffs">
          <div>
            <dt>Picked up</dt>
            <dd
              className={
                pickups.average === null
                  ? undefined
                  : pickups.count >= pickups.average
                    ? "good"
                    : "bad"
              }
            >
              {pickups.count}
            </dd>
          </div>
          <div>
            <dt>
              {curve ? `Avg ${hero} at ${curve.band.label}` : "Rank average"}
            </dt>
            <dd>
              {curveLoading
                ? "…"
                : pickups.average === null
                  ? "—"
                  : pickups.average.toFixed(1)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

`src/features/match-report/components/Scoreboard.tsx`:

```tsx
import { RouteLink } from "@/app/links";
import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { compact } from "../utils/format";
import { heroName, isMe, optionLabel } from "../utils/perspective";
import {
  TEAM_NAMES,
  finalValue,
  teamOf,
  type MatchReport,
  type Team,
} from "../utils/report";

export function Scoreboard({
  report,
  names,
  meId,
  selected,
  onSelect,
}: {
  report: MatchReport;
  names: Map<number, string>;
  meId: number | null;
  selected: number | null;
  onSelect(slot: number): void;
}) {
  const winner = report.winningTeam;
  const order: Team[] = [winner, winner === 0 ? 1 : 0];
  return order.map((team) => (
    <div className="report-team" key={team}>
      <h3 className={`report-team-name team-${team}`}>
        {TEAM_NAMES[team]}
        {team === winner && " · winner"}
      </h3>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>K / D / A</th>
              <th>Souls</th>
              <th>Hero dmg</th>
              <th>Dmg taken</th>
              <th>Obj. dmg</th>
              <th>Healing</th>
              <th>Last hits</th>
              <th>
                <span className="visually-hidden">View as</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {teamOf(report, team)
              .sort((a, b) => b.netWorth - a.netWorth || a.slot - b.slot)
              .map((p) => {
                const hero = heroById.get(p.heroId);
                const current = p.slot === selected;
                return (
                  <tr
                    key={p.slot}
                    className={current ? "selected" : undefined}
                    aria-current={current ? "true" : undefined}
                  >
                    <td>
                      <span className="report-player">
                        <Picture
                          className="report-portrait"
                          src={hero?.cardImage ?? hero?.image}
                          label={heroName(p.heroId)}
                        />
                        <span>
                          <b>{heroName(p.heroId)}</b>
                          {p.accountId > 0 && (
                            <RouteLink
                              className="report-player-link"
                              aria-label={
                                isMe(p, meId) || names.get(p.accountId)
                                  ? undefined
                                  : `${heroName(p.heroId)} player's profile`
                              }
                              route={{
                                page: "profile",
                                accountId: p.accountId,
                              }}
                            >
                              {isMe(p, meId)
                                ? "You"
                                : names.get(p.accountId) || "Profile"}
                            </RouteLink>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>
                      {p.kills} / {p.deaths} / {p.assists}
                    </td>
                    <td>{compact(p.netWorth)}</td>
                    <td>{compact(finalValue(p, "heroDamage"))}</td>
                    <td>{compact(finalValue(p, "damageTaken"))}</td>
                    <td>{compact(finalValue(p, "objectiveDamage"))}</td>
                    <td>{compact(finalValue(p, "healing"))}</td>
                    <td>{p.lastHits}</td>
                    <td>
                      <button
                        type="button"
                        className="view-as-link"
                        aria-label={
                          current
                            ? undefined
                            : `View as ${optionLabel(p, names, meId)}`
                        }
                        disabled={current}
                        onClick={() => onSelect(p.slot)}
                      >
                        {current ? "Viewing" : "View as"}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  ));
}
```

`src/features/match-report/components/MatchReportPage.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { RouteLink } from "@/app/links";
import { useAsync } from "@/shared/api/useAsync";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
  fetchMatchReport,
  fetchPlayerNames,
  fetchRankCurve,
} from "../services/match-report";
import {
  defaultPerspective,
  optionLabel,
  viewNote,
} from "../utils/perspective";
import { lobbyBadge } from "../utils/rank-curve";
import { NORMAL_MODE, type MatchReport } from "../utils/report";
import { CopyLinkButton } from "./CopyLinkButton";
import { PlayerInsights } from "./PlayerInsights";
import { ReportBanner } from "./ReportBanner";
import { Scoreboard } from "./Scoreboard";
import { Verdicts } from "./Verdicts";

const NO_NAMES = new Map<number, string>();

function Report({
  report,
  fromId,
  meId,
}: {
  report: MatchReport;
  fromId?: number;
  meId: number | null;
}) {
  const names =
    useAsync(
      () => fetchPlayerNames(report.players.map((p) => p.accountId)),
      [report.matchId],
    ).data ?? NO_NAMES;
  // Until the viewer picks someone, the default follows `meId`, which the
  // website only learns after its first render.
  const [picked, setPicked] = useState<{ slot: number | null } | null>(null);
  const slot = picked ? picked.slot : defaultPerspective(report, meId, fromId);
  const selected = report.players.find((p) => p.slot === slot);
  const badge = selected ? selected.badge || lobbyBadge(report.players) : 0;
  const normal = report.gameMode === NORMAL_MODE;
  const curve = useAsync(
    selected && normal
      ? () => fetchRankCurve(selected.heroId, badge, report.durationS)
      : null,
    [selected?.heroId, badge, report.durationS],
  );
  const top = useRef<HTMLDivElement>(null);
  const viewing = useRef<HTMLSelectElement>(null);
  const refocus = useRef(false);
  // Focus once the selector names the new player, so it is read out.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    viewing.current?.focus({ preventScroll: true });
  }, [slot]);
  const select = (next: number | null) => setPicked({ slot: next });
  // "View as" sits far down the page: bring the new point of view into
  // sight and move focus to the selector, which now names that player.
  const viewAs = (next: number) => {
    select(next);
    if (next === slot) viewing.current?.focus({ preventScroll: true });
    else refocus.current = true;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView({
      block: "start",
      behavior: still ? "auto" : "smooth",
    });
  };
  return (
    <>
      <div className="report-bar" ref={top}>
        <RouteLink
          className="report-back"
          route={
            fromId === undefined
              ? { page: "home" }
              : { page: "profile", accountId: fromId }
          }
        >
          {fromId === undefined ? "← Home" : "← Back to profile"}
        </RouteLink>
        <label className="view-as">
          Viewing as
          <select
            ref={viewing}
            value={slot ?? "all"}
            onChange={(event) =>
              select(
                event.target.value === "all"
                  ? null
                  : Number(event.target.value),
              )
            }
          >
            <option value="all">Whole match (no player)</option>
            {report.players.map((p) => (
              <option key={p.slot} value={p.slot}>
                {optionLabel(p, names, meId)}
              </option>
            ))}
          </select>
        </label>
        <CopyLinkButton
          matchId={report.matchId}
          accountId={selected?.accountId}
        />
      </div>
      <p className="report-note">{viewNote(selected, names, meId)}</p>
      <ReportBanner {...{ report, selected, names, meId }} />
      {selected && (
        <Verdicts
          player={selected}
          durationS={report.durationS}
          curve={curve}
          normal={normal}
        />
      )}
      {selected ? (
        <PlayerInsights
          player={selected}
          report={report}
          curve={curve.data ?? null}
          curveLoading={curve.loading}
          curveFailed={!!curve.error}
          names={names}
          meId={meId}
        />
      ) : (
        <p className="muted report-pick">
          Pick a player in “Viewing as” to see their verdicts, best and worst
          stretches and impact.
        </p>
      )}
      <SectionHeader title="Scoreboard" />
      <Scoreboard
        {...{ report, names, meId }}
        selected={slot}
        onSelect={viewAs}
      />
    </>
  );
}

export function MatchReportPage({
  matchId,
  fromId,
  meId,
}: {
  matchId: number;
  fromId?: number;
  meId: number | null;
}) {
  const report = useAsync(() => fetchMatchReport(matchId), [matchId]);
  return (
    <section className="match-report">
      {report.loading && <p className="muted">Loading match…</p>}
      {report.error && (
        <p className="notice warning" role="status">
          Match details unavailable
          <button type="button" onClick={report.retry}>
            Retry
          </button>
        </p>
      )}
      {report.data && (
        <Report report={report.data} fromId={fromId} meId={meId} />
      )}
    </section>
  );
}
```

- [ ] **Step 6: Write the styles**

`src/features/match-report/styles/match-report.css`:

```css
.match-report {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 30px 40px;
}
.match-report > .notice {
  margin: 0;
}
.match-report .good {
  color: var(--good);
}
.match-report .bad {
  color: var(--bad);
}
/* Notes read as one paragraph, with Retry inline after the text. */
.match-report .data-note {
  display: block;
}
.match-report .retry {
  margin-left: 4px;
  padding: 0;
  color: var(--gold);
  font: 700 12px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.match-report .visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Viewing as, back link and Copy link. */
.report-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  scroll-margin-top: 18px;
}
.report-back {
  padding: 0;
  margin-right: auto;
  color: var(--muted);
  font: 700 12px var(--font-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.report-back:hover:not(:disabled) {
  color: var(--gold);
  text-decoration: none;
}
.view-as {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--muted);
  font: 700 12px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.view-as select {
  min-width: 0;
  max-width: 360px;
  border-color: var(--gold);
  font: 600 13px var(--font-body);
  letter-spacing: 0;
  text-transform: none;
}
.copy-link {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.copy-link .profile-action {
  margin: 0;
}
.copy-link-note {
  align-self: center;
  color: var(--bad);
  font-size: 12px;
}
.copy-link-fallback {
  width: min(320px, 100%);
  font-size: 12px;
}
.report-note {
  margin: 8px 0 12px;
  color: var(--dim);
  font-size: 12px;
  text-align: right;
}

/* Banner: win or loss for the selected player, or the whole match. */
.report-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 0 -30px;
  padding: 24px 30px;
  overflow: hidden;
  border-block: 1px solid var(--line);
}
/* The win or loss tint sits above the hero art and below the text. */
.report-banner::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    90deg,
    rgb(from var(--good) r g b / 0.1),
    transparent 60%
  );
  pointer-events: none;
}
.report-banner.lost::before {
  background: linear-gradient(
    90deg,
    rgb(from var(--bad) r g b / 0.12),
    transparent 60%
  );
}
.report-banner.whole::before {
  background: linear-gradient(
    90deg,
    rgb(from var(--ally) r g b / 0.14),
    rgb(from var(--enemy) r g b / 0.14)
  );
}
/* A lighter wash than the hero page's keeps text readable over the art. */
.report-banner .hero-art::after {
  background: linear-gradient(
    90deg,
    rgb(from var(--ink) r g b / 0.75),
    transparent 70%
  );
}
.report-banner .hero-art-bg {
  top: -80px;
  right: 8%;
  height: 360px;
  opacity: 0.55;
}
.report-banner-portrait {
  position: relative;
  z-index: 1;
  flex: none;
  width: 110px;
  height: 110px;
  border: 2px solid var(--gold);
  border-radius: 0;
  object-fit: cover;
  object-position: center 15%;
}
.report-banner-body {
  position: relative;
  z-index: 1;
  min-width: 0;
}
.report-result {
  font: 900 40px/1 var(--font-title);
  color: var(--good);
}
.report-banner.lost .report-result {
  color: var(--bad);
}
.report-banner.whole .report-result {
  color: var(--cream);
}
.report-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 26px;
  margin-top: 12px;
}
.report-stats dt {
  color: var(--muted);
  font: 600 11px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.report-stats dd {
  margin: 0;
  font: 700 20px var(--font-label);
  font-variant-numeric: tabular-nums;
}

/* Verdicts: three stats against the rank average. */
.report-verdicts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.verdict {
  padding: 12px 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.verdict small {
  display: block;
  color: var(--muted);
  font: 600 11px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.verdict b {
  margin-right: 8px;
  font: 700 28px var(--font-label);
  font-variant-numeric: tabular-nums;
}
.verdict span {
  display: block;
  font-size: 13px;
}
.report-verdicts + .data-note {
  margin-top: 8px;
}
.report-pick {
  margin-top: 16px;
}

/* Stretches, impact and buffs. */
.report-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
.stretches {
  display: grid;
  gap: 8px;
  padding: 0;
  list-style: none;
}
.stretch {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--line-soft);
  background: var(--surface);
  font-size: 13px;
}
.stretch b {
  flex: none;
  width: 120px;
  font: 700 13px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.impact-row {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr) 100px;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 13px;
}
.impact-track {
  position: relative;
  height: 12px;
  border: 1px solid var(--line-soft);
  background: var(--surface-2);
}
.impact-track i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--gold);
}
.impact-track u {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--cream);
  opacity: 0.6;
}
.impact-row b {
  color: var(--cream);
  font: 700 16px var(--font-label);
  text-align: right;
}
.impact-row small,
.impact-kp small {
  color: var(--dim);
  font-size: 12px;
}
.impact-kp {
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
}
.impact-kp b {
  color: var(--cream);
  font: 700 16px var(--font-label);
}
.report-stats.buffs {
  margin-top: 0;
}

/* Scoreboard. */
.report-team + .report-team {
  margin-top: 16px;
}
.report-team-name {
  margin-bottom: 8px;
  font: 700 13px var(--font-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.report-team-name.team-0 {
  color: var(--ally);
}
.report-team-name.team-1 {
  color: var(--enemy);
}
.report-table-wrap {
  overflow-x: auto;
}
.report-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--line);
  background: var(--surface);
}
.report-table th {
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font: 600 11px var(--font-label);
  letter-spacing: 0.14em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}
.report-table td {
  height: auto;
  padding: 7px 10px;
  border-bottom: 1px solid var(--line-soft);
  font: 600 15px var(--font-label);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.report-player {
  display: flex;
  align-items: center;
  gap: 10px;
  font: 14px var(--font-body);
}
.report-player b {
  display: block;
}
.report-portrait {
  width: 32px;
  height: 32px;
  border-radius: 0;
  object-fit: cover;
  object-position: center 15%;
}
.report-player-link {
  padding: 0;
  color: var(--muted);
  font-size: 12px;
}
.view-as-link {
  padding: 0;
  color: var(--gold);
  font: 700 12px var(--font-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.view-as-link:disabled {
  color: var(--muted);
  opacity: 1;
}

@media (max-width: 1000px) {
  .report-cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .report-table th,
  .report-table td {
    padding-right: 7px;
    padding-left: 7px;
  }
}
```

In `src/app/styles/index.css`, after `@import "../../features/items/styles/items.css";`, add:

```css
@import "../../features/match-report/styles/match-report.css";
```

- [ ] **Step 7: Mount the page in the desktop app**

In `src/app/DesktopApp.tsx`:

After `import { ItemsPage } from "@/features/items/components/ItemsPage";`, add:

```tsx
import { MatchReportPage } from "@/features/match-report/components/MatchReportPage";
```

After `const [profileId, setProfileId] = useState<number | null>(null);`, add:

```tsx
  const [report, setReport] = useState<{
    matchId: number;
    accountId?: number;
  } | null>(null);
```

In `show`, replace:

```tsx
    if (next.page === "profile" && next.accountId === undefined)
      next = { page: "home" };
    if (next.page === "profile") setProfileId(next.accountId ?? null);
```

with:

```tsx
    if (next.page === "profile" && next.accountId === undefined)
      next = { page: "home" };
    if (next.page === "match" && next.matchId === undefined)
      next = { page: "home" };
    if (next.page === "profile") setProfileId(next.accountId ?? null);
    if (next.page === "match")
      setReport({ matchId: next.matchId!, accountId: next.accountId });
```

Before `{visited.includes("live") && (`, add:

```tsx
        {visited.includes("match") && report !== null && (
          <div className="page" hidden={route.page !== "match"}>
            <MatchReportPage
              key={`${report.matchId}-${report.accountId ?? ""}`}
              matchId={report.matchId}
              fromId={report.accountId}
              meId={me.meId}
            />
          </div>
        )}
```

- [ ] **Step 8: Link Home's latest match to its report**

In `src/features/home/components/YouCard.tsx` (`LatestMatch`), replace:

```tsx
        <RouteLink
          className="latest-link"
          route={{ page: "profile", accountId }}
        >
          View profile →
        </RouteLink>
```

with:

```tsx
        <div className="latest-links">
          <RouteLink
            className="latest-link"
            route={{ page: "match", matchId: match.matchId }}
          >
            Open match report →
          </RouteLink>
          <RouteLink
            className="latest-link"
            route={{ page: "profile", accountId }}
          >
            View profile →
          </RouteLink>
        </div>
```

In `src/features/home/styles/home.css`, replace:

```css
.latest-link {
  margin-top: 8px;
  padding: 0;
```

with:

```css
.latest-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin-top: 8px;
}
.latest-link {
  padding: 0;
```

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/match-report.spec.ts tests/browser/home.spec.ts`
Expected: PASS (7 report tests and all of `home.spec.ts`).

- [ ] **Step 10: Check and commit**

Run `npm test`, `npx tsc --noEmit`, `npm run web:typecheck` and `npm run test:browser`.

```bash
npx prettier --write src/app/navigation.ts src/app/DesktopApp.tsx src/shared/site.ts src/shared/utils/clipboard.ts web/app/seo.tsx src/features/match-report src/features/home tests/browser/match-report.spec.ts tests/browser/home.spec.ts
git add -A src/app src/shared web/app/seo.tsx public/manifest.json src/features/match-report src/features/home tests/browser
git commit -m "feat(match-report): report page with Viewing as, verdicts, stretches, impact and scoreboard"
```

---

### Task 6: The Graph

**Files:**
- Create: `src/features/match-report/components/GraphChart.tsx` (the SVG: axes, lines, rank-average band, marker lanes, hover)
- Create: `src/features/match-report/components/ReportGraph.tsx` (stat tabs, filters, ranking panel, legend, footnote)
- Modify: `src/features/match-report/components/MatchReportPage.tsx`
- Modify: `src/features/match-report/styles/match-report.css`
- Test: `tests/browser/match-report.spec.ts`

How the Graph behaves:
- **Measuring:** `ReportGraph` measures its chart column with a `ResizeObserver` and draws `GraphChart` at that pixel width.
- **Hidden desktop pages:** a desktop page mounted while hidden measures 0 and draws once it is shown.
- **"Player vs avg" without a player:** with no player selected, it falls back to "Everyone". That is derived during render, not stored, so picking a player again restores it.
- **Rate stats:** "Per minute" is disabled for them, and team views average them instead of summing.
- **Clipping:** lines are clipped to the plot area, so a time range can cut a segment mid-way.

- [ ] **Step 1: Write the failing tests**

In `tests/browser/match-report.spec.ts`, change the fixture import to include `bigItem`:

```ts
import {
  MATCH_ID,
  bigItem,
  heroes,
  matchMetadata,
  rankCurveRows,
} from "../fixtures/match-report";
```

and append at the end of the file:

```ts
test.describe("the graph", () => {
  const graph = (page: Page) => report(page).locator(".report-graph");
  const title = (page: Page) => graph(page).locator(".graph-ranking h3");

  test("starts on souls, player vs the rank average, with markers", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await expect(g.getByRole("button", { name: "Souls" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      g.getByRole("button", { name: "Player vs avg" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(title(page)).toHaveText("Most souls");
    const rows = g.locator(".graph-ranking li");
    await expect(rows).toHaveCount(12);
    await expect(rows.first()).toContainText(heroes[11].name);
    await expect(rows.first()).toContainText("37.6K");
    await expect(rows.nth(6)).toContainText(`You · ${lead.name}`);
    await expect(g.locator(".graph-line")).toHaveCount(1);
    await expect(g.locator(".graph-avg")).toHaveCount(1);
    await expect(g.locator(".graph-band")).toHaveCount(1);
    await expect(g.locator(".mark-death")).toHaveCount(4);
    await expect(g.locator(".mark-item")).toHaveCount(1);
    await expect(g.locator(".mark-item title")).toHaveText(
      `${bigItem.name} at 15:00`,
    );
    await expect(g.locator(".mark-objective")).toHaveCount(2);
    await expect(g.locator(".mark-boss title")).toHaveText(
      "Mid Boss taken by Amber at 28:20",
    );
    await expect(g.locator(".graph-foot")).toHaveText(
      `You vs the average ${lead.name} at Emissary · shaded band = normal range (±1 standard deviation). Snapshots every 3 min until 15:00, then every 5 min; lines connect them.`,
    );
  });

  test("stat tabs, More stats, values and time change the ranking", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await g.getByRole("button", { name: "Deaths" }).click();
    await expect(title(page)).toHaveText("Fewest deaths");
    await g.getByRole("button", { name: "Per minute" }).click();
    await expect(title(page)).toHaveText("Fewest deaths / min");
    await g.getByRole("button", { name: "0–10" }).click();
    await expect(title(page)).toHaveText("Fewest deaths / min · at 10:00");
    await expect(g.locator(".mark-death")).toHaveCount(1);
    await g.getByRole("combobox", { name: "More stats" }).selectOption({
      label: "Accuracy %",
    });
    await expect(title(page)).toHaveText("Highest accuracy % · at 10:00");
    await expect(g.getByRole("button", { name: "Per minute" })).toBeDisabled();
    await g.getByRole("button", { name: "Damage taken" }).click();
    await expect(g.locator(".graph-foot")).toHaveText(
      "You · no rank average for this stat. Snapshots every 3 min until 15:00, then every 5 min; lines connect them.",
    );
    await expect(g.locator(".graph-avg")).toHaveCount(0);
  });

  test("team totals, team lead and everyone with a legend", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await g.getByRole("button", { name: "Team totals" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(2);
    await expect(g.locator(".graph-foot")).toContainText(
      "Each team's combined total.",
    );
    await g.getByRole("button", { name: "Team lead" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(1);
    await expect(g.locator(".graph-lead-label")).toHaveText([
      "AMBER AHEAD",
      "SAPPHIRE AHEAD",
    ]);
    await expect(g.locator(".mark-death")).toHaveCount(0);
    await g.getByRole("button", { name: "Everyone" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(12);
    await expect(g.locator(".graph-line.focus")).toHaveCount(1);
    const legend = g.getByRole("group", { name: "Lines" });
    await legend.getByRole("button", { name: second.name }).click();
    await expect(g.locator(".graph-line")).toHaveCount(11);
    await legend.getByRole("button", { name: "Sapphire only" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(6);
    await legend.getByRole("button", { name: "Show all" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(12);
  });

  test("hover shows every visible line and the average at that time", async ({
    page,
  }) => {
    await openReport(page);
    const hit = graph(page).locator(".graph-hit");
    const box = (await hit.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tip = graph(page).locator(".graph-tip");
    await expect(tip).toBeVisible();
    await expect(tip.locator("b")).toContainText("· Souls");
    await expect(tip.locator("div")).toHaveCount(2);
    await expect(tip).toContainText(`Avg ${lead.name} at Emissary`);
    await page.mouse.move(box.x - 40, box.y - 40);
    await expect(tip).toBeHidden();
  });

  test("keeps a modest height and redraws at the new width", async ({
    page,
  }) => {
    await openReport(page);
    const svg = graph(page).locator(".graph-svg");
    const height = Number(await svg.getAttribute("height"));
    expect(height).toBeGreaterThanOrEqual(190 + 66);
    expect(height).toBeLessThanOrEqual(260 + 66);
    const before = Number(await svg.getAttribute("width"));
    await page.setViewportSize({ width: 900, height: 900 });
    await expect
      .poll(async () => Number(await svg.getAttribute("width")))
      .toBeLessThan(before);
  });

  test("with no player selected, Everyone is shown and Player vs avg is off", async ({
    page,
  }) => {
    await openReport(page);
    await viewingAs(page).selectOption("all");
    const g = graph(page);
    await expect(
      g.getByRole("button", { name: "Player vs avg" }),
    ).toBeDisabled();
    await expect(g.getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(g.locator(".graph-line")).toHaveCount(12);
    await expect(g.locator(".graph-line.focus")).toHaveCount(0);
    await expect(g.locator(".mark-death")).toHaveCount(0);
  });

  test("a match without buff pickup times has no Permanent buffs line", async ({
    page,
  }) => {
    const old = matchMetadata(ACCOUNT);
    for (const player of old.match_info.players)
      player.power_up_buffs = [
        {
          type: "hp_permanent_pickup",
          is_permanent: true,
          value: 2,
          pickup_times_s: [],
        },
      ];
    await storeAccount(page);
    await routeApi(page);
    await page.route(
      `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
      (route) => route.fulfill({ json: old, headers: cors }),
    );
    await page.goto("/");
    await view(page)
      .getByRole("button", { name: "Open match report →" })
      .click();
    await expect(
      graph(page)
        .getByRole("combobox", { name: "More stats" })
        .locator("option", { hasText: "Permanent buffs" }),
    ).toHaveCount(0);
    await expect(
      report(page).locator(".report-stats.buffs dd").first(),
    ).toHaveText("2");
  });

  test("clicking a ranking row switches Viewing as", async ({ page }) => {
    await openReport(page);
    await graph(page)
      .locator(".graph-ranking li")
      .first()
      .getByRole("button")
      .click();
    await expect(viewingAs(page)).toHaveValue("12");
    await expect(title(page)).toHaveText("Most souls");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/match-report.spec.ts -g "the graph"`
Expected: FAIL (no `.report-graph`).

- [ ] **Step 3: Write the chart**

`src/features/match-report/components/GraphChart.tsx`:

```tsx
import { useId, useState } from "react";
import { clock } from "../utils/format";
import { formatValue, valueAt, type Point } from "../utils/graph";
import type { Metric } from "../utils/metrics";
import type { Team } from "../utils/report";

export interface ChartLine {
  key: string;
  label: string;
  color: string;
  focus: boolean;
  points: Point[];
}
export interface Markers {
  deaths: { t: number; title: string }[] | null;
  items: { t: number; image?: string; title: string }[] | null;
  objectives: { t: number; team: Team; boss: boolean; title: string }[] | null;
}

// Plot margins and the marker lanes below it, in pixels.
const LEFT = 80;
const RIGHT = 24;
const TOP = 12;
const BOTTOM = 24;
export const LANES = 66;

/** About 24% of the width, kept between 190 and 260px. */
export const plotHeight = (width: number) =>
  Math.round(Math.min(260, Math.max(190, width * 0.24)));

/** Points inside [t0, t1] plus one either side, so lines run to the edges (the plot clips them). */
function visible<T extends [number, ...number[]]>(
  points: T[],
  t0: number,
  t1: number,
): T[] {
  const first = Math.max(0, points.findIndex(([t]) => t >= t0) - 1);
  const after = points.findIndex(([t]) => t > t1);
  return points.slice(first, after === -1 ? undefined : after + 1);
}

// Tooltip rows only where a series has data: no values held before its
// first snapshot or after the rank average stops.
const covers = (points: [number, ...number[]][], t: number) =>
  points.length > 0 && t >= points[0][0] && t <= points.at(-1)![0];

export function GraphChart({
  width,
  lines,
  average,
  averageLabel,
  metric,
  markers,
  t0,
  t1,
  lead,
  perMinute,
}: {
  width: number;
  lines: ChartLine[];
  average: [number, number, number][] | null;
  averageLabel: string;
  metric: Metric;
  markers: Markers;
  t0: number;
  t1: number;
  lead: boolean;
  perMinute: boolean;
}) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  const height = plotHeight(width);
  const x = (t: number) =>
    LEFT + ((t - t0) / Math.max(1, t1 - t0)) * (width - LEFT - RIGHT);
  const shown = lines.map((line) => ({
    ...line,
    points: visible(line.points, t0, t1),
  }));
  const band = average ? visible(average, t0, t1) : [];
  const inside = (t: number) => t >= t0 && t <= t1;
  const values = [
    ...shown.flatMap((line) =>
      line.points.filter(([t]) => inside(t)).map(([, v]) => v),
    ),
    ...band.filter(([t]) => inside(t)).map(([, v, s]) => v + s),
  ];
  let low = Math.min(0, ...values);
  let high = Math.max(...values, 0) * 1.06 || 1;
  if (lead) {
    const most = Math.max(...values.map(Math.abs), 1) * 1.1;
    low = -most;
    high = most;
  }
  const y = (v: number) =>
    TOP + (1 - (v - low) / (high - low)) * (height - TOP - BOTTOM);
  const path = (points: [number, number][]) =>
    points.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = Array.from(
    { length: 6 },
    (_, i) => low + ((high - low) * i) / 5,
  );
  const step = width < 520 ? 600 : 300;
  const minutes: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) minutes.push(t);
  const lanes = {
    deaths: height + 12,
    items: height + 32,
    objectives: height + 52,
  };

  const hoverRows =
    hover === null
      ? []
      : [
          ...shown
            .filter((line) => covers(line.points, hover))
            .map((line) => ({
              key: line.key,
              label: line.label,
              color: line.color,
              value: valueAt(line.points, hover),
            }))
            .sort((a, b) => b.value - a.value),
          ...(covers(band, hover)
            ? [
                {
                  key: "avg",
                  label: averageLabel,
                  color: "var(--cream)",
                  value: valueAt(
                    band.map(([t, v]) => [t, v] as [number, number]),
                    hover,
                  ),
                },
              ]
            : []),
        ];
  const hoverX = hover === null ? 0 : x(hover);

  return (
    <>
      <svg
        className="graph-svg"
        width={width}
        height={height + LANES}
        viewBox={`0 0 ${width} ${height + LANES}`}
        role="img"
        aria-label={`${metric.label}${perMinute ? " per minute" : ""}, ${clock(t0)} to ${clock(t1)}`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={LEFT} y={0} width={width - LEFT - RIGHT} height={height} />
          </clipPath>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line
              className="graph-grid"
              x1={LEFT}
              x2={width - RIGHT}
              y1={y(v)}
              y2={y(v)}
            />
            <text
              className="graph-axis"
              x={LEFT - 8}
              y={y(v) + 4}
              textAnchor="end"
            >
              {formatValue(v, metric)}
            </text>
          </g>
        ))}
        {minutes.map((t) => (
          <g key={t}>
            <line
              className="graph-grid"
              x1={x(t)}
              x2={x(t)}
              y1={TOP}
              y2={height - BOTTOM}
            />
            <text
              className="graph-axis"
              x={x(t)}
              y={height - BOTTOM + 16}
              textAnchor="middle"
            >
              {t / 60} min
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clip})`}>
          {lead && (
            <>
              <line
                className="graph-zero"
                x1={LEFT}
                x2={width - RIGHT}
                y1={y(0)}
                y2={y(0)}
              />
              <text
                className="graph-lead-label team-0"
                x={LEFT + 6}
                y={TOP + 12}
              >
                AMBER AHEAD
              </text>
              <text
                className="graph-lead-label team-1"
                x={LEFT + 6}
                y={height - BOTTOM - 6}
              >
                SAPPHIRE AHEAD
              </text>
            </>
          )}
          {band.length > 0 && (
            <>
              <polygon
                className="graph-band"
                points={`${path(band.map(([t, v, s]) => [t, v + s]))} ${path(
                  [...band]
                    .reverse()
                    .map(([t, v, s]) => [t, Math.max(low, v - s)]),
                )}`}
              />
              <polyline
                className="graph-avg"
                points={path(band.map(([t, v]) => [t, v]))}
              />
            </>
          )}
          {[...shown]
            .sort((a, b) => Number(a.focus) - Number(b.focus))
            .map((line) => (
              <polyline
                key={line.key}
                className={`graph-line${line.focus ? " focus" : ""}`}
                style={{ stroke: line.color }}
                points={path(line.points)}
              />
            ))}
        </g>
        {markers.deaths && (
          <g className="graph-lane">
            <text
              className="graph-lane-label"
              x={LEFT - 8}
              y={lanes.deaths + 4}
              textAnchor="end"
            >
              DEATHS
            </text>
            {markers.deaths
              .filter((m) => inside(m.t))
              .map((m) => (
                <circle
                  key={m.t}
                  className="mark-death"
                  cx={x(m.t)}
                  cy={lanes.deaths}
                  r={5}
                >
                  <title>{m.title}</title>
                </circle>
              ))}
          </g>
        )}
        {markers.items && (
          <g className="graph-lane">
            <text
              className="graph-lane-label"
              x={LEFT - 8}
              y={lanes.items + 4}
              textAnchor="end"
            >
              ITEMS
            </text>
            {markers.items
              .filter((m) => inside(m.t))
              .map((m, index) =>
                m.image ? (
                  <image
                    key={index}
                    className="mark-item"
                    href={m.image}
                    x={x(m.t) - 8}
                    y={lanes.items - 8}
                    width={16}
                    height={16}
                  >
                    <title>{m.title}</title>
                  </image>
                ) : (
                  <rect
                    key={index}
                    className="mark-item"
                    x={x(m.t) - 5}
                    y={lanes.items - 5}
                    width={10}
                    height={10}
                  >
                    <title>{m.title}</title>
                  </rect>
                ),
              )}
          </g>
        )}
        {markers.objectives && (
          <g className="graph-lane">
            <text
              className="graph-lane-label"
              x={LEFT - 8}
              y={lanes.objectives + 4}
              textAnchor="end"
            >
              OBJECTIVES
            </text>
            {markers.objectives
              .filter((m) => inside(m.t))
              .map((m, index) => {
                const cx = x(m.t);
                const cy = lanes.objectives;
                return m.boss ? (
                  <polygon
                    key={index}
                    className={`mark-boss team-${m.team}`}
                    points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                  >
                    <title>{m.title}</title>
                  </polygon>
                ) : (
                  <rect
                    key={index}
                    className={`mark-objective team-${m.team}`}
                    x={cx - 3}
                    y={cy - 6}
                    width={6}
                    height={12}
                  >
                    <title>{m.title}</title>
                  </rect>
                );
              })}
          </g>
        )}
        {hover !== null && (
          <line
            className="graph-cross"
            x1={hoverX}
            x2={hoverX}
            y1={TOP}
            y2={height - BOTTOM}
          />
        )}
        <rect
          className="graph-hit"
          x={LEFT}
          y={TOP}
          width={width - LEFT - RIGHT}
          height={height - TOP - BOTTOM}
          onPointerMove={(event) => {
            const box =
              event.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const px = ((event.clientX - box.left) / box.width) * width;
            const t = t0 + ((px - LEFT) / (width - LEFT - RIGHT)) * (t1 - t0);
            setHover(Math.min(t1, Math.max(t0, t)));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && hoverRows.length > 0 && (
        <div
          className="graph-tip"
          role="status"
          style={{
            left: hoverX > width * 0.6 ? hoverX - 234 : hoverX + 14,
          }}
        >
          <b>
            {clock(hover)} · {metric.label}
            {perMinute ? " / min" : ""}
          </b>
          {hoverRows.slice(0, 13).map((row) => (
            <div key={row.key}>
              <span>
                <i style={{ background: row.color }} />
                {row.label}
              </span>
              <span>{formatValue(row.value, metric)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Write the Graph section**

`src/features/match-report/components/ReportGraph.tsx`:

```tsx
import { useLayoutEffect, useRef, useState } from "react";
import { heroById, itemById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { clock } from "../utils/format";
import {
  ITEM_MARKER_COST,
  TIME_RANGES,
  averageSeries,
  formatValue,
  leadSeries,
  playerSeries,
  rangeAvailable,
  rangeOf,
  ranking,
  rankingTitle,
  teamSeries,
  type ShowMode,
  type TimeRange,
  type ValueMode,
} from "../utils/graph";
import { METRICS, metricById, type MetricId } from "../utils/metrics";
import { displayName, heroName, isMe, optionLabel } from "../utils/perspective";
import type { RankCurve } from "../utils/rank-curve";
import {
  TEAM_NAMES,
  type MatchReport,
  type ReportPlayer,
  type Team,
} from "../utils/report";
import { GraphChart, type ChartLine, type Markers } from "./GraphChart";

const SHOW: { id: ShowMode; label: string }[] = [
  { id: "player", label: "Player vs avg" },
  { id: "teams", label: "Team totals" },
  { id: "lead", label: "Team lead" },
  { id: "everyone", label: "Everyone" },
];
const VALUES: { id: ValueMode; label: string }[] = [
  { id: "total", label: "Total" },
  { id: "perMinute", label: "Per minute" },
];
// Six shades per team: Amber in blues, Sapphire in reds (spec).
const SHADES = [100, 62, 84, 46, 92, 70];
const teamColor = (team: Team) => (team === 0 ? "var(--ally)" : "var(--enemy)");
const shade = (team: Team, index: number) =>
  `color-mix(in srgb, ${teamColor(team)} ${SHADES[index % SHADES.length]}%, var(--cream))`;
const FOOT =
  "Snapshots every 3 min until 15:00, then every 5 min; lines connect them.";

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = () => false,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange(value: T): void;
  disabled?(id: T): boolean;
}) {
  return (
    <div className="graph-filter" role="group" aria-label={label}>
      <small>{label}</small>
      <span className="segmented">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            disabled={disabled(option.id)}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </div>
  );
}

export function ReportGraph({
  report,
  names,
  meId,
  selected,
  curve,
  onSelect,
}: {
  report: MatchReport;
  names: Map<number, string>;
  meId: number | null;
  selected?: ReportPlayer;
  curve: RankCurve | null;
  onSelect(slot: number): void;
}) {
  const [metricId, setMetricId] = useState<MetricId>("souls");
  const [show, setShow] = useState<ShowMode>("player");
  const [values, setValues] = useState<ValueMode>("total");
  const [range, setRange] = useState<TimeRange>("all");
  const [marks, setMarks] = useState({
    deaths: true,
    items: true,
    objectives: true,
  });
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const chartRef = useRef<HTMLDivElement>(null);
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

  const metric = metricById.get(metricId)!;
  // Matches before 2026-09-29 have no buff pickup times, so no buffs line.
  const metrics = METRICS.filter(
    (m) => m.id !== "permanentBuffs" || report.buffsTimed,
  );
  // Without a selected player, "Player vs avg" falls back to everyone.
  const mode: ShowMode = show === "player" && !selected ? "everyone" : show;
  const [t0, t1] = rangeOf(range, report.durationS);
  const colors = new Map(
    ([0, 1] as Team[]).flatMap((team) =>
      report.players
        .filter((p) => p.team === team)
        .map((p, index) => [p.slot, shade(team, index)] as const),
    ),
  );
  const colorOf = (p: ReportPlayer) =>
    p.slot === selected?.slot ? "var(--gold)" : colors.get(p.slot)!;
  const lineName = (p: ReportPlayer) =>
    isMe(p, meId)
      ? "You"
      : `${heroName(p.heroId)} · ${displayName(p, names, meId)}`;
  let lines: ChartLine[];
  if (mode === "player" && selected)
    lines = [
      {
        key: `p${selected.slot}`,
        label: lineName(selected),
        color: "var(--gold)",
        focus: true,
        points: playerSeries(selected, metric, values),
      },
    ];
  else if (mode === "teams")
    lines = ([0, 1] as Team[]).map((team) => ({
      key: `t${team}`,
      label: TEAM_NAMES[team],
      color: teamColor(team),
      focus: true,
      points: teamSeries(report.players, team, metric, values),
    }));
  else if (mode === "lead")
    lines = [
      {
        key: "lead",
        label: "Amber lead",
        color: "var(--gold)",
        focus: true,
        points: leadSeries(report.players, metric, values),
      },
    ];
  else
    lines = report.players
      .filter((p) => !hidden.has(p.slot))
      .map((p) => ({
        key: `p${p.slot}`,
        label: lineName(p),
        color: colorOf(p),
        focus: p.slot === selected?.slot,
        points: playerSeries(p, metric, values),
      }));
  const average =
    mode === "player" && selected
      ? averageSeries(curve, metric, values, report.durationS)
      : null;
  const averageLabel =
    selected && curve
      ? `Avg ${heroName(selected.heroId)} at ${curve.band.label}`
      : "";

  const playerMarks = selected && (mode === "player" || mode === "everyone");
  const who = selected ? displayName(selected, names, meId) : "";
  const markers: Markers = {
    deaths:
      marks.deaths && playerMarks
        ? selected.deathTimes.map((t) => ({
            t,
            title: `${who} died at ${clock(t)}`,
          }))
        : null,
    items:
      marks.items && playerMarks
        ? selected.purchases.flatMap(({ timeS, itemId }) => {
            const item = itemById.get(itemId);
            return item && item.cost >= ITEM_MARKER_COST
              ? [
                  {
                    t: timeS,
                    image: item.image,
                    title: `${item.name} at ${clock(timeS)}`,
                  },
                ]
              : [];
          })
        : null,
    objectives: marks.objectives
      ? [
          ...report.objectives.map(({ timeS, team }) => {
            const by: Team = team === 0 ? 1 : 0;
            return {
              t: timeS,
              team: by,
              boss: false,
              title: `${TEAM_NAMES[by]} destroyed a ${TEAM_NAMES[team]} objective at ${clock(timeS)}`,
            };
          }),
          ...report.midBoss.map(({ timeS, team }) => ({
            t: timeS,
            team,
            boss: true,
            title: `Mid Boss taken by ${TEAM_NAMES[team]} at ${clock(timeS)}`,
          })),
        ]
      : null,
  };

  const ranked = ranking(report.players, metric, values, t1);
  const top = Math.max(...ranked.map((row) => Math.abs(row.value)), 1);
  const notes: Record<ShowMode, string> = {
    player: selected
      ? average
        ? `${isMe(selected, meId) ? "You" : `${who} (${heroName(selected.heroId)})`} vs the average ${heroName(selected.heroId)} at ${curve!.band.label} · shaded band = normal range (±1 standard deviation)`
        : `${who} · no rank average for this stat`
      : "",
    teams: metric.rate ? "Each team's average" : "Each team's combined total",
    lead: "Above the line: Amber ahead. Below: Sapphire ahead",
    everyone:
      "Click a hero below to hide or show their line. Gold = the player you're viewing as",
  };

  return (
    <div className="report-graph">
      <div className="graph-tabs">
        <div className="graph-stat-tabs" role="group" aria-label="Stat">
          {metrics.filter((m) => m.main).map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metricId === m.id}
              onClick={() => setMetricId(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <select
          aria-label="More stats"
          value={metric.main ? "" : metricId}
          onChange={(event) =>
            event.target.value && setMetricId(event.target.value as MetricId)
          }
        >
          <option value="">More stats…</option>
          {metrics.filter((m) => !m.main).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="graph-filters">
        <Segmented<ShowMode>
          label="Show"
          options={SHOW}
          value={mode}
          onChange={setShow}
          disabled={(id) => id === "player" && !selected}
        />
        <Segmented<ValueMode>
          label="Values"
          options={VALUES}
          value={metric.rate ? "total" : values}
          onChange={setValues}
          disabled={(id) => id === "perMinute" && metric.rate}
        />
        <Segmented<TimeRange>
          label="Time"
          options={TIME_RANGES}
          value={range}
          onChange={setRange}
          disabled={(id) => !rangeAvailable(id, report.durationS)}
        />
        <div className="graph-filter" role="group" aria-label="Markers">
          <small>Markers</small>
          {(
            [
              ["deaths", "Deaths"],
              ["items", "Items"],
              ["objectives", "Objectives"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="graph-check">
              <input
                type="checkbox"
                checked={marks[key]}
                onChange={(event) =>
                  setMarks({ ...marks, [key]: event.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="graph-body">
        <div className="graph-chart" ref={chartRef}>
          {width > 0 && (
            <GraphChart
              width={width}
              {...{ lines, average, averageLabel, metric, markers, t0, t1 }}
              lead={mode === "lead"}
              perMinute={values === "perMinute" && !metric.rate}
            />
          )}
        </div>
        <aside className="graph-ranking">
          <h3>{rankingTitle(metric, values, range, t1)}</h3>
          <ol>
            {ranked.map(({ player, value }) => {
              const hero = heroById.get(player.heroId);
              return (
                <li key={player.slot}>
                  <button
                    type="button"
                    className={
                      player.slot === selected?.slot ? "selected" : undefined
                    }
                    aria-label={`View as ${optionLabel(player, names, meId)}`}
                    onClick={() => onSelect(player.slot)}
                  >
                    <Picture
                      className="graph-rank-portrait"
                      src={hero?.cardImage ?? hero?.image}
                      label={heroName(player.heroId)}
                    />
                    <span className="graph-rank-name">
                      {isMe(player, meId) ? "You · " : ""}
                      {heroName(player.heroId)}
                    </span>
                    <span className="graph-rank-bar" aria-hidden="true">
                      <i
                        style={{
                          width: `${(Math.abs(value) / top) * 100}%`,
                          background: colorOf(player),
                        }}
                      />
                    </span>
                    <b>{formatValue(value, metric)}</b>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
      {mode === "everyone" && (
        <div className="graph-legend" role="group" aria-label="Lines">
          {report.players.map((p) => {
            const hero = heroById.get(p.heroId);
            return (
              <button
                key={p.slot}
                type="button"
                aria-pressed={!hidden.has(p.slot)}
                onClick={() => {
                  const next = new Set(hidden);
                  if (!next.delete(p.slot)) next.add(p.slot);
                  setHidden(next);
                }}
              >
                <Picture
                  className="graph-legend-portrait"
                  src={hero?.cardImage ?? hero?.image}
                  label={heroName(p.heroId)}
                />
                <i style={{ background: colorOf(p) }} />
                {isMe(p, meId) ? "You" : heroName(p.heroId)}
              </button>
            );
          })}
          <button type="button" onClick={() => setHidden(new Set())}>
            Show all
          </button>
          {([0, 1] as Team[]).map((team) => (
            <button
              key={team}
              type="button"
              onClick={() =>
                setHidden(
                  new Set(
                    report.players
                      .filter((p) => p.team !== team)
                      .map((p) => p.slot),
                  ),
                )
              }
            >
              {TEAM_NAMES[team]} only
            </button>
          ))}
        </div>
      )}
      <p className="data-note graph-foot">
        {notes[mode]}. {FOOT}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Put the Graph on the page**

In `src/features/match-report/components/MatchReportPage.tsx`, after `import { ReportBanner } from "./ReportBanner";`, add:

```tsx
import { ReportGraph } from "./ReportGraph";
```

and before `{selected ? (` (the `PlayerInsights` block), add:

```tsx
      <SectionHeader title="Graph" />
      <ReportGraph
        {...{ report, names, meId, selected }}
        curve={curve.data ?? null}
        onSelect={viewAs}
      />
```

- [ ] **Step 6: Add the Graph styles**

In `src/features/match-report/styles/match-report.css`, insert this block just before the `/* Stretches, impact and buffs. */` comment:

```css
/* The Graph. */
.report-graph {
  container-type: inline-size;
  padding: 12px 16px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.graph-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.graph-stat-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.graph-stat-tabs button {
  padding: 6px 9px;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  font: 700 13px var(--font-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.graph-stat-tabs button[aria-pressed="true"] {
  border-color: var(--gold);
  color: var(--cream);
}
.graph-tabs select {
  margin-left: auto;
  padding: 5px 8px;
  font-size: 12px;
}
.graph-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line-soft);
}
.graph-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  color: var(--muted);
  font-size: 12px;
}
.graph-filter small {
  font: 700 11px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--line);
}
.segmented button {
  padding: 4px 9px;
  color: var(--muted);
  font: 600 12px var(--font-label);
  letter-spacing: 0.06em;
}
.segmented button + button {
  border-left: 1px solid var(--line);
}
.segmented button[aria-pressed="true"] {
  background: rgb(from var(--gold) r g b / 0.16);
  color: var(--cream);
}
.segmented button:disabled {
  opacity: 0.4;
}
.graph-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.graph-check input {
  padding: 0;
  accent-color: var(--gold);
}
.graph-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  gap: 16px;
  padding-top: 10px;
}
@container (max-width: 700px) {
  .graph-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
.graph-chart {
  position: relative;
  min-width: 0;
}
.graph-svg {
  display: block;
  font: 600 11px var(--font-label);
}
.graph-grid {
  stroke: var(--line-soft);
}
.graph-axis,
.graph-lane-label {
  fill: var(--dim);
  letter-spacing: 0.08em;
}
.graph-zero {
  stroke: var(--cream);
  stroke-opacity: 0.4;
}
.graph-lead-label {
  letter-spacing: 0.12em;
}
.graph-lead-label.team-0 {
  fill: var(--ally);
}
.graph-lead-label.team-1 {
  fill: var(--enemy);
}
.graph-band {
  fill: rgb(from var(--cream) r g b / 0.1);
}
.graph-avg {
  fill: none;
  stroke: var(--cream);
  stroke-opacity: 0.55;
  stroke-dasharray: 5 5;
  stroke-width: 1.5;
}
.graph-line {
  fill: none;
  stroke-width: 1.5;
  stroke-linejoin: round;
  opacity: 0.85;
}
.graph-line.focus {
  stroke-width: 3;
  opacity: 1;
}
.mark-death {
  fill: var(--bad);
}
.mark-item {
  fill: var(--gold);
}
.mark-objective.team-0,
.mark-boss.team-0 {
  fill: var(--ally);
}
.mark-objective.team-1,
.mark-boss.team-1 {
  fill: var(--enemy);
}
.mark-boss {
  stroke: var(--tier-gold);
}
.graph-cross {
  stroke: var(--cream);
  stroke-opacity: 0.5;
}
.graph-hit {
  fill: transparent;
  cursor: crosshair;
}
.graph-tip {
  position: absolute;
  top: 10px;
  z-index: 2;
  width: 220px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  background: rgb(from var(--ink) r g b / 0.95);
  font-size: 12px;
  pointer-events: none;
}
.graph-tip b {
  display: block;
  margin-bottom: 4px;
  font: 700 12px var(--font-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.graph-tip div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.graph-tip span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-tip i,
.graph-legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
}
.graph-ranking h3 {
  margin-bottom: 6px;
  color: var(--muted);
  font: 700 12px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.graph-ranking ol {
  display: grid;
  gap: 2px;
  padding: 0;
  list-style: none;
}
.graph-ranking button {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 40px 44px;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 1px 4px;
  color: var(--cream);
  font-size: 12px;
  text-align: left;
}
.graph-ranking button:hover:not(:disabled),
.graph-ranking button.selected {
  background: rgb(from var(--gold) r g b / 0.1);
}
.graph-rank-portrait,
.graph-legend-portrait {
  width: 18px;
  height: 18px;
  border-radius: 0;
  object-fit: cover;
  object-position: center 15%;
}
.graph-rank-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-rank-bar {
  height: 6px;
  background: var(--surface-2);
}
.graph-rank-bar i {
  display: block;
  height: 100%;
}
.graph-ranking b {
  font: 700 13px var(--font-label);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 10px;
}
.graph-legend button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 2px;
  border: 1px solid var(--line);
  color: var(--cream);
  font-size: 12px;
}
.graph-legend button[aria-pressed="false"] {
  opacity: 0.4;
}
.graph-foot {
  margin: 10px 0 0;
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/match-report.spec.ts`
Expected: PASS (19 tests).

- [ ] **Step 8: Check and commit**

Run `npm test`, `npx tsc --noEmit` and `npm run test:browser`.

```bash
npx prettier --write src/features/match-report tests/browser/match-report.spec.ts
git add src/features/match-report tests/browser/match-report.spec.ts
git commit -m "feat(match-report): the Graph with stat tabs, filters, markers, hover and ranking"
```

---

### Task 7: Website route `/matches/:matchId`

**Files:**
- Create: `web/app/routes/match.tsx`
- Modify: `web/app/routes.ts`, `web/app/paths.ts`
- Modify: `web/scripts/postbuild.mjs`, `web/scripts/serve.mjs` (SPA fallback for `/matches/*`)
- Modify: `web/app/styles/web.css`, `web/app/styles/phone.css`
- Modify: `tests/web-browser/fixtures.ts` (shared match fixture and curve)
- Test: `tests/web-browser/match-report.spec.ts` (create), `tests/web-browser/mobile.spec.ts`

- [ ] **Step 1: Point the website fixtures at the shared match**

In `tests/web-browser/fixtures.ts`:
- After the catalog import, add `import { matchMetadata, rankCurveRows } from "../fixtures/match-report";`.
- Delete the `const player = (teamHero: number, id: number, team: number) => ({ … });` helper.
- Replace the whole `case "/v1/matches/1001/metadata":` branch with:

```ts
      case "/v1/matches/1001/metadata":
        return json(matchMetadata(FARGO));
      case "/v1/analytics/player-performance-curve":
        return json(rankCurveRows());
```

- [ ] **Step 2: Write the failing tests**

`tests/web-browser/match-report.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { heroes } from "../fixtures/match-report";
import { FARGO, mockApi } from "./fixtures";

const viewingAs = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: "Viewing as" });

test("a match URL opens as the linked player", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/matches/1001?player=${FARGO}`);
  await expect(page).toHaveTitle("Match 1001 | Counterlock");
  await expect(viewingAs(page)).toHaveValue("1");
  await expect(page.locator(".report-note")).toHaveText(
    "You're viewing A Rather Long Persona Name Fixture's match. Labels and verdicts are from their point of view.",
  );
  await expect(page.locator(".report-result")).toHaveText("Victory");
  await expect(page.locator(".graph-ranking li")).toHaveCount(12);
});

test("without a player the match opens whole, unless you played in it", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/matches/1001");
  await expect(viewingAs(page)).toHaveValue("all");
  await expect(page.locator(".report-result")).toHaveText("Amber won");
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "counterlock.web.account",
        JSON.stringify({ accountId: id }),
      ),
    FARGO,
  );
  await page.goto("/matches/1001?player=5001");
  await expect(viewingAs(page)).toHaveValue("1");
  await expect(page.locator(".report-note")).toHaveText("This is your match.");
});

test("reloading a match URL serves the app shell with 200", async ({
  page,
}) => {
  await mockApi(page);
  const response = await page.goto("/matches/1001");
  expect(response?.status()).toBe(200);
  await expect(page.locator(".report-result")).toBeVisible();
});

test("an invalid match id says so", async ({ page }) => {
  await page.goto("/matches/abc");
  await expect(page.locator("h1")).toHaveText("That isn't a valid match ID.");
});

test("the report banner runs edge to edge; its text keeps the gutter", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/matches/1001?player=${FARGO}`);
  const banner = (await page.locator(".report-banner").boundingBox())!;
  expect(banner.x).toBe(0);
  expect(banner.width).toBe(1260);
  const portrait = (await page
    .locator(".report-banner-portrait")
    .boundingBox())!;
  expect(portrait.x).toBe(64);
  await expect(
    page.locator(".report-banner .report-stats dd").nth(1),
  ).toHaveText(heroes[0].name);
});
```

In `tests/web-browser/mobile.spec.ts`, change `SCROLLERS` to:

```ts
const SCROLLERS =
  ".hero-table-wrap, .scoreboard-team, .report-table-wrap, .skill-order";
```

and add this test at the end of the `phone width (375px)` describe block (after the profile test):

```ts
  test("match report has no page scroll; the scoreboard scrolls inside its container", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto(`/matches/1001?player=${FARGO}`);
    await expect(page.locator(".report-result")).toHaveText("Victory");
    await expect(page.locator(".graph-svg")).toBeVisible();
    await expect(page.locator(".verdict span").first()).toContainText("▲");
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
    const wrap = page.locator(".report-table-wrap").first();
    expect(
      await wrap.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Everyone" }).click();
    await expect(page.locator(".graph-legend")).toBeVisible();
    expect(await clipped(page, 375)).toEqual([]);
  });
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npm run test:web`
Expected: the new tests FAIL; `/matches/1001` renders the not-found page.

- [ ] **Step 4: Add the route**

`web/app/routes/match.tsx`:

```tsx
import { Link, useParams, useSearchParams } from "react-router";
import { MatchReportPage } from "@/features/match-report/components/MatchReportPage";
import { matchPath } from "@/shared/site";
import { useRememberedMe } from "../remembered";
import { PageMeta } from "../seo";

const id = (value: string | null | undefined) =>
  value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;

export default function MatchRoute() {
  const { matchId } = useParams();
  const [params] = useSearchParams();
  const { meId } = useRememberedMe();
  const match = id(matchId);
  const player = id(params.get("player")) ?? undefined;
  if (match === null)
    return (
      <section className="web-not-found">
        <title>Invalid match | Counterlock</title>
        <h1>That isn&apos;t a valid match ID.</h1>
        <Link to="/">Back to Counterlock</Link>
      </section>
    );
  return (
    <>
      <PageMeta
        title={`Match ${match} | Counterlock`}
        description={`Deadlock match ${match}: souls against the rank average, best and worst stretches, impact and the full scoreboard.`}
        path={matchPath(match)}
      />
      <MatchReportPage
        key={`${match}-${player ?? ""}`}
        matchId={match}
        fromId={player}
        meId={meId}
      />
    </>
  );
}
```

In `web/app/routes.ts`, after `route("players/:accountId", "routes/player.tsx"),`, add:

```ts
  route("matches/:matchId", "routes/match.tsx"),
```

In `web/app/paths.ts`, add `import { matchPath } from "@/shared/site";` after the slugs import, and after the `profile` branch of `routeToPath` add:

```ts
  if (route.page === "match")
    return route.matchId === undefined
      ? "/"
      : matchPath(route.matchId, route.accountId);
```

- [ ] **Step 5: Serve the app shell for match URLs**

In `web/scripts/postbuild.mjs`, replace:

```js
writeFileSync(client("_redirects"), "/players/* /__spa-fallback.html 200\n");
```

with:

```js
writeFileSync(
  client("_redirects"),
  "/players/* /__spa-fallback.html 200\n/matches/* /__spa-fallback.html 200\n",
);
```

In `web/scripts/serve.mjs`, replace `if (pathname.startsWith("/players/"))` with:

```js
  if (pathname.startsWith("/players/") || pathname.startsWith("/matches/"))
```

- [ ] **Step 6: Website and phone layout**

In `web/app/styles/web.css`:
- Add `.match-report,` after `.profile,` in the `:is(…)` list that sets `padding: 0`.
- After the `.app.web .hero-header, .app.web .profile-header { … }` full-bleed rule, add:

```css
.app.web .report-banner {
  margin-right: calc(-1 * var(--gut));
  margin-left: calc(-1 * var(--gut));
  padding-right: var(--gut);
  padding-left: var(--gut);
}
.app.web .report-banner .hero-art-bg {
  right: calc(var(--gut) + 2%);
}
```

In `web/app/styles/phone.css`, replace the first rule with:

```css
.app.web
  :is(
    .heroes-page,
    .items-page,
    .item-detail,
    .hero-detail,
    .profile,
    .home,
    .match-report
  ) {
  overflow: visible;
}
```

Inside `@media (max-width: 640px)`, after the `.app.web .hero-table th button { … }` rule, add:

```css
  .app.web .report-back {
    flex-basis: 100%;
  }
  .app.web .view-as {
    flex: 1 1 100%;
  }
  .app.web .view-as select {
    flex: 1;
    max-width: none;
  }
  .app.web .report-note {
    text-align: left;
  }
  .app.web .report-banner {
    gap: 14px;
  }
  .app.web .report-banner .hero-art {
    display: none;
  }
  .app.web .report-banner-portrait {
    width: 72px;
    height: 72px;
  }
  .app.web .report-result {
    font-size: 30px;
  }
  .app.web .report-stats {
    gap: 6px 18px;
  }
  .app.web .report-stats dd {
    font-size: 17px;
  }
  .app.web .report-verdicts {
    grid-template-columns: minmax(0, 1fr);
  }
  .app.web .report-graph {
    padding: 10px;
  }
  .app.web .graph-tabs select {
    margin-left: 0;
  }
  .app.web .stretch {
    flex-direction: column;
    gap: 2px;
  }
  .app.web .impact-row {
    grid-template-columns: 96px minmax(0, 1fr) 76px;
    gap: 8px;
  }
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npm run web:typecheck` and `npm run test:web`.
Expected: PASS (69 tests).

- [ ] **Step 8: Check and commit**

Run `npm test` and `npx tsc --noEmit`.

```bash
npx prettier --write web/app web/scripts tests/web-browser
git add web tests/web-browser
git commit -m "feat(web): match report at /matches/:matchId"
```

---

### Task 8: Match rows open the report; the inline scoreboard goes

**Files:**
- Modify: `src/features/profile/components/MatchHistory.tsx`
- Delete: `src/features/profile/components/MatchDetail.tsx`
- Modify: `src/features/profile/services/profile-api.ts` (remove `fetchScoreboard` and its types)
- Modify: `src/features/profile/styles/profile.css`, `web/app/styles/phone.css`
- Test: `tests/profile/profile-api.test.ts`, `tests/browser/home.spec.ts`, `tests/browser/match-report.spec.ts`, `tests/web-browser/match-report.spec.ts`, `tests/web-browser/mobile.spec.ts`

- [ ] **Step 1: Update the tests first**

In `tests/browser/home.spec.ts`:
- Add `import { matchMetadata } from "../fixtures/match-report";` after the catalog import.
- Delete the `const items = …` line and the whole `const scoreboard = { … };` block.
- In `routeApi`, replace `return json(scoreboard);` with `return json(matchMetadata(ACCOUNT));`.
- Replace the test `match detail shows both teams with items` with:

```ts
test("a match row opens that match's report", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  const row = view(page).locator(".match-open").first();
  await expect(row).toContainText("Report →");
  await row.click();
  await expect(view(page).locator(".match-report .report-result")).toHaveText(
    "Victory",
  );
  await expect(view(page).locator(".report-table tbody tr")).toHaveCount(12);
});
```

In `tests/browser/match-report.spec.ts`, add before `test("a failed match load says so and Retry recovers"`:

```ts
test("a match row opens the report; Back returns to the profile", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Matches" }).click();
  await view(page).locator(".match-open").first().click();
  await expect(report(page).locator(".report-result")).toHaveText("Victory");
  await report(page).getByRole("button", { name: "← Back to profile" }).click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Fixture Persona",
  );
});
```

In `tests/web-browser/match-report.spec.ts`, add:

```ts
test("profile match rows link to the report and Back returns", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  const row = page.locator("a.match-open").first();
  await expect(row).toHaveAttribute("href", `/matches/1001?player=${FARGO}`);
  await row.click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await expect(page.locator(".report-table tbody tr")).toHaveCount(12);
  await expect(
    page.locator(".report-table").first().getByRole("link", {
      name: "A Rather Long Persona Name Fixture",
    }),
  ).toHaveAttribute("href", `/players/${FARGO}`);
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
});
```

In `tests/web-browser/mobile.spec.ts`:
- Change `SCROLLERS` to `".hero-table-wrap, .report-table-wrap, .skill-order"`.
- In the test `profile page has no page scroll; wide tables scroll inside their container`, replace:

```ts
    await expect(page.locator(".match-toggle").first()).toBeVisible();
    expect(await clipped(page, 375)).toEqual([]);
    await page.locator(".match-toggle").first().click();
    await expect(page.locator(".score-row").first()).toBeVisible();
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
```

with:

```ts
    await expect(page.locator(".match-open").first()).toBeVisible();
    expect(await clipped(page, 375)).toEqual([]);
```

In `tests/profile/profile-api.test.ts`, delete the `describe("fetchScoreboard", …)` block, `fetchScoreboard` from the import list, the `itemById` import and the `const [itemA, itemB, itemC] = …` line.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/home.spec.ts tests/browser/match-report.spec.ts`
Expected: FAIL (no `.match-open`).

- [ ] **Step 3: Rows open the report**

In `src/features/profile/components/MatchHistory.tsx`:
- Delete the `MatchDetail` import, the `open` state (`const [open, setOpen] = …`) and `const expanded = …`.
- Replace the row button opening tag:

```tsx
                <button
                  className="match-toggle"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : match.matchId)}
                >
```

with:

```tsx
                <RouteLink
                  className="match-open"
                  route={{ page: "match", matchId: match.matchId, accountId }}
                >
```

- Replace its end, and the expanded detail after the row:

```tsx
                  <span className="match-date">
                    {timeAgo(match.startTime * 1000)}
                  </span>
                </button>
              </div>
              {expanded && (
                <MatchDetail matchId={match.matchId} accountId={accountId} />
              )}
```

with:

```tsx
                  <span className="match-date">
                    {timeAgo(match.startTime * 1000)}
                  </span>
                  <span className="match-report-link">Report →</span>
                </RouteLink>
              </div>
```

Delete `src/features/profile/components/MatchDetail.tsx` (`git rm`).

In `src/features/profile/services/profile-api.ts`, delete:
- the `ScoreboardPlayer` and `Scoreboard` interfaces;
- `finalItems()` and `fetchScoreboard()`;
- the now-unused `import { itemById } from "@/shared/catalog";`.

- [ ] **Step 4: Styles**

In `src/features/profile/styles/profile.css`:
- Rename `.match-toggle` to `.match-open` (both rules). Give it a seventh column, `grid-template-columns: 1.2fr 0.9fr 0.9fr 0.6fr 0.5fr 0.8fr 0.7fr;`, and add `text-decoration: none;` to its hover rule, because it is a link on the website.
- After the `.match-date { … }` rule, add:

```css
.match-report-link {
  color: var(--gold);
  font: 700 12px var(--font-label);
  letter-spacing: 0.14em;
  text-align: right;
  text-transform: uppercase;
}
```

- Delete every rule from `.match-detail {` up to (not including) `.heroes-tab {`. That is `.match-detail`, `.scoreboard*`, `.you`, `.score-items` and `.scoreboard .item-icon`; nothing else uses them.

In `web/app/styles/phone.css`, inside `@media (max-width: 640px)`:
- Rename `.app.web .match-toggle` to `.app.web .match-open`.
- Change `.app.web .match-date {` to `.app.web :is(.match-date, .match-report-link) {`.
- Delete the three `.app.web .scoreboard…` rules.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`, `npm run test:browser` and `npm run test:web`.
Expected: all pass. Browser: 118 desktop and 70 website tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/features/profile web/app/styles tests
git add -A src/features/profile web/app/styles tests
git commit -m "feat(profile): match rows open the match report"
```

---

### Task 9: Docs and final check

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-21-redesign-design.md`

- [ ] **Step 1: README**

In "What it does":
- Replace "Click a match for its scoreboard." with "Click a match for its match report."
- Add a bullet after **Profile**:

```markdown
- **Match report** opens from any match row, from Home's latest match or from a shared link, for any player. **Viewing as** picks whose point of view it takes (any of the 12 players, or the whole match); it opens as you if you played, otherwise as the player you came from. It shows win or loss, verdicts (souls / min, hero damage and creep kills against the average player on that hero at that rank), **the Graph** (nine stat tabs plus "More stats…", player against the rank average, team totals, team lead or everyone, per minute, time ranges, death, item and objective markers, hover and a ranking that switches the point of view), best and worst stretches, impact, permanent buffs and a scoreboard for both teams. **Copy link** copies the website address of the report. See [Match report](#match-report).
```

After the "Hero page builds and counter items" section, add:

```markdown
### Match report

Everything comes from `GET /v1/matches/{id}/metadata`: per-player stat snapshots (every 3 min until 15:00, then every 5 min, plus one at the end; lines connect them), deaths, purchases, permanent buff pickups, objectives and Mid Boss. Player names come from one batched `GET /v1/players/steam`. Teams are named Amber and Sapphire.

- **Rank average:** `GET /v1/analytics/player-performance-curve?hero_ids=…&min_average_badge=…&max_average_badge=…&resolution=0` (absolute game time) for the selected player's hero and the whole tier of their rank at match start (from the metadata; the lobby's rank when theirs is unknown), last 30 days, normal matches only. When the tier has fewer than 100 games at 3:00 it widens one tier each way and says so; steps with fewer than 30 games are dropped. The graph shades ±1 standard deviation around the average.
- **Verdicts** compare the match's end values with the average at the same match length. The graph and verdicts use **creep kills**, which the snapshots and the average both have; the banner and scoreboard show the game's **last hits**, which is a different count.
- **Stretches** are rule-based: the moments furthest ahead of and behind the average souls, where the player crossed it, every death, and any 3+ deaths within 5 minutes.
- **Impact** is the player's share of their team's hero damage, objective damage and healing (bars fill at half the team's total; the line marks an even 1/6), plus kill participation.
- **Permanent buffs** counts permanent pickups against the rank average.
- **Copy link** copies `{VITE_SITE_URL}/matches/{id}?player={account}`; the desktop app uses Overwolf's clipboard (the manifest's "Clipboard" permission).
```

In "Website":
- Replace "Player profiles (`/players/:accountId`) are not pre-rendered and render in the browser." with "Player profiles (`/players/:accountId`) and match reports (`/matches/:matchId`) are not pre-rendered and render in the browser."
- Replace "The build writes `_redirects` with `/players/* /__spa-fallback.html 200`" with "The build writes `_redirects` with `/players/* /__spa-fallback.html 200` and the same for `/matches/*`".
- Replace "serve `/__spa-fallback.html` with status 200 for `/players/*`" with "serve `/__spa-fallback.html` with status 200 for `/players/*` and `/matches/*`".

At the end of the paragraph that starts "Set `VITE_SITE_URL`", add: "Set it for the desktop app's build (`npm run build`) too: the match report's **Copy link** uses it."

In "API endpoints", replace `- /v1/matches/{id}/metadata` with `` - `/v1/matches/{id}/metadata` and `/v1/analytics/player-performance-curve` (match report) ``.

- [ ] **Step 2: Spec**

In `docs/superpowers/specs/2026-10-21-redesign-design.md`:
- Under "Delivery phases", change item 3 to `3. **Match report (done).**`.
- Under "The Graph":
  - in the stat tabs list, change "Last hits" to "Last hits (built as **Creep kills**: the snapshots and the rank average have creep kills over time, not the game's last hits)";
  - in the "More stats…" list, change "Power-ups picked up" to "Power-ups picked up (built as **Permanent buffs**, counted from `power_up_buffs`, with a rank average)";
  - change "Team lead: Amber minus Sapphire, around a zero line." to "Team lead: Amber's advantage around a zero line (Amber minus Sapphire, flipped for deaths so above the line is always Amber ahead)."
- Under "Match report", after the benchmark paragraph, add: "Built in phase 3: the rank band is the selected player's tier at match start, read from the metadata (`player_rank_data.initial_display_rank`), and widened one tier each way when it has fewer than 100 games."

- [ ] **Step 3: Final check**

Run all of these; every one must pass:
- `npm test`
- `npx tsc --noEmit`
- `npm run web:typecheck`
- `npm run test:browser`
- `npm run test:web`
- `npm run build`
- `npm run web:build`
- `npm run validate:manifest`

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-21-redesign-design.md
git commit -m "docs: match report"
```
