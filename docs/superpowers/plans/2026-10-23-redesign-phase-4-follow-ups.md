# Redesign phase 4 follow-ups — Performance tab and API limits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the phase 4 follow-ups the owner picked:
- **Requests:** the shared API client keeps to each endpoint's rate limit, cools down only what a 429 refused (everything after a 503), and drops expired responses. Rank averages load per hero and rank tier, a few at a time, and a failed one leaves only its own games without an average.
- **One rank rule:** a player whose rank a match didn't record is compared at their current rank, in the match report as on the Performance tab (owner's choice).
- **All four Impact shares:** objective damage and healing shares join kill participation and hero damage share (ten cards).
- **The tab:** the profile keeps its tab, filter, range and hero for the session; the cards stay, dimmed, while a new range or hero loads; picking a game on a chart (pointer, tap or arrow keys) shows it and opens its match report; win and loss dots stay readable on Last 100.
- **Tests:** the browser tests the phase 4 reviews found missing.

**Architecture:**
- **`src/shared/api/DeadlockApi.ts`** groups paths as the API's rate limits do, holds a request back while its group's last minute is full, keeps cooldowns per group, per path and for everything, and sweeps expired responses when it stores one.
- **The match report** asks `/v1/players/rank` once per match for every player without a recorded rank (`fetchRankBadges` in the profile service, `fetchCurrentBadges` in the report's); the curve waits for that answer only when the selected player needs it.
- **`performance-api.ts`** groups games by hero and rank tier and loads at most `CURVE_CONCURRENCY` (4) groups at once; `fetchGameAverages` now returns `{ byMatch, failed, error }`.
- **`ProfileView`** keeps each profile's view (tab, filter, range, hero) in a session map keyed by account; `PerformanceTab` takes the range and hero as props.
- **`PerformanceTab`** remembers the last games that finished loading and shows them, dimmed, while new ones load.
- **`Sparkline`** becomes a keyboard-operable slider with a pointer hit area and a tip above the chart; `nearestGame()` and `dotRadius()` are exported for unit tests.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8 (web), plain global CSS with the noir tokens, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md` ("Performance tab", "Match report", "Profile") and the follow-ups listed in `docs/superpowers/plans/2026-10-22-redesign-phase-4-performance-tab.md`. Owner decisions on 2026-10-23: do the follow-up pass before phase 5; current rank for unranked games in both places; all four shares; also the three request items (rate limit, session memory, averages failing together).

**Every code block in this plan was built and run before the plan was written** (reference commits in a scratch worktree, replayed from this plan's blocks). The full result:
- `npm test` 382 passed;
- `npm run test:browser` 147 passed;
- `npm run test:web` 76 passed;
- both type checks, `npm run build`, `npm run web:build` and `npm run validate:manifest` passed.

Each task's end state was also checked on its own: type check and unit tests after every task (377, 378, 378, 380, 380, 380, 382 and 382 tests), and both browser suites after every task (desktop 132, 133, 133, 134, 136, 137, 139 and 147; website 74, 74, 74, 74, 75, 75, 76 and 76). Copy the code as given. If something fails, fix the cause rather than the test.

## Decisions made while planning (verified against the live API on 2026-10-23)

- **Rate limits are per endpoint group, from the API's OpenAPI docs** (`https://api.deadlock-api.com/openapi.json`), per IP:
  - analytics: 200 requests a minute, **shared across all `/v1/analytics/*` endpoints**;
  - bulk match metadata (`/v1/matches/metadata`): 30 a minute;
  - rank lookups (`/v1/players/rank`): 20 a minute;
  - everything else the app calls (Steam profiles and search, match history, mate stats, hero stats, builds, single-match metadata from cache): 100 a second, so no client limit is needed.
- **The client waits rather than going over a limit.** A sliding window of `RATE_WINDOW` (61 s: a second's margin for latency) counts each group's requests; one beyond the limit waits until the oldest leaves the window. Requests in groups without a limit start synchronously, as before (the in-flight test relies on it). A waiting request checks for a cooldown each time it wakes, before it takes a slot (Task 1 review), so a request that fails into a cooldown doesn't use one up.
- **What a refusal pauses (Task 1 review).** A 429 or 503 used to pause every request for at least 30 s.
  - **A 429** now pauses the whole group for the three groups the API limits as a whole, and otherwise only the refused path. Those other endpoints' limits depend on where the data comes from: single-match metadata allows 100 a second from the API's cache but 3 an hour from Steam, so one refused match must not block every report.
  - **A 503** pauses everything. The API's docs ("Load Shedding") say its database-backed endpoints share one query queue and that a client should wait out `Retry-After` and not send many uncached requests in parallel.
  - The 30 s minimum and `Retry-After` handling are unchanged.
- **Expired responses are dropped.** Each cache entry keeps the ttl it was stored with; storing a response sweeps out the expired ones, at most once a minute. Every path is always asked for with the same ttl (checked across `src`), so an entry's own ttl is the one that matters. The match report's single-match metadata (about 1 MB a game) and the bulk responses no longer stay for the whole session. The Performance service still keeps parsed totals per match (about 1 KB a game) for the session.
- **One rank rule (owner's choice: current rank).** In the match report, a player whose rank the match didn't record (`player_rank_data` missing, as in unranked games) is compared at their current rank, then all ranks; the lobby's rank is no longer used for the average (it still names the lobby in the banner).
  - `/v1/players/rank?account_ids=a,b,c` answers for many accounts at once (checked live: three accounts, three rows), so the report asks once per match for every such player. Rank lookups allow only 20 a minute, so one request per "Viewing as" switch would have been wasteful.
  - The report asks only for normal-mode matches, and the curve waits for the answer only when the selected player has no recorded rank.
  - A failed lookup, like a player without a current rank, means all ranks, with the note "This player's rank isn't recorded for this match, and there's no current rank to use." The wording doesn't claim which of the two it was (Task 2 review), as on the Performance tab.
- **All four Impact shares.** Kill participation and the player's share of their team's hero damage, objective damage and healing, as in the match report's Impact. None has a rank average (the curve has no team totals). The test fixture's teammates now have 1,500 objective damage and 3,000 healing each, so the three damage-type shares differ (29%, 44%, 21%) and a test can't pass by reading the wrong team total.
- **Rank averages per hero and rank tier, four at a time.** Games that ask for the same curve (`curvePath(hero, rankBand(badge))`) share their requests (the client shares them anyway); grouping lets a limit apply to distinct curves. A group never has more than one request in flight (its base curve, then its wider one), so four groups mean at most four curve requests at once. `CURVE_CONCURRENCY = 4`: an uncached curve takes about 7 s, and Last 100 can need a dozen, which all at once ran past the client's 15 s timeout. Each game's curve is awaited separately (`Promise.allSettled`), so a failure costs only its own games. `fetchGameAverages` fails as a whole only when no game gets an average, so the existing "Rank averages unavailable: {error}" notice and Retry still cover a full failure; a partial one gets "Rank averages unavailable for {n} of {count}: {error}" with Retry. Retry re-asks only the failed curves (the others are cached for 10 minutes).
  - **A card with any game whose curve failed claims no trend (Task 4 review).** Its trend would follow only the games that kept their average: after a rank-up, the recent games form the new, uncached group most likely to fail, and a trend from the older games alone could even point the wrong way. Such a card also shows no "Too few games" and no "no rank average for these games"; its numbers stay like for like ("20 games · 10 with a rank average: … vs …"). `GameAverages.failed` is the set of those games' match ids.
- **The profile keeps its view for the session.** A module-level map in `ProfileView`, keyed by account, holds the tab, the match filter, the range and the hero. The desktop app keeps the profile mounted while a report is open, but the website opens the report as its own page, so its profile remounts; the map covers both, and switching profile tabs (which unmounts the Performance tab) too. Phase 3 suggested URL state; a session map needs no route changes in either shell. A reload starts at Overview again, and coming back to a profile later in the session finds it as it was left.
- **Cards stay while new games load.** The tab remembers the last games whose totals and averages both finished, with their requests, and shows those while a new range or hero loads: `aria-busy` on the cards, 55% opacity, and "Updating to the last {n} games…" beside the controls. It uses React's documented "storing information from previous renders" pattern (`setState` during render, behind a condition that turns false once stored). The first load still shows the loading texts.
- **Picking a game on a chart.**
  - **Mouse or pen:** hovering picks the nearest game (`nearestGame()`); a click opens its report.
  - **Touch:** a tap only picks it, so the details show first; the tip's "Report →" link opens it; a tap outside the chart clears it (as the match report's Graph does).
  - **Keyboard:** the chart is a `role="slider"` (screen readers pass arrow keys to sliders): arrow keys, Home and End pick a game, Enter opens its report, Escape clears, and focus starts on the newest game. Its `aria-valuetext` reads the tip.
  - **The tip** sits above the chart, over the card's numbers, on the picked game's side, so the whole line stays in sight. Two lines: "{Hero} · Win · 3d ago" and "{value} rank avg {x} · Report →". Rejected while planning: a readout line under the chart (truncated at four columns: "rank avg …") and a tip beside the point (ran off the card on narrow charts). Its link has a 24 px touch target.
  - **Points without a value** can be picked too ("—"); the report is still useful.
  - The old `<title>` tooltips go.
- **Readable dots on Last 100.** The radius still shrinks with the spacing (`dotRadius()`), but not below 2 px, and every dot has a 1 px outline in `--surface` (the card), which keeps neighbours apart and off the gold line. Checked on live data at 1260 px, Last 100.
- **Test fixtures.**
  - `routeApi` in `tests/browser/home.spec.ts` gains `failCurveFor` (a set the test can empty before Retry), `thinTiers` (one tier's curves come back with 50 games, so they widen) and `gate` (awaited before each answer, to hold requests back). The route handler becomes `async` for it.
  - Tests that recover on Retry pass a fixtures object and change it before clicking Retry: the handler reads it at request time.
- **Checked by eye** on live data (account 400239835) through the website build: Last 20 and Last 100 at 1260 px (tip on both sides), and a tap at 375 px on a touch phone; no horizontal page scroll.

- **Follow-ups for the owner (not built):**
  - **Abandoned requests still go out:** a range or hero the user has already left keeps its queued bulk requests and curve groups (no cancellation), so they use up the rate limit, and two quick switches can run two calls' curve groups at once (Task 4 review).
  - **Other tabs:** each browser tab or window has its own limiter, while the API counts per IP.
  - **The tip covers the card's numbers** while a game is picked.
  - **Enter on the slider** opens a report, which the slider pattern doesn't define; screen readers announce it through the label.
  - **Clients outside the shared one:** the live overlay's statistics client (`src/features/player-stats/`) has its own cache and cooldowns, and `src/features/builds/services/build-analytics.ts` fetches `/v1/analytics/hero-build-stats` directly; neither counts against these limits (Task 1 review).
  - **A waiting request learns of a cooldown only when it wakes,** up to a minute later, even when `Retry-After` is an hour.
  - **A profile reopened later in the session** opens on the tab it was left on, not Overview.
  - **Share trends on "All heroes" (Task 3 review):** shares have no rank average, so a trend can follow the hero mix (from a healer to a carry, healing share slips) rather than form. Hiding share trends on "All heroes" is an option.
  - **Card rows (Task 3 review):** at full width the ten cards run 4/4/2, so the shares are split across two rows; five columns above about 1100 px would put each share under its per-minute card.
  - **A team total of 0:** the report shows 0% where the tab leaves the game out of that share (copying kill participation); none of 40 live team totals was 0.

## Global Constraints

- Every colour comes from `src/app/styles/tokens.css` (`var(--token)` or `rgb(from var(--token) r g b / a)`). `tests/app/theme.test.ts` fails on any hex literal in `src/**/*.css`, `web/app/**/*.css` or `src/**/*.tsx`.
- **Constants (exported; tests import them):** `RATE_LIMITS`, `RATE_WINDOW` and `endpointGroup()` in `DeadlockApi.ts`; `CURVE_CONCURRENCY = 4` in `performance-api.ts`; `dotRadius()` and `nearestGame()` in `Sparkline.tsx`.
- **New or changed copy strings (tests assert them):**
  - **Card titles:** "Objective damage share" and "Healing share" after "Hero damage share".
  - **Notes:** "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals."
  - **Partial failure:** "Rank averages unavailable for {n} of {count}: {error}" with Retry, for example "Rank averages unavailable for 10 of 20 games: Deadlock API unavailable (500)."
  - **Loading:** "Updating to the last {count}…", for example "Updating to the last 50 games…".
  - **Tip:** "{Hero} · Win · 3d ago" over "{value} rank avg {x} · Report →" ("—" without a value; no "rank avg" without an average).
  - **Chart label:** "{metric}, game by game. Arrow keys pick a game, Enter opens its match report." with `aria-valuetext` "{Hero} · Win · 3d ago: {value}, rank avg {x}".
  - **Match report notes:** " This player's rank isn't recorded for this match, so the average uses their current rank." and " This player's rank isn't recorded for this match, and there's no current rank to use."
- One shared copy of the feature code for the app and the website.
- **Before every commit**, run `npm test`, `npx tsc --noEmit` and `npm run web:typecheck`.
- **Browser suites:** `npm run test:browser` (desktop, port 5186) and `npm run test:web` (website, builds and serves on 5187). If a port is busy, free it with `fuser -k <port>/tcp`; never `pkill -f`.
- **Formatting:** format touched files with `npx prettier --write <files>`. The spec file has never been prettier-formatted: leave its existing formatting alone and check only that your edit adds no new differences.
- **Commits:** plain conventional commits with **no AI attribution lines or trailers** (owner rule).

## Review Focus

1. **Limits that hold.** The throttle counts a request when it is sent and never more than the limit per window, a waiting request checks for a cooldown before taking a slot, duplicates share one wait, unlimited groups still start synchronously, a 429 pauses only what it refused and a 503 everything. Tests: `cools down a rate-limited group after a 429 with Retry-After`, `cools down only the refused path of other endpoints`, `pauses everything after a 503: the API is shedding load`, `sends a burst a window at a time, never more than the limit`, `fails a waiting request when its group cools down, without using a slot`, `drops responses that outlived their ttl`, `keeps responses still fresh, and sweeps at most once a minute`.
2. **One rank rule.** The report and the tab both use the game's rank, then the current rank, then all ranks, and the report asks for every player's current rank in one request. Tests: `a player without a recorded rank is compared at their current rank, and the note says so`, `with no ranks recorded and no current rank, the average covers all ranks and says so`, `the report waits for current ranks only where it needs them, and asks for each curve once`, `Street Brawl reports say rank averages cover normal matches only` (no lookup), `performance tab compares ranked games at their own rank`.
3. **Partial failure.** A failed curve leaves only its games without an average, cards with such games claim no trend, Retry re-asks only the failed curve and recovers, and a full failure still fails as a whole. Tests: `keeps the games whose curve loaded when another fails`, `fails as a whole when every curve fails, so the tab can offer Retry`, `performance tab keeps the rank averages that loaded, and Retry asks again for the rest`, `performance tab keeps the trends a failed curve doesn't touch`, `performance tab doesn't call failed averages missing`.
4. **Picking a game.** Pointer, touch and keyboard each work, and a tap never opens a report on its own. Tests: `performance tab describes the game under the pointer and a click opens its report`, `performance tab points can be picked and opened from the keyboard`, `a tap on a Performance chart shows the game; its Report link opens it`.
5. **No lost state.** Tests: `the profile keeps its tab, range and hero after a match report`, `performance range and hero survive a profile tab switch`, `each profile keeps its own tab and filter for the session`, `performance tab keeps the last cards, dimmed, while new games load`.

## File structure

| File | Responsibility |
|---|---|
| `src/shared/api/DeadlockApi.ts` | Endpoint groups, per-group rate limits, cooldowns by group, path or everything, expired-response sweep |
| `src/features/profile/services/profile-api.ts` | `fetchRankBadges()`: many accounts' current ranks in one request |
| `src/features/match-report/services/match-report.ts` | `fetchCurrentBadges()`: the report's current ranks, empty on failure |
| `src/features/match-report/components/MatchReportPage.tsx` | Current rank for players without a recorded one; the curve waits for it |
| `src/features/match-report/components/Verdicts.tsx` | `RankSource` and the rank note |
| `src/features/profile/utils/performance-metrics.ts` | Team objective damage and healing; the two new shares |
| `src/features/profile/services/performance-api.ts` | Averages per hero and rank tier, four at a time, partial failure |
| `src/features/profile/components/ProfileView.tsx` | The view kept per account for the session |
| `src/features/profile/components/ProfilePage.tsx` | Keys `ProfileView` by account |
| `src/features/profile/components/PerformanceTab.tsx` | Controlled range and hero, kept cards while loading, partial-failure notice, point text and routes |
| `src/features/profile/components/Sparkline.tsx` | Slider, pointer hit area, tip, picked-game cross and ring, `dotRadius()`, `nearestGame()` |
| `src/features/profile/styles/profile.css` | Busy cards, tip, hit area, dot outline |

---

### Task 1: The API client keeps to each endpoint's rate limit

**Files:**
- Modify: `src/shared/api/DeadlockApi.ts`
- Test: `tests/shared/DeadlockApi.test.ts`

What changes, in the client every feature shares:
- **`endpointGroup(path)`** names the group a path's limit and cooldown belong to: `/v1/analytics` for every analytics endpoint, otherwise the path without its query, with numeric segments as `{id}`.
- **`RATE_LIMITS`** holds the three groups with a limit tight enough to matter (requests a minute per IP); `RATE_WINDOW` is 61 s.
- **Throttle:** a limited group's request waits until the group has had fewer than its limit in the window, then counts itself. The wait is injectable (the constructor's third argument), so tests don't sleep.
- **Cooldowns:** `cooldownUntil` becomes a map. A 429 pauses `refused(path, group)`: the group for the three limited groups, otherwise the path. A 503 pauses everything (`"*"`).
- **Sweep:** cache entries keep their ttl; `store()` drops expired ones at most once a minute.
- **Tests:** the burst and cooldown tests use Vitest's fake timers with the client's real `Date.now` and `setTimeout`. Each was checked against broken code while planning: no re-check loop, no cooldown check while waiting, one counter for all groups, no sharing of a waiting request, cooldowns by path for limited groups, a sweep that clears everything or runs on every store, a 60 s window, and a 503 that pauses one group all fail a test.

- [ ] **Step 1: Write the failing tests**

In `tests/shared/DeadlockApi.test.ts`:

1. Replace:

```ts
import { describe, expect, it, vi } from "vitest";
import { DeadlockApi, TTL } from "@/shared/api/DeadlockApi";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);
```

with:

```ts
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
```

2. Replace:

```ts
    expect(b).toBe(a);
  });

  it("cools down after 429 with Retry-After", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
```

with:

```ts
    expect(b).toBe(a);
  });

  it("cools down a rate-limited group after a 429 with Retry-After", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
```

3. Replace:

```ts
      .mockImplementation(async () => json([]));
    let now = 1_000;
    const api = new DeadlockApi(request, () => now);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    await expect(api.get("/v1/other", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    expect(request).toHaveBeenCalledTimes(1);
    now += 60_001;
    await expect(api.get("/v1/other", 1000)).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("uses a 30s cooldown on 503 without Retry-After", async () => {
```

with:

```ts
      .mockImplementation(async () => json([]));
    let now = 1_000;
    const api = new DeadlockApi(request, () => now);
    await expect(api.get("/v1/analytics/hero-stats", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    // The analytics endpoints share their limit, so they share the cooldown.
    await expect(api.get("/v1/analytics/item-stats", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    expect(request).toHaveBeenCalledTimes(1);
    // Other endpoints have limits of their own.
    await expect(
      api.get("/v1/players/rank?account_ids=1", 1000),
    ).resolves.toEqual([]);
    now += 60_001;
    await expect(api.get("/v1/analytics/item-stats", 1000)).resolves.toEqual(
      [],
    );
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("cools down only the refused path of other endpoints", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockImplementation(async () => json({}));
    const api = new DeadlockApi(request, () => 0);
    await expect(api.get("/v1/matches/1/metadata", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    await expect(api.get("/v1/matches/1/metadata", 1000)).rejects.toThrow(
      "API busy",
    );
    // Another match may come from the API's cache.
    await expect(api.get("/v1/matches/2/metadata", 1000)).resolves.toEqual({});
  });

  it("pauses everything after a 503: the API is shedding load", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockImplementation(async () => json([]));
    const api = new DeadlockApi(request, () => 0);
    await expect(api.get("/v1/analytics/hero-stats", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    await expect(api.get("/v1/players/7/match-history", 1000)).rejects.toThrow(
      "API busy",
    );
    expect(request).toHaveBeenCalledTimes(1);
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
    expect(RATE_WINDOW).toBe(61_000);
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

  it("sends a burst a window at a time, never more than the limit", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const sentAt = new Map<string, number>();
      const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        sentAt.set(String(url), Date.now() - start);
        return json([]);
      });
      const api = new DeadlockApi(request);
      const rank = (id: number) =>
        api.get(`/v1/players/rank?account_ids=${id}`, 1);
      // Another group's requests don't count against this one's limit.
      await api.get("/v1/analytics/hero-stats", 1);
      const all = Promise.all([
        ...Array.from({ length: 45 }, (_, i) => rank(i)),
        // A second ask for a waiting path shares its wait.
        rank(44),
      ]);
      await vi.advanceTimersByTimeAsync(3 * RATE_WINDOW);
      await all;
      expect(request).toHaveBeenCalledTimes(46);
      expect(
        sentAt.get("https://api.deadlock-api.com/v1/analytics/hero-stats"),
      ).toBe(0);
      sentAt.delete("https://api.deadlock-api.com/v1/analytics/hero-stats");
      expect([...sentAt.values()]).toEqual([
        ...Array(20).fill(0),
        ...Array(20).fill(RATE_WINDOW),
        ...Array(5).fill(2 * RATE_WINDOW),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails a waiting request when its group cools down, without using a slot", async () => {
    vi.useFakeTimers();
    try {
      let sent = 0;
      const request = vi.fn<typeof fetch>().mockImplementation(async () =>
        ++sent === 20
          ? new Response("", {
              status: 429,
              headers: { "Retry-After": "120" },
            })
          : json([]),
      );
      const api = new DeadlockApi(request);
      const rank = (id: number) =>
        api.get(`/v1/players/rank?account_ids=${id}`, 1);
      const first = Array.from({ length: 20 }, (_, i) =>
        rank(i).catch(() => null),
      );
      // The 21st waits for room; a second ask for it shares the wait.
      const waiting = Promise.allSettled([rank(20), rank(20)]);
      await Promise.all(first);
      await vi.advanceTimersByTimeAsync(RATE_WINDOW);
      expect((await waiting).map((r) => r.status)).toEqual([
        "rejected",
        "rejected",
      ]);
      expect(request).toHaveBeenCalledTimes(20);
      // Once the cooldown ends, a full window's worth goes out at once.
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.all(Array.from({ length: 20 }, (_, i) => rank(100 + i)));
      expect(request).toHaveBeenCalledTimes(40);
    } finally {
      vi.useRealTimers();
    }
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

  it("keeps responses still fresh, and sweeps at most once a minute", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({ ok: true }));
    let now = 0;
    const api = new DeadlockApi(request, () => now);
    await api.get("/v1/fresh", TTL.analytics);
    await api.get("/v1/short", 1000);
    now += 2_000;
    // Nothing is swept within a minute of the last sweep (here, the
    // client's start), so the expired entry is still there for a longer
    // ttl to find.
    await api.get("/v1/other", 1000);
    await api.get("/v1/short", TTL.analytics);
    expect(request).toHaveBeenCalledTimes(3);
    now += 60_000;
    await api.get("/v1/another", 1000);
    await api.get("/v1/fresh", TTL.analytics);
    await api.get("/v1/short", TTL.analytics);
    // Only the expired one was asked for again.
    expect(request).toHaveBeenCalledTimes(5);
  });

  it("uses a 30s cooldown on 503 without Retry-After", async () => {
```


The old cooldown test refused `/v1/other` after a 429 on `/v1/x`; it is replaced by three tests, for a limited group, another endpoint's path and a 503.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/shared/DeadlockApi.test.ts`
Expected: FAIL (8 failed, 11 passed: `endpointGroup is not a function`; a 429 still refuses other groups and other matches; nothing waits (`expected [] to deeply equal [ NaN ]`, as `RATE_WINDOW` doesn't exist yet) and the burst goes out at once; a waiting request isn't failed by the cooldown; expired responses are still served. The 503 test already passes: the old cooldown paused everything).

- [ ] **Step 3: Write the client**

Replace the whole of `src/shared/api/DeadlockApi.ts` with:

```ts
const BASE = "https://api.deadlock-api.com";
const BUSY = "API busy. Retry after the cooldown.";
const MINUTE = 60_000;

export const TTL = {
  analytics: 10 * 60_000,
  profile: 5 * 60_000,
  history: 2 * 60_000,
};

// Requests a minute per IP, from the API's OpenAPI docs, for the groups the
// app could reach; the other endpoints allow 100 a second.
export const RATE_LIMITS: Record<string, number> = {
  "/v1/analytics": 200,
  "/v1/matches/metadata": 30,
  "/v1/players/rank": 20,
};
// A second's margin, so latency can't put a minute's last request into the
// API's next window early.
export const RATE_WINDOW = MINUTE + 1000;

/**
 * The group a path's rate limit belongs to: the analytics endpoints share
 * one limit; any other endpoint has its own.
 */
export function endpointGroup(path: string) {
  const pathname = path.split("?")[0];
  if (pathname.startsWith("/v1/analytics/")) return "/v1/analytics";
  return pathname.replace(/\/\d+(?=\/|$)/g, "/{id}");
}

// A 503 means the API is shedding load: its database-backed endpoints share
// one query queue, so every request waits out the cooldown.
const EVERYTHING = "*";

// What a 429 pauses: the group when the API limits it as a whole, otherwise
// only the refused path, as those endpoints' limits depend on where the data
// comes from (a match from the API's cache, or from Steam).
const refused = (path: string, group: string) =>
  RATE_LIMITS[group] ? group : path;

/**
 * Every path is always asked for with the same ttl; an entry is kept, and
 * swept, by the ttl it was stored with.
 */
export class DeadlockApi {
  private cache = new Map<
    string,
    { data: unknown; fetchedAt: number; ttl: number }
  >();
  private inFlight = new Map<string, Promise<unknown>>();
  private cooldowns = new Map<string, number>();
  private sent = new Map<string, number[]>();
  private sweptAt = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  get<T>(path: string, ttlMs: number): Promise<T> {
    const saved = this.cache.get(path);
    if (saved && this.now() - saved.fetchedAt < ttlMs)
      return Promise.resolve(saved.data as T);
    const pending = this.inFlight.get(path);
    if (pending) return pending as Promise<T>;
    const group = endpointGroup(path);
    if (this.cooling(path, group)) return Promise.reject(new Error(BUSY));
    const run = this.send<T>(path, group)
      .then((data) => {
        this.store(path, data, ttlMs);
        return data;
      })
      .finally(() => this.inFlight.delete(path));
    this.inFlight.set(path, run);
    return run;
  }

  private cooling(path: string, group: string) {
    const now = this.now();
    return [EVERYTHING, refused(path, group)].some(
      (key) => now < (this.cooldowns.get(key) ?? 0),
    );
  }

  /** Sends at once, or when the group's rate limit has room. */
  private async send<T>(path: string, group: string): Promise<T> {
    const limit = RATE_LIMITS[group];
    if (limit) await this.throttle(path, group, limit);
    return this.fetchJson<T>(path, group);
  }

  /**
   * Waits until the group has had fewer than `limit` requests in the window,
   * then counts this one. A cooldown that started while it waited fails it
   * before it takes a slot.
   */
  private async throttle(path: string, group: string, limit: number) {
    const sent = this.sent.get(group) ?? [];
    this.sent.set(group, sent);
    for (;;) {
      if (this.cooling(path, group)) throw new Error(BUSY);
      const now = this.now();
      while (sent.length && now - sent[0] >= RATE_WINDOW) sent.shift();
      if (sent.length < limit) {
        sent.push(now);
        return;
      }
      await this.wait(sent[0] + RATE_WINDOW - now);
    }
  }

  // Responses that have outlived their ttl are dropped, at most once a
  // minute, so a long session doesn't keep every response it has seen.
  private store(path: string, data: unknown, ttl: number) {
    const now = this.now();
    if (now - this.sweptAt >= MINUTE) {
      this.sweptAt = now;
      for (const [key, entry] of this.cache)
        if (now - entry.fetchedAt >= entry.ttl) this.cache.delete(key);
    }
    this.cache.set(path, { data, fetchedAt: now, ttl });
  }

  // The timeout covers both the request and reading the body.
  private mapTimeout(error: unknown) {
    return error instanceof Error && error.name === "TimeoutError"
      ? new Error("Deadlock API timed out.")
      : error;
  }

  private async fetchJson<T>(path: string, group: string): Promise<T> {
    let response: Response;
    try {
      response = await this.request(`${BASE}${path}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error("Deadlock API unreachable.");
      throw this.mapTimeout(error);
    }
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get("Retry-After");
      const seconds = header ? Number(header) : NaN;
      const until = Number.isFinite(seconds)
        ? this.now() + seconds * 1000
        : Date.parse(header ?? "");
      this.cooldowns.set(
        response.status === 503 ? EVERYTHING : refused(path, group),
        Math.max(this.now() + 30_000, Number.isFinite(until) ? until : 0),
      );
      throw new Error(BUSY);
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Data unavailable or profile protected."
          : `Deadlock API unavailable (${response.status}).`,
      );
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw this.mapTimeout(error);
    }
  }
}

export const deadlockApi = new DeadlockApi();
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/shared/DeadlockApi.test.ts`
Expected: PASS (19 tests).

Run: `npm test`
Expected: PASS (377 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/shared/api/DeadlockApi.ts tests/shared/DeadlockApi.test.ts
npm run test:browser && npm run test:web
git add src/shared/api/DeadlockApi.ts tests/shared/DeadlockApi.test.ts
git commit -m "feat(api): rate limits and cooldowns per endpoint group; drop expired responses"
```

Expected: 132 desktop and 74 website tests pass.

---

### Task 2: The match report compares unrecorded ranks at the current rank

**Files:**
- Modify: `src/features/profile/services/profile-api.ts`
- Modify: `src/features/match-report/services/match-report.ts`
- Modify: `src/features/match-report/components/MatchReportPage.tsx`
- Modify: `src/features/match-report/components/Verdicts.tsx`
- Test: `tests/profile/profile-api.test.ts`, `tests/browser/match-report.spec.ts`

The Performance tab already uses the game's rank, then the player's current rank, then all ranks. The report used the lobby's rank instead. Now it follows the tab's rule (owner's choice):
- **`fetchRankBadges(ids)`** asks `/v1/players/rank` once for many accounts (sorted, unique, above 0) and returns each ranked account's badge; unranked accounts (badge 0) are left out.
- **`fetchCurrentBadges(ids)`** wraps it for the report and returns an empty map on failure, so those players get all ranks.
- **The report** asks once per normal-mode match for every player whose rank the match didn't record. While that answer loads, the selected player's curve waits only if they are one of them.
- **`Verdicts`** takes `rank: RankSource` (`"match" | "current" | "none"`) instead of `fromLobby`, for its note. `lobbyBadge` stays: the banner still names the lobby ("Emissary-level lobby").

- [ ] **Step 1: Write the failing tests**

In `tests/profile/profile-api.test.ts`:

1. Replace:

```ts
  fetchMates,
  fetchPlayerHeroStats,
  fetchRank,
  fetchSteamProfiles,
  heroStatsQueries,
  searchSteamAccounts,
```

with:

```ts
  fetchMates,
  fetchPlayerHeroStats,
  fetchRank,
  fetchRankBadges,
  fetchSteamProfiles,
  heroStatsQueries,
  searchSteamAccounts,
```

2. Replace:

```ts
    expect(await fetchRank(5, api)).toEqual(row);
    expect(await fetchRank(6, api)).toBeNull();
  });
});

describe("searchSteamAccounts", () => {
```

with:

```ts
    expect(await fetchRank(5, api)).toEqual(row);
    expect(await fetchRank(6, api)).toBeNull();
  });

  it("asks for many accounts' ranks in one request, leaving out the unranked", async () => {
    const { api, calls } = fakeApi({
      "/v1/players/rank?account_ids=3,5,7": [
        { account_id: 5, badge: 61, rank: 6, subrank: 1 },
        { account_id: 7, badge: 0, rank: 0, subrank: 0 },
        { account_id: 9, badge: 116, rank: 11, subrank: 6 },
      ],
    });
    expect(await fetchRankBadges([7, 5, 0, 3, 5], api)).toEqual(
      new Map([[5, 61]]),
    );
    expect(calls).toEqual(["/v1/players/rank?account_ids=3,5,7"]);
    expect(await fetchRankBadges([0], api)).toEqual(new Map());
    expect(calls).toHaveLength(1);
  });
});

describe("searchSteamAccounts", () => {
```


In `tests/browser/match-report.spec.ts`:

1. Replace:

```ts
  );
});

async function openWith(page: Page, metadata: unknown) {
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) => route.fulfill({ json: metadata, headers: cors }),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  await expect(report(page).locator(".report-result")).toBeVisible();
}

test("a player without a recorded rank is compared at the lobby's rank, and the note says so", async ({
  page,
}) => {
  const unranked = matchMetadata(ACCOUNT);
  delete (unranked.match_info.players[0] as Record<string, unknown>)
    .player_rank_data;
  await openWith(page, unranked);
  await expect(
    report(page).locator(".report-verdicts + .data-note"),
  ).toHaveText(
    `Compared with the average ${lead.name} at Emissary at the same match length, over the last 30 days. This player's rank isn't recorded for this match, so the average uses the lobby's rank.`,
  );
});

test("with no ranks recorded, the average covers all ranks without a lobby note", async ({
  page,
}) => {
  const unranked = matchMetadata(ACCOUNT);
  for (const player of unranked.match_info.players)
    delete (player as Record<string, unknown>).player_rank_data;
  await openWith(page, unranked);
  await expect(
    report(page).locator(".report-verdicts + .data-note"),
  ).toHaveText(
    `Compared with the average ${lead.name} at all ranks at the same match length, over the last 30 days.`,
  );
});

test("Street Brawl reports say rank averages cover normal matches only", async ({
  page,
}) => {
  const brawl = matchMetadata(ACCOUNT);
  brawl.match_info.game_mode = 4;
  await openWith(page, brawl);
  const r = report(page);
  await expect(r.locator(".report-banner .eyebrow")).toHaveText(
```

with:

```ts
  );
});

/** The report's current-rank lookups; the home page asks for one account, without a comma. */
function rankLookups(page: Page) {
  const asked: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const ids = url.searchParams.get("account_ids");
    if (url.pathname === "/v1/players/rank" && ids?.includes(","))
      asked.push(ids);
  });
  return asked;
}

async function openWith(page: Page, metadata: unknown, ranks?: unknown[]) {
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) => route.fulfill({ json: metadata, headers: cors }),
  );
  if (ranks)
    await page.route(
      "https://api.deadlock-api.com/v1/players/rank**",
      (route) => route.fulfill({ json: ranks, headers: cors }),
    );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  await expect(report(page).locator(".report-result")).toBeVisible();
}

test("a player without a recorded rank is compared at their current rank, and the note says so", async ({
  page,
}) => {
  const unrecorded = matchMetadata(ACCOUNT);
  delete (unrecorded.match_info.players[0] as Record<string, unknown>)
    .player_rank_data;
  // The lobby is Emissary; the player is Eternus now.
  await openWith(page, unrecorded, [
    { account_id: ACCOUNT, badge: 116, rank: 11, subrank: 6 },
  ]);
  await expect(
    report(page).locator(".report-verdicts + .data-note"),
  ).toHaveText(
    `Compared with the average ${lead.name} at Eternus at the same match length, over the last 30 days. This player's rank isn't recorded for this match, so the average uses their current rank.`,
  );
});

test("with no ranks recorded and no current rank, the average covers all ranks and says so", async ({
  page,
}) => {
  const asked = rankLookups(page);
  const unranked = matchMetadata(ACCOUNT);
  for (const player of unranked.match_info.players)
    delete (player as Record<string, unknown>).player_rank_data;
  await openWith(page, unranked, []);
  await expect(
    report(page).locator(".report-verdicts + .data-note"),
  ).toHaveText(
    `Compared with the average ${lead.name} at all ranks at the same match length, over the last 30 days. This player's rank isn't recorded for this match, and there's no current rank to use.`,
  );
  // One request covers every player's current rank.
  const players = [
    ...Array.from({ length: 11 }, (_, i) => 5001 + i),
    ACCOUNT,
  ].join(",");
  expect(asked).toEqual([players]);
});

test("the report waits for current ranks only where it needs them, and asks for each curve once", async ({
  page,
}) => {
  const curves: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/player-performance-curve")
      curves.push(
        `${url.searchParams.get("hero_ids")} at ${url.searchParams.get("min_average_badge") ?? "all ranks"}`,
      );
  });
  // Slots 1 and 3 have no recorded rank; both players are Eternus now.
  const metadata = matchMetadata(ACCOUNT);
  for (const index of [0, 2])
    delete (metadata.match_info.players[index] as Record<string, unknown>)
      .player_rank_data;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) => route.fulfill({ json: metadata, headers: cors }),
  );
  await page.route(
    "https://api.deadlock-api.com/v1/players/rank**",
    async (route) => {
      const ids = new URL(route.request().url()).searchParams.get(
        "account_ids",
      )!;
      // Hold the report's lookup back (the home page's has no comma).
      if (ids.includes(",")) await held;
      return route.fulfill({
        json: [ACCOUNT, 5002].map((account_id) => ({
          account_id,
          badge: 116,
          rank: 11,
          subrank: 6,
        })),
        headers: cors,
      });
    },
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  const note = report(page).locator(".report-verdicts + .data-note");
  // The lead waits for the lookup...
  await expect(note).toHaveText("Loading the rank average…");
  // ...a player with a recorded rank doesn't.
  await viewingAs(page).selectOption("2");
  await expect(note).toHaveText(
    new RegExp(`^Compared with the average ${second.name} at Emissary`),
  );
  release();
  await viewingAs(page).selectOption("3");
  await expect(note).toHaveText(/at Eternus .* uses their current rank\.$/);
  await viewingAs(page).selectOption("1");
  await expect(note).toHaveText(/at Eternus .* uses their current rank\.$/);
  // Each curve was asked for once, at the rank it needed: none at all
  // ranks while the lookup was held.
  expect(curves.sort()).toEqual(
    [
      `${lead.id} at 111`,
      `${second.id} at 71`,
      `${heroes[2].id} at 111`,
    ].sort(),
  );
});

test("Street Brawl reports say rank averages cover normal matches only", async ({
  page,
}) => {
  const asked = rankLookups(page);
  const brawl = matchMetadata(ACCOUNT);
  brawl.match_info.game_mode = 4;
  // Even without recorded ranks: Street Brawl has no rank averages to look
  // a current rank up for.
  for (const player of brawl.match_info.players)
    delete (player as Record<string, unknown>).player_rank_data;
  await openWith(page, brawl);
  const r = report(page);
  await expect(r.locator(".report-banner .eyebrow")).toHaveText(
```

2. Replace:

```ts
  await expect(r.locator(".graph-foot")).toHaveText(
    "You · rank averages cover normal matches only. Snapshots every 3 min until 15:00, then every 5 min; lines connect them.",
  );
});

test("when the average stops before the match ends, there are no verdicts and the notes say why", async ({
```

with:

```ts
  await expect(r.locator(".graph-foot")).toHaveText(
    "You · rank averages cover normal matches only. Snapshots every 3 min until 15:00, then every 5 min; lines connect them.",
  );
  expect(asked).toEqual([]);
});

test("when the average stops before the match ends, there are no verdicts and the notes say why", async ({
```


The browser tests:
- **Current rank:** the lobby is Emissary and the player Eternus now, so the old rule and the new one give different notes.
- **No current rank:** one request covers all twelve players. `rankLookups()` records only requests with a comma, as the home page asks for the stored account alone.
- **Timing (Task 2 review):** the lookup is held back. The lead waits for it, a player with a recorded rank loads at once, and each curve is asked for once, never first at all ranks. Checked while planning against a curve that doesn't wait, and against recorded players that wait too: both fail.
- **Street Brawl:** a Street Brawl report without recorded ranks asks for none.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/profile-api.test.ts`
Expected: FAIL (1 failed, 13 passed: `fetchRankBadges is not a function`).

Run: `npx playwright test tests/browser/match-report.spec.ts -g "recorded rank|no ranks recorded|waits for current ranks|Street Brawl"`
Expected: FAIL (3 failed, 1 passed: the notes still say "at Emissary … uses the lobby's rank." or end without the no-current-rank sentence, and the timing test sees the lead compared at once (the Street Brawl test already passes: the old report never looks ranks up)).

- [ ] **Step 3: Ask for current ranks**

In `src/features/profile/services/profile-api.ts`:

Replace:

```ts
  return row ? (row as unknown as PlayerRank) : null;
}

export async function fetchMatchHistory(
  id: number,
  api: DeadlockApi = deadlockApi,
```

with:

```ts
  return row ? (row as unknown as PlayerRank) : null;
}

/** Current rank badges by account id, in one request; unranked accounts are left out. */
export async function fetchRankBadges(
  ids: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, number>> {
  const asked = [...new Set(ids.filter((id) => id > 0))].sort((a, b) => a - b);
  if (!asked.length) return new Map();
  const data = await api.get<unknown>(
    `/v1/players/rank?account_ids=${asked.join(",")}`,
    TTL.profile,
  );
  return new Map(
    rows(data).flatMap((r) =>
      isNumber(r.account_id) &&
      asked.includes(r.account_id) &&
      isNumber(r.badge) &&
      r.badge > 0
        ? [[r.account_id, r.badge] as const]
        : [],
    ),
  );
}

export async function fetchMatchHistory(
  id: number,
  api: DeadlockApi = deadlockApi,
```


In `src/features/match-report/services/match-report.ts`:

1. Replace:

```ts
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parseMatchReport, type MatchReport } from "../utils/report";
import {
  MIN_CURVE_SAMPLES,
```

with:

```ts
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import {
  fetchRankBadges,
  fetchSteamProfiles,
} from "@/features/profile/services/profile-api";
import { parseMatchReport, type MatchReport } from "../utils/report";
import {
  MIN_CURVE_SAMPLES,
```

2. Replace:

```ts
  }
}

/**
 * The hero's rank-average curve for the badge's tier, widened one tier each
 * way when the tier is thin: too few games at the first step, or too few
```

with:

```ts
  }
}

/**
 * Current rank badges by account id, for players whose rank the match didn't
 * record; empty when the lookup fails, so those players get all ranks.
 */
export async function fetchCurrentBadges(
  accountIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, number>> {
  try {
    return await fetchRankBadges(accountIds, api);
  } catch {
    return new Map();
  }
}

/**
 * The hero's rank-average curve for the badge's tier, widened one tier each
 * way when the tier is thin: too few games at the first step, or too few
```


- [ ] **Step 4: Use them in the report**

In `src/features/match-report/components/Verdicts.tsx`:

1. Replace:

```tsx
import type { RankCurve } from "../utils/rank-curve";
import type { ReportPlayer } from "../utils/report";

export function curveNote(
  hero: string,
  curve: AsyncState<RankCurve>,
  normal: boolean,
  durationS: number,
  fromLobby: boolean,
) {
  if (!normal) return "Rank averages cover normal matches only.";
  if (curve.loading) return "Loading the rank average…";
```

with:

```tsx
import type { RankCurve } from "../utils/rank-curve";
import type { ReportPlayer } from "../utils/report";

// Where the player's rank came from: the match, their current rank (the
// match recorded none), or neither (all ranks).
export type RankSource = "match" | "current" | "none";

export function curveNote(
  hero: string,
  curve: AsyncState<RankCurve>,
  normal: boolean,
  durationS: number,
  rank: RankSource,
) {
  if (!normal) return "Rank averages cover normal matches only.";
  if (curve.loading) return "Loading the rank average…";
```

2. Replace:

```tsx
    (widenedFrom
      ? ` Too few ${hero} games at ${widenedFrom} alone, so this covers ${band.label}.`
      : "") +
    (fromLobby
      ? " This player's rank isn't recorded for this match, so the average uses the lobby's rank."
      : "");
  if (!points.length)
    return `Too few ${hero} games at ${band.label} in the last 30 days.${notes}`;
  const end = points.at(-1)!.t;
```

with:

```tsx
    (widenedFrom
      ? ` Too few ${hero} games at ${widenedFrom} alone, so this covers ${band.label}.`
      : "") +
    (rank === "current"
      ? " This player's rank isn't recorded for this match, so the average uses their current rank."
      : rank === "none"
        ? " This player's rank isn't recorded for this match, and there's no current rank to use."
        : "");
  if (!points.length)
    return `Too few ${hero} games at ${band.label} in the last 30 days.${notes}`;
  const end = points.at(-1)!.t;
```

3. Replace:

```tsx
  durationS,
  curve,
  normal,
  fromLobby,
}: {
  player: ReportPlayer;
  durationS: number;
  curve: AsyncState<RankCurve>;
  fromLobby: boolean;
  normal: boolean;
}) {
  const hero = heroName(player.heroId);
```

with:

```tsx
  durationS,
  curve,
  normal,
  rank,
}: {
  player: ReportPlayer;
  durationS: number;
  curve: AsyncState<RankCurve>;
  rank: RankSource;
  normal: boolean;
}) {
  const hero = heroName(player.heroId);
```

4. Replace:

```tsx
        ))}
      </div>
      <p className="data-note">
        {curveNote(hero, curve, normal, durationS, fromLobby)}
        {curve.error && (
          <>
            {" "}
```

with:

```tsx
        ))}
      </div>
      <p className="data-note">
        {curveNote(hero, curve, normal, durationS, rank)}
        {curve.error && (
          <>
            {" "}
```


In `src/features/match-report/components/MatchReportPage.tsx`:

1. Replace:

```tsx
import { useAsync } from "@/shared/api/useAsync";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
  fetchMatchReport,
  fetchPlayerNames,
  fetchRankCurve,
```

with:

```tsx
import { useAsync } from "@/shared/api/useAsync";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
  fetchCurrentBadges,
  fetchMatchReport,
  fetchPlayerNames,
  fetchRankCurve,
```

2. Replace:

```tsx
  optionLabel,
  viewNote,
} from "../utils/perspective";
import { lobbyBadge } from "../utils/rank-curve";
import { NORMAL_MODE, type MatchReport } from "../utils/report";
import { CopyLinkButton } from "./CopyLinkButton";
import { PlayerInsights } from "./PlayerInsights";
```

with:

```tsx
  optionLabel,
  viewNote,
} from "../utils/perspective";
import { NORMAL_MODE, type MatchReport } from "../utils/report";
import { CopyLinkButton } from "./CopyLinkButton";
import { PlayerInsights } from "./PlayerInsights";
```

3. Replace:

```tsx
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
```

with:

```tsx
  const [picked, setPicked] = useState<{ slot: number | null } | null>(null);
  const slot = picked ? picked.slot : defaultPerspective(report, meId, fromId);
  const selected = report.players.find((p) => p.slot === slot);
  const normal = report.gameMode === NORMAL_MODE;
  // A player whose rank the match didn't record, as in unranked games, is
  // compared at their current rank, as on the Performance tab; one request
  // covers every such player.
  const unrecorded = report.players
    .filter((p) => !p.badge)
    .map((p) => p.accountId);
  const current = useAsync(
    normal && unrecorded.length ? () => fetchCurrentBadges(unrecorded) : null,
    [report.matchId],
  );
  const badge = selected
    ? selected.badge || (current.data?.get(selected.accountId) ?? 0)
    : 0;
  const rank = selected?.badge ? "match" : badge ? "current" : "none";
  // Without a recorded rank, the curve waits for the current one.
  const waiting = !!selected && !selected.badge && current.loading;
  const loaded = useAsync(
    selected && normal && !waiting
      ? () => fetchRankCurve(selected.heroId, badge, report.durationS)
      : null,
    [selected?.heroId, badge, report.durationS, waiting],
  );
  const curve = waiting ? { loading: true, retry: loaded.retry } : loaded;
  const top = useRef<HTMLDivElement>(null);
  const viewing = useRef<HTMLSelectElement>(null);
  const refocus = useRef(false);
```

4. Replace:

```tsx
          durationS={report.durationS}
          curve={curve}
          normal={normal}
          fromLobby={!selected.badge && lobbyBadge(report.players) > 0}
        />
      )}
      <SectionHeader title="Graph" />
```

with:

```tsx
          durationS={report.durationS}
          curve={curve}
          normal={normal}
          rank={rank}
        />
      )}
      <SectionHeader title="Graph" />
```


- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/profile-api.test.ts`
Expected: PASS (14 tests).

Run: `npx playwright test tests/browser/match-report.spec.ts`
Expected: PASS (29 tests).

Run: `npm test`
Expected: PASS (378 tests).

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/match-report src/features/profile/services/profile-api.ts tests/browser/match-report.spec.ts tests/profile/profile-api.test.ts
npm run test:browser && npm run test:web
git add src/features/match-report src/features/profile/services/profile-api.ts tests/browser/match-report.spec.ts tests/profile/profile-api.test.ts
git commit -m "feat(match-report): compare players without a recorded rank at their current rank"
```

Expected: 133 desktop and 74 website tests pass.

---

### Task 3: All four Impact shares

**Files:**
- Modify: `src/features/profile/utils/performance-metrics.ts`
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Modify: `tests/fixtures/performance.ts`
- Test: `tests/profile/performance-metrics.test.ts`, `tests/browser/home.spec.ts`, `tests/web-browser/mobile.spec.ts`

`GameTotals` gains the team's objective damage and healing, and two `share()` metrics follow "Hero damage share": "Objective damage share" and "Healing share". A game whose team healed nothing has no healing share (as with team kills); a player who healed nothing while the team healed has a share of 0, and the game still counts. The always-on note names the shares without a rank average and says why, and the main browser test now asserts it (Task 3 review).

- [ ] **Step 1: Change the fixture and write the failing tests**

In `tests/fixtures/performance.ts`:

1. Replace:

```ts
}

// The account's totals unless a test says otherwise. With five teammates at
// 4 kills and 15,000 hero damage each, kill participation is 17 / 30 and the
// damage share 30,000 / 105,000.
export const OWN: OwnTotals = {
  kills: 10,
  assists: 7,
```

with:

```ts
}

// The account's totals unless a test says otherwise. With five teammates at
// 4 kills, 15,000 hero damage, 1,500 objective damage and 3,000 healing each,
// kill participation is 17 / 30, the hero damage share 30,000 / 105,000, the
// objective damage share 6,000 / 13,500 and the healing share 4,000 / 19,000.
export const OWN: OwnTotals = {
  kills: 10,
  assists: 7,
```

2. Replace:

```ts
  kills: 4,
  assists: 6,
  heroDamage: 15000,
  objectiveDamage: 3000,
  healing: 2000,
  creepKills: 60,
};
```

with:

```ts
  kills: 4,
  assists: 6,
  heroDamage: 15000,
  objectiveDamage: 1500,
  healing: 3000,
  creepKills: 60,
};
```


In `tests/profile/performance-metrics.test.ts`:

1. Replace:

```ts
    expect(totals.own.accountId).toBe(77);
    expect(totals.teamKills).toBe(10 + 5 * 4);
    expect(totals.teamHeroDamage).toBe(30000 + 5 * 15000);
  });

  it("is undefined when the player isn't in the match", () => {
```

with:

```ts
    expect(totals.own.accountId).toBe(77);
    expect(totals.teamKills).toBe(10 + 5 * 4);
    expect(totals.teamHeroDamage).toBe(30000 + 5 * 15000);
    expect(totals.teamObjectiveDamage).toBe(6000 + 5 * 1500);
    expect(totals.teamHealing).toBe(4000 + 5 * 3000);
  });

  it("is undefined when the player isn't in the match", () => {
```

2. Replace:

```ts
    return fraction ? fraction.num / fraction.den : null;
  };

  it("are the eight in the spec, in order", () => {
    expect(PERFORMANCE_METRICS.map((m) => m.label)).toEqual([
      "Souls / min",
      "K/D/A ratio",
```

with:

```ts
    return fraction ? fraction.num / fraction.den : null;
  };

  it("are the ten in the spec, in order", () => {
    expect(PERFORMANCE_METRICS.map((m) => m.label)).toEqual([
      "Souls / min",
      "K/D/A ratio",
```

3. Replace:

```ts
      "Creep kills / min",
      "Kill participation",
      "Hero damage share",
    ]);
  });
```

with:

```ts
      "Creep kills / min",
      "Kill participation",
      "Hero damage share",
      "Objective damage share",
      "Healing share",
    ]);
  });
```

4. Replace:

```ts
    expect(average("creepKillsPerMin")).toBeNull();
    expect(value("killParticipation")).toBe(17 / 30);
    expect(value("damageShare")).toBe(30000 / 105000);
    expect(metric("damageShare").average).toBeUndefined();
    expect(metric("heroDamagePerMin").value(game, undefined)).toBeNull();
  });
```

with:

```ts
    expect(average("creepKillsPerMin")).toBeNull();
    expect(value("killParticipation")).toBe(17 / 30);
    expect(value("damageShare")).toBe(30000 / 105000);
    expect(value("objectiveShare")).toBe(6000 / 13500);
    expect(value("healingShare")).toBe(4000 / 19000);
    expect(metric("damageShare").average).toBeUndefined();
    expect(metric("objectiveShare").average).toBeUndefined();
    expect(metric("healingShare").average).toBeUndefined();
    expect(metric("heroDamagePerMin").value(game, undefined)).toBeNull();
  });
```

5. Replace:

```ts
    const short = match({ durationS: 0 });
    expect(metric("soulsPerMin").value(short, totals)).toBeNull();
    expect(metric("soulsPerMin").average!(short, values)).toBeNull();
    const alone = { ...totals!, teamKills: 0 };
    expect(metric("killParticipation").value(game, alone)).toBeNull();
  });
});
```

with:

```ts
    const short = match({ durationS: 0 });
    expect(metric("soulsPerMin").value(short, totals)).toBeNull();
    expect(metric("soulsPerMin").average!(short, values)).toBeNull();
    const alone = {
      ...totals!,
      teamKills: 0,
      teamObjectiveDamage: 0,
      teamHealing: 0,
    };
    expect(metric("killParticipation").value(game, alone)).toBeNull();
    expect(metric("objectiveShare").value(game, alone)).toBeNull();
    expect(metric("healingShare").value(game, alone)).toBeNull();
    // Healing nothing while the team heals is a share of 0, still a game.
    const noHeals = { ...totals!, own: { ...totals!.own, healing: 0 } };
    expect(metric("healingShare").value(game, noHeals)).toEqual({
      num: 0,
      den: 19000,
    });
  });
});
```


In `tests/browser/home.spec.ts`:

1. Replace:

```ts
    "Creep kills / min",
    "Kill participation",
    "Hero damage share",
  ]);
  // Last 20: ten games at 1,000 souls a minute, then ten at 1,200.
  const souls = card(page, "Souls / min");
```

with:

```ts
    "Creep kills / min",
    "Kill participation",
    "Hero damage share",
    "Objective damage share",
    "Healing share",
  ]);
  // Last 20: ten games at 1,000 souls a minute, then ten at 1,200.
  const souls = card(page, "Souls / min");
```

2. Replace:

```ts
  await expect(
    card(page, "Hero damage share").locator(".perf-card-numbers"),
  ).toHaveText("29% 20 games · no rank average");

  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
```

with:

```ts
  await expect(
    card(page, "Hero damage share").locator(".perf-card-numbers"),
  ).toHaveText("29% 20 games · no rank average");
  await expect(
    card(page, "Objective damage share").locator(".perf-card-numbers"),
  ).toHaveText("44% 20 games · no rank average");
  await expect(
    card(page, "Healing share").locator(".perf-card-numbers"),
  ).toHaveText("21% 20 games · no rank average");

  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
```

3. Replace:

```ts
      "Games without a recorded rank use the player's current rank.",
    ),
  ).toBeVisible();
  expect(bulk.map((ids) => ids.split(",").length)).toEqual([20]);

  // Last 50 asks only for the 30 games it adds.
```

with:

```ts
      "Games without a recorded rank use the player's current rank.",
    ),
  ).toBeVisible();
  await expect(
    view(page).getByText(
      "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals.",
    ),
  ).toBeVisible();
  expect(bulk.map((ids) => ids.split(",").length)).toEqual([20]);

  // Last 50 asks only for the 30 games it adds.
```

4. Replace:

```ts
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toContainText("1 game · rank avg 1,000");
  await expect(view(page).locator(".perf-trend")).toHaveText(
    Array(8).fill("Too few games"),
  );
  await expect(dots(page, "Souls / min")).toHaveCount(1);
  await expect(view(page).getByRole("combobox", { name: "Hero" })).toHaveCount(
```

with:

```ts
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toContainText("1 game · rank avg 1,000");
  await expect(view(page).locator(".perf-trend")).toHaveText(
    Array(10).fill("Too few games"),
  );
  await expect(dots(page, "Souls / min")).toHaveCount(1);
  await expect(view(page).getByRole("combobox", { name: "Hero" })).toHaveCount(
```


In `tests/web-browser/mobile.spec.ts`:

Replace:

```ts
    ).toBe(true);

    await page.getByRole("tab", { name: "Performance" }).click();
    await expect(page.locator(".perf-card .sparkline svg")).toHaveCount(8);
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
  });
```

with:

```ts
    ).toBe(true);

    await page.getByRole("tab", { name: "Performance" }).click();
    await expect(page.locator(".perf-card .sparkline svg")).toHaveCount(10);
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
  });
```


- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/performance-metrics.test.ts`
Expected: FAIL (4 failed, 20 passed: the team totals have no objective damage (`expected undefined to be 13500`), and there are eight metrics).

- [ ] **Step 3: Add the shares**

In `src/features/profile/utils/performance-metrics.ts`:

1. Replace:

```ts
  own: PlayerTotals;
  teamKills: number;
  teamHeroDamage: number;
}

export function gameTotals(
```

with:

```ts
  own: PlayerTotals;
  teamKills: number;
  teamHeroDamage: number;
  teamObjectiveDamage: number;
  teamHealing: number;
}

export function gameTotals(
```

2. Replace:

```ts
    own,
    teamKills: team.reduce((sum, p) => sum + p.kills, 0),
    teamHeroDamage: team.reduce((sum, p) => sum + p.heroDamage, 0),
  };
}
```

with:

```ts
    own,
    teamKills: team.reduce((sum, p) => sum + p.kills, 0),
    teamHeroDamage: team.reduce((sum, p) => sum + p.heroDamage, 0),
    teamObjectiveDamage: team.reduce((sum, p) => sum + p.objectiveDamage, 0),
    teamHealing: team.reduce((sum, p) => sum + p.healing, 0),
  };
}
```

3. Replace:

```ts
  | "healingPerMin"
  | "creepKillsPerMin"
  | "killParticipation"
  | "damageShare";

export interface PerformanceMetric {
  id: PerformanceMetricId;
```

with:

```ts
  | "healingPerMin"
  | "creepKillsPerMin"
  | "killParticipation"
  | "damageShare"
  | "objectiveShare"
  | "healingShare";

export interface PerformanceMetric {
  id: PerformanceMetricId;
```

4. Replace:

```ts
    num: t.own.heroDamage,
    den: t.teamHeroDamage,
  })),
];

export interface GamePoint {
```

with:

```ts
    num: t.own.heroDamage,
    den: t.teamHeroDamage,
  })),
  share("objectiveShare", "Objective damage share", (t) => ({
    num: t.own.objectiveDamage,
    den: t.teamObjectiveDamage,
  })),
  share("healingShare", "Healing share", (t) => ({
    num: t.own.healing,
    den: t.teamHealing,
  })),
];

export interface GamePoint {
```


In `src/features/profile/components/PerformanceTab.tsx`:

Replace:

```tsx
  const lines = [
    "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days.",
    "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat.",
    "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and hero damage share have no rank average.",
  ];
  const sources = new Set([...(averages?.values() ?? [])].map((a) => a.source));
  if (sources.has("current"))
```

with:

```tsx
  const lines = [
    "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days.",
    "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat.",
    "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals.",
  ];
  const sources = new Set([...(averages?.values() ?? [])].map((a) => a.source));
  if (sources.has("current"))
```


- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/performance-metrics.test.ts`
Expected: PASS (24 tests).

Run: `npx playwright test tests/browser/home.spec.ts -g "performance tab"`
Expected: PASS (7 tests).

Run: `npm test`
Expected: PASS (378 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile tests/profile tests/fixtures/performance.ts tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile tests/profile tests/fixtures/performance.ts tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
git commit -m "feat(profile): objective damage and healing shares on the Performance tab"
```

Expected: 133 desktop and 74 website tests pass.

---

### Task 4: Rank averages per hero and rank tier, four at a time

**Files:**
- Modify: `src/features/profile/services/performance-api.ts`
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Test: `tests/profile/performance-api.test.ts`, `tests/browser/home.spec.ts`

`fetchGameAverages` used to run one `fetchRankCurve` per game, all at once, and fail as a whole when any curve failed. Now:
- **Groups:** games of one hero and rank tier (`rankBand(badge).label`) form a group; at most `CURVE_CONCURRENCY` groups load at once (`eachLimited`). Within a group every game still calls `fetchRankCurve` with its own length, so widening stays per game; the client shares the requests.
- **Result:** `GameAverages` is `{ byMatch, failed, error }`: the averages by match id, the set of match ids whose curve failed, and a failure's message.
- **Failure:** it throws only when no game got an average, so a full failure keeps the tab's existing notice and Retry.
- **The tab** reads `averages.data?.byMatch` and shows "Rank averages unavailable for {n} of {count}: {error}" with Retry for a partial failure. A card whose metric has a rank average and that has a game with a value in `failed` counts as failed: no trend, no "Too few games", no "no rank average for these games" (Task 4 review).
- **`eachLimited`'s `run` must not reject;** here each group settles every game with `Promise.allSettled`.

- [ ] **Step 1: Write the failing tests**

In `tests/profile/performance-api.test.ts`:

1. Replace:

```ts
import { describe, expect, it, vi } from "vitest";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
import {
  fetchGameAverages,
  fetchMatchTotals,
} from "@/features/profile/services/performance-api";
```

with:

```ts
import { describe, expect, it, vi } from "vitest";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
import {
  CURVE_CONCURRENCY,
  fetchGameAverages,
  fetchMatchTotals,
} from "@/features/profile/services/performance-api";
```

2. Replace:

```ts
      `https://api.deadlock-api.com${curvePath(6, rankBand(73))}`,
      `https://api.deadlock-api.com${curvePath(7, rankBand(73))}`,
    ]);
    expect(averages.get(1)!.values.souls).toBe(30000);
    expect(averages.get(2)!.values.souls).toBe(25000);
    expect(averages.get(3)!.source).toBe("game");
  });

  it("uses the current rank for games that recorded none", async () => {
```

with:

```ts
      `https://api.deadlock-api.com${curvePath(6, rankBand(73))}`,
      `https://api.deadlock-api.com${curvePath(7, rankBand(73))}`,
    ]);
    expect(averages.byMatch.get(1)!.values.souls).toBe(30000);
    expect(averages.byMatch.get(2)!.values.souls).toBe(25000);
    expect(averages.byMatch.get(3)!.source).toBe("game");
  });

  it("uses the current rank for games that recorded none", async () => {
```

3. Replace:

```ts
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(116)));
    expect(averages.get(1)!.source).toBe("current");
    expect(averages.get(1)!.band.label).toBe("Eternus");
  });

  it("falls back to all ranks without a current rank", async () => {
```

with:

```ts
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(116)));
    expect(averages.byMatch.get(1)!.source).toBe("current");
    expect(averages.byMatch.get(1)!.band.label).toBe("Eternus");
  });

  it("falls back to all ranks without a current rank", async () => {
```

4. Replace:

```ts
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.get(1)!.source).toBe("none");
  });

  it("falls back to all ranks when the current rank fails to load", async () => {
```

with:

```ts
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.byMatch.get(1)!.source).toBe("none");
  });

  it("falls back to all ranks when the current rank fails to load", async () => {
```

5. Replace:

```ts
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
```

with:

```ts
      api,
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.byMatch.get(1)!.source).toBe("none");
  });

  it("fails as a whole when every curve fails, so the tab can offer Retry", async () => {
    const { api } = curveApi(116, true);
    await expect(
      fetchGameAverages(77, [game({ matchId: 1 })], api),
    ).rejects.toThrow("Deadlock API unavailable (500).");
  });

  it("keeps the games whose curve loaded when another fails", async () => {
    const api = {
      get: async (path: string) => {
        if (path === curvePath(7, rankBand(73)))
          throw new Error("Deadlock API timed out.");
        return rankCurveRows();
      },
    } as unknown as DeadlockApi;
    const averages = await fetchGameAverages(
      77,
      [
        game({ matchId: 1 }),
        game({ matchId: 2, heroId: 7 }),
        game({ matchId: 3, heroId: 7 }),
      ],
      api,
    );
    expect([...averages.byMatch.keys()]).toEqual([1]);
    expect([...averages.failed]).toEqual([2, 3]);
    expect(averages.error).toBe("Deadlock API timed out.");
  });

  it(`loads at most ${CURVE_CONCURRENCY} hero-and-rank groups at once`, async () => {
    let running = 0;
    let most = 0;
    const api = {
      get: async () => {
        running++;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running--;
        return rankCurveRows();
      },
    } as unknown as DeadlockApi;
    const averages = await fetchGameAverages(
      77,
      Array.from({ length: 12 }, (_, i) =>
        game({ matchId: i + 1, heroId: i + 1 }),
      ),
      api,
    );
    expect(averages.byMatch.size).toBe(12);
    expect(averages.failed.size).toBe(0);
    expect(most).toBe(CURVE_CONCURRENCY);
  });

  it("doesn't ask for the current rank when every game has one", async () => {
    const { api, calls } = curveApi(116);
    await fetchGameAverages(77, [game({ matchId: 1 })], api);
```


The existing tests read the result as a map; they now read `averages.byMatch`.

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  heroStats?: unknown[];
  failTotals?: boolean;
  failCurve?: boolean;
  unstoredTotals?: number[];
  unlistedPlayer?: number[];
}
```

with:

```ts
  heroStats?: unknown[];
  failTotals?: boolean;
  failCurve?: boolean;
  // Heroes whose curves fail while they're in the set.
  failCurveFor?: Set<number>;
  unstoredTotals?: number[];
  unlistedPlayer?: number[];
}
```

2. Replace:

```ts
              ),
          );
    if (url.pathname === "/v1/analytics/player-performance-curve")
      return fixtures.failCurve ? json({}, 500) : json(rankCurveRows());
    if (url.pathname.endsWith("/metadata")) return json(matchMetadata(ACCOUNT));
    return json([]);
  });
```

with:

```ts
              ),
          );
    if (url.pathname === "/v1/analytics/player-performance-curve")
      return fixtures.failCurve ||
        fixtures.failCurveFor?.has(Number(url.searchParams.get("hero_ids")))
        ? json({}, 500)
        : json(rankCurveRows());
    if (url.pathname.endsWith("/metadata")) return json(matchMetadata(ACCOUNT));
    return json([]);
  });
```

3. Replace:

```ts
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
});

test("performance tab degrades without match history", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403 });
```

with:

```ts
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
});

test("performance tab keeps the rank averages that loaded, and Retry asks again for the rest", async ({
  page,
}) => {
  const failCurveFor = new Set([heroes[1]]);
  const curves: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/player-performance-curve")
      curves.push(url.searchParams.get("hero_ids")!);
  });
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory, failCurveFor });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const notice = view(page).getByText(
    "Rank averages unavailable for 10 of 20 games: Deadlock API unavailable (500).",
  );
  await expect(notice).toBeVisible();
  const souls = card(page, "Souls / min");
  await expect(souls.locator(".perf-card-numbers")).toContainText(
    "20 games · 10 with a rank average",
  );
  // No trend from the games that kept their average; the shares, which
  // have none, keep theirs.
  await expect(souls.locator(".perf-trend")).toHaveCount(0);
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveCount(1);
  const asked = curves.length;
  failCurveFor.clear();
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "1,100 20 games · rank avg 1,000",
  );
  await expect(notice).toHaveCount(0);
  // Retry asked again only for the curve that failed.
  expect(new Set(curves.slice(asked))).toEqual(new Set([String(heroes[1])]));
});

test("performance tab degrades without match history", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403 });
```


- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/performance-api.test.ts`
Expected: FAIL (6 failed, 8 passed: the result has no `byMatch` (`Cannot read properties of undefined (reading 'get')`), and `CURVE_CONCURRENCY` is undefined).

- [ ] **Step 3: Load averages per group**

In `src/features/profile/services/performance-api.ts`:

1. Replace:

```ts
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HistoryMatch } from "../types";
import {
```

with:

```ts
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HistoryMatch } from "../types";
import {
```

2. Replace:

```ts
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

with:

```ts
  );
}

// Hero-and-rank groups whose curves load at once. An uncached curve takes
// seconds, and Last 100 can need a dozen; all at once, the slowest would run
// past the client's timeout.
export const CURVE_CONCURRENCY = 4;

export interface GameAverages {
  // By match id; games whose curve failed are missing.
  byMatch: Map<number, GameAverage>;
  // The games whose curve failed.
  failed: Set<number>;
  // A failure's message, for the notice.
  error?: string;
}

/** Runs `run` over the items, at most `limit` at a time; `run` must not reject. */
async function eachLimited<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}

/**
 * Each game's rank averages: the hero's curve for the game's rank, or the
 * player's current rank when the game recorded none. Games of one hero and
 * rank tier share their curve requests; a few groups load at a time, and a
 * failed curve only leaves its own games without an average. It fails as a
 * whole only when no game gets one.
 */
export async function fetchGameAverages(
  accountId: number,
  games: HistoryMatch[],
  api: DeadlockApi = deadlockApi,
): Promise<GameAverages> {
  const current = games.some((game) => !game.badge)
    ? ((await fetchRank(accountId, api).catch(() => null))?.badge ?? 0)
    : 0;
  const badge = (game: HistoryMatch) => game.badge || current;
  const groups = new Map<string, HistoryMatch[]>();
  for (const game of games) {
    // Games that ask for the same curve form a group.
    const key = curvePath(game.heroId, rankBand(badge(game)));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(game);
  }
  const byMatch = new Map<number, GameAverage>();
  const failed = new Set<number>();
  let error: string | undefined;
  await eachLimited([...groups.values()], CURVE_CONCURRENCY, async (group) => {
    const results = await Promise.allSettled(
      group.map(async (game) => {
        const curve = await fetchRankCurve(
          game.heroId,
          badge(game),
          game.durationS,
          api,
        );
        const source = game.badge ? "game" : badge(game) ? "current" : "none";
        byMatch.set(game.matchId, gameAverage(curve, game.durationS, source));
      }),
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      failed.add(group[index].matchId);
      error ??=
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
    });
  });
  if (failed.size && !byMatch.size) throw new Error(error);
  return { byMatch, failed, error };
}
```


- [ ] **Step 4: Show a partial failure**

In `src/features/profile/components/PerformanceTab.tsx`:

1. Replace:

```tsx
import {
  fetchGameAverages,
  fetchMatchTotals,
} from "../services/performance-api";
import type { HistoryMatch } from "../types";
import { timeAgo } from "../utils/format";
```

with:

```tsx
import {
  fetchGameAverages,
  fetchMatchTotals,
  type GameAverages,
} from "../services/performance-api";
import type { HistoryMatch } from "../types";
import { timeAgo } from "../utils/format";
```

2. Replace:

```tsx
  gamesInRange,
  heroChoices,
  summarizeMetric,
  type GameAverage,
  type GamePoint,
  type MetricSummary,
  type PerformanceMetric,
```

with:

```tsx
  gamesInRange,
  heroChoices,
  summarizeMetric,
  type GamePoint,
  type MetricSummary,
  type PerformanceMetric,
```

3. Replace:

```tsx
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
```

with:

```tsx
}: {
  summary: MetricSummary;
  totals: AsyncState<unknown>;
  averages: AsyncState<GameAverages>;
}) {
  const { metric, value, games, average, comparedValue, compared } = summary;
  // What the card still waits for, or lacks because a request failed.
  const waiting =
    (metric.needsTotals && totals.loading) ||
    (!!metric.average && averages.loading);
  // A failed curve leaves some of the card's games without an average: the
  // card then claims no trend from the rest.
  const partial =
    !!metric.average &&
    summary.points.some(
      (p) => p.value !== null && !!averages.data?.failed.has(p.matchId),
    );
  const failed =
    (metric.needsTotals && !!totals.error) ||
    (!!metric.average && (!!averages.error || partial));
  const trend = failed ? null : summary.trend;
  const detail =
    metric.needsTotals && totals.loading
      ? "Loading match details…"
```

4. Replace:

```tsx
            : averages.loading
              ? " · loading rank average…"
              : average === null
                ? averages.error
                  ? ""
                  : " · no rank average for these games"
                : compared < games
```

with:

```tsx
            : averages.loading
              ? " · loading rank average…"
              : average === null
                ? failed
                  ? ""
                  : " · no rank average for these games"
                : compared < games
```

5. Replace:

```tsx
  accountId: number,
  games: HistoryMatch[],
  totals: Map<number, PlayerTotals[]> | undefined,
  averages: Map<number, GameAverage> | undefined,
) {
  const lines = [
    "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days.",
    "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat.",
    "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals.",
  ];
  const sources = new Set([...(averages?.values() ?? [])].map((a) => a.source));
  if (sources.has("current"))
    lines.push("Games without a recorded rank use the player's current rank.");
  if (sources.has("none"))
    lines.push(
      "Games without a recorded rank, and no current rank to use, are compared with all ranks.",
    );
  if ([...(averages?.values() ?? [])].some((a) => a.widenedFrom))
    lines.push(
      "Where a hero has too few games at one rank, its average covers the ranks either side.",
    );
```

with:

```tsx
  accountId: number,
  games: HistoryMatch[],
  totals: Map<number, PlayerTotals[]> | undefined,
  averages: GameAverages | undefined,
) {
  const lines = [
    "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days.",
    "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat.",
    "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals.",
  ];
  const loaded = [...(averages?.byMatch.values() ?? [])];
  const sources = new Set(loaded.map((a) => a.source));
  if (sources.has("current"))
    lines.push("Games without a recorded rank use the player's current rank.");
  if (sources.has("none"))
    lines.push(
      "Games without a recorded rank, and no current rank to use, are compared with all ranks.",
    );
  if (loaded.some((a) => a.widenedFrom))
    lines.push(
      "Where a hero has too few games at one rank, its average covers the ranks either side.",
    );
```

6. Replace:

```tsx
      metric,
      games,
      (id) => gameTotals(totals.data?.get(id), accountId),
      (id) => averages.data?.get(id),
    ),
  );
  return (
```

with:

```tsx
      metric,
      games,
      (id) => gameTotals(totals.data?.get(id), accountId),
      (id) => averages.data?.byMatch.get(id),
    ),
  );
  return (
```

7. Replace:

```tsx
              </button>
            </p>
          )}
          <div className="performance-legend" aria-hidden="true">
            <span>
              <i className="value" />
```

with:

```tsx
              </button>
            </p>
          )}
          {!!averages.data?.failed.size && (
            <p className="notice warning" role="status">
              Rank averages unavailable for {averages.data.failed.size} of{" "}
              {count(games.length)}: {averages.data.error}
              <button type="button" onClick={averages.retry}>
                Retry
              </button>
            </p>
          )}
          <div className="performance-legend" aria-hidden="true">
            <span>
              <i className="value" />
```


- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/performance-api.test.ts`
Expected: PASS (14 tests).

Run: `npx playwright test tests/browser/home.spec.ts -g "performance tab"`
Expected: PASS (8 tests).

Run: `npm test`
Expected: PASS (380 tests).

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile tests/profile/performance-api.test.ts tests/browser/home.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile tests/profile/performance-api.test.ts tests/browser/home.spec.ts
git commit -m "feat(profile): rank averages load per hero and rank, a few at a time; a failed curve leaves only its games out"
```

Expected: 134 desktop and 74 website tests pass.

---

### Task 5: The profile keeps its tab and filters for the session

**Files:**
- Modify: `src/features/profile/components/ProfileView.tsx`
- Modify: `src/features/profile/components/ProfilePage.tsx`
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Test: `tests/web-browser/match-report.spec.ts`, `tests/browser/home.spec.ts`

How it works:
- **`ProfileView`** holds one `ViewState` (tab, match filter, range, hero) in state, starting from a session map keyed by account.
- **Every change** is merged onto the latest stored view and written back to the map, so two changes in one event both count (Task 5 review).
- **`ProfilePage`** keys `ProfileView` by account itself, so another account never starts from this one's view, whatever the shell does.
- **`PerformanceTab`** loses its own `useState` and takes `range`, `heroId`, `onRange` and `onHero`.

The tests:
- **Website:** switching profile tabs, and the profile remounting after a match report.
- **Desktop (Task 5 review):** the range and hero surviving a tab switch, and each account keeping its own tab and filter. Checked while planning against a map that drops the filter and against one entry shared by every account: both fail.

- [ ] **Step 1: Write the failing tests**

In `tests/web-browser/match-report.spec.ts`:

Replace:

```ts
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
});
```

with:

```ts
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
});

test("the profile keeps its tab, range and hero after a match report", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Performance" }).click();
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  const hero = page.getByRole("combobox", { name: "Hero" });
  await hero.selectOption({ index: 1 });
  const picked = await hero.inputValue();
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page.getByRole("tab", { name: "Matches" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    page.getByRole("button", { name: "Last 50", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveValue(picked);
});
```


In `tests/browser/home.spec.ts`:

Replace:

```ts
  expect(new Set(curves.slice(asked))).toEqual(new Set([String(heroes[1])]));
});

test("performance tab degrades without match history", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403 });
```

with:

```ts
  expect(new Set(curves.slice(asked))).toEqual(new Set([String(heroes[1])]));
});

test("performance range and hero survive a profile tab switch", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  const hero = view(page).getByRole("combobox", { name: "Hero" });
  await hero.selectOption({ label: `${heroName(heroes[1])} · 30 games` });
  await expect(dots(page, "Souls / min")).toHaveCount(30);
  await openMatches(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByRole("button", { name: "Last 50", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveValue(String(heroes[1]));
  await expect(dots(page, "Souls / min")).toHaveCount(30);
});

test("each profile keeps its own tab and filter for the session", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  await openMatches(page);
  await view(page).getByRole("button", { name: "Ranked", exact: true }).click();
  // Another account opens on its own view.
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByLabel("Find a player").fill("76561198060265729");
  await page.getByRole("button", { name: /Use this ID/ }).click();
  await expect(
    view(page).getByRole("tab", { name: "Overview" }),
  ).toHaveAttribute("aria-selected", "true");
  // Back on the first, its tab and filter are as they were.
  await myProfile(page).click();
  await expect(
    view(page).getByRole("tab", { name: "Matches" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    view(page).getByRole("button", { name: "Ranked", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("performance tab degrades without match history", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403 });
```


- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts -g "keeps its tab"`
Expected: FAIL (1 failed: after the report, the Matches tab isn't selected (`aria-selected` is "false")).

Run: `npx playwright test tests/browser/home.spec.ts -g "survive a profile tab switch|keeps its own tab"`
Expected: FAIL (2 failed: after the tab switch "Last 50" isn't pressed (`aria-pressed` is "false"), and back on the first account the Matches tab isn't selected).

- [ ] **Step 3: Keep the view per account**

In `src/features/profile/components/ProfileView.tsx`:

1. Replace:

```tsx
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
import type { HistoryFilter, HistoryMatch } from "../types";
import { HeroesTab } from "./HeroesTab";
import { MatchHistory } from "./MatchHistory";
import { OverviewTab } from "./OverviewTab";
```

with:

```tsx
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
import type { HistoryFilter, HistoryMatch } from "../types";
import type { PerformanceRange } from "../utils/performance-metrics";
import { HeroesTab } from "./HeroesTab";
import { MatchHistory } from "./MatchHistory";
import { OverviewTab } from "./OverviewTab";
```

2. Replace:

```tsx
  { id: "heroes", label: "Heroes" },
];

export function ProfileView({
  accountId,
  history,
```

with:

```tsx
  { id: "heroes", label: "Heroes" },
];

interface ViewState {
  subtab: Subtab;
  filter: HistoryFilter;
  range: PerformanceRange;
  // Null for all heroes.
  heroId: number | null;
}
const FIRST_VIEW: ViewState = {
  subtab: "overview",
  filter: "all",
  range: 20,
  heroId: null,
};
// Each profile's tab and filters, kept for the session: switching tabs, or
// coming back from a match report (a page of its own on the website),
// finds them as they were.
const views = new Map<number, ViewState>();

export function ProfileView({
  accountId,
  history,
```

3. Replace:

```tsx
  header: React.ReactNode;
  navigate: Navigate;
}) {
  const [subtab, setSubtab] = useState<Subtab>("overview");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  return (
    <LinkScope navigate={navigate}>
      <section className="profile">
```

with:

```tsx
  header: React.ReactNode;
  navigate: Navigate;
}) {
  const [view, setView] = useState(() => views.get(accountId) ?? FIRST_VIEW);
  const { subtab, filter, range, heroId } = view;
  const update = (change: Partial<ViewState>) => {
    // Onto the latest stored view, so two changes in one event both count.
    const next = { ...(views.get(accountId) ?? view), ...change };
    views.set(accountId, next);
    setView(next);
  };
  const setSubtab = (next: Subtab) => update({ subtab: next });
  const setFilter = (next: HistoryFilter) => update({ filter: next });
  return (
    <LinkScope navigate={navigate}>
      <section className="profile">
```

4. Replace:

```tsx
          <HeroesTab {...{ accountId, history, filter }} onFilter={setFilter} />
        )}
        {subtab === "performance" && (
          <PerformanceTab accountId={accountId} history={history} />
        )}
      </section>
    </LinkScope>
```

with:

```tsx
          <HeroesTab {...{ accountId, history, filter }} onFilter={setFilter} />
        )}
        {subtab === "performance" && (
          <PerformanceTab
            {...{ accountId, history, range, heroId }}
            onRange={(next) => update({ range: next })}
            onHero={(next) => update({ heroId: next })}
          />
        )}
      </section>
    </LinkScope>
```


In `src/features/profile/components/ProfilePage.tsx`:

Replace:

```tsx
  const topHeroId = history.data && topHeroes(history.data, 1)[0]?.heroId;
  const isMe = me.meId === accountId;
  return (
    <ProfileView
      accountId={accountId}
      history={history}
      navigate={navigate}
```

with:

```tsx
  const topHeroId = history.data && topHeroes(history.data, 1)[0]?.heroId;
  const isMe = me.meId === accountId;
  return (
    // Keyed, so another account never starts from this one's view.
    <ProfileView
      key={accountId}
      accountId={accountId}
      history={history}
      navigate={navigate}
```


In `src/features/profile/components/PerformanceTab.tsx`:

1. Replace:

```tsx
import { useState } from "react";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
```

with:

```tsx
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
```

2. Replace:

```tsx
export function PerformanceTab({
  accountId,
  history,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
}) {
  const [range, setRange] = useState<PerformanceRange>(20);
  const [picked, setPicked] = useState<number | null>(null);
  const matches = history.data ?? [];
  const heroes = heroChoices(matches);
  // All heroes when the picked one has no games (left the history).
```

with:

```tsx
export function PerformanceTab({
  accountId,
  history,
  range,
  heroId: picked,
  onRange,
  onHero,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  range: PerformanceRange;
  // Null for all heroes.
  heroId: number | null;
  onRange(range: PerformanceRange): void;
  onHero(heroId: number | null): void;
}) {
  const matches = history.data ?? [];
  const heroes = heroChoices(matches);
  // All heroes when the picked one has no games (left the history).
```

3. Replace:

```tsx
              key={value}
              className={range === value ? "active" : ""}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              Last {value}
            </button>
```

with:

```tsx
              key={value}
              className={range === value ? "active" : ""}
              aria-pressed={range === value}
              onClick={() => onRange(value)}
            >
              Last {value}
            </button>
```

4. Replace:

```tsx
            <select
              value={heroId ?? ""}
              onChange={(event) =>
                setPicked(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">All heroes</option>
```

with:

```tsx
            <select
              value={heroId ?? ""}
              onChange={(event) =>
                onHero(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">All heroes</option>
```


- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts`
Expected: PASS (10 tests).

Run: `npx playwright test tests/browser/home.spec.ts -g "survive a profile tab switch|keeps its own tab"`
Expected: PASS (2 tests).

Run: `npm test`
Expected: PASS (380 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile/components tests/web-browser/match-report.spec.ts tests/browser/home.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/components tests/web-browser/match-report.spec.ts tests/browser/home.spec.ts
git commit -m "feat(profile): keep each profile's tab, filter, range and hero for the session"
```

Expected: 136 desktop and 75 website tests pass.

---

### Task 6: The cards stay while new games load

**Files:**
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Modify: `src/features/profile/styles/profile.css`
- Test: `tests/browser/home.spec.ts`

**How it works:**
- **What's remembered:** `Loaded` is the key, games, totals and averages of a render whose requests had both finished. It is stored with `setState` during render, behind a condition that is false once stored (React's "storing information from previous renders").
- **What's shown:** while either request loads and something was stored, the tab shows the stored games, data and request states (`shown`); `stale` is true then.
- **Display:** the cards get `aria-busy` (dimmed by CSS) and the controls a status, "Updating to the last {count}…". The first load, with nothing stored, still shows the loading texts.
- **The test's `gate` option** holds the bulk requests for Last 50 back until the test releases them. Its route handler becomes `async`.

- [ ] **Step 1: Write the failing test**

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  failCurveFor?: Set<number>;
  unstoredTotals?: number[];
  unlistedPlayer?: number[];
}

async function routeApi(page: Page, fixtures: Fixtures = {}) {
  let historyRequests = 0;
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
```

with:

```ts
  failCurveFor?: Set<number>;
  unstoredTotals?: number[];
  unlistedPlayer?: number[];
  // Awaited before each answer, so a test can hold requests back.
  gate?: (url: URL) => Promise<void>;
}

async function routeApi(page: Page, fixtures: Fixtures = {}) {
  let historyRequests = 0;
  await page.route("https://api.deadlock-api.com/**", async (route) => {
    const url = new URL(route.request().url());
    await fixtures.gate?.(url);
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
```

2. Replace:

```ts
  expect(new Set(curves.slice(asked))).toEqual(new Set([String(heroes[1])]));
});

test("performance range and hero survive a profile tab switch", async ({
  page,
}) => {
```

with:

```ts
  expect(new Set(curves.slice(asked))).toEqual(new Set([String(heroes[1])]));
});

test("performance tab keeps the last cards, dimmed, while new games load", async ({
  page,
}) => {
  let hold: Promise<void> | null = null;
  let release = () => {};
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    gate: (url) =>
      url.pathname === "/v1/matches/metadata" && hold
        ? hold
        : Promise.resolve(),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const souls = card(page, "Souls / min").locator(".perf-card-numbers");
  const cards = view(page).locator(".perf-cards");
  await expect(souls).toHaveText("1,100 20 games · rank avg 1,000");
  hold = new Promise((resolve) => (release = resolve));
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect(
    view(page).getByRole("status").filter({ hasText: "Updating" }),
  ).toHaveText("Updating to the last 50 games…");
  await expect(cards).toHaveAttribute("aria-busy", "true");
  await expect(souls).toHaveText("1,100 20 games · rank avg 1,000");
  release();
  await expect(cards).toHaveAttribute("aria-busy", "false");
  await expect(souls).toContainText("50 games");
});

test("performance range and hero survive a profile tab switch", async ({
  page,
}) => {
```


- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test tests/browser/home.spec.ts -g "keeps the last cards"`
Expected: FAIL (1 failed: no "Updating to the last 50 games…" status).

- [ ] **Step 3: Keep the last games**

In `src/features/profile/components/PerformanceTab.tsx`:

1. Replace:

```tsx
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
```

with:

```tsx
import { useState } from "react";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
```

2. Replace:

```tsx
  return lines;
}

export function PerformanceTab({
  accountId,
  history,
```

with:

```tsx
  return lines;
}

// The games the cards show, with their requests.
interface Loaded {
  key: string;
  games: HistoryMatch[];
  totals: AsyncState<Map<number, PlayerTotals[]>>;
  averages: AsyncState<GameAverages>;
}

export function PerformanceTab({
  accountId,
  history,
```

3. Replace:

```tsx
    games.length ? () => fetchGameAverages(accountId, games) : null,
    [accountId, key],
  );
  const summaries = PERFORMANCE_METRICS.map((metric) =>
    summarizeMetric(
      metric,
      games,
      (id) => gameTotals(totals.data?.get(id), accountId),
      (id) => averages.data?.byMatch.get(id),
    ),
  );
  return (
```

with:

```tsx
    games.length ? () => fetchGameAverages(accountId, games) : null,
    [accountId, key],
  );
  // While a new range or hero loads, the cards keep the last games that
  // finished loading, dimmed, rather than blanking.
  const [last, setLast] = useState<Loaded | null>(null);
  const settled = !totals.loading && !averages.loading;
  if (
    settled &&
    games.length &&
    (last?.key !== key ||
      last.totals.data !== totals.data ||
      last.totals.error !== totals.error ||
      last.averages.data !== averages.data ||
      last.averages.error !== averages.error)
  )
    setLast({ key, games, totals, averages });
  const shown =
    !settled && last && games.length ? last : { games, totals, averages };
  const stale = shown === last;
  const summaries = PERFORMANCE_METRICS.map((metric) =>
    summarizeMetric(
      metric,
      shown.games,
      (id) => gameTotals(shown.totals.data?.get(id), accountId),
      (id) => shown.averages.data?.byMatch.get(id),
    ),
  );
  return (
```

4. Replace:

```tsx
            </select>
          </label>
        )}
      </div>
      {history.loading && <p className="muted">Loading match history…</p>}
      {history.error && (
```

with:

```tsx
            </select>
          </label>
        )}
        {stale && (
          <span className="muted" role="status">
            Updating to the last {count(games.length)}…
          </span>
        )}
      </div>
      {history.loading && <p className="muted">Loading match history…</p>}
      {history.error && (
```

5. Replace:

```tsx
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
          {notes(accountId, games, totals.data, averages.data).map((line) => (
            <p key={line} className="data-note">
              {line}
            </p>
```

with:

```tsx
              Loss
            </span>
          </div>
          <div className="perf-cards" aria-busy={stale}>
            {summaries.map((summary) => (
              <PerformanceCard
                key={summary.metric.id}
                summary={summary}
                totals={shown.totals}
                averages={shown.averages}
              />
            ))}
          </div>
          {notes(
            accountId,
            shown.games,
            shown.totals.data,
            shown.averages.data,
          ).map((line) => (
            <p key={line} className="data-note">
              {line}
            </p>
```


In `src/features/profile/styles/profile.css`:

Replace:

```css
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@container (max-width: 900px) {
  .perf-card {
    grid-column: span 2;
```

with:

```css
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.perf-cards[aria-busy="true"] {
  opacity: 0.55;
}
@container (max-width: 900px) {
  .perf-card {
    grid-column: span 2;
```


- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/home.spec.ts`
Expected: PASS (31 tests).

Run: `npm test`
Expected: PASS (380 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile tests/browser/home.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile tests/browser/home.spec.ts
git commit -m "feat(profile): keep the last cards, dimmed, while new games load"
```

Expected: 137 desktop and 75 website tests pass.

---

### Task 7: Picking a game on a chart

**Files:**
- Modify: `src/features/profile/components/Sparkline.tsx`
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Modify: `src/features/profile/styles/profile.css`
- Test: `tests/profile/sparkline.test.ts`, `tests/browser/home.spec.ts`, `tests/web-browser/mobile.spec.ts`

**The sparkline's new parts:**
- **Structure:** a `.sparkline-box` (positioning, outside-tap and leave handling) around the `.sparkline` slider (measured width, keys, focus), whose SVG is `aria-hidden`.
- **Pointer:** a transparent `.spark-hit` rect over the SVG takes pointer moves and presses (`nearestGame()`), and clicks. A click opens the report unless the last press was a touch.
- **Picked game:** a `.spark-cross` line, a bigger ring on its dot (`.picked`), and the `.spark-tip` above the chart. The tip goes on the right when the game is in the right half. Its "Report →" is a `RouteLink`: a button in the desktop app, a link on the website.
- **Props:** `describe` (returning `PointText`) and `route` replace `title`. The tab passes `accountId` to each card for the route.
- **Dots:** `dotRadius()` keeps them at 2 px or more, with an outline in `--surface`.

- [ ] **Step 1: Write the failing tests**

In `tests/profile/sparkline.test.ts`:

1. Replace:

```ts
import { describe, expect, it } from "vitest";
import { linePath } from "@/features/profile/components/Sparkline";

const x = (index: number) => index * 10;
const y = (value: number) => value;
```

with:

```ts
import { describe, expect, it } from "vitest";
import {
  dotRadius,
  linePath,
  nearestGame,
} from "@/features/profile/components/Sparkline";

const x = (index: number) => index * 10;
const y = (value: number) => value;
```

2. Replace:

```ts
    expect(linePath([null, null], x, y)).toBe("");
  });
});
```

with:

```ts
    expect(linePath([null, null], x, y)).toBe("");
  });
});

describe("dotRadius", () => {
  it("shrinks dots as games crowd together, down to 2 px", () => {
    expect(dotRadius(20)).toBe(3);
    expect(dotRadius(6)).toBeCloseTo(2.4);
    expect(dotRadius(2.5)).toBe(2);
  });
});

describe("nearestGame", () => {
  it("picks the game nearest the pointer, within the chart", () => {
    // Five games on a 112 px chart: 6 px padding, games 25 px apart.
    expect(nearestGame(6, 112, 5)).toBe(0);
    expect(nearestGame(18, 112, 5)).toBe(0);
    expect(nearestGame(19, 112, 5)).toBe(1);
    expect(nearestGame(106, 112, 5)).toBe(4);
    expect(nearestGame(-20, 112, 5)).toBe(0);
    expect(nearestGame(500, 112, 5)).toBe(4);
    expect(nearestGame(50, 112, 1)).toBe(0);
  });
});
```


In `tests/browser/home.spec.ts`:

Replace:

```ts
  );
});

test("performance tab says so with too few games", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
```

with:

```ts
  );
});

/** Match ids whose report metadata the page asks for. */
function reportRequests(page: Page) {
  const ids: number[] = [];
  page.on("request", (request) => {
    const id = new URL(request.url()).pathname.match(
      /^\/v1\/matches\/(\d+)\/metadata$/,
    )?.[1];
    if (id) ids.push(Number(id));
  });
  return ids;
}

test("performance tab describes the game under the pointer and a click opens its report", async ({
  page,
}) => {
  const reports = reportRequests(page);
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const souls = card(page, "Souls / min");
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  const chart = (await souls.getByRole("slider").boundingBox())!;
  // The newest game is on the right: 1h ago, lost, 1,200 souls a minute.
  await page.mouse.move(chart.x + chart.width - 2, chart.y + 40);
  const tip = souls.locator(".spark-tip span");
  await expect(tip).toHaveText([
    `${heroName(heroes[0])} · Loss · 1h ago`,
    "1,200 rank avg 1,000 · Report →",
  ]);
  await expect(souls.locator("circle.picked")).toHaveCount(1);
  await page.mouse.click(chart.x + chart.width - 2, chart.y + 40);
  await expect(view(page).locator(".match-report")).toBeVisible();
  expect(reports).toEqual([3000]);
});

test("performance tab points can be picked and opened from the keyboard", async ({
  page,
}) => {
  const reports = reportRequests(page);
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  const chart = card(page, "Souls / min").getByRole("slider");
  // Focus starts on the newest game.
  await chart.focus();
  await expect(chart).toHaveAttribute("aria-valuenow", "20");
  await expect(chart).toHaveAttribute(
    "aria-valuetext",
    `${heroName(heroes[0])} · Loss · 1h ago: 1,200, rank avg 1,000`,
  );
  await page.keyboard.press("ArrowLeft");
  await expect(chart).toHaveAttribute("aria-valuenow", "19");
  await expect(chart).toHaveAttribute(
    "aria-valuetext",
    `${heroName(heroes[1])} · Win · 2h ago: 1,200, rank avg 1,000`,
  );
  await page.keyboard.press("Enter");
  await expect(view(page).locator(".match-report")).toBeVisible();
  expect(reports).toEqual([3001]);
});

test("performance tab says so with too few games", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
```


The newest game in `performanceHistory` (match 3000) is on the right: 1h ago, lost, 1,200 souls a minute against a rank average of 1,000; the one before it (3001) is a win on the other hero.

In `tests/web-browser/mobile.spec.ts`:

Replace:

```ts
    client: document.documentElement.clientWidth,
  }));

test.describe("phone width (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });
```

with:

```ts
    client: document.documentElement.clientWidth,
  }));

test.describe("a touch screen at phone width", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("a tap on a Performance chart shows the game; its Report link opens it", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto(`/players/${FARGO}`);
    await page.getByRole("tab", { name: "Performance" }).click();
    const souls = page.getByRole("region", {
      name: "Souls / min",
      exact: true,
    });
    await expect(souls.locator("circle")).toHaveCount(8);
    const chart = (await souls.getByRole("slider").boundingBox())!;
    // The newest game, on the right, is match 1001.
    await page.touchscreen.tap(chart.x + chart.width - 2, chart.y + 40);
    const tip = souls.locator(".spark-tip");
    await expect(tip).toBeVisible();
    await expect(page).toHaveURL(`/players/${FARGO}`);
    await tip.getByRole("link", { name: "Report →" }).tap();
    await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  });
});

test.describe("phone width (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });
```


On the website fixture every game starts at the same time, so the newest, on the right, is match 1001.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/sparkline.test.ts`
Expected: FAIL (2 failed, 4 passed: `dotRadius is not a function`, `nearestGame is not a function`).

Run: `npx playwright test tests/browser/home.spec.ts -g "under the pointer|keyboard"`
Expected: FAIL (2 failed: there is no chart with the `slider` role, so both time out).

- [ ] **Step 3: Write the sparkline**

Replace the whole of `src/features/profile/components/Sparkline.tsx` with:

```tsx
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { RouteLink, useLinks } from "@/app/links";
import type { Route } from "@/app/navigation";
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

// What a picked game shows: "Ivy · Win · 5d ago", "1,226", "rank avg 1,107".
export interface PointText {
  game: string;
  value: string;
  average?: string;
}

/**
 * A dot's radius for games `step` px apart. Dots shrink as games crowd
 * together, but not below 2 px, so a win or loss still shows on Last 100; an
 * outline in the card's colour keeps neighbours apart and off the line.
 */
export const dotRadius = (step: number) => Math.min(3, Math.max(2, step * 0.4));

/** The game nearest to `px` on a chart `width` wide showing `count` games. */
export function nearestGame(px: number, width: number, count: number) {
  if (count <= 1) return 0;
  const step = (width - 2 * PAD_X) / (count - 1);
  return Math.min(count - 1, Math.max(0, Math.round((px - PAD_X) / step)));
}

/**
 * One point per game, oldest on the left: the player's line with a win or
 * loss dot per game, and the dashed rank average. Drawn at its real width.
 *
 * Pointing at it, or the arrow keys, picks the nearest game and describes
 * it above the chart. A click, Enter or the tip's "Report" link opens that
 * game's match report. A tap only picks, so a touch screen shows the
 * details first.
 */
export function Sparkline({
  points,
  label,
  describe,
  route,
}: {
  points: GamePoint[];
  label: string;
  describe(point: GamePoint): PointText;
  route(point: GamePoint): Route;
}) {
  const chart = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(chart);
  const { navigate } = useLinks();
  const [picked, setPicked] = useState<number | null>(null);
  const pointer = useRef("mouse");
  const picking = picked !== null;
  // A tapped game stays picked; tapping anywhere outside clears it.
  useEffect(() => {
    if (!picking) return;
    const clear = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setPicked(null);
    };
    document.addEventListener("pointerdown", clear);
    return () => document.removeEventListener("pointerdown", clear);
  }, [picking]);
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
  const step =
    points.length > 1 ? (width - 2 * PAD_X) / (points.length - 1) : width;
  const radius = dotRadius(step);
  const last = points.length - 1;
  const game = picked === null ? undefined : points[picked];
  const text = describe(game ?? points[last]);
  const at = (event: MouseEvent<SVGRectElement>) =>
    nearestGame(
      event.clientX -
        event.currentTarget.ownerSVGElement!.getBoundingClientRect().left,
      width,
      points.length,
    );
  const track = (event: PointerEvent<SVGRectElement>) => {
    pointer.current = event.pointerType;
    setPicked(at(event));
  };
  const keys = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, (picked ?? last + 1) - 1),
      ArrowRight: Math.min(last, (picked ?? last) + 1),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setPicked(moves[event.key]);
    } else if (event.key === "Enter" && game) navigate(route(game));
    else if (event.key === "Escape") setPicked(null);
  };
  return (
    <div
      className="sparkline-box"
      ref={box}
      // A mouse leaving clears the pick; a tap keeps it.
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setPicked(null);
      }}
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node))
          setPicked(null);
      }}
    >
      <div
        className="sparkline"
        ref={chart}
        role="slider"
        tabIndex={0}
        aria-label={`${label}. Arrow keys pick a game, Enter opens its match report.`}
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={(picked ?? last) + 1}
        aria-valuetext={`${text.game}: ${text.value}${text.average ? `, ${text.average}` : ""}`}
        onKeyDown={keys}
        // The keyboard starts on the newest game.
        onFocus={() => setPicked((current) => current ?? last)}
      >
        {width > 0 && values.length > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true">
            {game && (
              <line
                className="spark-cross"
                x1={x(picked!)}
                x2={x(picked!)}
                y1={0}
                y2={HEIGHT}
              />
            )}
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
                  className={`${p.won ? "win" : "loss"}${index === picked ? " picked" : ""}`}
                  cx={x(index)}
                  cy={y(p.value)}
                  r={index === picked ? radius + 1.5 : radius}
                />
              ),
            )}
            <rect
              className="spark-hit"
              width={width}
              height={HEIGHT}
              onPointerMove={track}
              onPointerDown={track}
              onClick={(event) => {
                if (pointer.current !== "touch")
                  navigate(route(points[at(event)]));
              }}
            />
          </svg>
        )}
      </div>
      {game && (
        // On the picked game's side, over the card's numbers, so the whole
        // line stays in sight.
        <div className={`spark-tip${x(picked!) > width / 2 ? " right" : ""}`}>
          <span>{text.game}</span>
          <span>
            <b>{text.value}</b> {text.average && <>{text.average} · </>}
            <RouteLink route={route(game)}>Report →</RouteLink>
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Give it the game text and routes**

In `src/features/profile/components/PerformanceTab.tsx`:

1. Replace:

```tsx
};

function PerformanceCard({
  summary,
  totals,
  averages,
}: {
  summary: MetricSummary;
  totals: AsyncState<unknown>;
  averages: AsyncState<GameAverages>;
```

with:

```tsx
};

function PerformanceCard({
  accountId,
  summary,
  totals,
  averages,
}: {
  accountId: number;
  summary: MetricSummary;
  totals: AsyncState<unknown>;
  averages: AsyncState<GameAverages>;
```

2. Replace:

```tsx
    !failed &&
    games > 0 &&
    (!metric.average || average !== null);
  const title = (p: GamePoint) =>
    `${heroName(p.heroId)} · ${p.won ? "Win" : "Loss"} · ${timeAgo(p.startTime * 1000)}: ` +
    format(metric, p.value!) +
    (p.average === null ? "" : ` (rank avg ${format(metric, p.average)})`);
  return (
    <section className="perf-card" aria-label={metric.label}>
      <div className="perf-card-head">
```

with:

```tsx
    !failed &&
    games > 0 &&
    (!metric.average || average !== null);
  const describe = (p: GamePoint) => ({
    game: `${heroName(p.heroId)} · ${p.won ? "Win" : "Loss"} · ${timeAgo(p.startTime * 1000)}`,
    value: p.value === null ? "—" : format(metric, p.value),
    average:
      p.average === null ? undefined : `rank avg ${format(metric, p.average)}`,
  });
  return (
    <section className="perf-card" aria-label={metric.label}>
      <div className="perf-card-head">
```

3. Replace:

```tsx
        <Sparkline
          points={summary.points}
          label={`${metric.label}, game by game`}
          title={title}
        />
      )}
    </section>
```

with:

```tsx
        <Sparkline
          points={summary.points}
          label={`${metric.label}, game by game`}
          describe={describe}
          route={(p) => ({ page: "match", matchId: p.matchId, accountId })}
        />
      )}
    </section>
```

4. Replace:

```tsx
            {summaries.map((summary) => (
              <PerformanceCard
                key={summary.metric.id}
                summary={summary}
                totals={shown.totals}
                averages={shown.averages}
```

with:

```tsx
            {summaries.map((summary) => (
              <PerformanceCard
                key={summary.metric.id}
                accountId={accountId}
                summary={summary}
                totals={shown.totals}
                averages={shown.averages}
```


- [ ] **Step 5: Style it**

In `src/features/profile/styles/profile.css`:

1. Replace:

```css
  font-size: 11.5px;
  color: var(--muted);
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
```

with:

```css
  font-size: 11.5px;
  color: var(--muted);
}
.sparkline-box {
  position: relative;
  margin-top: 6px;
}
.sparkline {
  height: 80px;
}
.sparkline:focus-visible {
  outline: 1px solid var(--gold);
  outline-offset: 2px;
}
.sparkline svg {
  display: block;
}
.spark-hit {
  fill: transparent;
  cursor: pointer;
}
.spark-cross {
  stroke: rgb(from var(--cream) r g b / 0.35);
}
.spark-value {
  fill: none;
  stroke: var(--gold);
```

2. Replace:

```css
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

with:

```css
  stroke-dasharray: 4 4;
  stroke-width: 1.5;
}
.sparkline circle {
  stroke: var(--surface);
}
.sparkline circle.win {
  fill: var(--good);
}
.sparkline circle.loss {
  fill: var(--bad);
}
.sparkline circle.picked {
  stroke: var(--cream);
  stroke-width: 1.5;
}
.spark-tip {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 0;
  z-index: 1;
  display: grid;
  gap: 2px;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--line);
  background: var(--ink);
  font-size: 11.5px;
  color: var(--muted);
}
.spark-tip.right {
  right: 0;
  left: auto;
}
.spark-tip b {
  font-weight: 600;
  color: var(--cream);
}
/* A 24 px touch target without making the tip taller. */
.spark-tip a,
.spark-tip button {
  margin: -4px 0;
  padding: 4px 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--gold);
  cursor: pointer;
}
```


- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/sparkline.test.ts`
Expected: PASS (6 tests).

Run: `npx playwright test tests/browser/home.spec.ts -g "performance tab"`
Expected: PASS (11 tests).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/mobile.spec.ts`
Expected: PASS (17 tests).

Run: `npm test`
Expected: PASS (382 tests).

- [ ] **Step 7: Look at it**

Run `npm run web:build && npm run web:preview`, then open `http://127.0.0.1:5187/players/400239835` → Performance. Check these with live data:
- **1260 px:** hovering a chart's left half puts the tip on the left, its right half on the right; the line stays visible; a click opens the report.
- **Last 100:** wins and losses still show as separate dots.
- **375 px, touch emulation:** a tap shows the tip without leaving the page; its "Report →" opens the report; no horizontal scroll.

- [ ] **Step 8: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile tests/profile/sparkline.test.ts tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile tests/profile/sparkline.test.ts tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
git commit -m "feat(profile): pick a game on a Performance chart to see it and open its report; readable dots on Last 100"
```

Expected: 139 desktop and 76 website tests pass.

---

### Task 8: The browser tests the reviews found missing

**Files:**
- Test: `tests/browser/home.spec.ts`, `tests/web-browser/mobile.spec.ts`

These cover behaviour that already works, so they pass at once. While planning, each was checked against broken code: ignoring each game's own rank, or dropping the widening note, makes its test fail.
- **Loading:** "loading rank average…" and "Loading match details…" while both requests are held.
- **Retry:** failed match details come back after Retry.
- **Own rank:** ranked games (`ranked_display_badge: 116`) ask for Eternus curves only, with no current-rank note.
- **All ranks:** with no current rank, the all-ranks note shows.
- **Widening:** thin tiers widen, and the note says so (`thinTiers`).
- **Columns:** four at 1260 px and two at 850 px on the desktop; one at 375 px on the website.
- **Partial failure, per card (Task 4 review):**
  - **Untouched cards keep their trend.** The failed hero's games have no match details either, so the per-minute cards have none of them: they keep their average and trend, while souls, which has them, shows none.
  - **Failed averages aren't called missing.** Every game with match details is on the failed hero, so the card shows "1,000 10 games" with no trend and no "no rank average for these games".
  - Checked against broken code: a card that ignores whether a game has a value, and a detail that checks only a full failure, each fail one of them.

- [ ] **Step 1: Add the tests**

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  failCurve?: boolean;
  // Heroes whose curves fail while they're in the set.
  failCurveFor?: Set<number>;
  unstoredTotals?: number[];
  unlistedPlayer?: number[];
  // Awaited before each answer, so a test can hold requests back.
```

with:

```ts
  failCurve?: boolean;
  // Heroes whose curves fail while they're in the set.
  failCurveFor?: Set<number>;
  // One tier's curves come back thin (50 games), so they widen.
  thinTiers?: boolean;
  unstoredTotals?: number[];
  unlistedPlayer?: number[];
  // Awaited before each answer, so a test can hold requests back.
```

2. Replace:

```ts
      return fixtures.failCurve ||
        fixtures.failCurveFor?.has(Number(url.searchParams.get("hero_ids")))
        ? json({}, 500)
        : json(rankCurveRows());
    if (url.pathname.endsWith("/metadata")) return json(matchMetadata(ACCOUNT));
    return json([]);
  });
```

with:

```ts
      return fixtures.failCurve ||
        fixtures.failCurveFor?.has(Number(url.searchParams.get("hero_ids")))
        ? json({}, 500)
        : json(
            rankCurveRows(
              fixtures.thinTiers &&
                Number(url.searchParams.get("max_average_badge")) -
                  Number(url.searchParams.get("min_average_badge")) ===
                  5
                ? 50
                : 5000,
            ),
          );
    if (url.pathname.endsWith("/metadata")) return json(matchMetadata(ACCOUNT));
    return json([]);
  });
```

3. Replace:

```ts
  await expect(souls).toContainText("50 games");
});

test("performance range and hero survive a profile tab switch", async ({
  page,
}) => {
```

with:

```ts
  await expect(souls).toContainText("50 games");
});

test("performance tab says what is still loading", async ({ page }) => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    gate: (url) =>
      url.pathname === "/v1/matches/metadata" ||
      url.pathname === "/v1/analytics/player-performance-curve"
        ? hold
        : Promise.resolve(),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("1,100 20 games · loading rank average…");
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("— Loading match details…");
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
  release();
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("1,000 20 games · rank avg 500");
});

test("performance tab asks for match details again on Retry", async ({
  page,
}) => {
  const fixtures = { history: performanceHistory, failTotals: true };
  await storeAccount(page);
  await routeApi(page, fixtures);
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const notice = view(page).getByText(
    "Match details unavailable: Deadlock API unavailable (500).",
  );
  await expect(notice).toBeVisible();
  fixtures.failTotals = false;
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("1,000 20 games · rank avg 500");
  await expect(notice).toHaveCount(0);
});

test("performance tab compares ranked games at their own rank", async ({
  page,
}) => {
  const bands: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/player-performance-curve")
      bands.push(url.searchParams.get("min_average_badge")!);
  });
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory.map((row) => ({
      ...row,
      ranked_display_badge: 116,
    })),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("1,100 20 games · rank avg 1,000");
  // Eternus, not the player's current Mystic.
  expect(new Set(bands)).toEqual(new Set(["111"]));
  await expect(
    view(page).getByText(/^Games without a recorded rank/),
  ).toHaveCount(0);
});

test("performance tab notes games compared with all ranks", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory, rank: [] });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByText(
      "Games without a recorded rank, and no current rank to use, are compared with all ranks.",
    ),
  ).toBeVisible();
});

test("performance tab widens a thin rank's average and says so", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory, thinTiers: true });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByText(
      "Where a hero has too few games at one rank, its average covers the ranks either side.",
    ),
  ).toBeVisible();
});

test("performance cards sit in four columns, two on a narrower window", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  const columns = () =>
    view(page)
      .locator(".perf-card")
      .evaluateAll(
        (cards) =>
          new Set(cards.map((card) => card.getBoundingClientRect().left)).size,
      );
  expect(await columns()).toBe(4);
  await page.setViewportSize({ width: 850, height: 800 });
  await expect.poll(columns).toBe(2);
});

// The newest 20 games alternate heroes: heroes[0] on even indices.
const recent = (hero: 0 | 1) =>
  Array.from({ length: 10 }, (_, i) => 3000 + 2 * i + hero);

test("performance tab keeps the trends a failed curve doesn't touch", async ({
  page,
}) => {
  await storeAccount(page);
  // heroes[1]'s curve fails, and its games have no match details either.
  await routeApi(page, {
    history: performanceHistory,
    failCurveFor: new Set([heroes[1]]),
    unstoredTotals: recent(1),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const damage = card(page, "Hero damage / min");
  await expect(damage.locator(".perf-card-numbers")).toHaveText(
    "1,000 10 games · rank avg 500",
  );
  await expect(damage.locator(".perf-trend")).toHaveText("– Flat");
  // Souls has heroes[1]'s games, so it claims no trend.
  await expect(card(page, "Souls / min").locator(".perf-trend")).toHaveCount(0);
});

test("performance tab doesn't call failed averages missing", async ({
  page,
}) => {
  await storeAccount(page);
  // heroes[1]'s curve fails, and heroes[0]'s games have no match details.
  await routeApi(page, {
    history: performanceHistory,
    failCurveFor: new Set([heroes[1]]),
    unstoredTotals: recent(0),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const damage = card(page, "Hero damage / min");
  await expect(damage.locator(".perf-card-numbers")).toHaveText(
    "1,000 10 games",
  );
  await expect(damage.locator(".perf-trend")).toHaveCount(0);
});

test("performance range and hero survive a profile tab switch", async ({
  page,
}) => {
```


In `tests/web-browser/mobile.spec.ts`:

Replace:

```ts

    await page.getByRole("tab", { name: "Performance" }).click();
    await expect(page.locator(".perf-card .sparkline svg")).toHaveCount(10);
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
  });
```

with:

```ts

    await page.getByRole("tab", { name: "Performance" }).click();
    await expect(page.locator(".perf-card .sparkline svg")).toHaveCount(10);
    // One column of cards.
    expect(
      await page
        .locator(".perf-card")
        .evaluateAll(
          (cards) =>
            new Set(cards.map((card) => card.getBoundingClientRect().left))
              .size,
        ),
    ).toBe(1);
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
  });
```


- [ ] **Step 2: Run them**

Run: `npx playwright test tests/browser/home.spec.ts -g "performance"`
Expected: PASS (20 tests).

Run: `npm run test:browser && npm run test:web`
Expected: PASS (147 and 76).

- [ ] **Step 3: Check and commit**

```bash
npx tsc --noEmit
npx prettier --write tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
git add tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
git commit -m "test(profile): loading, Retry, rank notes, own rank and column layout on the Performance tab"
```

---

### Task 9: Docs and final check

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-21-redesign-design.md`

- [ ] **Step 1: README**

In `README.md`:

1. Replace:

```markdown

- **Live** shows the current match roster, builds and counters, or a "Deadlock isn't running" / "Waiting for a match" state. The app opens on Live when Deadlock is detected running (unless you have already picked a tab); otherwise it opens on Home. It also switches to Live once per match when live data first arrives.
- **Home** is a search (**Find a player**) followed by a **You** section for the remembered account (rank, recent form and latest match, each number explained) and **Top of the city**, the strongest heroes right now.
- **Profile** is its own page, opened from search, **You** or the header's **My profile**: rank badge, ranked games, KDA, souls per minute, top heroes, frequent teammates and a filterable match history, in the tabs Overview, Matches, Performance and Heroes. Click a match for its match report. **Performance** follows the last 20, 50 or 100 normal and ranked games, for all heroes or one, against the average player on the same hero at the same rank. **This is me** remembers the account; **Not you? Switch account** forgets it.
- **Match report** opens from any match row, from Home's latest match or from a shared link, for any player. **Viewing as** picks whose point of view it takes (any of the 12 players, or the whole match); it opens as you if you played, otherwise as the player you came from. It shows win or loss, verdicts (souls / min, hero damage and creep kills against the average player on that hero at that rank), **the Graph** (nine stat tabs plus "More stats…", player against the rank average, team totals, team lead or everyone, per minute, time ranges, death, item and objective markers, hover and a ranking that switches the point of view), best and worst stretches, impact, permanent buffs and a scoreboard for both teams. **Copy link** copies the website address of the report. See [Match report](#match-report).
- **Tier list** ranks heroes S to D by win-rate percentile over the last 30 days across all ranks, with a role filter.
- **Heroes** is the full roster with search and a role filter. A hero page (with a rank filter) shows abilities (hover, focus or tap one for its tooltip), then two tabs: **Build**, the main build (the most-bought items in each phase: Early 0–10 min, Mid 10–20 min and Late 20+ min, up to eight each), and **Popular builds**, the hero's most-favourited community builds, shown exactly as their authors set them up. **Counter items** come next: pick up to six enemy heroes to see the items, not already in the main build, that gain the most win rate against them (during a match, the desktop app uses the live enemy team instead on the pages of heroes on your team). Then come skill order, matchups, best partners, best items and **Items that beat {Hero}**, which compares an item's win rate against this hero with its overall win rate, adjusted for the hero's overall win rate. Both counter lists fall back to hero-trait heuristics, labelled "Based on hero traits", when the data is too thin. See [Hero page builds and counter items](#hero-page-builds-and-counter-items).
```

with:

```markdown

- **Live** shows the current match roster, builds and counters, or a "Deadlock isn't running" / "Waiting for a match" state. The app opens on Live when Deadlock is detected running (unless you have already picked a tab); otherwise it opens on Home. It also switches to Live once per match when live data first arrives.
- **Home** is a search (**Find a player**) followed by a **You** section for the remembered account (rank, recent form and latest match, each number explained) and **Top of the city**, the strongest heroes right now.
- **Profile** is its own page, opened from search, **You** or the header's **My profile**: rank badge, ranked games, KDA, souls per minute, top heroes, frequent teammates and a filterable match history, in the tabs Overview, Matches, Performance and Heroes. Click a match for its match report. **Performance** follows the last 20, 50 or 100 normal and ranked games, for all heroes or one, against the average player on the same hero at the same rank; pick a game on a chart to see it and open its match report. The profile keeps its tab and filters for the session, so coming back from a report finds them as they were. **This is me** remembers the account; **Not you? Switch account** forgets it.
- **Match report** opens from any match row, from Home's latest match or from a shared link, for any player. **Viewing as** picks whose point of view it takes (any of the 12 players, or the whole match); it opens as you if you played, otherwise as the player you came from. It shows win or loss, verdicts (souls / min, hero damage and creep kills against the average player on that hero at that rank), **the Graph** (nine stat tabs plus "More stats…", player against the rank average, team totals, team lead or everyone, per minute, time ranges, death, item and objective markers, hover and a ranking that switches the point of view), best and worst stretches, impact, permanent buffs and a scoreboard for both teams. **Copy link** copies the website address of the report. See [Match report](#match-report).
- **Tier list** ranks heroes S to D by win-rate percentile over the last 30 days across all ranks, with a role filter.
- **Heroes** is the full roster with search and a role filter. A hero page (with a rank filter) shows abilities (hover, focus or tap one for its tooltip), then two tabs: **Build**, the main build (the most-bought items in each phase: Early 0–10 min, Mid 10–20 min and Late 20+ min, up to eight each), and **Popular builds**, the hero's most-favourited community builds, shown exactly as their authors set them up. **Counter items** come next: pick up to six enemy heroes to see the items, not already in the main build, that gain the most win rate against them (during a match, the desktop app uses the live enemy team instead on the pages of heroes on your team). Then come skill order, matchups, best partners, best items and **Items that beat {Hero}**, which compares an item's win rate against this hero with its overall win rate, adjusted for the hero's overall win rate. Both counter lists fall back to hero-trait heuristics, labelled "Based on hero traits", when the data is too thin. See [Hero page builds and counter items](#hero-page-builds-and-counter-items).
```

2. Replace:

```markdown

The compact overlay's community build is selected by recorded match count among builds with at least 20 matches in the API's aggregate bucket. Its win rate is measured over the last 30 days of ranked and unranked matches and can span multiple build versions. Item groups come from the selected community build. These are adaptable suggestions, not a mandatory purchase order or a claim that the build causes more wins.

Home and the hero and item pages use Deadlock API aggregates, so figures reflect community data for the filters shown, not a complete record. Hero tiers are relative to the current win-rate distribution, not an official ranking. A hero page makes ten analytics requests, plus one for each picked enemy, and the Deadlock API limits analytics to 200 requests per minute per IP, so very rapid browsing can hit the cooldown. Picking an enemy again reuses its cached request.

### Hero page builds and counter items
```

with:

```markdown

The compact overlay's community build is selected by recorded match count among builds with at least 20 matches in the API's aggregate bucket. Its win rate is measured over the last 30 days of ranked and unranked matches and can span multiple build versions. Item groups come from the selected community build. These are adaptable suggestions, not a mandatory purchase order or a claim that the build causes more wins.

Home and the hero and item pages use Deadlock API aggregates, so figures reflect community data for the filters shown, not a complete record. Hero tiers are relative to the current win-rate distribution, not an official ranking. A hero page makes ten analytics requests, plus one for each picked enemy. The Deadlock API allows 200 analytics requests per minute per IP; the client holds requests back rather than go over it, so very rapid browsing slows down instead of hitting the cooldown. Picking an enemy again reuses its cached request.

### Hero page builds and counter items
```

3. Replace:

```markdown

Everything comes from `GET /v1/matches/{id}/metadata`: per-player stat snapshots (every 3 min until 15:00, then every 5 min, plus one at the end; lines connect them), deaths, purchases, permanent buff pickups, objectives and Mid Boss. Player names come from one batched `GET /v1/players/steam`. Teams are named Amber and Sapphire.

- **Rank average:** `GET /v1/analytics/player-performance-curve?hero_ids=…&min_average_badge=…&max_average_badge=…&resolution=0` (absolute game time) for the selected player's hero and the whole tier of their rank at match start (from the metadata; the lobby's rank when theirs is unknown), last 30 days, normal matches only. When the tier has fewer than 100 games at 3:00, or its games stop before the match ends, it widens one tier each way and says so; steps with fewer than 30 games are dropped. The graph shades ±1 standard deviation around the average.
- **Verdicts** compare the match's end values with the average at the same match length. The graph and verdicts use **creep kills**, which the snapshots and the average both have; the banner and scoreboard show the game's **last hits**, which is a different count.
- **Stretches** are rule-based: the moments with the most and fewest souls against the average, where the player ended up against the normal range (the average ± 1 standard deviation) and since when, every death, and any 3+ deaths within 5 minutes. When the average stops before the match ends, they say so.
- **Team lead** is Amber's advantage: Amber minus Sapphire, flipped for deaths so above the line always means Amber is ahead.
```

with:

```markdown

Everything comes from `GET /v1/matches/{id}/metadata`: per-player stat snapshots (every 3 min until 15:00, then every 5 min, plus one at the end; lines connect them), deaths, purchases, permanent buff pickups, objectives and Mid Boss. Player names come from one batched `GET /v1/players/steam`. Teams are named Amber and Sapphire.

- **Rank average:** `GET /v1/analytics/player-performance-curve?hero_ids=…&min_average_badge=…&max_average_badge=…&resolution=0` (absolute game time) for the selected player's hero and the whole tier of their rank at match start (from the metadata; when the match recorded none, as in unranked games, their current rank from `/v1/players/rank`, one request for every such player; all ranks when that is unknown too), last 30 days, normal matches only. When the tier has fewer than 100 games at 3:00, or its games stop before the match ends, it widens one tier each way and says so; steps with fewer than 30 games are dropped. The graph shades ±1 standard deviation around the average.
- **Verdicts** compare the match's end values with the average at the same match length. The graph and verdicts use **creep kills**, which the snapshots and the average both have; the banner and scoreboard show the game's **last hits**, which is a different count.
- **Stretches** are rule-based: the moments with the most and fewest souls against the average, where the player ended up against the normal range (the average ± 1 standard deviation) and since when, every death, and any 3+ deaths within 5 minutes. When the average stops before the match ends, they say so.
- **Team lead** is Amber's advantage: Amber minus Sapphire, flipped for deaths so above the line always means Amber is ahead.
```

4. Replace:

```markdown

### Performance tab

Eight cards, each with one point per game (oldest on the left, dotted by win or loss), the dashed rank average where there is one, and the value over the range. A range adds up the games rather than averaging each game's value, so longer games count for more.

- **From match history:** souls / min and the K/D/A ratio, (kills + assists) ÷ deaths, with deaths counted as at least one after adding up the games.
- **From each game's totals:** hero damage, objective damage, healing and creep kills per minute, kill participation and hero damage share. They come from `GET /v1/matches/metadata?match_ids=…&include_player_kda=true&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills&limit=…` (bulk metadata, every player's stat snapshots; the last one is the final total; `limit` is the number of games asked for), at most 50 games per request and kept per match, so a wider range only asks for the games it adds. Games the API hasn't stored yet are left out and the note says how many. Bulk metadata allows 30 requests per minute per IP (checked against the live API; the app doesn't throttle), so switching heroes quickly on Last 100 can hit the cooldown, which holds back every uncached request for at least 30 seconds.
- **Rank average:** the match report's curve, read at each game's length: the tier of the game's rank (match history's `ranked_display_badge`), the player's current rank (`/v1/players/rank`, asked only when a game has none) for games without one, such as unranked games, or all ranks when neither is known. It takes one request per hero and rank tier, plus one when it widens as in the match report, shared between games. The match report falls back to the lobby's rank instead, so an unranked game's average can differ between the two. As there, **creep kills** stand in for last hits. Kill participation and hero damage share have no rank average: the curve has no team totals.
- **Improving / Flat / Slipping** compares the recent half of the games with the earlier half (at least 6 games with a value and, where the metric has one, a rank average), each game as its value ÷ its rank average, so changing hero or rank doesn't read as a change in form; the two shares use their values. It says improving or slipping only when Welch's t-test finds the halves differ at the 95% level, and flat otherwise. When some games run past the end of the rank average, the card compares the player and the average over the games that have one.

## Website
```

with:

```markdown

### Performance tab

Ten cards, each with one point per game (oldest on the left, dotted by win or loss), the dashed rank average where there is one, and the value over the range. A range adds up the games rather than averaging each game's value, so longer games count for more.

Pointing at a chart, or its arrow keys, picks the nearest game and shows its hero, result, age, value and rank average above the chart; a click, Enter or the tip's **Report →** opens that game's match report. On a touch screen a tap only picks the game, and the tip's link opens it. Dots shrink as games crowd together, but not below 2 px, with an outline in the card's colour. While a new range or hero loads, the cards keep the last ones, dimmed.

- **From match history:** souls / min and the K/D/A ratio, (kills + assists) ÷ deaths, with deaths counted as at least one after adding up the games.
- **From each game's totals:** hero damage, objective damage, healing and creep kills per minute, and the four shares: kill participation and the player's share of their team's hero damage, objective damage and healing. They come from `GET /v1/matches/metadata?match_ids=…&include_player_kda=true&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills&limit=…` (bulk metadata, every player's stat snapshots; the last one is the final total; `limit` is the number of games asked for), at most 50 games per request and kept per match, so a wider range only asks for the games it adds. Games the API hasn't stored yet are left out and the note says how many. Bulk metadata allows 30 requests per minute per IP; the client holds requests back rather than go over it, so switching heroes quickly on Last 100 slows down rather than stopping.
- **Rank average:** the match report's curve, read at each game's length: the tier of the game's rank (match history's `ranked_display_badge`), the player's current rank (`/v1/players/rank`, asked only when a game has none) for games without one, such as unranked games, or all ranks when neither is known. Games of one hero and rank tier share their requests (one, plus one when it widens as in the match report); at most four such groups load at once, and a group whose curve fails leaves only its own games without an average, with a notice and Retry, and a card with any of those games claims no trend. The match report uses the same rank rule. As there, **creep kills** stand in for last hits. The four shares have no rank average: the curve has no team totals.
- **Improving / Flat / Slipping** compares the recent half of the games with the earlier half (at least 6 games with a value and, where the metric has one, a rank average), each game as its value ÷ its rank average, so changing hero or rank doesn't read as a change in form; the four shares use their values. It says improving or slipping only when Welch's t-test finds the halves differ at the 95% level, and flat otherwise. When some games run past the end of the rank average, the card compares the player and the average over the games that have one.

## Website
```

5. Replace:

```markdown
| `src/features/counters/`                          | Hero-page counter items and enemy picker, counter rules, threat types, desktop/compact panels      |
| `src/features/overlay/`                           | Visibility preferences, persisted keys, settings UI, overlay styles                                |
| `src/platform/overwolf/`                          | Background lifecycle, store bridge, game detection, window controls and native window hooks        |
| `src/shared/api/`                                 | Shared cached Deadlock API client and async request hook                                           |
| `src/shared/catalog/`                             | Typed catalog access (heroes, roles, abilities, items), metadata types and the dated JSON snapshot |
| `src/shared/ui/`                                  | Reusable icons, images, item artwork, page title, ribbon, section header and element-width hook    |
| `src/background/`, `src/desktop/`, `src/in_game/` | Stable HTML and minimal TypeScript entrypoints used by the manifest                                |
```

with:

```markdown
| `src/features/counters/`                          | Hero-page counter items and enemy picker, counter rules, threat types, desktop/compact panels      |
| `src/features/overlay/`                           | Visibility preferences, persisted keys, settings UI, overlay styles                                |
| `src/platform/overwolf/`                          | Background lifecycle, store bridge, game detection, window controls and native window hooks        |
| `src/shared/api/`                                 | Shared Deadlock API client (cache, rate limits, cooldowns) and async request hook                  |
| `src/shared/catalog/`                             | Typed catalog access (heroes, roles, abilities, items), metadata types and the dated JSON snapshot |
| `src/shared/ui/`                                  | Reusable icons, images, item artwork, page title, ribbon, section header and element-width hook    |
| `src/background/`, `src/desktop/`, `src/in_game/` | Stable HTML and minimal TypeScript entrypoints used by the manifest                                |
```

6. Replace:

```markdown
- `/v1/analytics/hero-stats`, `hero-counter-stats`, `hero-synergy-stats`, `ability-order-stats` and `item-stats` (also per build phase and per picked enemy)
- `/v1/builds` (popular builds on the hero page)

The client caches in memory (two to ten minutes depending on the data), times out after 15 seconds, shares in-flight requests and honours `Retry-After` cooldowns. The Performance tab also keeps each stored game's totals for the session.

## Sources
```

with:

```markdown
- `/v1/analytics/hero-stats`, `hero-counter-stats`, `hero-synergy-stats`, `ability-order-stats` and `item-stats` (also per build phase and per picked enemy)
- `/v1/builds` (popular builds on the hero page)

The client caches in memory (two to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests. It keeps to the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding requests back. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum. The Performance tab also keeps each stored game's totals for the session.

## Sources
```


- [ ] **Step 2: Spec**

The phase records stay as written; a paragraph after "Built in phase 4" records what changed.

In `docs/superpowers/specs/2026-10-21-redesign-design.md`:

Replace:

```markdown

Built in phase 4: eight metrics (souls / min, K/D/A ratio, hero damage, objective damage, healing and creep kills per minute, kill participation and hero damage share) over the last 20 (the default), 50 or 100 normal and ranked games, for all heroes or one. "All" is dropped: thousands of games of metadata is too much. The tab replaces the old one entirely: K/D/A and souls / min become cards like the rest, win or loss dots on every card replace the form strip, the damage-per-minute card becomes Hero damage / min from each game's totals, and the accuracy, last-hits and deaths cards are gone. Damage, healing, creep kills and shares come from bulk metadata (`GET /v1/matches/metadata`, 50 games per request) rather than one metadata request per game. The rank average is the match report's curve at each game's length, using the game's rank, the player's current rank for games without one (such as unranked games), or all ranks when neither is known. As in the match report, creep kills stand in for last hits, which the curve doesn't have. Impact share is built as kill participation and hero damage share; objective damage and healing are shown per minute rather than as shares. The two shares have no rank average, as the curve has no team totals. Improving or slipping needs Welch's t-test to find the recent half of the games different from the earlier half at the 95% level, each game against its own rank average (the two shares on their own values).

### Profile Live tab (app and website)

- **Your own account, in the desktop app:** use GEP. In a match, show the
```

with:

```markdown

Built in phase 4: eight metrics (souls / min, K/D/A ratio, hero damage, objective damage, healing and creep kills per minute, kill participation and hero damage share) over the last 20 (the default), 50 or 100 normal and ranked games, for all heroes or one. "All" is dropped: thousands of games of metadata is too much. The tab replaces the old one entirely: K/D/A and souls / min become cards like the rest, win or loss dots on every card replace the form strip, the damage-per-minute card becomes Hero damage / min from each game's totals, and the accuracy, last-hits and deaths cards are gone. Damage, healing, creep kills and shares come from bulk metadata (`GET /v1/matches/metadata`, 50 games per request) rather than one metadata request per game. The rank average is the match report's curve at each game's length, using the game's rank, the player's current rank for games without one (such as unranked games), or all ranks when neither is known. As in the match report, creep kills stand in for last hits, which the curve doesn't have. Impact share is built as kill participation and hero damage share; objective damage and healing are shown per minute rather than as shares. The two shares have no rank average, as the curve has no team totals. Improving or slipping needs Welch's t-test to find the recent half of the games different from the earlier half at the 95% level, each game against its own rank average (the two shares on their own values).

Changed after phase 4 (follow-up pass): objective damage and healing shares join kill participation and hero damage share, so the tab has all four of the match report's Impact shares (ten cards). Picking a game on a chart (pointer, tap or arrow keys) shows it and opens its match report; on a touch screen a tap only picks it and the tip's link opens it. Dots stay at least 2 px. The profile keeps its tab, filter, range and hero for the session, and the cards stay, dimmed, while a new range or hero loads. Rank averages load per hero and rank tier, four groups at a time, and a failed one leaves only its own games without an average. The match report now compares a player whose rank the match didn't record at their current rank, as the tab does, instead of the lobby's rank. The API client keeps to each endpoint group's per-IP rate limit, cools down only the group that was refused, and drops expired responses.

### Profile Live tab (app and website)

- **Your own account, in the desktop app:** use GEP. In a match, show the
```


- [ ] **Step 3: Final check**

Run all of these; every one must pass:
- `npm test` (382)
- `npx tsc --noEmit`
- `npm run web:typecheck`
- `npm run test:browser` (147)
- `npm run test:web` (76)
- `npm run build`
- `npm run web:build`
- `npm run validate:manifest`

- [ ] **Step 4: Commit**

Check only the README with prettier; the spec has never been prettier-formatted (its token table and two blank lines predate this work), so leave its existing formatting alone.

```bash
npx prettier --check README.md
git add README.md docs/superpowers/specs/2026-10-21-redesign-design.md
git commit -m "docs: Performance tab follow-ups"
```
