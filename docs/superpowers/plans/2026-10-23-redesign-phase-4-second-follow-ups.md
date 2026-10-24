# Redesign phase 4, second follow-up pass — request budget, one rank rule, cards and coming back — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the follow-ups the first follow-up pass (`docs/superpowers/plans/2026-10-23-redesign-phase-4-follow-ups.md`, "Follow-ups for the owner") left, as the owner picked them:
- **Requests:** every tab of the website and every Overwolf window keep to one rate limit budget, and the Live statistics client and the compact overlay's build loader now go through the shared client. A request no one waits for any more leaves the queue, so a range or hero left before it loads drops its requests. A cooldown fails waiting requests at once, not when they next wake.
- **One rank rule:** one helper gives the rank a game is compared at (its own, then the player's current rank, then all ranks), for the match report and the Performance tab alike. A current rank that didn't load says so in both, with Retry.
- **The Performance tab:** five cards a row where there is room, each share under its per-minute card. The shares claim no trend over games on more than one hero. "Updating…" is never cut short from 375 px up. Retry keeps keyboard focus in place.
- **The profile:** opened afresh, it starts at Overview. Coming back (the report's "Back to profile", or the browser's Back) finds it as it was left, on the website with its scroll position.
- **The match report:** no Impact share of a team total of 0.
- **Tests:** a partial failure, and its Retry, while older cards are kept.
- **The final review's fixes (Tasks 14–20):** a request every caller left before it claimed its slot is never sent; a stored cooldown lasts at most ten minutes; the Live roster asks again for stats that failed; coming back on the website keeps Matches' "Show more" and the Heroes sort; a scroll position still waiting to come back is kept; the chart's tip covers a shorter card's numbers, which sit with the chart at the foot.

**Architecture:**
- **`src/shared/api/rate-store.ts`** (new) holds the request counts and cooldowns behind a `RateStore`: `memoryRateStore` (one tab's own), `sharedRateStore` (in `localStorage`, taken under a lock, other tabs told through `storage` events) and `defaultRateStore`, which picks the shared one wherever the browser has storage.
- **`DeadlockApi.get(path, ttl, signal?)`**: a request on its way counts the callers waiting for it, and is dropped while still queued once every one has left. A waiting request wakes early when a cooldown starts, in this tab or (through the store) another.
- **`useAsync`** gives each load an `AbortSignal`, aborted on new deps, Retry or unmount. The services the Performance tab and the report use take it as a last `signal` parameter.
- **`fetchMatchTotals`** keeps, per match, either its totals or the batch request still out for it; a call that needs a batch another asked for asks again, so the client shares it and counts both.
- **`comparedRank()`** and `RankSource` (`"game" | "current" | "none"`) live in `rank-curve.ts`, used by the report and the tab.
- **`ProfileView`** takes `restore`. The desktop app keys the profile by visit; the website keys it by history entry and restores on Back or Forward, or on the report's link. `useScrollBack()` (`src/shared/ui/`) brings the website's scroll position back once the profile is tall enough again.
- **CSS:** `.performance` becomes the size container, five columns from 1100 px, each card a column with its chart at the foot.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8 (web), plain global CSS with the noir tokens, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md` ("Performance tab", "Match report", "Profile") and the follow-ups listed in `docs/superpowers/plans/2026-10-23-redesign-phase-4-follow-ups.md`. Owner decisions on 2026-10-23 ("do the follow ups"): all four behaviour changes offered (hide share trends on several heroes, five card columns when wide, fresh opens start at Overview, "—" for a team total of 0); keep the three chart trade-offs as decided; one limit everywhere (shared across tabs and windows, and the two outside clients on the shared one).

**Every code block in this plan was built and run before the plan was written** (reference commits in a scratch worktree, replayed from this plan's blocks). Tasks 14–20, the final review's fixes, were built and checked the same way after Tasks 1–13 ran. The full result:
- `npm test` 405 passed;
- `npm run test:browser` 154 passed;
- `npm run test:web` 82 passed;
- both type checks, `npm run build`, `npm run web:build` and `npm run validate:manifest` passed.

Each task's end state was also checked on its own: type check and unit tests after every task (385, 390, 391, 394, 395, 396, 397, 397, 397, 397, 397 and 397 tests for Tasks 1–12, then 401, 403, 405, 405, 405, 405 and 405 for Tasks 14–20), and both browser suites after every task (desktop 148, 149, 149, 150, 152, 153, 153, 153, 153, 153, 153 and 154, then 154, 154, 154, 154, 154, 154 and 154; website 76, 76, 76, 76, 76, 76, 76, 77, 78, 79, 79 and 79, then 79, 79, 79, 81, 82, 82 and 82). Copy the code as given. If something fails, fix the cause rather than the test.

## Decisions made while planning (checked in the browser on 2026-10-23)

- **One budget for every tab and window (owner's choice).** The API counts per IP, but each tab of the website, and each Overwolf window (background, desktop, in-game), had its own client and counts.
  - **Where:** `localStorage`, which every tab of one site shares, as do the app's Overwolf windows (they share an origin: the background window already reads the overlay preferences the other windows write). Keys: `counterlock.api.sent.{group}` (the group's request times in the window, as JSON) and `counterlock.api.cooldown.{key}` (an end time); `counterlock.api.probe` is written and removed once, to find storage that refuses writes.
  - **Taking a slot** reads, decides and writes under one lock, `navigator.locks.request("counterlock.api.lock", …)`, so two tabs can't both claim a group's last slot. Web Locks need a secure context (https, or `127.0.0.1` as in the tests; checked in Chromium). Where they're missing, `serialLocks()` orders this tab's own requests and storage is still shared: two tabs could then claim the last slot at the same moment. Whether Overwolf's windows have Web Locks is not checked (it needs Windows and Overwolf); either way their counts are now shared.
  - **What is shared:** the three limited groups' counts, their cooldowns, and a 503's pause-everything cooldown. A refused path's cooldown (another endpoint's 429) stays with the tab: those limits depend on where the data comes from, and the keys would hold match and account ids.
  - **Other tabs hear of a cooldown** through the `storage` event, which wakes their waiting requests to fail at once. A tab's own cooldowns wake its own.
  - **Without a window** (Node: the website's prerender and Vitest) the store is `memoryRateStore`, the old per-client behaviour; the existing tests run on it unchanged.
  - **The About page** says what is kept, as it does for the remembered account.
- **The two outside clients go through the shared one (owner's choice).**
  - **`StatsClient`** (the Live roster's hero stats and ranks) takes a `DeadlockApi` instead of `fetch`. Its own cooldown goes: the client's apply. Its errors are now the client's ("Data unavailable or profile protected.", "Deadlock API unavailable (500).", "API busy. Retry after the cooldown."), shown in the roster's tooltips. A 429 on one roster's hero stats now holds back only that request, as for every endpoint the API doesn't limit as a whole; rank lookups pause as a group.
  - **`loadBuild`** (the compact overlay's build) asks through the client with `TTL.analytics` and the hook's signal; its own five-minute cache goes, as the client caches both responses. A hook that times out or unmounts stops waiting at once; a request already sent completes and is cached.
- **Leaving drops only what hasn't claimed its slot.** A request in a group's queue is dropped once every caller has left. Once it claims its slot, in the same step as the count (Task 14), it goes out: it completes, and its answer is cached for whoever asks next. A caller that leaves hears so at once (its promise rejects with the signal's reason).
- **The totals cache keeps batches, not promises.** Each match maps to its totals, or to the batch request still out for it. A call that needs a batch another asked for asks for that path again: the client shares the request and counts both callers, so one leaving doesn't take the other's games. (React aborts a load before starting the next, but a promise tied to the first caller's signal would reject for both.) A batch that fails or was dropped is asked for again as the same batch.
- **Groups stop at the signal.** `fetchGameAverages` starts no more hero-and-rank groups once its signal aborts, and fails rather than answer.
- **One rank rule.** `comparedRank(recorded, current)` gives `{ badge, source }`: the game's own rank (`"game"`), else the current rank (`"current"`), else all ranks (`"none"`). The report's `"match"` is now `"game"`, as on the tab.
- **A current rank that didn't load** still means all ranks meanwhile (as decided in the first pass), now with a way back:
  - **The report's note** says " This player's rank isn't recorded for this match, and their current rank didn't load." with Retry, which asks again for the current ranks (and the curve). Without a failure the note is as before (" …, and there's no current rank to use.").
  - **The tab** shows "Current rank unavailable: {error}" with Retry, which asks again for the averages (the curves are cached).
- **No share trends over several heroes (owner's choice).** A metric without a rank average (the four shares) claims no trend, and no "Too few games", when its games with a value are of more than one hero: a change of hero moves a share more than form does. A note says so. On one hero, picked or not, they keep their trend. `MetricSummary.heroMix` says when.
- **Five cards a row (owner's choice)** where the cards have 1100 px or more: about 1162 px of window on the desktop. Each share then sits under its per-minute card, and kill participation under K/D/A.
  - **Measured at 1260 px** (desktop, cards 230 px wide): "Objective damage / min" beside its trend wraps to two lines. Long titles beside "▲ Improving" already wrapped in four columns.
  - **The charts still line up:** each card is a column with its chart at the foot.
  - **The container** moves from `.perf-cards` to `.performance`, the same width, so the grid itself can change its columns.
- **"Updating…" is never cut short from 375 px up.** It is 60 px wide (12 px DM Sans). On the website, between 530 and 580 px, the Hero select left it 6 to 56 px. Its status now keeps 5.25 em (63 px) wherever the cards have 400 px or more, so the select takes the next line instead. Phones have 63 px beside the buttons at 375 px without it; reserving it there stacked the buttons. Narrower phones (360 px leaves 48 px) can still cut it short.
- **Opened afresh, a profile starts at Overview (owner's choice).**
  - **Coming back** is the report's "← Back to profile" (`Route.back`), or on the website the browser's Back or Forward (navigation type `POP`, which a reload is too, with nothing kept yet). Any other way in starts at Overview, even to the profile already open.
  - **The desktop app** keeps the profile mounted while a report shows. It counts the other ways in (`profileVisit`) and keys the profile by them; coming back keeps the key.
  - **The website** keys the profile by history entry (`location.key`). The report's link passes `{ back: true }` as the history state.
  - **The map** still holds each profile's view as last left: a fresh visit writes Overview into it, so Back to an earlier entry finds the latest visit's view. Changes merge onto a ref of the latest view rather than the map.
- **The scroll position comes back on the website.** The profile loads again on Back, so the router's own restore finds the page too short and stops at the top or partway.
  - **Kept:** when the profile unmounts, in a layout effect's cleanup, before the next page resets the scroll.
  - **Restored:** once the page is tall enough (a `ResizeObserver` on the body), unless the viewer scrolls first (wheel, touch, key or pointer), within 10 seconds.
  - **The desktop** keeps the profile mounted while a report shows, so coming back has nothing to restore. It would restore only on a way back to another profile than the one mounted, which no way in reaches today: a report offers the way back only when opened from the mounted profile. `restore` is kept there as a safety net.
- **Retry keeps focus in place.** The notice holding Retry unmounts as soon as Retry is pressed. Focus now moves to the tab's status (which reads "Updating…") or to the report's rank note (which says what loads). Both take `tabIndex={-1}` and show no ring: they are places to read from, not controls.
- **A team total of 0** gives an Impact share of `null`: "—" and an empty bar, as the tab leaves such a game out of the share.
- **Kept as decided (owner's choice):** the chart's tip covers the card's numbers, so the whole line stays in sight; in a row's tallest card it sits right under the title row (its top meets the trend's baseline, a wrapped title's second line too), and a shorter card's numbers sit with its chart at the foot, under a gap (Task 19); and Enter on the chart opens the picked game's report, which the slider pattern doesn't define but the chart's label announces.
- **Checked by eye** in the desktop app at 1260 px (five columns, the tip on a wrapped title), and on the website build at 375 to 800 px ("Updating…" beside the buttons, or the select below).
- **Final review fixes (2026-10-23), Tasks 14–20,** from the final review and the review of its fixes, after Tasks 1–13 ran:
  - **A request claims its slot in the same step as the count.** `RateStore.take(group, limit, keys, claim)` runs `claim` just before counting: inside the shared store's lock callback, synchronously in the memory store. The client's `claim` throws if every caller has left (nothing is counted, `take` rejects, the lock is released), else marks the request claimed, which no leave can drop. Before, a request every caller left while `take` waited for the lock, or just after a memory-store `take`, was still sent and spent its slot, and the next caller sent it again: under StrictMode (the website's dev build) every Performance and report request went out twice. A signal alone would not do: the memory store counts inside `get()`, before StrictMode's abort. `Locks` is unchanged.
  - **A cooldown lasts at most ten minutes** (`MAX_COOLDOWN`), as it outlives a reload: a far-off `Retry-After` date, a clock moved back or a long 503 wait locked every tab, reload and app restart out, and Overwolf gives no way to clear it. The client caps a cooldown at 30 seconds to ten minutes. The shared store ignores a stored end more than ten minutes ahead (rather than clamp it, which would let it slide), and the next `cool` replaces it.
  - **The Live roster asks again for stats that failed:** an entry with an error is never fresh. Cooldowns from any tab or window fail the roster's requests at once, and the error was then cached for five minutes, which Refresh served. A half that fails again keeps the half that loaded while it is fresh, with its saved `fetchedAt`, so nothing outlives its ttl. A lasting failure (a 403) is asked for again on each `load`, which runs only on a roster change or Refresh: not polling.
  - **Coming back keeps Matches' "Show more" and the Heroes sort (owner: fix both).** The website mounts the profile again, so the count went back to 20 (and a scroll position past row 20 never came back) and the sort to Games. The view holds `shown` and `sort`; another filter resets `shown`, in the same update. Both now survive a tab switch too, in both apps, as "Switching tabs keeps them anyway" says.
  - **A scroll position still waiting to come back stays kept.** The cleanup saved `scrollY` even then: StrictMode's first cleanup (`npm run web:dev`) saved the router's clamped 0, and in production leaving before the page had grown lost the position (the toolbar's Back and Forward fire no takeover event). Its test is the first to use Playwright's clock, to expire the history's two-minute cache. `match-report.spec.ts` also passes against `npm run web:dev`, checked by hand.
  - **Numbers at the foot, with the chart (owner's choice).** With only the chart at the foot, a card shorter than its row's tallest had its spare height between numbers and chart, and the top of the big number showed above the tip (K/D/A at 1260 px). The numbers now take `margin-top: auto`: the charts still line up, the tip covers the numbers, and a shorter card has a gap under its title. A card without a chart keeps its numbers under its title.
  - **The docs** say a cooldown lasts at most ten minutes. The spec says which Retry buttons keep focus (the tab's match-details and rank notices, and the report's rank note), and that the tip sits right under the title row only in a row's tallest card.

- **Follow-ups for the owner (not built):**
  - **Update 2026-10-24:** this list records the state after the second pass. The implementation and current manual checks are tracked in [Phase 4 and phase 5 follow-ups](2026-10-24-phase-4-5-follow-ups.md).
  - **Other Retry buttons** (tier list, Heroes, items, hero page, the match history notices) still drop focus to the page when their notice unmounts.
  - **Focus after Retry:** on a first load, a fast match-details failure shows its notice before any cards, and Retry then focuses an empty status. A double "Updating…" announcement (focus and live region) is unchecked with a screen reader. The report's rank note has no live region, so a second failure after Retry isn't announced. Only the match-details notice's Retry is tested from the keyboard.
  - **Web Locks in Overwolf** are unchecked. Without them the windows still share their counts, but two could claim a group's last slot at the same moment.
  - **A request that has claimed its slot still uses it** when everyone has left it; it goes out, completes and is cached.
  - **API tests not written:** a refused path's cooldown staying in its tab (shared store); `pause()`'s early return; a 503's `"*"` being shared; `watch` on a cleared storage, and ignoring `sent.*`; `defaultRateStore` falling back to memory when storage refuses a write; a later `cool` replacing a stored end too far ahead to count (final review of Tasks 14–20).
  - **A batch that failed or was dropped is asked for again as it was:** Last 50 after a failed Last 20 makes two bulk requests (20 and 30 games), not one of 50.
  - **A batch that fails for a reason tied to its contents** is asked for again, as the same batch, by every range that touches it.
  - **Performance tests not written:** nothing pins `fetchGameAverages`'s `throwIfAborted` (it matters only when some groups finished before the abort), and no test covers the report's signals.
  - **The Live roster's errors** read as the shared client's ("Deadlock API unavailable (500).", "API busy. Retry after the cooldown.") rather than "Stats API unavailable (…)".
  - **During a 429 on one roster's hero stats**, another roster's are still asked for (a refused path only holds back itself).
  - **`StatsClient` passes no signal:** a roster's queued rank lookup can't be dropped, and `LiveStore`'s `running` gate makes a new roster wait behind it (up to about a minute when the rank budget is spent).
  - **The Live roster's re-asked half:** on an unchanged roster, a half that loaded comes again from the shared client's cache with a new `fetchedAt`, so it can show up to about twice `TTL.profile` after it loaded.
  - **Impact:** no browser test of kill participation's "—".
  - **"Updating…" can still be cut short** on phones narrower than 375 px (360 px leaves 48 px of its 60).
  - **Five columns wrap more titles** beside "▲ Improving" or "▼ Slipping"; the charts still line up.
  - **With the fallback font,** Souls / min's numbers wrap to two lines at 1260 px, and the 40 px tip doesn't reach the top of its big number (so before Task 19 too; unchecked with the real font).
  - **The desktop app's scroll position** is the window's, shared by every page, as before; only the website brings a profile's back.
  - **Website tests not written:** none pins keying the profile by `location.key` (the header's My profile on one's own open profile, a `replace`, should open at Overview), nor the mount effect writing Overview for an unchanged fresh visit; none tests the scroll restore giving up when the viewer scrolls first.
  - **macOS trackpads:** a swipe back may leave wheel events that count as the viewer taking over and cancel the scroll restore (unchecked).
  - **`useScrollBack` in development:** with a kept position of 0, StrictMode's first cleanup saves whatever `scrollY` is then.
  - **The mouse's Back and Forward buttons (final review of Tasks 14–20):** they fire `pointerdown`, which counts as the viewer taking over, so one pressed while a scroll position still waits to come back loses it, as the toolbar's buttons no longer do (Alt+← and Alt+→ probably too, unchecked). Ignoring pointer buttons past the third, and keys with Alt or Cmd, would keep it.

## Global Constraints

- Every colour comes from `src/app/styles/tokens.css` (`var(--token)` or `rgb(from var(--token) r g b / a)`). `tests/app/theme.test.ts` fails on any hex literal in `src/**/*.css`, `web/app/**/*.css` or `src/**/*.tsx`.
- **Exported, and imported by tests:** `RATE_WINDOW` moves to `src/shared/api/rate-store.ts` and `DeadlockApi.ts` re-exports it; `memoryRateStore`, `sharedRateStore`, `serialLocks` and `defaultRateStore` from `rate-store.ts`; `comparedRank` and `RankSource` from `rank-curve.ts`; `loadBuild(heroId, signal, api)`.
- **Exported or changed in Tasks 14–19:** `RateStore.take(group, limit, keys, claim)` takes a fourth argument, which the store tests pass (`() => {}`); they also import `type Locks` from `rate-store.ts`, and the stats tests import `TTL` from `DeadlockApi.ts`. `MAX_COOLDOWN` is exported from `rate-store.ts` (the client imports it). `PAGE_SIZE` is exported from `MatchHistory.tsx`, and `FIRST_SORT` and `type HeroSort` from `HeroesTab.tsx` (the profile's view imports them). `MatchHistory` takes `shown` and `onShowMore`; `HeroesTab` takes `sort` and `onSort`.
- **Storage keys:** `counterlock.api.sent.{group}`, `counterlock.api.cooldown.{key}` and `counterlock.api.probe`; the lock is `counterlock.api.lock`.
- **New or changed copy strings (tests assert them; Tasks 14–20 add none):**
  - **Tab notice:** "Current rank unavailable: {error}" with Retry.
  - **Tab note:** "Kill participation and the shares show no trend over games on more than one hero: a change of hero moves them more than form does."
  - **Report note:** " This player's rank isn't recorded for this match, and their current rank didn't load." with Retry.
  - **Impact:** "—" for a share of a team total of 0.
  - **About page:** "The site also keeps the times of its recent requests to Deadlock API in `localStorage`, and any wait the API asked for, so that all its open tabs together keep to the API's rate limits."
- One shared copy of the feature code for the app and the website.
- **Before every commit**, run `npm test`, `npx tsc --noEmit` and `npm run web:typecheck`.
- **Browser suites:** `npm run test:browser` (desktop, port 5186) and `npm run test:web` (website, builds and serves on 5187). If a port is busy, free it with `fuser -k <port>/tcp`; never `pkill -f`.
- **Formatting:** format touched files with `npx prettier --write <files>`. The spec file has never been prettier-formatted: leave its existing formatting alone and check only that your edit adds no new differences.
- **Commits:** plain conventional commits with **no AI attribution lines or trailers** (owner rule).

## Review Focus

1. **One budget, dropped requests.** Two tabs never send more than a group's limit together; a cooldown one tab was given holds the others back and fails their waiting requests at once; a queued request is dropped once no one wants it, never one another caller still waits for, and never one already sent. Tests: `keeps two tabs together within one limit`, `holds every tab back during a cooldown one of them was given`, `fails another tab's waiting requests as soon as a cooldown starts`, `fails waiting requests as soon as their group cools down`, `drops a waiting request once no one wants it, without using a slot`, `keeps a sent request's answer when its caller has left`, `a cooldown one tab was given holds the app's other tabs back`.
2. **Leaving a range.** A left range's curve groups never start, and a batch another call waits for survives the first caller leaving. Tests: `drops a batch no call waits for any more, and the next asks afresh`, `keeps a batch another call still waits for`, `starts no more groups once the call is left`, `performance tab drops the rank averages of a range it has left`.
3. **One rank rule.** The report and the tab both use `comparedRank`, and both say when the current rank didn't load and offer Retry. Tests: `is the game's own, else the player's current rank, else all ranks`, `falls back to all ranks when the current rank fails to load, and says why`, `a current rank that didn't load leaves all ranks, with Retry`, `performance tab says when the current rank didn't load, and Retry asks again`.
4. **Coming back.** Fresh opens start at Overview; the report's link and the browser's Back restore the view, and the website's scroll. Tests: `a profile opened afresh starts at Overview; back from its report, it is as it was`, `browser Back finds the profile as it was; opened afresh, it starts at Overview`, `coming back from a report finds the profile scrolled as it was`, `the profile keeps its tab, range and hero after a match report`.
5. **Cards.** Five columns with shares under their per-minute cards and the charts lined up; "Updating…" uncut from 375 px; no share trends over several heroes. Tests: `performance cards sit in five columns when wide, then four, then two`, `Updating… is never cut short beside the Performance range buttons`, `has no share trend over games on more than one hero`, `performance tab compares each metric with the rank average`.
6. **The final review's fixes.** A request every caller left before it claimed its slot is never sent, nor counted, and one claimed goes out whoever leaves; a cooldown ends within ten minutes, however far ahead it was set or stored; the Live roster asks again for what failed and keeps what loaded, never past its ttl; coming back keeps Matches' rows shown and the Heroes sort, and a fresh visit or another filter resets them; a position still waiting to come back survives leaving early; in a shorter card the tip covers the numbers, and a card without a chart keeps them under its title. Tests: `keeps a waiting request one of its two callers still wants`, `sends a request asked for again just after its caller left once, using one slot`, `neither sends nor counts a request every caller left before the lock was granted`, `sends a request whose callers left once its slot was claimed, for whoever asks next`, `ends a cooldown within ten minutes, however far ahead Retry-After is`, `holds nothing back for a stored cooldown further ahead than any is set for`, `fails at once during a cooldown, as the app's other requests do`, `asks again for stats that failed, and keeps those that loaded`, `keeps the stats that loaded when the roster changes during a cooldown`, `coming back keeps the matches shown, and the scroll past the first page`, `coming back keeps the Heroes tab's sort; opened afresh, it sorts by games`, `a scroll position still waiting to come back is kept`, `performance cards sit in five columns when wide, then four, then two`, `performance tab says what is still loading`.

## File structure

| File | Responsibility |
|---|---|
| `src/shared/api/rate-store.ts` | Request counts and cooldowns: a tab's own, or shared by every tab in `localStorage` under a lock; a request claimed in the same step as its count; stored cooldowns of ten minutes at most (`MAX_COOLDOWN`) |
| `src/shared/api/DeadlockApi.ts` | Callers per request, dropping one no one wants before it claims its slot, waking waiting requests on a cooldown; counts and shared cooldowns in the store; cooldowns capped at ten minutes |
| `src/shared/api/useAsync.ts` | A signal per load, aborted when its result can't be shown any more |
| `src/features/player-stats/services/StatsClient.ts` | The Live roster's stats through the shared client; stats that failed asked for again, what loaded kept while fresh |
| `src/features/builds/services/build-analytics.ts` | The compact overlay's build through the shared client |
| `src/features/profile/services/profile-api.ts` | Rank lookups take a signal |
| `src/features/match-report/services/match-report.ts` | Current ranks and curves take a signal |
| `src/features/profile/services/performance-api.ts` | Totals per match or pending batch; groups stop at the signal; the current rank's failure |
| `src/features/match-report/utils/rank-curve.ts` | `comparedRank()` and `RankSource` |
| `src/features/profile/utils/performance-metrics.ts` | `RankSource` for a game's average; `heroMix` |
| `src/features/match-report/utils/insights.ts` | No Impact share of a team total of 0 |
| `src/features/match-report/components/MatchReportPage.tsx` | Signals; `comparedRank`; a failed lookup; the back link says so |
| `src/features/match-report/components/Verdicts.tsx` | The failed-lookup note, its Retry and the focus it keeps |
| `src/features/match-report/components/PlayerInsights.tsx` | "—" for no share |
| `src/features/profile/components/PerformanceTab.tsx` | Signals; the current-rank notice; the hero-mix note; focus after Retry |
| `src/features/profile/components/ProfileView.tsx` | `restore`; the view (with Matches' rows shown and the Heroes sort) and scroll position to come back to |
| `src/features/profile/components/MatchHistory.tsx` | The rows shown, from the view (`shown`, `onShowMore`); `PAGE_SIZE` |
| `src/features/profile/components/HeroesTab.tsx` | The sort, from the view (`sort`, `onSort`); `HeroSort` and `FIRST_SORT` |
| `src/features/profile/components/ProfilePage.tsx` | Passes `restore` on |
| `src/shared/ui/useScrollBack.ts` | The window's scroll position, kept on unmount (unless still waiting to come back) and brought back once the page is tall enough |
| `src/app/navigation.ts` | `Route.back` |
| `src/app/DesktopApp.tsx` | The profile keyed by visit |
| `web/app/WebShell.tsx`, `web/app/routes/player.tsx` | The way back as history state; the profile keyed by history entry |
| `web/app/routes/about.tsx` | What the request budget keeps in `localStorage` |
| `src/features/profile/styles/profile.css` | Five columns, numbers and charts at the foot, room for "Updating…", no ring on the status |
| `src/features/match-report/styles/match-report.css` | No ring on the rank note |

### Task 1: A queued request no one wants is dropped; a cooldown fails waiting ones at once

**Files:**
- Modify: `src/shared/api/DeadlockApi.ts`
- Test: `tests/shared/DeadlockApi.test.ts`

What changes in the client every feature shares:
- **`get(path, ttl, signal?)`:** a caller whose signal aborts stops waiting at once (its promise rejects with the signal's reason). A caller with an already aborted signal asks for nothing.
- **A request on its way (`Pending`)** counts the callers waiting for it; a caller without a signal counts for ever (`Infinity`), as every caller did before. Once the last caller with a signal leaves while the request still waits in its group's queue, the request is dropped (`abandon`) and taken out of `inFlight`, so the next caller starts afresh. A request already sent completes and is cached.
- **Waiting (`pause`)** ends early when a cooldown starts (`cool()` wakes every sleeper) or when the request is dropped; the loop then fails it before it takes a slot, as before. The injected `wait(ms, signal)` now gets a signal, which the default uses to clear its timer.
- **Tests:**
  - **A cooldown fails waiting requests at once:** the 20th rank lookup is refused for an hour; the 21st, waiting for the window, settles with no time passing.
  - **A request no one wants leaves the queue:** one waiting lookup's only caller leaves; another lookup has two callers and one leaves. The first never goes out; the second goes when the window has room.
  - **A sent request's answer is kept:** its caller leaves while it is out; a new caller shares it, and it is cached. A caller whose signal was aborted before asking asks for nothing.

- [ ] **Step 1: Write the failing tests**

In `tests/shared/DeadlockApi.test.ts`:

Replace:

```ts
    }
  });

  it("drops responses that outlived their ttl", async () => {
    const request = vi
      .fn<typeof fetch>()
```

with:

```ts
    }
  });

  it("fails waiting requests as soon as their group cools down", async () => {
    vi.useFakeTimers();
    try {
      let sent = 0;
      const request = vi.fn<typeof fetch>().mockImplementation(async () =>
        ++sent === 20
          ? new Response("", {
              status: 429,
              headers: { "Retry-After": "3600" },
            })
          : json([]),
      );
      const api = new DeadlockApi(request);
      const rank = (id: number) =>
        api.get(`/v1/players/rank?account_ids=${id}`, 1);
      const first = Array.from({ length: 20 }, (_, i) =>
        rank(i).catch(() => null),
      );
      let settled = false;
      const waiting = rank(20).finally(() => (settled = true));
      waiting.catch(() => {});
      await Promise.all(first);
      // No time passes: the 429 wakes it, rather than the window freeing
      // a slot a minute later.
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(true);
      await expect(waiting).rejects.toThrow("API busy");
      expect(request).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a waiting request once no one wants it, without using a slot", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const sentAt = new Map<string, number>();
      const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        sentAt.set(String(url).split("=")[1], Date.now() - start);
        return json([]);
      });
      const api = new DeadlockApi(request);
      const rank = (id: number, signal?: AbortSignal) =>
        api.get(`/v1/players/rank?account_ids=${id}`, 1, signal);
      await Promise.all(Array.from({ length: 20 }, (_, i) => rank(i)));
      const left = new AbortController();
      const leaving = rank(20, left.signal);
      // Two ask for 21; one leaves, the other still wants it.
      const shared = new AbortController();
      const stays = rank(21);
      const goes = rank(21, shared.signal);
      const later = rank(22);
      left.abort();
      shared.abort();
      // Callers that leave hear so at once.
      await expect(leaving).rejects.toThrow(/abort/i);
      await expect(goes).rejects.toThrow(/abort/i);
      await vi.advanceTimersByTimeAsync(RATE_WINDOW);
      await Promise.all([stays, later]);
      // 20 never went out; the others went once the window had room.
      expect(sentAt.has("20")).toBe(false);
      expect(sentAt.get("21")).toBe(RATE_WINDOW);
      expect(sentAt.get("22")).toBe(RATE_WINDOW);
      expect(request).toHaveBeenCalledTimes(22);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a sent request's answer when its caller has left", async () => {
    let release!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const api = new DeadlockApi(request, () => 0);
    const caller = new AbortController();
    const asked = api.get("/v1/x", 1000, caller.signal);
    caller.abort();
    await expect(asked).rejects.toThrow(/abort/i);
    // A new caller shares the request already out, and its answer is kept.
    const again = api.get("/v1/x", 1000);
    release(json({ n: 1 }));
    await expect(again).resolves.toEqual({ n: 1 });
    await expect(api.get("/v1/x", 1000)).resolves.toEqual({ n: 1 });
    expect(request).toHaveBeenCalledTimes(1);
    // A caller that has already left asks for nothing.
    await expect(api.get("/v1/y", 1000, caller.signal)).rejects.toThrow(
      /abort/i,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("drops responses that outlived their ttl", async () => {
    const request = vi
      .fn<typeof fetch>()
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/shared/DeadlockApi.test.ts`
Expected: FAIL (3 failed, 19 passed: the waiting lookup hasn't settled after the 429 (`expected false to be true`), and the other two time out after 5 s, as `get` ignores the signal).

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

// A request on its way: shared by everyone who asks for its path while it
// is out.
interface Pending {
  promise: Promise<unknown>;
  // Callers still waiting for it; Infinity once one came without a signal.
  callers: number;
  // Aborted when every caller has left while it still waits for room.
  abandon: AbortController;
  queued: boolean;
}

/**
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree.
 */
export class DeadlockApi {
  private cache = new Map<
    string,
    { data: unknown; fetchedAt: number; ttl: number }
  >();
  private inFlight = new Map<string, Pending>();
  private cooldowns = new Map<string, number>();
  private sent = new Map<string, number[]>();
  // Requests waiting for room: a cooldown wakes them to fail at once.
  private sleepers = new Set<() => void>();
  private sweptAt = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
    private wait: (ms: number, signal: AbortSignal) => Promise<void> = (
      ms,
      signal,
    ) =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      }),
  ) {}

  /**
   * The response for `path`, cached for `ttlMs`. A caller whose `signal`
   * aborts stops waiting at once; the request itself is dropped only if it
   * hasn't gone out yet and no one else still wants it.
   */
  get<T>(path: string, ttlMs: number, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const saved = this.cache.get(path);
    if (saved && this.now() - saved.fetchedAt < ttlMs)
      return Promise.resolve(saved.data as T);
    let pending = this.inFlight.get(path);
    if (!pending) {
      const group = endpointGroup(path);
      if (this.cooling(path, group)) return Promise.reject(new Error(BUSY));
      pending = this.start(path, group, ttlMs);
    }
    return this.follow(path, pending, signal) as Promise<T>;
  }

  private start(path: string, group: string, ttlMs: number) {
    const pending: Pending = {
      promise: Promise.resolve(),
      callers: 0,
      abandon: new AbortController(),
      queued: true,
    };
    pending.promise = this.send(path, group, pending)
      .then((data) => {
        this.store(path, data, ttlMs);
        return data;
      })
      .finally(() => {
        if (this.inFlight.get(path) === pending) this.inFlight.delete(path);
      });
    this.inFlight.set(path, pending);
    return pending;
  }

  /** The request's answer, for one caller, who may leave early. */
  private follow(path: string, pending: Pending, signal?: AbortSignal) {
    if (!signal) {
      pending.callers = Infinity;
      return pending.promise;
    }
    pending.callers++;
    return new Promise((resolve, reject) => {
      const leave = () => {
        reject(signal.reason);
        if (--pending.callers || !pending.queued) return;
        // No one wants it any more, and it hasn't gone out.
        pending.abandon.abort();
        if (this.inFlight.get(path) === pending) this.inFlight.delete(path);
      };
      signal.addEventListener("abort", leave, { once: true });
      pending.promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", leave));
    });
  }

  private cooling(path: string, group: string) {
    const now = this.now();
    return [EVERYTHING, refused(path, group)].some(
      (key) => now < (this.cooldowns.get(key) ?? 0),
    );
  }

  /** Sends at once, or when the group's rate limit has room. */
  private async send<T>(
    path: string,
    group: string,
    pending: Pending,
  ): Promise<T> {
    const limit = RATE_LIMITS[group];
    if (limit) await this.throttle(path, group, limit, pending.abandon.signal);
    pending.queued = false;
    return this.fetchJson<T>(path, group);
  }

  /**
   * Waits until the group has had fewer than `limit` requests in the window,
   * then counts this one. A cooldown that starts while it waits fails it at
   * once, before it takes a slot, as does every caller leaving.
   */
  private async throttle(
    path: string,
    group: string,
    limit: number,
    abandoned: AbortSignal,
  ) {
    const sent = this.sent.get(group) ?? [];
    this.sent.set(group, sent);
    for (;;) {
      abandoned.throwIfAborted();
      if (this.cooling(path, group)) throw new Error(BUSY);
      const now = this.now();
      while (sent.length && now - sent[0] >= RATE_WINDOW) sent.shift();
      if (sent.length < limit) {
        sent.push(now);
        return;
      }
      await this.pause(sent[0] + RATE_WINDOW - now, abandoned);
    }
  }

  /** Waits `ms`, or less when a cooldown starts or every caller leaves. */
  private async pause(ms: number, abandoned: AbortSignal) {
    const woken = new AbortController();
    const wake = () => woken.abort();
    this.sleepers.add(wake);
    abandoned.addEventListener("abort", wake);
    try {
      await Promise.race([
        this.wait(ms, woken.signal),
        new Promise((resolve) =>
          woken.signal.addEventListener("abort", resolve),
        ),
      ]);
    } finally {
      this.sleepers.delete(wake);
      abandoned.removeEventListener("abort", wake);
      // Clears the timer of a wait cut short.
      woken.abort();
    }
  }

  private cool(key: string, until: number) {
    this.cooldowns.set(key, until);
    for (const wake of [...this.sleepers]) wake();
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
      this.cool(
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
Expected: PASS (22 tests).

Run: `npm test`
Expected: PASS (385 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/shared/api/DeadlockApi.ts tests/shared/DeadlockApi.test.ts
npm run test:browser && npm run test:web
git add src/shared/api/DeadlockApi.ts tests/shared/DeadlockApi.test.ts
git commit -m "feat(api): drop a queued request no one wants; a cooldown fails waiting ones at once"
```

Expected: 148 desktop and 76 website tests pass.

---

### Task 2: One budget for every tab and window of the app

**Files:**
- Create: `src/shared/api/rate-store.ts`
- Modify: `src/shared/api/DeadlockApi.ts`
- Modify: `web/app/routes/about.tsx`
- Test: `tests/shared/rate-store.test.ts` (new), `tests/browser/tier-list.spec.ts`, `tests/web-browser/shell.spec.ts`

What changes:
- **`rate-store.ts`** holds what was the client's `sent` map and the shared cooldowns, behind `RateStore`:
  - `take(group, limit, keys)` counts a request if none of `keys` is cooling down and the group has room (then 0); otherwise null (cooling down) or how long until the oldest request leaves the window.
  - `cooling(keys)`, `cool(key, until)` (keeps the later end) and `watch(listener)` (another tab started a cooldown).
  - **`memoryRateStore(now)`**: one tab's own, its `take` synchronous inside, so requests take slots in the order they ask, as before.
  - **`sharedRateStore(storage, locks, now, events)`**: in `localStorage`, `take` under the lock; `watch` listens for `storage` events on cooldown keys (or a cleared storage); damaged entries read as empty.
  - **`serialLocks()`**: a lock within one tab, where `navigator.locks` is missing.
  - **`defaultRateStore(now)`**: memory without a window (Node), shared where storage takes a write, memory where it refuses one.
  - `RATE_WINDOW` moves here (`DeadlockApi.ts` re-exports it, so imports don't change).
- **`DeadlockApi`** takes the store as a fourth constructor argument (default `defaultRateStore(now)`) and wakes its sleepers when the store reports another tab's cooldown.
  - **Shared keys:** `"*"` (a 503) and the three limited groups' cooldowns go to the store; a refused path's cooldown stays in the client.
  - **The throttle** asks the store for a slot; `pause()` also returns at once if a cooldown started while the slot was being asked for (the shared store's lock is asynchronous).
- **The About page** says what the store keeps.
- **Tests:**
  - **Two tabs, one limit:** two clients on one storage and one lock send 15 rank lookups each; 20 go at once and 10 a window later.
  - **A cooldown holds every tab back:** a 429 on analytics in one tab fails the other tab's analytics without a request, and leaves only the two analytics keys in storage; an endpoint the API doesn't limit as a whole still answers.
  - **Another tab's waiting requests fail at once:** tab b waits for the window; tab a is refused; the storage event tab b's browser would fire makes it give up with no time passing. Checked against the same test without the event: it fails.
  - **Damaged entries** read as empty, and **without a window** each client counts on its own.
  - **In the browser:** a 429 one tab is given holds a second tab of the same context back, with no request (checked against a store that is always per tab: the second tab asks again).

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/rate-store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { DeadlockApi, RATE_WINDOW } from "@/shared/api/DeadlockApi";
import {
  defaultRateStore,
  serialLocks,
  sharedRateStore,
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
    await expect(store.take("/v1/players/rank", 20, ["*"])).resolves.toBe(0);
    expect(storage.getItem("counterlock.api.sent./v1/players/rank")).toBe(
      "[1000]",
    );
  });

  it("counts per tab where nothing can be shared", async () => {
    // As in Node, with no window, storage or locks.
    const store = defaultRateStore(() => 0);
    await expect(store.take("/v1/players/rank", 1, [])).resolves.toBe(0);
    await expect(store.take("/v1/players/rank", 1, [])).resolves.toBe(
      RATE_WINDOW,
    );
  });
});
```

In `tests/browser/tier-list.spec.ts`:

Replace:

```ts
    page.getByRole("button", { name: "Heroes", exact: true }),
  ).toHaveClass(/active/);
});
```

with:

```ts
    page.getByRole("button", { name: "Heroes", exact: true }),
  ).toHaveClass(/active/);
});

test("a cooldown one tab was given holds the app's other tabs back", async ({
  context,
}) => {
  const asked: string[] = [];
  await context.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/v1/analytics/hero-stats")
      return route.fulfill({ json: [], headers: cors });
    asked.push(url.pathname);
    return route.fulfill({
      status: 429,
      json: {},
      headers: {
        ...cors,
        "access-control-expose-headers": "Retry-After",
        "retry-after": "3600",
      },
    });
  });
  const first = await context.newPage();
  await first.goto("/");
  await first.getByRole("button", { name: "Tier list", exact: true }).click();
  await expect(first.getByRole("status")).toHaveText(
    /^Hero stats unavailable: API busy\. Retry after the cooldown\./,
  );
  expect(asked).toHaveLength(1);
  // Another tab of the app waits the cooldown out too, without asking.
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "Tier list", exact: true }).click();
  await expect(second.getByRole("status")).toHaveText(
    /^Hero stats unavailable: API busy\. Retry after the cooldown\./,
  );
  expect(asked).toHaveLength(1);
});
```

In `tests/web-browser/shell.spec.ts`:

Replace:

```ts
  await expect(main).toContainText("not affiliated with Valve");
  await expect(main).toContainText("localStorage");
  await expect(main).toContainText("Switch account");
  await expect(main).toContainText("Google Fonts");
});

```

with:

```ts
  await expect(main).toContainText("not affiliated with Valve");
  await expect(main).toContainText("localStorage");
  await expect(main).toContainText("Switch account");
  await expect(main).toContainText("keep to the API's rate limits");
  await expect(main).toContainText("Google Fonts");
});

```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/shared/rate-store.test.ts`
Expected: FAIL (`Cannot find package '@/shared/api/rate-store'`).

Run: `npx playwright test tests/browser/tier-list.spec.ts -g "cooldown one tab"`
Expected: FAIL (the second tab asks again: `Received array: ["/v1/analytics/hero-stats", "/v1/analytics/hero-stats"]`).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/shell.spec.ts -g "about page covers"`
Expected: FAIL (the About page doesn't say "keep to the API's rate limits" yet).

- [ ] **Step 3: Write the store**

Create `src/shared/api/rate-store.ts`:

```ts
// A second's margin over the API's minute, so latency can't put a minute's
// last request into the API's next window early.
export const RATE_WINDOW = 61_000;

/**
 * Request counts and cooldowns for the endpoint groups the API limits per
 * IP: one tab's own, or shared by every tab and window of the app.
 */
export interface RateStore {
  /**
   * Counts a request against the group if none of `keys` is cooling down
   * and the group has had fewer than `limit` in the window: then 0.
   * Otherwise null while cooling down, or how long until the oldest
   * request leaves the window.
   */
  take(group: string, limit: number, keys: string[]): Promise<number | null>;
  cooling(keys: string[]): boolean;
  cool(key: string, until: number): void;
  /** Calls `listener` when another tab or window starts a cooldown. */
  watch(listener: () => void): () => void;
}

const recent = (times: number[], now: number) =>
  times
    .filter((at) => at <= now && now - at < RATE_WINDOW)
    .sort((a, b) => a - b);

/** One tab's own counts, for where storage can't be shared. */
export function memoryRateStore(now: () => number): RateStore {
  const sent = new Map<string, number[]>();
  const cooldowns = new Map<string, number>();
  const cooling = (keys: string[]) =>
    keys.some((key) => now() < (cooldowns.get(key) ?? 0));
  return {
    // Synchronous inside: requests take slots in the order they ask.
    async take(group, limit, keys) {
      if (cooling(keys)) return null;
      const at = now();
      const times = recent(sent.get(group) ?? [], at);
      sent.set(group, times);
      if (times.length >= limit) return times[0] + RATE_WINDOW - at;
      times.push(at);
      return 0;
    },
    cooling,
    cool: (key, until) =>
      cooldowns.set(key, Math.max(until, cooldowns.get(key) ?? 0)),
    watch: () => () => {},
  };
}

const PREFIX = "counterlock.api.";

// What the store needs of the browser's LockManager.
export interface Locks {
  request<T>(name: string, callback: () => T): Promise<T>;
}

/** Runs each request in turn: a lock within this tab only. */
export function serialLocks(): Locks {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    request<T>(_name: string, callback: () => T) {
      const run = queue.then(callback);
      queue = run.catch(() => {});
      return run;
    },
  };
}

/**
 * Counts and cooldowns in `storage`, which every tab and window of the app
 * shares, taken under a lock so two can't both claim the last slot.
 */
export function sharedRateStore(
  storage: Storage,
  locks: Locks,
  now: () => number,
  events: EventTarget,
): RateStore {
  const read = (key: string): unknown => {
    try {
      return JSON.parse(storage.getItem(PREFIX + key) ?? "null");
    } catch {
      return null;
    }
  };
  const until = (key: string) => {
    const value = read(`cooldown.${key}`);
    return typeof value === "number" ? value : 0;
  };
  const cooling = (keys: string[]) => keys.some((key) => now() < until(key));
  return {
    take: (group, limit, keys) =>
      locks.request(`${PREFIX}lock`, () => {
        if (cooling(keys)) return null;
        const at = now();
        const stored = read(`sent.${group}`);
        const times = recent(
          Array.isArray(stored)
            ? stored.filter((t): t is number => typeof t === "number")
            : [],
          at,
        );
        if (times.length >= limit) return times[0] + RATE_WINDOW - at;
        storage.setItem(
          `${PREFIX}sent.${group}`,
          JSON.stringify([...times, at]),
        );
        return 0;
      }),
    cooling,
    cool: (key, value) =>
      storage.setItem(
        `${PREFIX}cooldown.${key}`,
        JSON.stringify(Math.max(value, until(key))),
      ),
    // Storage events reach every other tab and window, not this one.
    watch(listener) {
      const changed = (event: Event) => {
        const key = (event as StorageEvent).key;
        if (key === null || key.startsWith(`${PREFIX}cooldown.`)) listener();
      };
      events.addEventListener("storage", changed);
      return () => events.removeEventListener("storage", changed);
    },
  };
}

/**
 * Shared counts where the browser has storage: every tab of the website and
 * every Overwolf window of the app. Without Web Locks (they need a secure
 * context) the lock only orders this tab's own requests, so two tabs could
 * claim a group's last slot at the same moment. Without storage, this tab's
 * own counts.
 */
export function defaultRateStore(now: () => number): RateStore {
  if (typeof window === "undefined") return memoryRateStore(now);
  try {
    // Storage can be there but refuse writes (blocked, or full).
    const storage = window.localStorage;
    storage.setItem(`${PREFIX}probe`, "1");
    storage.removeItem(`${PREFIX}probe`);
    return sharedRateStore(
      storage,
      navigator.locks ?? serialLocks(),
      now,
      window,
    );
  } catch {
    return memoryRateStore(now);
  }
}
```

- [ ] **Step 4: Use it in the client**

Replace the whole of `src/shared/api/DeadlockApi.ts` with:

```ts
import { RATE_WINDOW, defaultRateStore, type RateStore } from "./rate-store";

export { RATE_WINDOW };

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

// The cooldowns that hold a group back, shared with the app's other tabs and
// windows, as the API counts per IP: everything's, and the group's own when
// the API limits it as a whole. A refused path's stays with this tab.
const sharedKeys = (group: string) =>
  RATE_LIMITS[group] ? [EVERYTHING, group] : [EVERYTHING];

// A request on its way: shared by everyone who asks for its path while it
// is out.
interface Pending {
  promise: Promise<unknown>;
  // Callers still waiting for it; Infinity once one came without a signal.
  callers: number;
  // Aborted when every caller has left while it still waits for room.
  abandon: AbortController;
  queued: boolean;
}

/**
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree.
 */
export class DeadlockApi {
  private cache = new Map<
    string,
    { data: unknown; fetchedAt: number; ttl: number }
  >();
  private inFlight = new Map<string, Pending>();
  // Refused paths' cooldowns.
  private cooldowns = new Map<string, number>();
  // Requests waiting for room: a cooldown wakes them to fail at once.
  private sleepers = new Set<() => void>();
  private sweptAt = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => number = Date.now,
    private wait: (ms: number, signal: AbortSignal) => Promise<void> = (
      ms,
      signal,
    ) =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      }),
    private limits: RateStore = defaultRateStore(now),
  ) {
    // A cooldown another tab started holds back this one's waiting requests.
    limits.watch(() => this.wake());
  }

  /**
   * The response for `path`, cached for `ttlMs`. A caller whose `signal`
   * aborts stops waiting at once; the request itself is dropped only if it
   * hasn't gone out yet and no one else still wants it.
   */
  get<T>(path: string, ttlMs: number, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const saved = this.cache.get(path);
    if (saved && this.now() - saved.fetchedAt < ttlMs)
      return Promise.resolve(saved.data as T);
    let pending = this.inFlight.get(path);
    if (!pending) {
      const group = endpointGroup(path);
      if (this.cooling(path, group)) return Promise.reject(new Error(BUSY));
      pending = this.start(path, group, ttlMs);
    }
    return this.follow(path, pending, signal) as Promise<T>;
  }

  private start(path: string, group: string, ttlMs: number) {
    const pending: Pending = {
      promise: Promise.resolve(),
      callers: 0,
      abandon: new AbortController(),
      queued: true,
    };
    pending.promise = this.send(path, group, pending)
      .then((data) => {
        this.store(path, data, ttlMs);
        return data;
      })
      .finally(() => {
        if (this.inFlight.get(path) === pending) this.inFlight.delete(path);
      });
    this.inFlight.set(path, pending);
    return pending;
  }

  /** The request's answer, for one caller, who may leave early. */
  private follow(path: string, pending: Pending, signal?: AbortSignal) {
    if (!signal) {
      pending.callers = Infinity;
      return pending.promise;
    }
    pending.callers++;
    return new Promise((resolve, reject) => {
      const leave = () => {
        reject(signal.reason);
        if (--pending.callers || !pending.queued) return;
        // No one wants it any more, and it hasn't gone out.
        pending.abandon.abort();
        if (this.inFlight.get(path) === pending) this.inFlight.delete(path);
      };
      signal.addEventListener("abort", leave, { once: true });
      pending.promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", leave));
    });
  }

  private cooling(path: string, group: string) {
    return (
      this.now() < (this.cooldowns.get(path) ?? 0) ||
      this.limits.cooling(sharedKeys(group))
    );
  }

  /** Sends at once, or when the group's rate limit has room. */
  private async send<T>(
    path: string,
    group: string,
    pending: Pending,
  ): Promise<T> {
    const limit = RATE_LIMITS[group];
    if (limit) await this.throttle(path, group, limit, pending.abandon.signal);
    pending.queued = false;
    return this.fetchJson<T>(path, group);
  }

  /**
   * Waits until the group has had fewer than `limit` requests in the window
   * (in every tab), then counts this one. A cooldown that starts while it
   * waits fails it at once, before it takes a slot, as does every caller
   * leaving.
   */
  private async throttle(
    path: string,
    group: string,
    limit: number,
    abandoned: AbortSignal,
  ) {
    for (;;) {
      abandoned.throwIfAborted();
      const wait = await this.limits.take(group, limit, sharedKeys(group));
      if (wait === null) throw new Error(BUSY);
      if (!wait) return;
      await this.pause(wait, abandoned, () => this.cooling(path, group));
    }
  }

  /**
   * Waits `ms`, or less when a cooldown starts or every caller leaves;
   * at once if either happened while the slot was asked for.
   */
  private async pause(
    ms: number,
    abandoned: AbortSignal,
    cooling: () => boolean,
  ) {
    const woken = new AbortController();
    const wake = () => woken.abort();
    this.sleepers.add(wake);
    abandoned.addEventListener("abort", wake);
    try {
      if (abandoned.aborted || cooling()) return;
      await Promise.race([
        this.wait(ms, woken.signal),
        new Promise((resolve) =>
          woken.signal.addEventListener("abort", resolve),
        ),
      ]);
    } finally {
      this.sleepers.delete(wake);
      abandoned.removeEventListener("abort", wake);
      // Clears the timer of a wait cut short.
      woken.abort();
    }
  }

  private wake() {
    for (const wake of [...this.sleepers]) wake();
  }

  private cool(key: string, until: number) {
    if (key === EVERYTHING || RATE_LIMITS[key]) this.limits.cool(key, until);
    else this.cooldowns.set(key, until);
    this.wake();
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
      this.cool(
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

- [ ] **Step 5: Say so on the About page**

In `web/app/routes/about.tsx`:

Replace:

```tsx
        If you pick your Steam account, it is remembered only in this browser
        (in <code>localStorage</code>). Use "Switch account" to clear it.
        Nothing about it is kept on a Counterlock server, because there isn't
        one.
      </p>
      <p>
        Searches and player IDs you enter are sent to Deadlock API to fetch
```

with:

```tsx
        If you pick your Steam account, it is remembered only in this browser
        (in <code>localStorage</code>). Use "Switch account" to clear it.
        Nothing about it is kept on a Counterlock server, because there isn't
        one. The site also keeps the times of its recent requests to Deadlock
        API in <code>localStorage</code>, and any wait the API asked for, so
        that all its open tabs together keep to the API&apos;s rate limits.
      </p>
      <p>
        Searches and player IDs you enter are sent to Deadlock API to fetch
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/shared`
Expected: PASS (44 tests).

Run: `npx playwright test tests/browser/tier-list.spec.ts`
Expected: PASS (9 tests).

Run: `npm test`
Expected: PASS (390 tests).

- [ ] **Step 7: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/shared/api tests/shared/rate-store.test.ts tests/browser/tier-list.spec.ts web/app/routes/about.tsx tests/web-browser/shell.spec.ts
npm run test:browser && npm run test:web
git add src/shared/api tests/shared/rate-store.test.ts tests/browser/tier-list.spec.ts web/app/routes/about.tsx tests/web-browser/shell.spec.ts
git commit -m "feat(api): one rate limit budget for every tab and window of the app"
```

Expected: 149 desktop and 76 website tests pass.

---

### Task 3: The Live statistics and the compact overlay's build go through the shared client

**Files:**
- Modify: `src/features/player-stats/services/StatsClient.ts`
- Modify: `src/features/builds/services/build-analytics.ts`
- Test: `tests/player-stats/StatsClient.test.ts`, `tests/builds/build-analytics.test.ts`

What changes:
- **`StatsClient(api = deadlockApi, now)`** asks `/v1{path}` through the client with `TTL.profile` (its own five minutes), so its rank lookups count against the shared limit and it waits out the shared cooldowns. Its own cooldown and fetch go; its per-account cache stays. Callers (`LiveStore`) don't change.
- **`loadBuild(heroId, signal, api = deadlockApi)`** asks both paths through the client with `TTL.analytics` and the hook's signal; its module cache goes (the client caches both answers). The hook (`useMeasuredBuild`) doesn't change.
- **Tests:** the stats tests build their client on a `DeadlockApi` over the mocked `fetch`. The cooldown test now reads the shared client's rules: after a 429, rank lookups pause for every account, another roster's hero stats (a request of its own) may still be asked for, and once the cooldown ends both go out again. A new build test checks the two paths and that a second load is served from the cache.

- [ ] **Step 1: Write the failing tests**

In `tests/player-stats/StatsClient.test.ts`:

1. Replace:

```ts
import { describe, expect, it, vi } from "vitest";
import { StatsClient } from "@/features/player-stats/services/StatsClient";

describe("stats API", () => {
  it("batches and caches IDs, with a distinct cache for each mode", async () => {
```

with:

```ts
import { describe, expect, it, vi } from "vitest";
import { StatsClient } from "@/features/player-stats/services/StatsClient";
import { DeadlockApi } from "@/shared/api/DeadlockApi";

const client = (request: typeof fetch, now = () => 0) =>
  new StatsClient(new DeadlockApi(request, now), now);

describe("stats API", () => {
  it("batches and caches IDs, with a distinct cache for each mode", async () => {
```

2. Replace:

```ts
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
```

with:

```ts
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
```

3. Replace:

```ts
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
```

with:

```ts
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
```

4. Replace:

```ts
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
```

with:

```ts
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
```

5. Replace:

```ts
        ),
      )
      .mockResolvedValueOnce(new Response("{}"));
    const stats = await new StatsClient(request).load([10], "normal");
    expect(stats[10].heroes).toEqual([]);
    expect(stats[10].rankError).toContain("Unexpected");
  });
```

with:

```ts
        ),
      )
      .mockResolvedValueOnce(new Response("{}"));
    const stats = await client(request).load([10], "normal");
    expect(stats[10].heroes).toEqual([]);
    expect(stats[10].rankError).toContain("Unexpected");
  });
```

In `tests/builds/build-analytics.test.ts`:

1. Replace:

```ts
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  chooseBuild,
  parseBuild,
} from "@/features/builds/services/build-analytics";
const row = {
  hero_id: 77,
  hero_build_id: 100,
```

with:

```ts
import { test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  chooseBuild,
  loadBuild,
  parseBuild,
} from "@/features/builds/services/build-analytics";
import { DeadlockApi } from "@/shared/api/DeadlockApi";
const row = {
  hero_id: 77,
  hero_build_id: 100,
```

2. Replace:

```ts
    ["Early", "Late game", "Situational picks", "Custom group"],
  );
});
```

with:

```ts
    ["Early", "Late game", "Situational picks", "Custom group"],
  );
});

test("builds load through the shared client, which keeps them", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).includes("hero-build-stats")
            ? [row]
            : {
                hero_build: {
                  hero_id: 77,
                  hero_build_id: 100,
                  name: "Build",
                  details: {
                    mod_categories: [
                      { name: "Early", mods: [{ ability_id: 42 }] },
                    ],
                  },
                },
              },
        ),
      ),
  );
  const api = new DeadlockApi(request, () => 0);
  const signal = new AbortController().signal;
  assert.equal((await loadBuild(77, signal, api)).name, "Build");
  assert.deepEqual(
    request.mock.calls.map(([url]) => String(url)),
    [
      "https://api.deadlock-api.com/v1/analytics/hero-build-stats/77?min_matches=20",
      "https://api.deadlock-api.com/v1/builds/77/100",
    ],
  );
  await loadBuild(77, signal, api);
  assert.equal(request.mock.calls.length, 2);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/player-stats/StatsClient.test.ts tests/builds/build-analytics.test.ts`
Expected: FAIL (5 failed, 3 passed: the stats client calls the `DeadlockApi` it is given as `fetch` (`this.request is not a function`), and the build loader fetches by itself, ignoring the client).

- [ ] **Step 3: Use the shared client**

In `src/features/player-stats/services/StatsClient.ts`:

1. Replace:

```ts
import type { HeroStats, PlayerRank, StatsEntry } from "../types";

const BASE = "https://api.deadlock-api.com/v1";
const TTL = 5 * 60_000;
export class StatsClient {
  private cache = new Map<string, StatsEntry>();
  private cooldownUntil = 0;
  constructor(
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
    private now = Date.now,
  ) {}

  private async get(path: string): Promise<unknown[]> {
    if (this.now() < this.cooldownUntil)
      throw new Error("API busy. Retry after the cooldown.");
    const response = await this.request(`${BASE}${path}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get("Retry-After");
      const seconds = header ? Number(header) : NaN;
      const until = Number.isFinite(seconds)
        ? this.now() + seconds * 1000
        : Date.parse(header ?? "");
      this.cooldownUntil = Math.max(
        this.now() + 30_000,
        Number.isFinite(until) ? until : 0,
      );
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Stats unavailable or profile protected."
          : `Stats API unavailable (${response.status}).`,
      );
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("Unexpected stats response.");
    return body;
  }
```

with:

```ts
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HeroStats, PlayerRank, StatsEntry } from "../types";

export class StatsClient {
  private cache = new Map<string, StatsEntry>();
  constructor(
    private api: DeadlockApi = deadlockApi,
    private now = Date.now,
  ) {}

  // Through the app's shared client, so these requests keep to the API's
  // rate limits along with every other, and wait out its cooldowns.
  private async get(path: string): Promise<unknown[]> {
    const body = await this.api.get<unknown>(`/v1${path}`, TTL.profile);
    if (!Array.isArray(body)) throw new Error("Unexpected stats response.");
    return body;
  }
```

2. Replace:

```ts
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const pending = unique.filter((id) => {
      const saved = this.cache.get(`${mode}:${id}`);
      return !saved || this.now() - saved.fetchedAt >= TTL;
    });
    if (pending.length) {
      const params = new URLSearchParams({ account_ids: pending.join(",") });
```

with:

```ts
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const pending = unique.filter((id) => {
      const saved = this.cache.get(`${mode}:${id}`);
      return !saved || this.now() - saved.fetchedAt >= TTL.profile;
    });
    if (pending.length) {
      const params = new URLSearchParams({ account_ids: pending.join(",") });
```

In `src/features/builds/services/build-analytics.ts`:

1. Replace:

```ts
import { categoryName } from "../utils/popular-builds";
export type BuildStats = {
  hero_id: number;
```

with:

```ts
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { categoryName } from "../utils/popular-builds";
export type BuildStats = {
  hero_id: number;
```

2. Replace:

```ts
    throw Error("Build contains no item groups");
  return { stats, name: b.name.slice(0, 200), groups };
}
const cache = new Map<number, { expires: number; value: MeasuredBuild }>();
export async function loadBuild(
  heroId: number,
  signal: AbortSignal,
): Promise<MeasuredBuild> {
  const cached = cache.get(heroId);
  if (cached && cached.expires > Date.now()) return cached.value;
  const get = async (path: string) => {
    const r = await fetch("https://api.deadlock-api.com/v1/" + path, {
      signal,
    });
    if (!r.ok)
      throw Error(
        r.status === 429
          ? "Build service busy; try again later."
          : "Build statistics unavailable.",
      );
    return r.json();
  };
  const stats = chooseBuild(
    await get(`analytics/hero-build-stats/${heroId}?min_matches=20`),
    heroId,
  );
  if (!stats) throw Error("No build has 20 recorded matches for this hero.");
  const value = parseBuild(
    await get(`builds/${heroId}/${stats.hero_build_id}`),
    stats,
  );
  cache.set(heroId, { expires: Date.now() + 300000, value });
  return value;
}
```

with:

```ts
    throw Error("Build contains no item groups");
  return { stats, name: b.name.slice(0, 200), groups };
}
/**
 * The hero's most played build with 20 recorded matches, through the app's
 * shared client, which caches it and keeps to the API's rate limits. When
 * `signal` aborts, the wait ends at once, and a request that hasn't gone
 * out is dropped.
 */
export async function loadBuild(
  heroId: number,
  signal: AbortSignal,
  api: DeadlockApi = deadlockApi,
): Promise<MeasuredBuild> {
  const get = (path: string) =>
    api.get<unknown>(`/v1/${path}`, TTL.analytics, signal);
  const stats = chooseBuild(
    await get(`analytics/hero-build-stats/${heroId}?min_matches=20`),
    heroId,
  );
  if (!stats) throw Error("No build has 20 recorded matches for this hero.");
  return parseBuild(
    await get(`builds/${heroId}/${stats.hero_build_id}`),
    stats,
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/player-stats/StatsClient.test.ts tests/builds/build-analytics.test.ts`
Expected: PASS (8 tests).

Run: `npm test`
Expected: PASS (391 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/player-stats/services/StatsClient.ts src/features/builds/services/build-analytics.ts tests/player-stats/StatsClient.test.ts tests/builds/build-analytics.test.ts
npm run test:browser && npm run test:web
git add src/features/player-stats/services/StatsClient.ts src/features/builds/services/build-analytics.ts tests/player-stats/StatsClient.test.ts tests/builds/build-analytics.test.ts
git commit -m "fix(api): the overlay's stats and the build loader keep to the shared limits"
```

Expected: 149 desktop and 76 website tests pass.

---

### Task 4: A range or hero left before it loads drops the requests it still waits for

**Files:**
- Modify: `src/shared/api/useAsync.ts`
- Modify: `src/features/profile/services/profile-api.ts`
- Modify: `src/features/match-report/services/match-report.ts`
- Modify: `src/features/profile/services/performance-api.ts`
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Modify: `src/features/match-report/components/MatchReportPage.tsx`
- Test: `tests/profile/performance-api.test.ts`, `tests/browser/home.spec.ts`

What changes:
- **`useAsync(load, deps)`** calls `load(signal)` and aborts the signal in the effect's cleanup: on new deps, Retry or unmount. Every existing load takes no argument and is unchanged.
- **A last `signal` parameter** for `fetchRank`, `fetchRankBadges`, `fetchCurrentBadges`, `fetchRankCurve`, `fetchMatchTotals` and `fetchGameAverages`, passed on to the client. Components pass `deadlockApi` for the `api` before it.
- **`fetchMatchTotals`** keeps each match's totals, or `{ path, batch }` while its batch is out. It asks for every batch its games wait for, its own or another call's: the client shares a request still out and counts both callers, so one leaving doesn't take the other's games. A match the API hasn't stored is forgotten, as before; a batch that failed or was dropped stays, and is asked for again.
- **`fetchGameAverages`** starts no more groups once its signal aborts (`eachLimited` checks it before each), and then fails rather than answer.
- **The tab** passes the signal to both loads; **the report** to its current-rank lookup and its curve, so switching "Viewing as" quickly drops a curve still queued.
- **Tests:**
  - **A batch no call waits for:** bulk metadata's 30 a minute are used up; a call's batch waits, and the call leaves. The batch never goes out, and the next call asks for the same batch and gets it.
  - **A batch another call waits for:** one call leaves; a wider call that shares its batch still gets all three games, from two requests.
  - **Groups:** with 12 groups held, a call that leaves has started four, and starts no more.
  - **In the browser:** Last 50 adds eight heroes' curves; while the first four are held, Last 20 is picked again, and the other four are never asked for (checked against a tab that passes no signal: all eight are).

- [ ] **Step 1: Write the failing tests**

In `tests/profile/performance-api.test.ts`:

1. Replace:

```ts
} from "@/features/profile/services/performance-api";
import type { HistoryMatch } from "@/features/profile/types";
import { totalsPath } from "@/features/profile/utils/match-totals";
import { DeadlockApi, TTL } from "@/shared/api/DeadlockApi";
import { rankCurveRows } from "../fixtures/match-report";
import { bulkMatch } from "../fixtures/performance";

```

with:

```ts
} from "@/features/profile/services/performance-api";
import type { HistoryMatch } from "@/features/profile/types";
import { totalsPath } from "@/features/profile/utils/match-totals";
import { DeadlockApi, RATE_WINDOW, TTL } from "@/shared/api/DeadlockApi";
import { rankCurveRows } from "../fixtures/match-report";
import { bulkMatch } from "../fixtures/performance";

```

2. Replace:

```ts
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
```

with:

```ts
  });

  it("shares a request still in flight", async () => {
    const { api, request } = realBulkApi([1, 2], () => 0);
    await Promise.all([
      fetchMatchTotals([1, 2], api),
      fetchMatchTotals([2, 1], api),
    ]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("drops a batch no call waits for any more, and the next asks afresh", async () => {
    vi.useFakeTimers();
    try {
      const { api, request } = realBulkApi([1, 2], Date.now);
      // Bulk metadata allows 30 requests a minute: fill the window.
      await Promise.all(
        range(101, 130).map((id) => fetchMatchTotals([id], api)),
      );
      const left = new AbortController();
      const leaving = fetchMatchTotals([1, 2], api, left.signal);
      left.abort();
      await expect(leaving).rejects.toThrow(/abort/i);
      await vi.advanceTimersByTimeAsync(RATE_WINDOW);
      expect(request).toHaveBeenCalledTimes(30);
      // The next call asks for the same batch, and gets it.
      const later = fetchMatchTotals([1, 2], api);
      await vi.advanceTimersByTimeAsync(0);
      expect((await later).size).toBe(2);
      expect(request).toHaveBeenCalledTimes(31);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a batch another call still waits for", async () => {
    vi.useFakeTimers();
    try {
      const { api, request } = realBulkApi([1, 2, 3], Date.now);
      await Promise.all(
        range(101, 130).map((id) => fetchMatchTotals([id], api)),
      );
      const left = new AbortController();
      const leaving = fetchMatchTotals([1, 2], api, left.signal);
      leaving.catch(() => {});
      // A wider range waits for the same games, and one more.
      const staying = fetchMatchTotals([1, 2, 3], api);
      left.abort();
      await vi.advanceTimersByTimeAsync(RATE_WINDOW);
      expect((await staying).size).toBe(3);
      expect(
        request.mock.calls
          .slice(30)
          .map(([url]) => new URL(String(url)).searchParams.get("match_ids")),
      ).toEqual(["1,2", "3"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves out games the API hasn't stored and asks again next time", async () => {
```

3. Replace:

```ts
    expect(most).toBe(CURVE_CONCURRENCY);
  });

  it("doesn't ask for the current rank when every game has one", async () => {
    const { api, calls } = curveApi(116);
    await fetchGameAverages(77, [game({ matchId: 1 })], api);
```

with:

```ts
    expect(most).toBe(CURVE_CONCURRENCY);
  });

  it("starts no more groups once the call is left", async () => {
    const asked: string[] = [];
    const left = new AbortController();
    const api = {
      get: (path: string, _ttl: number, signal?: AbortSignal) => {
        asked.push(path);
        // Held until the caller leaves.
        return new Promise((_, reject) =>
          signal?.addEventListener("abort", () => reject(signal.reason)),
        );
      },
    } as unknown as DeadlockApi;
    const averages = fetchGameAverages(
      77,
      Array.from({ length: 12 }, (_, i) =>
        game({ matchId: i + 1, heroId: i + 1 }),
      ),
      api,
      left.signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(asked).toHaveLength(CURVE_CONCURRENCY);
    left.abort();
    await expect(averages).rejects.toThrow(/abort/i);
    expect(asked).toHaveLength(CURVE_CONCURRENCY);
  });

  it("doesn't ask for the current rank when every game has one", async () => {
    const { api, calls } = curveApi(116);
    await fetchGameAverages(77, [game({ matchId: 1 })], api);
```

In `tests/browser/home.spec.ts`:

Replace:

```ts
  await expect(status).toHaveText("");
});

test("performance tab says what is still loading", async ({ page }) => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
```

with:

```ts
  await expect(status).toHaveText("");
});

test("performance tab drops the rank averages of a range it has left", async ({
  page,
}) => {
  // Last 50 adds 20 older games on eight more heroes: eight more curves,
  // four of which load at a time.
  const more = catalog.heroes.slice(4, 12).map((hero) => hero.id);
  const older = Array.from({ length: 20 }, (_, i) =>
    historyRow(4000 + i, more[i % 8], 1, 4, true, now - 3600 * (30 + i)),
  );
  const asked: string[] = [];
  let hold: Promise<void> | null = null;
  let release = () => {};
  await storeAccount(page);
  await routeApi(page, {
    history: [...performanceHistory.slice(0, 20), ...older],
    gate: async (url) => {
      if (url.pathname !== "/v1/analytics/player-performance-curve") return;
      asked.push(url.searchParams.get("hero_ids")!);
      await hold;
    },
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const souls = card(page, "Souls / min").locator(".perf-card-numbers");
  await expect(souls).toHaveText("1,100 20 games · rank avg 1,000");
  asked.length = 0;
  hold = new Promise((resolve) => (release = resolve));
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect.poll(() => asked.length).toBe(4);
  // Back to Last 20 before they answer: the four other curves are never
  // asked for.
  await page.getByRole("button", { name: "Last 20", exact: true }).click();
  await expect(view(page).locator(".perf-cards")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  release();
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(4);
  await expect(souls).toHaveText("1,100 20 games · rank avg 1,000");
});

test("performance tab says what is still loading", async ({ page }) => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/performance-api.test.ts`
Expected: FAIL (2 failed, 15 passed: both time out after 5 s, as nothing takes a signal yet. "keeps a batch another call still waits for" already passes: nothing leaves).

Run: `npx playwright test tests/browser/home.spec.ts -g "drops the rank averages"`
Expected: FAIL (all eight curves are asked for: `Received array: ["10", "8", "7", "6", "14", "13", "12", "11"]`).

- [ ] **Step 3: A signal for each load**

In `src/shared/api/useAsync.ts`:

1. Replace:

```ts
const same = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

export function useAsync<T>(
  load: (() => Promise<T>) | null,
  deps: unknown[],
): AsyncState<T> {
  // Each result remembers the deps it was loaded for.
```

with:

```ts
const same = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/**
 * Loads for `deps`. Each load gets a signal, aborted once its result can't
 * be shown any more (new deps, Retry or unmount), so the requests it still
 * waits for can be dropped.
 */
export function useAsync<T>(
  load: ((signal: AbortSignal) => Promise<T>) | null,
  deps: unknown[],
): AsyncState<T> {
  // Each result remembers the deps it was loaded for.
```

2. Replace:

```ts
      return;
    }
    let stale = false;
    setState({ loading: true, key });
    load().then(
      (data) => {
        if (!stale) setState({ data, loading: false, key });
      },
```

with:

```ts
      return;
    }
    let stale = false;
    const left = new AbortController();
    setState({ loading: true, key });
    load(left.signal).then(
      (data) => {
        if (!stale) setState({ data, loading: false, key });
      },
```

3. Replace:

```ts
    );
    return () => {
      stale = true;
    };
  }, key);
  const retry = () => setAttempt((count) => count + 1);
```

with:

```ts
    );
    return () => {
      stale = true;
      left.abort();
    };
  }, key);
  const retry = () => setAttempt((count) => count + 1);
```

- [ ] **Step 4: Pass it through the services**

In `src/features/profile/services/profile-api.ts`:

1. Replace:

```ts
export async function fetchRank(
  id: number,
  api: DeadlockApi = deadlockApi,
): Promise<PlayerRank | null> {
  const data = await api.get<unknown>(
    `/v1/players/rank?account_ids=${id}`,
    TTL.profile,
  );
  const row = rows(data).find(
    (r) =>
```

with:

```ts
export async function fetchRank(
  id: number,
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<PlayerRank | null> {
  const data = await api.get<unknown>(
    `/v1/players/rank?account_ids=${id}`,
    TTL.profile,
    signal,
  );
  const row = rows(data).find(
    (r) =>
```

2. Replace:

```ts
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
```

with:

```ts
export async function fetchRankBadges(
  ids: number[],
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<Map<number, number>> {
  const asked = [...new Set(ids.filter((id) => id > 0))].sort((a, b) => a - b);
  if (!asked.length) return new Map();
  const data = await api.get<unknown>(
    `/v1/players/rank?account_ids=${asked.join(",")}`,
    TTL.profile,
    signal,
  );
  return new Map(
    rows(data).flatMap((r) =>
```

In `src/features/match-report/services/match-report.ts`:

1. Replace:

```ts
export const fetchCurrentBadges = (
  accountIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, number>> => fetchRankBadges(accountIds, api);

/**
 * The hero's rank-average curve for the badge's tier, widened one tier each
```

with:

```ts
export const fetchCurrentBadges = (
  accountIds: number[],
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<Map<number, number>> => fetchRankBadges(accountIds, api, signal);

/**
 * The hero's rank-average curve for the badge's tier, widened one tier each
```

2. Replace:

```ts
  badge: number,
  durationS = 0,
  api: DeadlockApi = deadlockApi,
): Promise<RankCurve> {
  const load = (band: RankBand) =>
    api.get<unknown>(curvePath(heroId, band), TTL.analytics).then(parseCurve);
  const keep = (points: CurvePoint[]) =>
    points.filter((p) => p.samples >= MIN_STEP_SAMPLES);
  const band = rankBand(badge);
```

with:

```ts
  badge: number,
  durationS = 0,
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<RankCurve> {
  const load = (band: RankBand) =>
    api
      .get<unknown>(curvePath(heroId, band), TTL.analytics, signal)
      .then(parseCurve);
  const keep = (points: CurvePoint[]) =>
    points.filter((p) => p.samples >= MIN_STEP_SAMPLES);
  const band = rankBand(badge);
```

Replace the whole of `src/features/profile/services/performance-api.ts` with:

```ts
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
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
// only asks for the games it adds: a match's totals once known, or the batch
// request still out for it.
type Entry = PlayerTotals[] | { path: string; batch: number[] };
const totalsCache = new WeakMap<DeadlockApi, Map<number, Entry>>();

/**
 * Every player's final totals for each match, by match id, from bulk match
 * metadata in batches of TOTALS_BATCH. A match the API hasn't stored yet is
 * missing from the result and asked for again next time; the client keeps
 * each response for TTL.history (two minutes, as match history), so a game
 * just played appears soon after the API stores it.
 *
 * A batch another call already asked for is asked for again: the client
 * shares the request while it's out, and drops it only once no call waits
 * for it, so a call that leaves (`signal`) never takes another's games
 * with it.
 */
export async function fetchMatchTotals(
  matchIds: number[],
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<Map<number, PlayerTotals[]>> {
  const known = totalsCache.get(api) ?? new Map<number, Entry>();
  totalsCache.set(api, known);
  const missing = [...new Set(matchIds)].filter((id) => !known.has(id));
  for (let start = 0; start < missing.length; start += TOTALS_BATCH) {
    const batch = missing.slice(start, start + TOTALS_BATCH);
    const entry = { path: totalsPath(batch), batch };
    for (const id of batch) known.set(id, entry);
  }
  const waiting = new Map<string, number[]>();
  for (const id of matchIds) {
    const entry = known.get(id);
    if (entry && !Array.isArray(entry)) waiting.set(entry.path, entry.batch);
  }
  await Promise.all(
    [...waiting].map(async ([path, batch]) => {
      const matches = parseMatchTotals(
        await api.get<unknown>(path, TTL.history, signal),
      );
      for (const id of batch) {
        const players = matches.get(id);
        const entry = known.get(id);
        if (players) known.set(id, players);
        // Not stored yet: ask again next time.
        else if (entry && !Array.isArray(entry) && entry.path === path)
          known.delete(id);
      }
    }),
  );
  return new Map(
    matchIds.flatMap((id) => {
      const entry = known.get(id);
      return Array.isArray(entry) ? [[id, entry] as const] : [];
    }),
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

/**
 * Runs `run` over the items, at most `limit` at a time, starting no more
 * once `signal` aborts; `run` must not reject.
 */
async function eachLimited<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
  signal?: AbortSignal,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length && !signal?.aborted) await run(items[next++]);
    }),
  );
}

/**
 * Each game's rank averages: the hero's curve for the game's rank, or the
 * player's current rank when the game recorded none. Games of one hero and
 * rank tier share their curve requests; a few groups load at a time, and a
 * failed curve only leaves its own games without an average. It fails as a
 * whole only when no game gets one. Once `signal` aborts it starts no more
 * groups and fails.
 */
export async function fetchGameAverages(
  accountId: number,
  games: HistoryMatch[],
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<GameAverages> {
  const current = games.some((game) => !game.badge)
    ? ((await fetchRank(accountId, api, signal).catch(() => null))?.badge ?? 0)
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
  const load = async (group: HistoryMatch[]) => {
    const results = await Promise.allSettled(
      group.map(async (game) => {
        const curve = await fetchRankCurve(
          game.heroId,
          badge(game),
          game.durationS,
          api,
          signal,
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
  };
  await eachLimited([...groups.values()], CURVE_CONCURRENCY, load, signal);
  signal?.throwIfAborted();
  if (failed.size && !byMatch.size) throw new Error(error);
  return { byMatch, failed, error };
}
```

- [ ] **Step 5: Give it from the tab and the report**

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
import { useState } from "react";
import { deadlockApi } from "@/shared/api/DeadlockApi";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
```

2. Replace:

```tsx
  const heroId = heroes.some((h) => h.heroId === picked) ? picked : null;
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
  // While a new range or hero loads, the cards keep the last games that
```

with:

```tsx
  const heroId = heroes.some((h) => h.heroId === picked) ? picked : null;
  const games = gamesInRange(matches, range, heroId);
  const key = games.map((g) => g.matchId).join(",");
  // A range or hero left before it loads drops the requests it still waits
  // for, so they don't use up the API's rate limits.
  const totals = useAsync(
    games.length
      ? (signal) =>
          fetchMatchTotals(
            games.map((g) => g.matchId),
            deadlockApi,
            signal,
          )
      : null,
    [key],
  );
  const averages = useAsync(
    games.length
      ? (signal) => fetchGameAverages(accountId, games, deadlockApi, signal)
      : null,
    [accountId, key],
  );
  // While a new range or hero loads, the cards keep the last games that
```

In `src/features/match-report/components/MatchReportPage.tsx`:

1. Replace:

```tsx
import { useEffect, useRef, useState } from "react";
import { RouteLink } from "@/app/links";
import { useAsync } from "@/shared/api/useAsync";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
```

with:

```tsx
import { useEffect, useRef, useState } from "react";
import { RouteLink } from "@/app/links";
import { deadlockApi } from "@/shared/api/DeadlockApi";
import { useAsync } from "@/shared/api/useAsync";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
```

2. Replace:

```tsx
    .filter((p) => !p.badge)
    .map((p) => p.accountId);
  const current = useAsync(
    normal && unrecorded.length ? () => fetchCurrentBadges(unrecorded) : null,
    [report.matchId],
  );
  const badge = selected
```

with:

```tsx
    .filter((p) => !p.badge)
    .map((p) => p.accountId);
  const current = useAsync(
    normal && unrecorded.length
      ? (signal) => fetchCurrentBadges(unrecorded, deadlockApi, signal)
      : null,
    [report.matchId],
  );
  const badge = selected
```

3. Replace:

```tsx
  const rank = selected?.badge ? "match" : badge ? "current" : "none";
  // Without a recorded rank, the curve waits for the current one.
  const waiting = !!selected && !selected.badge && current.loading;
  const loaded = useAsync(
    selected && normal && !waiting
      ? () => fetchRankCurve(selected.heroId, badge, report.durationS)
      : null,
    [selected?.heroId, badge, report.durationS, waiting],
  );
```

with:

```tsx
  const rank = selected?.badge ? "match" : badge ? "current" : "none";
  // Without a recorded rank, the curve waits for the current one.
  const waiting = !!selected && !selected.badge && current.loading;
  // A player left before their curve loads drops its requests.
  const loaded = useAsync(
    selected && normal && !waiting
      ? (signal) =>
          fetchRankCurve(
            selected.heroId,
            badge,
            report.durationS,
            deadlockApi,
            signal,
          )
      : null,
    [selected?.heroId, badge, report.durationS, waiting],
  );
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/performance-api.test.ts`
Expected: PASS (17 tests).

Run: `npx playwright test tests/browser/home.spec.ts -g "performance"`
Expected: PASS (21 tests).

Run: `npm test`
Expected: PASS (394 tests).

- [ ] **Step 7: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/shared/api/useAsync.ts src/features/profile src/features/match-report tests/profile/performance-api.test.ts tests/browser/home.spec.ts
npm run test:browser && npm run test:web
git add src/shared/api/useAsync.ts src/features/profile src/features/match-report tests/profile/performance-api.test.ts tests/browser/home.spec.ts
git commit -m "feat(profile): a range or hero left before it loads drops the requests it still waits for"
```

Expected: 150 desktop and 76 website tests pass.

---

### Task 5: One rank rule; a current rank that didn't load says so, with Retry

**Files:**
- Modify: `src/features/match-report/utils/rank-curve.ts`
- Modify: `src/features/profile/utils/performance-metrics.ts`
- Modify: `src/features/profile/services/performance-api.ts`
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Modify: `src/features/match-report/components/MatchReportPage.tsx`
- Modify: `src/features/match-report/components/Verdicts.tsx`
- Test: `tests/match-report/rank-curve.test.ts`, `tests/profile/performance-api.test.ts`, `tests/browser/home.spec.ts`, `tests/browser/match-report.spec.ts`

What changes:
- **`comparedRank(recorded, current)`** in `rank-curve.ts` returns `{ badge, source }`, and `RankSource` moves there from `Verdicts.tsx`, with the report's `"match"` renamed `"game"`. `GameAverage.source` uses it.
- **The tab:** `fetchGameAverages` groups and labels games with `comparedRank`. A failed current-rank lookup still means all ranks, and now sets `GameAverages.rankError`; the tab shows "Current rank unavailable: {error}" with Retry (hidden while older cards are shown, as the other notices are).
- **The report:** `comparedRank` replaces its own fallback. `rankFailed` (the selected player needs a current rank and the lookup failed) gives the note's other ending, " …, and their current rank didn't load.", and Retry, once the curve has loaded. Retry asks again for the current ranks and the curve, as it already did for a failed curve.
- **Tests:**
  - **`comparedRank`:** own rank, then current, then all ranks.
  - **The service** sets `rankError` when the lookup fails, and not when it loads.
  - **The tab** (`failRank` in `routeApi`, read at request time): the notice and the all-ranks note show; after Retry, the current-rank note.
  - **The report:** only the lookup fails, the curve loads at all ranks, and the note says so with Retry; Retry compares the player at their current rank.

- [ ] **Step 1: Write the failing tests**

In `tests/match-report/rank-curve.test.ts`:

1. Replace:

```ts
import {
  MIN_STEP_SAMPLES,
  averageAt,
  curvePath,
  lobbyBadge,
  parseCurve,
```

with:

```ts
import {
  MIN_STEP_SAMPLES,
  averageAt,
  comparedRank,
  curvePath,
  lobbyBadge,
  parseCurve,
```

2. Replace:

```ts

const souls = metricById.get("souls")!;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("rank band", () => {
  it("covers the badge's whole tier, wider on request, clamped to real tiers", () => {
```

with:

```ts

const souls = metricById.get("souls")!;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("compared rank", () => {
  it("is the game's own, else the player's current rank, else all ranks", () => {
    expect(comparedRank(73, 116)).toEqual({ badge: 73, source: "game" });
    expect(comparedRank(0, 116)).toEqual({ badge: 116, source: "current" });
    expect(comparedRank(0, 0)).toEqual({ badge: 0, source: "none" });
  });
});

describe("rank band", () => {
  it("covers the badge's whole tier, wider on request, clamped to real tiers", () => {
```

In `tests/profile/performance-api.test.ts`:

1. Replace:

```ts
    expect(averages.byMatch.get(1)!.source).toBe("none");
  });

  it("falls back to all ranks when the current rank fails to load", async () => {
    const { api, calls } = curveApi(new Error("Deadlock API timed out."));
    const averages = await fetchGameAverages(
      77,
```

with:

```ts
    expect(averages.byMatch.get(1)!.source).toBe("none");
  });

  it("falls back to all ranks when the current rank fails to load, and says why", async () => {
    const { api, calls } = curveApi(new Error("Deadlock API timed out."));
    const averages = await fetchGameAverages(
      77,
```

2. Replace:

```ts
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.byMatch.get(1)!.source).toBe("none");
  });

  it("fails as a whole when every curve fails, so the tab can offer Retry", async () => {
```

with:

```ts
    );
    expect(calls).toContain(curvePath(6, rankBand(0)));
    expect(averages.byMatch.get(1)!.source).toBe("none");
    expect(averages.rankError).toBe("Deadlock API timed out.");
    // A current rank that loaded leaves nothing to say.
    const loaded = await fetchGameAverages(
      77,
      [game({ matchId: 1, badge: 0 })],
      curveApi(116).api,
    );
    expect(loaded.rankError).toBeUndefined();
  });

  it("fails as a whole when every curve fails, so the tab can offer Retry", async () => {
```

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  history?: number | unknown[];
  failFirstHistory?: boolean;
  rank?: unknown;
  heroStats?: unknown[];
  failTotals?: boolean;
  failCurve?: boolean;
```

with:

```ts
  history?: number | unknown[];
  failFirstHistory?: boolean;
  rank?: unknown;
  // Rank lookups fail while it's set.
  failRank?: boolean;
  heroStats?: unknown[];
  failTotals?: boolean;
  failCurve?: boolean;
```

2. Replace:

```ts
      );
    }
    if (url.pathname === "/v1/players/rank")
      return json(
        fixtures.rank ?? [
          { account_id: ACCOUNT, badge: 53, rank: 5, subrank: 3 },
        ],
      );
    if (url.pathname.endsWith("/match-history")) {
      if (fixtures.failFirstHistory && historyRequests++ === 0)
        return json({}, 500);
```

with:

```ts
      );
    }
    if (url.pathname === "/v1/players/rank")
      return fixtures.failRank
        ? json({}, 500)
        : json(
            fixtures.rank ?? [
              { account_id: ACCOUNT, badge: 53, rank: 5, subrank: 3 },
            ],
          );
    if (url.pathname.endsWith("/match-history")) {
      if (fixtures.failFirstHistory && historyRequests++ === 0)
        return json({}, 500);
```

3. Replace:

```ts
  ).toBeVisible();
});

test("performance tab widens a thin rank's average and says so", async ({
  page,
}) => {
```

with:

```ts
  ).toBeVisible();
});

test("performance tab says when the current rank didn't load, and Retry asks again", async ({
  page,
}) => {
  const fixtures = { history: performanceHistory, failRank: true };
  await storeAccount(page);
  await routeApi(page, fixtures);
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const notice = view(page).getByText(
    "Current rank unavailable: Deadlock API unavailable (500).",
  );
  await expect(notice).toBeVisible();
  // Meanwhile, all ranks.
  await expect(
    view(page).getByText(
      "Games without a recorded rank, and no current rank to use, are compared with all ranks.",
    ),
  ).toBeVisible();
  fixtures.failRank = false;
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(
    view(page).getByText(
      "Games without a recorded rank use the player's current rank.",
    ),
  ).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("performance tab widens a thin rank's average and says so", async ({
  page,
}) => {
```

In `tests/browser/match-report.spec.ts`:

Replace:

```ts
  );
});

test("Street Brawl reports say rank averages cover normal matches only", async ({
  page,
}) => {
```

with:

```ts
  );
});

test("a current rank that didn't load leaves all ranks, with Retry", async ({
  page,
}) => {
  let healthy = false;
  const unrecorded = matchMetadata(ACCOUNT);
  delete (unrecorded.match_info.players[0] as Record<string, unknown>)
    .player_rank_data;
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) => route.fulfill({ json: unrecorded, headers: cors }),
  );
  // Only the lookup fails; the curve loads.
  await page.route("https://api.deadlock-api.com/v1/players/rank**", (route) =>
    healthy
      ? route.fulfill({
          json: [{ account_id: ACCOUNT, badge: 116, rank: 11, subrank: 6 }],
          headers: cors,
        })
      : route.fulfill({ status: 500, json: {}, headers: cors }),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  const note = report(page).locator(".report-verdicts + .data-note");
  await expect(note).toHaveText(
    `Compared with the average ${lead.name} at all ranks at the same match length, over the last 30 days. This player's rank isn't recorded for this match, and their current rank didn't load. Retry`,
  );
  healthy = true;
  await note.getByRole("button", { name: "Retry" }).click();
  await expect(note).toHaveText(
    `Compared with the average ${lead.name} at Eternus at the same match length, over the last 30 days. This player's rank isn't recorded for this match, so the average uses their current rank.`,
  );
});

test("Street Brawl reports say rank averages cover normal matches only", async ({
  page,
}) => {
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/match-report/rank-curve.test.ts tests/profile/performance-api.test.ts`
Expected: FAIL (2 failed, 27 passed: `comparedRank is not a function`, and `rankError` is undefined).

Run: `npx playwright test tests/browser/home.spec.ts -g "current rank didn't load"`
Expected: FAIL (no "Current rank unavailable" notice).

Run: `npx playwright test tests/browser/match-report.spec.ts -g "didn't load leaves all ranks"`
Expected: FAIL (the note ends "and there's no current rank to use.", with no Retry).

- [ ] **Step 3: One rule**

In `src/features/match-report/utils/rank-curve.ts`:

Replace:

```ts
  // The tier the player was in, when the band had to be widened.
  widenedFrom?: string;
  points: CurvePoint[];
}

const tierName = (tier: number, ranks: Rank[]) =>
```

with:

```ts
  // The tier the player was in, when the band had to be widened.
  widenedFrom?: string;
  points: CurvePoint[];
}

// Where a rank average's rank came from: the game's own, the player's
// current rank (the game recorded none), or neither (all ranks).
export type RankSource = "game" | "current" | "none";

/**
 * The rank a game is compared at, in the match report as on the
 * Performance tab: the game's own, else the player's current rank, else all
 * ranks (badge 0).
 */
export function comparedRank(
  recorded: number,
  current: number,
): { badge: number; source: RankSource } {
  if (recorded) return { badge: recorded, source: "game" };
  if (current) return { badge: current, source: "current" };
  return { badge: 0, source: "none" };
}

const tierName = (tier: number, ranks: Rank[]) =>
```

In `src/features/profile/utils/performance-metrics.ts`:

1. Replace:

```ts
  averageAt,
  type RankBand,
  type RankCurve,
} from "@/features/match-report/utils/rank-curve";
import type { HistoryMatch } from "../types";
import { isSummaryMatch, isWin } from "./match-history";
```

with:

```ts
  averageAt,
  type RankBand,
  type RankCurve,
  type RankSource,
} from "@/features/match-report/utils/rank-curve";
import type { HistoryMatch } from "../types";
import { isSummaryMatch, isWin } from "./match-history";
```

2. Replace:

```ts
  band: RankBand;
  // The tier the game was in, when the band had to be widened.
  widenedFrom?: string;
  // The game's own rank, the player's current rank (the game recorded
  // none), or neither (all ranks).
  source: "game" | "current" | "none";
  // Each stat's rank average at the game's length; missing past the
  // curve's end or without a length.
  values: Partial<Record<MetricId, number>>;
```

with:

```ts
  band: RankBand;
  // The tier the game was in, when the band had to be widened.
  widenedFrom?: string;
  source: RankSource;
  // Each stat's rank average at the game's length; missing past the
  // curve's end or without a length.
  values: Partial<Record<MetricId, number>>;
```

- [ ] **Step 4: Use it on the tab, and say when the current rank didn't load**

In `src/features/profile/services/performance-api.ts`:

1. Replace:

```ts
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import { curvePath, rankBand } from "@/features/match-report/utils/rank-curve";
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HistoryMatch } from "../types";
import {
```

with:

```ts
import { fetchRankCurve } from "@/features/match-report/services/match-report";
import {
  comparedRank,
  curvePath,
  rankBand,
} from "@/features/match-report/utils/rank-curve";
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import type { HistoryMatch } from "../types";
import {
```

2. Replace:

```ts
  failed: Set<number>;
  // A failure's message, for the notice.
  error?: string;
}

/**
```

with:

```ts
  failed: Set<number>;
  // A failure's message, for the notice.
  error?: string;
  // Why the player's current rank didn't load: games without a recorded
  // rank are then compared with all ranks.
  rankError?: string;
}

/**
```

3. Replace:

```ts
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<GameAverages> {
  const current = games.some((game) => !game.badge)
    ? ((await fetchRank(accountId, api, signal).catch(() => null))?.badge ?? 0)
    : 0;
  const badge = (game: HistoryMatch) => game.badge || current;
  const groups = new Map<string, HistoryMatch[]>();
  for (const game of games) {
    // Games that ask for the same curve form a group.
    const key = curvePath(game.heroId, rankBand(badge(game)));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(game);
  }
```

with:

```ts
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<GameAverages> {
  let rankError: string | undefined;
  const current = games.some((game) => !game.badge)
    ? await fetchRank(accountId, api, signal).then(
        (rank) => rank?.badge ?? 0,
        (error: unknown) => {
          rankError = error instanceof Error ? error.message : String(error);
          return 0;
        },
      )
    : 0;
  const rank = (game: HistoryMatch) => comparedRank(game.badge, current);
  const groups = new Map<string, HistoryMatch[]>();
  for (const game of games) {
    // Games that ask for the same curve form a group.
    const key = curvePath(game.heroId, rankBand(rank(game).badge));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(game);
  }
```

4. Replace:

```ts
  const load = async (group: HistoryMatch[]) => {
    const results = await Promise.allSettled(
      group.map(async (game) => {
        const curve = await fetchRankCurve(
          game.heroId,
          badge(game),
          game.durationS,
          api,
          signal,
        );
        const source = game.badge ? "game" : badge(game) ? "current" : "none";
        byMatch.set(game.matchId, gameAverage(curve, game.durationS, source));
      }),
    );
```

with:

```ts
  const load = async (group: HistoryMatch[]) => {
    const results = await Promise.allSettled(
      group.map(async (game) => {
        const { badge, source } = rank(game);
        const curve = await fetchRankCurve(
          game.heroId,
          badge,
          game.durationS,
          api,
          signal,
        );
        byMatch.set(game.matchId, gameAverage(curve, game.durationS, source));
      }),
    );
```

5. Replace:

```ts
  await eachLimited([...groups.values()], CURVE_CONCURRENCY, load, signal);
  signal?.throwIfAborted();
  if (failed.size && !byMatch.size) throw new Error(error);
  return { byMatch, failed, error };
}
```

with:

```ts
  await eachLimited([...groups.values()], CURVE_CONCURRENCY, load, signal);
  signal?.throwIfAborted();
  if (failed.size && !byMatch.size) throw new Error(error);
  return { byMatch, failed, error, rankError };
}
```

In `src/features/profile/components/PerformanceTab.tsx`:

Replace:

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
          {/* Games without a recorded rank are meanwhile compared with all
              ranks; Retry asks for the current rank again. */}
          {!stale && averages.data?.rankError && (
            <p className="notice warning" role="status">
              Current rank unavailable: {averages.data.rankError}
              <button type="button" onClick={averages.retry}>
                Retry
              </button>
            </p>
          )}
          <div className="performance-legend" aria-hidden="true">
            <span>
              <i className="value" />
```

- [ ] **Step 5: Use it in the report, with Retry**

In `src/features/match-report/components/MatchReportPage.tsx`:

1. Replace:

```tsx
  optionLabel,
  viewNote,
} from "../utils/perspective";
import { NORMAL_MODE, type MatchReport } from "../utils/report";
import { CopyLinkButton } from "./CopyLinkButton";
import { PlayerInsights } from "./PlayerInsights";
```

with:

```tsx
  optionLabel,
  viewNote,
} from "../utils/perspective";
import { comparedRank } from "../utils/rank-curve";
import { NORMAL_MODE, type MatchReport } from "../utils/report";
import { CopyLinkButton } from "./CopyLinkButton";
import { PlayerInsights } from "./PlayerInsights";
```

2. Replace:

```tsx
      : null,
    [report.matchId],
  );
  const badge = selected
    ? selected.badge || (current.data?.get(selected.accountId) ?? 0)
    : 0;
  const rank = selected?.badge ? "match" : badge ? "current" : "none";
  // Without a recorded rank, the curve waits for the current one.
  const waiting = !!selected && !selected.badge && current.loading;
  // A player left before their curve loads drops its requests.
  const loaded = useAsync(
    selected && normal && !waiting
```

with:

```tsx
      : null,
    [report.matchId],
  );
  const { badge, source: rank } = comparedRank(
    selected?.badge ?? 0,
    (selected && current.data?.get(selected.accountId)) ?? 0,
  );
  // Without a recorded rank, the curve waits for the current one.
  const waiting = !!selected && !selected.badge && current.loading;
  // ...and a lookup that failed leaves all ranks, with Retry.
  const rankFailed = !!selected && !selected.badge && !!current.error;
  // A player left before their curve loads drops its requests.
  const loaded = useAsync(
    selected && normal && !waiting
```

3. Replace:

```tsx
          curve={curve}
          normal={normal}
          rank={rank}
        />
      )}
      <SectionHeader title="Graph" />
```

with:

```tsx
          curve={curve}
          normal={normal}
          rank={rank}
          rankFailed={rankFailed}
        />
      )}
      <SectionHeader title="Graph" />
```

In `src/features/match-report/components/Verdicts.tsx`:

1. Replace:

```tsx
import { clock, percent } from "../utils/format";
import { verdicts } from "../utils/insights";
import { heroName } from "../utils/perspective";
import type { RankCurve } from "../utils/rank-curve";
import type { ReportPlayer } from "../utils/report";

// Where the player's rank came from: the match, their current rank (the
// match recorded none), or neither (all ranks).
export type RankSource = "match" | "current" | "none";

export function curveNote(
  hero: string,
```

with:

```tsx
import { clock, percent } from "../utils/format";
import { verdicts } from "../utils/insights";
import { heroName } from "../utils/perspective";
import type { RankCurve, RankSource } from "../utils/rank-curve";
import type { ReportPlayer } from "../utils/report";

export function curveNote(
  hero: string,
```

2. Replace:

```tsx
  normal: boolean,
  durationS: number,
  rank: RankSource,
) {
  if (!normal) return "Rank averages cover normal matches only.";
  if (curve.loading) return "Loading the rank average…";
```

with:

```tsx
  normal: boolean,
  durationS: number,
  rank: RankSource,
  // The player's current rank was needed but didn't load.
  rankFailed = false,
) {
  if (!normal) return "Rank averages cover normal matches only.";
  if (curve.loading) return "Loading the rank average…";
```

3. Replace:

```tsx
    (rank === "current"
      ? " This player's rank isn't recorded for this match, so the average uses their current rank."
      : rank === "none"
        ? " This player's rank isn't recorded for this match, and there's no current rank to use."
        : "");
  if (!points.length)
    return `Too few ${hero} games at ${band.label} in the last 30 days.${notes}`;
```

with:

```tsx
    (rank === "current"
      ? " This player's rank isn't recorded for this match, so the average uses their current rank."
      : rank === "none"
        ? rankFailed
          ? " This player's rank isn't recorded for this match, and their current rank didn't load."
          : " This player's rank isn't recorded for this match, and there's no current rank to use."
        : "");
  if (!points.length)
    return `Too few ${hero} games at ${band.label} in the last 30 days.${notes}`;
```

4. Replace:

```tsx
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

with:

```tsx
  curve,
  normal,
  rank,
  rankFailed,
}: {
  player: ReportPlayer;
  durationS: number;
  curve: AsyncState<RankCurve>;
  rank: RankSource;
  rankFailed: boolean;
  normal: boolean;
}) {
  const hero = heroName(player.heroId);
```

5. Replace:

```tsx
        ))}
      </div>
      <p className="data-note">
        {curveNote(hero, curve, normal, durationS, rank)}
        {curve.error && (
          <>
            {" "}
            <button type="button" className="retry" onClick={curve.retry}>
```

with:

```tsx
        ))}
      </div>
      <p className="data-note">
        {curveNote(hero, curve, normal, durationS, rank, rankFailed)}
        {/* The curve's Retry also asks again for the current rank. */}
        {(curve.error || (rankFailed && !curve.loading)) && (
          <>
            {" "}
            <button type="button" className="retry" onClick={curve.retry}>
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/match-report/rank-curve.test.ts tests/profile/performance-api.test.ts`
Expected: PASS (29 tests).

Run: `npx playwright test tests/browser/home.spec.ts tests/browser/match-report.spec.ts -g "rank"`
Expected: PASS (23 tests).

Run: `npm test`
Expected: PASS (395 tests).

- [ ] **Step 7: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/match-report src/features/profile tests/match-report/rank-curve.test.ts tests/profile/performance-api.test.ts tests/browser/home.spec.ts tests/browser/match-report.spec.ts
npm run test:browser && npm run test:web
git add src/features/match-report src/features/profile tests/match-report/rank-curve.test.ts tests/profile/performance-api.test.ts tests/browser/home.spec.ts tests/browser/match-report.spec.ts
git commit -m "fix(match-report): one rank rule for the report and the tab; a current rank that didn't load offers Retry"
```

Expected: 152 desktop and 76 website tests pass.

---

### Task 6: No Impact share of a team total of 0

**Files:**
- Modify: `src/features/match-report/utils/insights.ts`
- Modify: `src/features/match-report/components/PlayerInsights.tsx`
- Test: `tests/match-report/insights.test.ts`, `tests/browser/match-report.spec.ts`

The report showed 0% where the tab leaves the game out of that share (owner's choice: "—"). `ImpactRow.share` and kill participation's `share` become `number | null`, null when the team's total is 0; the report shows "—" and an empty bar. "{n} of {total} team kills" stays.

- [ ] **Step 1: Write the failing tests**

In `tests/match-report/insights.test.ts`:

Replace:

```ts
      involved: 14,
      teamKills: 28,
    });
  });
});

```

with:

```ts
      involved: 14,
      teamKills: 28,
    });
  });

  it("gives no share where the team's total is 0", () => {
    // No one healed and no one killed; the damage is as before.
    const quiet = report.players.map((p) => ({
      ...p,
      kills: 0,
      assists: 0,
      values: { ...p.values, healing: p.values.healing.map(() => 0) },
    }));
    const { rows, killParticipation } = impact(quiet[0], quiet);
    expect(rows[0].share).toBeCloseTo(18000 / 87000);
    expect(rows[2].share).toBeNull();
    expect(killParticipation.share).toBeNull();
  });
});

```

In `tests/browser/match-report.spec.ts`:

Replace:

```ts
  await expect(r.locator(".report-stats.buffs dt").nth(1)).toHaveText(
    `Avg ${lead.name} at Emissary`,
  );
});

test("Viewing as another player switches every perspective-dependent part", async ({
```

with:

```ts
  await expect(r.locator(".report-stats.buffs dt").nth(1)).toHaveText(
    `Avg ${lead.name} at Emissary`,
  );
});

test("Impact gives no share of a team total of 0", async ({ page }) => {
  const metadata = matchMetadata(ACCOUNT);
  for (const player of metadata.match_info.players)
    for (const snapshot of player.stats) snapshot.player_healing = 0;
  await openWith(page, metadata);
  await expect(report(page).locator(".impact-row b")).toHaveText([
    "21% 18.0K",
    "29% 3.0K",
    "— 0",
  ]);
});

test("Viewing as another player switches every perspective-dependent part", async ({
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/match-report/insights.test.ts`
Expected: FAIL (1 failed, 17 passed: `expected +0 to be null`).

Run: `npx playwright test tests/browser/match-report.spec.ts -g "Impact gives no share"`
Expected: FAIL (the healing row reads "0% 0").

- [ ] **Step 3: No share of nothing**

In `src/features/match-report/utils/insights.ts`:

1. Replace:

```ts

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
```

with:

```ts

export interface ImpactRow {
  label: string;
  // Null when the team's total is 0: there is no share of nothing.
  share: number | null;
  value: number;
}

/**
 * The player's share of their team's totals, and their kill participation;
 * no share where the team's total is 0, as on the Performance tab, which
 * leaves such a game out.
 */
export function impact(player: ReportPlayer, players: ReportPlayer[]) {
  const team = players.filter((p) => p.team === player.team);
  const share = (id: MetricId, label: string): ImpactRow => {
    const value = finalValue(player, id);
    const total = team.reduce((sum, p) => sum + finalValue(p, id), 0);
    return { label, value, share: total > 0 ? value / total : null };
  };
  const teamKills = team.reduce((sum, p) => sum + p.kills, 0);
  return {
```

2. Replace:

```ts
      share:
        teamKills > 0
          ? Math.min(1, (player.kills + player.assists) / teamKills)
          : 0,
      involved: player.kills + player.assists,
      teamKills,
    },
```

with:

```ts
      share:
        teamKills > 0
          ? Math.min(1, (player.kills + player.assists) / teamKills)
          : null,
      involved: player.kills + player.assists,
      teamKills,
    },
```

In `src/features/match-report/components/PlayerInsights.tsx`:

1. Replace:

```tsx
  const pickups = buffs(player, report.durationS, curve);
  const lines = stretches(player, curve);
  const compared = lines.some((s) => s.label === "Strongest");
  const bar = (share: number) =>
    `${Math.min(share / BAR_FULL_SHARE, 1) * 100}%`;
  return (
    <div className="report-cols">
      <div>
```

with:

```tsx
  const pickups = buffs(player, report.durationS, curve);
  const lines = stretches(player, curve);
  const compared = lines.some((s) => s.label === "Strongest");
  const bar = (share: number | null) =>
    `${Math.min((share ?? 0) / BAR_FULL_SHARE, 1) * 100}%`;
  const shareText = (share: number | null) =>
    share === null ? "—" : percent(share);
  return (
    <div className="report-cols">
      <div>
```

2. Replace:

```tsx
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
```

with:

```tsx
                <u style={{ left: bar(EVEN_SHARE) }} />
              </span>
              <b>
                {shareText(row.share)} <small>{compact(row.value)}</small>
              </b>
            </div>
          ))}
          <p className="impact-kp">
            <span>Kill participation</span>
            <b>{shareText(killParticipation.share)}</b>
            <small>
              {killParticipation.involved} of {killParticipation.teamKills} team
              kills
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/match-report/insights.test.ts`
Expected: PASS (18 tests).

Run: `npx playwright test tests/browser/match-report.spec.ts`
Expected: PASS (32 tests).

Run: `npm test`
Expected: PASS (396 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/match-report/utils/insights.ts src/features/match-report/components/PlayerInsights.tsx tests/match-report/insights.test.ts tests/browser/match-report.spec.ts
npm run test:browser && npm run test:web
git add src/features/match-report/utils/insights.ts src/features/match-report/components/PlayerInsights.tsx tests/match-report/insights.test.ts tests/browser/match-report.spec.ts
git commit -m "fix(match-report): no Impact share of a team total of 0, as on the Performance tab"
```

Expected: 153 desktop and 76 website tests pass.

---

### Task 7: No share trends over games on more than one hero

**Files:**
- Modify: `src/features/profile/utils/performance-metrics.ts`
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Test: `tests/profile/performance-metrics.test.ts`, `tests/browser/home.spec.ts`

A share has no rank average to take the hero out of it, so over a mix of heroes its trend can follow the mix (from a healer to a carry, healing share slips) rather than form (owner's choice: hide it).
- **`summarizeMetric`** sets `heroMix` for a metric without a rank average whose games with a value are of more than one hero, and then gives no trend.
- **The card** shows no "Too few games" for it either; **the notes** add "Kill participation and the shares show no trend over games on more than one hero: a change of hero moves them more than form does." when any card has `heroMix`.
- **Tests:**
  - **The unit test** switches the last three of six games to another hero: kill participation loses its trend while souls (with a rank average) keeps "improving".
  - **The main browser test:** on all heroes (two in range) kill participation has no trend and the note shows; on one hero it is flat and the note goes.
  - **The partial-failure tests:** the share-trend check moves from "keeps the rank averages that loaded" (two heroes in range, so no share trend now) to "keeps the trends a failed curve doesn't touch", where the games with match details are all one hero's.

- [ ] **Step 1: Write the failing tests**

In `tests/profile/performance-metrics.test.ts`:

Replace:

```ts
    );
    expect(summary.points.map((p) => p.average)).toEqual(Array(6).fill(null));
    expect(summary.trend).toBe("improving");
  });

  it("leaves out games without totals", () => {
```

with:

```ts
    );
    expect(summary.points.map((p) => p.average)).toEqual(Array(6).fill(null));
    expect(summary.trend).toBe("improving");
    expect(summary.heroMix).toBe(false);
  });

  it("has no share trend over games on more than one hero", () => {
    const totals = (id: number) =>
      gameTotals(
        parseMatchTotals([
          bulkMatch(id, 77, { kills: id > 3 ? 20 : 2, assists: 0 }),
        ]).get(id),
        77,
      );
    // The same games, the last three on another hero: from a support to a
    // carry, say, which alone could lift kill participation.
    const switched = games.map((game, i) =>
      i > 2 ? { ...game, heroId: 7 } : game,
    );
    const share = summarizeMetric(
      metric("killParticipation"),
      switched,
      totals,
      () => average,
    );
    expect(share.trend).toBeNull();
    expect(share.heroMix).toBe(true);
    // A rank average takes the hero out of the comparison.
    const souls = summarizeMetric(
      metric("soulsPerMin"),
      switched,
      () => undefined,
      () => average,
    );
    expect(souls.trend).toBe("improving");
    expect(souls.heroMix).toBe(false);
  });

  it("leaves out games without totals", () => {
```

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  await expect(
    card(page, "Healing share").locator(".perf-card-numbers"),
  ).toHaveText("21% 20 games · no rank average");

  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
```

with:

```ts
  await expect(
    card(page, "Healing share").locator(".perf-card-numbers"),
  ).toHaveText("21% 20 games · no rank average");
  // Two heroes' games: the shares claim no trend, and say why.
  const mix =
    "Kill participation and the shares show no trend over games on more than one hero: a change of hero moves them more than form does.";
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveCount(0);
  await expect(view(page).getByText(mix)).toBeVisible();

  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
```

2. Replace:

```ts
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "1,050 20 games · rank avg 1,000",
  );
});

/** Match ids whose report metadata the page asks for. */
```

with:

```ts
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "1,050 20 games · rank avg 1,000",
  );
  // One hero's games: the shares have their trend.
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveText("– Flat");
  await expect(view(page).getByText(mix)).toHaveCount(0);
});

/** Match ids whose report metadata the page asks for. */
```

3. Replace:

```ts
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
```

with:

```ts
  await expect(souls.locator(".perf-card-numbers")).toContainText(
    "20 games · 10 with a rank average",
  );
  // No trend from the games that kept their average.
  await expect(souls.locator(".perf-trend")).toHaveCount(0);
  const asked = curves.length;
  failCurveFor.clear();
  await notice.getByRole("button", { name: "Retry" }).click();
```

4. Replace:

```ts
  await expect(damage.locator(".perf-trend")).toHaveText("– Flat");
  // Souls has heroes[1]'s games, so it claims no trend.
  await expect(card(page, "Souls / min").locator(".perf-trend")).toHaveCount(0);
});

test("performance tab doesn't call failed averages missing", async ({
```

with:

```ts
  await expect(damage.locator(".perf-trend")).toHaveText("– Flat");
  // Souls has heroes[1]'s games, so it claims no trend.
  await expect(card(page, "Souls / min").locator(".perf-trend")).toHaveCount(0);
  // The shares, which have no rank average, keep theirs: their games with
  // match details are all heroes[0]'s.
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveText("– Flat");
});

test("performance tab doesn't call failed averages missing", async ({
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/performance-metrics.test.ts`
Expected: FAIL (2 failed, 23 passed: `heroMix` is undefined, and the switched games still show "improving").

Run: `npx playwright test tests/browser/home.spec.ts -g "compares each metric"`
Expected: FAIL (kill participation still shows a trend on all heroes).

- [ ] **Step 3: No trend over a mix of heroes**

In `src/features/profile/utils/performance-metrics.ts`:

1. Replace:

```ts
  average: number | null;
  comparedValue: number | null;
  compared: number;
  // Null with fewer than MIN_TREND_GAMES games to compare.
  trend: Trend | null;
}

const ratio = (parts: Fraction[], minDenominator = 0) => {
```

with:

```ts
  average: number | null;
  comparedValue: number | null;
  compared: number;
  // Null with fewer than MIN_TREND_GAMES games to compare, or with
  // `heroMix`.
  trend: Trend | null;
  // A metric without a rank average over games on more than one hero: a
  // change of hero moves it as much as form does, so it claims no trend.
  heroMix: boolean;
}

const ratio = (parts: Fraction[], minDenominator = 0) => {
```

2. Replace:

```ts
  });
  const valued = rows.filter((row) => row.value);
  const compared = valued.filter((row) => row.average);
  const samples = metric.average
    ? compared.flatMap(({ value, average }) => {
        const avg = divide(average!);
```

with:

```ts
  });
  const valued = rows.filter((row) => row.value);
  const compared = valued.filter((row) => row.average);
  const heroMix =
    !metric.average && new Set(valued.map((row) => row.game.heroId)).size > 1;
  const samples = metric.average
    ? compared.flatMap(({ value, average }) => {
        const avg = divide(average!);
```

3. Replace:

```ts
      floor,
    ),
    compared: compared.length,
    trend: trend(samples),
  };
}
```

with:

```ts
      floor,
    ),
    compared: compared.length,
    trend: heroMix ? null : trend(samples),
    heroMix,
  };
}
```

In `src/features/profile/components/PerformanceTab.tsx`:

1. Replace:

```tsx
                  ? // Like with like: the player over the same games.
                    ` · ${compared} with a rank average: ${format(metric, comparedValue!)} vs ${format(metric, average)}`
                  : ` · rank avg ${format(metric, average)}`);
  // No badge while what the trend needs loads or failed, or when no game
  // has a rank average to follow.
  const tooFew =
    !trend &&
    !waiting &&
    !failed &&
    games > 0 &&
    (!metric.average || average !== null);
  const describe = (p: GamePoint) => ({
```

with:

```tsx
                  ? // Like with like: the player over the same games.
                    ` · ${compared} with a rank average: ${format(metric, comparedValue!)} vs ${format(metric, average)}`
                  : ` · rank avg ${format(metric, average)}`);
  // No badge while what the trend needs loads or failed, when no game has
  // a rank average to follow, or over a mix of heroes.
  const tooFew =
    !trend &&
    !waiting &&
    !failed &&
    !summary.heroMix &&
    games > 0 &&
    (!metric.average || average !== null);
  const describe = (p: GamePoint) => ({
```

2. Replace:

```tsx
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
```

with:

```tsx
  games: HistoryMatch[],
  totals: Map<number, PlayerTotals[]> | undefined,
  averages: GameAverages | undefined,
  summaries: MetricSummary[],
) {
  const lines = [
    "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days.",
    "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat.",
    "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals.",
  ];
  if (summaries.some((summary) => summary.heroMix))
    lines.push(
      "Kill participation and the shares show no trend over games on more than one hero: a change of hero moves them more than form does.",
    );
  const loaded = [...(averages?.byMatch.values() ?? [])];
  const sources = new Set(loaded.map((a) => a.source));
  if (sources.has("current"))
```

3. Replace:

```tsx
            shown.games,
            shown.totals.data,
            shown.averages.data,
          ).map((line) => (
            <p key={line} className="data-note">
              {line}
```

with:

```tsx
            shown.games,
            shown.totals.data,
            shown.averages.data,
            summaries,
          ).map((line) => (
            <p key={line} className="data-note">
              {line}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/performance-metrics.test.ts`
Expected: PASS (25 tests).

Run: `npx playwright test tests/browser/home.spec.ts -g "performance"`
Expected: PASS (22 tests).

Run: `npm test`
Expected: PASS (397 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile/utils/performance-metrics.ts src/features/profile/components/PerformanceTab.tsx tests/profile/performance-metrics.test.ts tests/browser/home.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/utils/performance-metrics.ts src/features/profile/components/PerformanceTab.tsx tests/profile/performance-metrics.test.ts tests/browser/home.spec.ts
git commit -m "feat(profile): no share trends over games on more than one hero"
```

Expected: 153 desktop and 76 website tests pass.

---

### Task 8: Five cards a row where there is room; room for "Updating…"

**Files:**
- Modify: `src/features/profile/styles/profile.css`
- Test: `tests/browser/home.spec.ts`, `tests/web-browser/mobile.spec.ts`

What changes, in CSS only:
- **`.performance`** becomes the size container (`.perf-cards` was), so the grid itself can change its columns: five from 1100 px, four, two up to 900 px, one up to 480 px. The ten cards then run 5 and 5: each share under its per-minute card, kill participation under K/D/A.
- **Each card** is a flex column with its chart at the foot (`margin-top: auto`; the numbers keep 6 px below them), so a row's charts line up when one title wraps to two lines.
- **The status** keeps `min-width: 5.25em` (63 px at its 12 px) where the container has 400 px or more, so the Hero select takes the next line rather than squeeze "Updating…". Its `font-size` moves from the span to the status, so the `em` is the text's.
- **Tests:**
  - **Desktop:** five columns at 1260 px, with the four pairs above one another and the first row's charts at one height (its "Objective damage / min" title wraps); four at 1100 px; two at 850 px.
  - **Website:** "Updating…" fits at 375, 414, 530, 560, 585, 640 and 800 px, and the range buttons stay on one line. Match details fail once and the Retry is held, so the status shows.

- [ ] **Step 1: Write the failing tests**

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  ).toBeVisible();
});

test("performance cards sit in four columns, two on a narrower window", async ({
  page,
}) => {
  await storeAccount(page);
```

with:

```ts
  ).toBeVisible();
});

test("performance cards sit in five columns when wide, then four, then two", async ({
  page,
}) => {
  await storeAccount(page);
```

2. Replace:

```ts
        (cards) =>
          new Set(cards.map((card) => card.getBoundingClientRect().left)).size,
      );
  expect(await columns()).toBe(4);
  await page.setViewportSize({ width: 850, height: 800 });
  await expect.poll(columns).toBe(2);
});
```

with:

```ts
        (cards) =>
          new Set(cards.map((card) => card.getBoundingClientRect().left)).size,
      );
  expect(await columns()).toBe(5);
  // Each share under its per-minute card, kill participation under K/D/A.
  const left = (label: string) =>
    card(page, label).evaluate((el) => el.getBoundingClientRect().left);
  for (const [above, below] of [
    ["K/D/A ratio", "Kill participation"],
    ["Hero damage / min", "Hero damage share"],
    ["Objective damage / min", "Objective damage share"],
    ["Healing / min", "Healing share"],
  ])
    expect(await left(below)).toBe(await left(above));
  // A title takes two lines ("Objective damage / min"), yet the first
  // row's charts line up.
  const tops = await view(page)
    .locator(".perf-card .sparkline")
    .evaluateAll((charts) =>
      charts.slice(0, 5).map((chart) => chart.getBoundingClientRect().top),
    );
  expect(new Set(tops).size).toBe(1);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(columns).toBe(4);
  await page.setViewportSize({ width: 850, height: 800 });
  await expect.poll(columns).toBe(2);
});
```

In `tests/web-browser/mobile.spec.ts`:

1. Replace:

```ts
import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { FARGO, mockApi } from "./fixtures";

const SCROLLERS = ".hero-table-wrap, .report-table-wrap, .skill-order";
const clipped = (page: Page, limit: number) =>
```

with:

```ts
import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { FARGO, cors, mockApi } from "./fixtures";

const SCROLLERS = ".hero-table-wrap, .report-table-wrap, .skill-order";
const clipped = (page: Page, limit: number) =>
```

2. Replace:

```ts
    await tip.getByRole("link", { name: "Match report" }).tap();
    await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  });
});

test.describe("phone width (375px)", () => {
```

with:

```ts
    await tip.getByRole("link", { name: "Match report" }).tap();
    await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  });
});

test("Updating… is never cut short beside the Performance range buttons", async ({
  page,
}) => {
  await mockApi(page);
  // Match details fail once; the Retry is then held, so the cards stay and
  // the status shows.
  let asked = 0;
  await page.route(
    "https://api.deadlock-api.com/v1/matches/metadata**",
    async (route) => {
      if (asked++ === 0)
        return route.fulfill({ status: 500, json: {}, headers: cors });
      await new Promise(() => {});
    },
  );
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Performance" }).click();
  await page.getByRole("button", { name: "Retry" }).click();
  const status = page.locator(".perf-status span");
  await expect(status).toHaveText("Updating…");
  // Between about 530 and 585 px the Hero select used to squeeze it.
  for (const width of [375, 414, 530, 560, 585, 640, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => status.evaluate((el) => el.scrollWidth <= el.clientWidth), {
        message: `at ${width} px`,
      })
      .toBe(true);
    // The range buttons stay on one line.
    expect(
      (await page.locator(".perf-range .filter-buttons").boundingBox())!.height,
    ).toBeLessThan(40);
  }
});

test.describe("phone width (375px)", () => {
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/home.spec.ts -g "five columns"`
Expected: FAIL (`Expected: 5`, `Received: 4`).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/mobile.spec.ts -g "never cut short"`
Expected: FAIL (`at 530 px`: the text is cut short).

- [ ] **Step 3: Style it**

In `src/features/profile/styles/profile.css`:

1. Replace:

```css
  color: var(--dim);
}
.performance {
  display: grid;
  gap: 12px;
}
```

with:

```css
  color: var(--dim);
}
.performance {
  container-type: inline-size;
  display: grid;
  gap: 12px;
}
```

2. Replace:

```css
  align-self: stretch;
  min-width: 0;
  margin: 0;
}
.perf-status span {
  position: absolute;
```

with:

```css
  align-self: stretch;
  min-width: 0;
  margin: 0;
  font-size: 12px;
}
/* Room for "Updating…" itself where the Hero select could share the line
   (about 500 px up): where the select would squeeze it, the select takes
   the next line instead, whether the status shows or not. Phones have room
   beside the buttons without it, down to 375 px; narrower ones can cut it
   short. */
@container (min-width: 400px) {
  .perf-status {
    min-width: 5.25em;
  }
}
.perf-status span {
  position: absolute;
```

3. Replace:

```css
  right: 0;
  left: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
```

with:

```css
  right: 0;
  left: 0;
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
```

4. Replace:

```css
  background: var(--bad);
}
.perf-cards {
  container-type: inline-size;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
/* Dimmed, but every text still at 4.5:1 or more. */
.perf-cards[aria-busy="true"] {
  opacity: 0.85;
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
```

with:

```css
  background: var(--bad);
}
.perf-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
/* Five when there's room: each share then sits under its per-minute card,
   and kill participation under K/D/A. */
@container (min-width: 1100px) {
  .perf-cards {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
@container (max-width: 900px) {
  .perf-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container (max-width: 480px) {
  .perf-cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
/* Dimmed, but every text still at 4.5:1 or more. */
.perf-cards[aria-busy="true"] {
  opacity: 0.85;
}
/* A column, its chart at the foot: in a row where one title wraps to two
   lines, the charts still line up. */
.perf-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
```

5. Replace:

```css
.perf-trend.slipping {
  color: var(--bad);
}
.perf-card-numbers b {
  font: 700 26px var(--font-label);
}
```

with:

```css
.perf-trend.slipping {
  color: var(--bad);
}
.perf-card-numbers {
  margin-bottom: 6px;
}
.perf-card-numbers b {
  font: 700 26px var(--font-label);
}
```

6. Replace:

```css
}
.sparkline-box {
  position: relative;
  margin-top: 6px;
}
.sparkline {
  height: 80px;
```

with:

```css
}
.sparkline-box {
  position: relative;
  margin-top: auto;
}
.sparkline {
  height: 80px;
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/home.spec.ts -g "performance"`
Expected: PASS (22 tests).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/mobile.spec.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Look at it**

In the desktop app at 1260 px, on the Performance tab: ten cards in two rows of five, each row's charts at one height, and a picked game's tip over the numbers of a card whose title wraps. On the website at 530 to 585 px, the Hero select sits below the range buttons.

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck && npm test
npx prettier --write src/features/profile/styles/profile.css tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/styles/profile.css tests/browser/home.spec.ts tests/web-browser/mobile.spec.ts
git commit -m "feat(profile): five Performance cards a row when wide, charts lined up; room for Updating…"
```

Expected: 153 desktop and 77 website tests pass.

---

### Task 9: A profile opened afresh starts at Overview; coming back finds it as it was

**Files:**
- Modify: `src/app/navigation.ts`
- Modify: `src/features/match-report/components/MatchReportPage.tsx`
- Modify: `src/features/profile/components/ProfileView.tsx`
- Modify: `src/features/profile/components/ProfilePage.tsx`
- Modify: `src/app/DesktopApp.tsx`
- Modify: `web/app/WebShell.tsx`
- Modify: `web/app/routes/player.tsx`
- Test: `tests/browser/home.spec.ts`, `tests/web-browser/match-report.spec.ts`

What changes (owner's choice):
- **`Route.back`** marks the way back to a profile; the report's "← Back to profile" sets it.
- **`ProfileView` takes `restore`:** with it, the view kept for the account; without it, Overview. Each visit writes its view into the map on mount, so coming back later finds the latest one. `update()` merges onto a ref of the latest view.
- **The desktop app** keeps the profile mounted. `show()` counts every way into a profile but the way back (`profileVisit`) and keys the profile by `${profileId}-${profileVisit}`: a fresh way in, even to the profile already open, mounts it again at Overview. Coming back keeps the key, so nothing remounts. `restore` is passed as a safety net for a way back to another profile than the one mounted, which no way in reaches today (a report offers the way back only when opened from the mounted profile).
- **The website** keys the profile by history entry (`location.key`), so every visit mounts it. The shell's `navigate` passes `{ back: true }` as history state for `Route.back`. `restore` is a `POP` (Back, Forward, or a reload, which finds nothing kept) or that state.
- **Tests:**
  - **Desktop:** the test that kept each profile's view for the session becomes: Matches and Ranked survive the report's Back link; another account opens at Overview; the first, opened afresh from My profile, starts at Overview with All, and so does My profile again while it is open.
  - **Website:** browser Back from a report finds the Matches tab; a link to the same profile from the report's scoreboard opens it at Overview. The existing "keeps its tab, range and hero after a match report" test now passes through `Route.back`.

- [ ] **Step 1: Write the failing tests**

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  await expect(dots(page, "Souls / min")).toHaveCount(30);
});

test("each profile keeps its own tab and filter for the session", async ({
  page,
}) => {
  await storeAccount(page);
```

with:

```ts
  await expect(dots(page, "Souls / min")).toHaveCount(30);
});

test("a profile opened afresh starts at Overview; back from its report, it is as it was", async ({
  page,
}) => {
  await storeAccount(page);
```

2. Replace:

```ts
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
```

with:

```ts
  await openMyProfile(page);
  await openMatches(page);
  await view(page).getByRole("button", { name: "Ranked", exact: true }).click();
  const tab = (name: string) => view(page).getByRole("tab", { name });
  const filter = (name: string) =>
    view(page).getByRole("button", { name, exact: true });
  // Back from a match report: the tab and filter as they were.
  await view(page).locator(".match-open").first().click();
  await view(page).getByRole("button", { name: "← Back to profile" }).click();
  await expect(tab("Matches")).toHaveAttribute("aria-selected", "true");
  await expect(filter("Ranked")).toHaveAttribute("aria-pressed", "true");
  // Another account opens on its own view.
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByLabel("Find a player").fill("76561198060265729");
  await page.getByRole("button", { name: /Use this ID/ }).click();
  await expect(tab("Overview")).toHaveAttribute("aria-selected", "true");
  // Opened afresh, the first starts at Overview, with every match shown.
  await myProfile(page).click();
  await expect(tab("Overview")).toHaveAttribute("aria-selected", "true");
  await openMatches(page);
  await expect(filter("All")).toHaveAttribute("aria-pressed", "true");
  // So does opening it again while it's open.
  await myProfile(page).click();
  await expect(tab("Overview")).toHaveAttribute("aria-selected", "true");
});

test("performance tab degrades without match history", async ({ page }) => {
```

In `tests/web-browser/match-report.spec.ts`:

Replace:

```ts
  await expect(page).toHaveURL(`/players/${FARGO}`);
});

test("the profile keeps its tab, range and hero after a match report", async ({
  page,
}) => {
```

with:

```ts
  await expect(page).toHaveURL(`/players/${FARGO}`);
});

test("browser Back finds the profile as it was; opened afresh, it starts at Overview", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Matches" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // A link to the same profile from the report's scoreboard is a fresh
  // visit.
  await page.goForward();
  await page
    .locator(".report-table")
    .first()
    .getByRole("link", { name: "A Rather Long Persona Name Fixture" })
    .click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the profile keeps its tab, range and hero after a match report", async ({
  page,
}) => {
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/home.spec.ts -g "opened afresh"`
Expected: FAIL (My profile reopens it on Matches: `Expected: "true"`, `Received: "false"` for Overview).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts -g "browser Back finds"`
Expected: FAIL (the scoreboard's link opens it on Matches).

- [ ] **Step 3: Mark the way back**

In `src/app/navigation.ts`:

Replace:

```ts
  // Profile: whose profile. Match: the player the viewer came from.
  accountId?: number;
  matchId?: number;
}
export type Navigate = (route: Route) => void;
```

with:

```ts
  // Profile: whose profile. Match: the player the viewer came from.
  accountId?: number;
  matchId?: number;
  // Profile: back from its match report, so it opens as it was left rather
  // than at Overview.
  back?: boolean;
}
export type Navigate = (route: Route) => void;
```

In `src/features/match-report/components/MatchReportPage.tsx`:

Replace:

```tsx
          route={
            fromId === undefined
              ? { page: "home" }
              : { page: "profile", accountId: fromId }
          }
        >
          {fromId === undefined ? "← Home" : "← Back to profile"}
```

with:

```tsx
          route={
            fromId === undefined
              ? { page: "home" }
              : { page: "profile", accountId: fromId, back: true }
          }
        >
          {fromId === undefined ? "← Home" : "← Back to profile"}
```

- [ ] **Step 4: Restore only coming back**

In `src/features/profile/components/ProfileView.tsx`:

1. Replace:

```tsx
import { useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
```

with:

```tsx
import { useEffect, useRef, useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
```

2. Replace:

```tsx
  range: 20,
  heroId: null,
};
// Each profile's tab and filters, kept for the session: switching tabs, or
// coming back from a match report (a page of its own on the website),
// finds them as they were.
const views = new Map<number, ViewState>();

export function ProfileView({
```

with:

```tsx
  range: 20,
  heroId: null,
};
// Each profile's tab and filters as last left, for the session: coming back
// from a match report (a page of its own on the website) finds them as they
// were. Switching tabs keeps them anyway.
const views = new Map<number, ViewState>();

export function ProfileView({
```

3. Replace:

```tsx
  history,
  header,
  navigate,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
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
```

with:

```tsx
  history,
  header,
  navigate,
  restore,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  header: React.ReactNode;
  navigate: Navigate;
  // Coming back (from the profile's match report, or with the browser's
  // Back): open as it was left. Any other way in starts at Overview.
  restore: boolean;
}) {
  const [view, setView] = useState(
    () => (restore && views.get(accountId)) || FIRST_VIEW,
  );
  // Onto the latest view, so two changes in one event both count.
  const latest = useRef(view);
  // This visit's view is the one to come back to, changed or not.
  useEffect(() => {
    views.set(accountId, latest.current);
  }, [accountId]);
  const { subtab, filter, range, heroId } = view;
  const update = (change: Partial<ViewState>) => {
    const next = { ...latest.current, ...change };
    latest.current = next;
    views.set(accountId, next);
    setView(next);
  };
```

In `src/features/profile/components/ProfilePage.tsx`:

1. Replace:

```tsx
  me,
  navigate,
  subtitle = "Deadlock profile",
}: {
  accountId: number;
  me: MeAdapter;
  navigate: Navigate;
  subtitle?: string;
}) {
  const history = useAsync(() => fetchMatchHistory(accountId), [accountId]);
  const topHeroId = history.data && topHeroes(history.data, 1)[0]?.heroId;
```

with:

```tsx
  me,
  navigate,
  subtitle = "Deadlock profile",
  restore = false,
}: {
  accountId: number;
  me: MeAdapter;
  navigate: Navigate;
  subtitle?: string;
  // Open as it was left (see ProfileView).
  restore?: boolean;
}) {
  const history = useAsync(() => fetchMatchHistory(accountId), [accountId]);
  const topHeroId = history.data && topHeroes(history.data, 1)[0]?.heroId;
```

2. Replace:

```tsx
      accountId={accountId}
      history={history}
      navigate={navigate}
      header={
        <ProfileHeader
          accountId={accountId}
```

with:

```tsx
      accountId={accountId}
      history={history}
      navigate={navigate}
      restore={restore}
      header={
        <ProfileHeader
          accountId={accountId}
```

- [ ] **Step 5: In the desktop app**

In `src/app/DesktopApp.tsx`:

1. Replace:

```tsx
  const [route, setRoute] = useState<Route>({ page: "home" });
  const [visited, setVisited] = useState<Page[]>(["home"]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [report, setReport] = useState<{
    matchId: number;
    accountId?: number;
```

with:

```tsx
  const [route, setRoute] = useState<Route>({ page: "home" });
  const [visited, setVisited] = useState<Page[]>(["home"]);
  const [profileId, setProfileId] = useState<number | null>(null);
  // Counts the ways into a profile but back from its match report: each
  // opens it afresh, at Overview, while the way back keeps it as it was.
  const [profileVisit, setProfileVisit] = useState(0);
  const [profileBack, setProfileBack] = useState(false);
  const [report, setReport] = useState<{
    matchId: number;
    accountId?: number;
```

2. Replace:

```tsx
      next = { page: "home" };
    if (next.page === "match" && next.matchId === undefined)
      next = { page: "home" };
    if (next.page === "profile") setProfileId(next.accountId ?? null);
    if (next.page === "match")
      setReport({ matchId: next.matchId!, accountId: next.accountId });
    setRoute(next);
```

with:

```tsx
      next = { page: "home" };
    if (next.page === "match" && next.matchId === undefined)
      next = { page: "home" };
    if (next.page === "profile") {
      setProfileId(next.accountId ?? null);
      setProfileBack(!!next.back);
      if (!next.back) setProfileVisit((visit) => visit + 1);
    }
    if (next.page === "match")
      setReport({ matchId: next.matchId!, accountId: next.accountId });
    setRoute(next);
```

3. Replace:

```tsx
        {visited.includes("profile") && profileId !== null && (
          <div className="page" hidden={route.page !== "profile"}>
            <ProfilePage
              key={profileId}
              accountId={profileId}
              me={me}
              navigate={navigate}
              subtitle={
```

with:

```tsx
        {visited.includes("profile") && profileId !== null && (
          <div className="page" hidden={route.page !== "profile"}>
            <ProfilePage
              key={`${profileId}-${profileVisit}`}
              accountId={profileId}
              restore={profileBack}
              me={me}
              navigate={navigate}
              subtitle={
```

- [ ] **Step 6: On the website**

In `web/app/WebShell.tsx`:

Replace:

```tsx
      <LinkProvider
        value={{
          href: routeToPath,
          navigate: (route: Route) => navigate(routeToPath(route)),
        }}
      >
        <main className="page">{children ?? <Outlet />}</main>
```

with:

```tsx
      <LinkProvider
        value={{
          href: routeToPath,
          // The way back to a profile says so, for it to open as it was.
          navigate: (route: Route) =>
            navigate(
              routeToPath(route),
              route.back ? { state: { back: true } } : undefined,
            ),
        }}
      >
        <main className="page">{children ?? <Outlet />}</main>
```

In `web/app/routes/player.tsx`:

1. Replace:

```tsx
import { Link, useParams } from "react-router";
import { useLinks } from "@/app/links";
import { accountId as parseAccountId } from "@/features/match/utils/game";
import { ProfilePage } from "@/features/profile/components/ProfilePage";
```

with:

```tsx
import { Link, useLocation, useNavigationType, useParams } from "react-router";
import { useLinks } from "@/app/links";
import { accountId as parseAccountId } from "@/features/match/utils/game";
import { ProfilePage } from "@/features/profile/components/ProfilePage";
```

2. Replace:

```tsx

function Player({ id }: { id: number }) {
  const { navigate } = useLinks();
  const me = useRememberedMe();
  const profile = useAsync(() => fetchSteamProfiles([id]), [id]);
  const name = profile.data?.find((p) => p.accountId === id)?.name;
```

with:

```tsx

function Player({ id }: { id: number }) {
  const { navigate } = useLinks();
  const location = useLocation();
  // Browser Back or Forward, or the match report's "Back to profile", find
  // the profile as it was left; any other way in opens it afresh.
  const back =
    useNavigationType() === "POP" ||
    (location.state as { back?: boolean } | null)?.back === true;
  const me = useRememberedMe();
  const profile = useAsync(() => fetchSteamProfiles([id]), [id]);
  const name = profile.data?.find((p) => p.accountId === id)?.name;
```

3. Replace:

```tsx
        description={`Deadlock profile for ${name ?? `player ${id}`}: rank, match history, heroes and performance.`}
        path={playerPath(id)}
      />
      <ProfilePage key={id} accountId={id} me={me} navigate={navigate} />
    </>
  );
}
```

with:

```tsx
        description={`Deadlock profile for ${name ?? `player ${id}`}: rank, match history, heroes and performance.`}
        path={playerPath(id)}
      />
      {/* A new one for each visit, even to the profile already open. */}
      <ProfilePage
        key={location.key}
        accountId={id}
        me={me}
        navigate={navigate}
        restore={back}
      />
    </>
  );
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/home.spec.ts tests/browser/match-report.spec.ts -g "afresh|survive a profile tab|Back returns"`
Expected: PASS (3 tests).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts tests/web-browser/home.spec.ts`
Expected: PASS (30 tests).

- [ ] **Step 8: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck && npm test
npx prettier --write src/app src/features/match-report/components/MatchReportPage.tsx src/features/profile/components web/app tests/browser/home.spec.ts tests/web-browser/match-report.spec.ts
npm run test:browser && npm run test:web
git add src/app src/features/match-report/components/MatchReportPage.tsx src/features/profile/components web/app tests/browser/home.spec.ts tests/web-browser/match-report.spec.ts
git commit -m "feat(profile): a profile opened afresh starts at Overview; coming back keeps it as it was"
```

Expected: 153 desktop and 78 website tests pass.

---

### Task 10: Coming back finds the website's profile scrolled as it was

**Files:**
- Create: `src/shared/ui/useScrollBack.ts`
- Modify: `src/features/profile/components/ProfileView.tsx`
- Test: `tests/web-browser/match-report.spec.ts`

On the website the profile mounts again on Back, and its first render is "loading", so the router's own scroll restoration finds the page too short. `useScrollBack(key, restore)`:
- **Keeps** the window's scroll position under `key` in a layout effect's cleanup: the old page's layout effects clean up before the next page resets the scroll.
- **Restores**, with `restore` (read as it mounts), once the page is tall enough: a `ResizeObserver` on the body, which also reports once at the start. It gives up when the viewer takes over (wheel, touch, key or pointer) or after 10 seconds.
- `ProfileView` calls it with `profile:{accountId}` and its `restore`. In the desktop app the profile stays mounted while a report shows, so nothing changes there.
- **Test:** at 1260 × 600, scrolled to the last card (460 px), a chart's report and then the browser's Back, or the report's "← Back to profile", find the profile at 460 px again.

- [ ] **Step 1: Write the failing test**

In `tests/web-browser/match-report.spec.ts`:

Replace:

```ts
  );
});

test("the profile keeps its tab, range and hero after a match report", async ({
  page,
}) => {
```

with:

```ts
  );
});

test("coming back from a report finds the profile scrolled as it was", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1260, height: 600 });
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Performance" }).click();
  const share = page.getByRole("region", {
    name: "Healing share",
    exact: true,
  });
  await expect(share.locator("circle")).toHaveCount(8);
  await share.scrollIntoViewIfNeeded();
  const scrolled = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrolled();
  expect(before).toBeGreaterThan(200);
  const open = async () => {
    const chart = (await share.getByRole("slider").boundingBox())!;
    await page.mouse.click(chart.x + chart.width - 2, chart.y + 40);
    await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  };
  // Browser Back: the profile loads again, then scrolls back.
  await open();
  await page.goBack();
  await expect.poll(scrolled).toBe(before);
  // So does the report's "Back to profile".
  await open();
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
  await expect.poll(scrolled).toBe(before);
});

test("the profile keeps its tab, range and hero after a match report", async ({
  page,
}) => {
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts -g "scrolled as it was"`
Expected: FAIL (`Expected: 460`, `Received: 0`).

- [ ] **Step 3: Write the hook**

Create `src/shared/ui/useScrollBack.ts`:

```ts
import { useLayoutEffect } from "react";

// The window's scroll position as each page was left, by key.
const positions = new Map<string, number>();
// Ways the viewer takes the scrolling over.
const TAKEOVER = ["wheel", "touchstart", "keydown", "pointerdown"];

/**
 * Keeps the window's scroll position under `key` when the page unmounts.
 * With `restore` (read when it mounts), scrolls back to it once the page is
 * tall enough: a page whose content loads after its first render is still
 * too short when the router restores the position. It gives up if the
 * viewer scrolls first, or after 10 seconds.
 */
export function useScrollBack(key: string, restore: boolean) {
  // Layout effects: the position is read before this page is scrolled, and
  // kept before the next page resets it.
  useLayoutEffect(() => {
    const y = restore ? (positions.get(key) ?? 0) : 0;
    const page = document.documentElement;
    let stop = () => {};
    if (y > 0) {
      const attempt = () => {
        if (page.scrollHeight - window.innerHeight < y) return;
        window.scrollTo(0, y);
        stop();
      };
      const observer = new ResizeObserver(attempt);
      const timer = setTimeout(() => stop(), 10_000);
      stop = () => {
        observer.disconnect();
        clearTimeout(timer);
        for (const event of TAKEOVER) window.removeEventListener(event, stop);
      };
      for (const event of TAKEOVER)
        window.addEventListener(event, stop, { passive: true });
      observer.observe(document.body);
    }
    return () => {
      stop();
      positions.set(key, window.scrollY);
    };
    // `restore` only matters as the page mounts.
  }, [key]);
}
```

- [ ] **Step 4: Use it in the profile**

In `src/features/profile/components/ProfileView.tsx`:

1. Replace:

```tsx
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
import type { HistoryFilter, HistoryMatch } from "../types";
import type { PerformanceRange } from "../utils/performance-metrics";
import { HeroesTab } from "./HeroesTab";
```

with:

```tsx
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
import { useScrollBack } from "@/shared/ui/useScrollBack";
import type { HistoryFilter, HistoryMatch } from "../types";
import type { PerformanceRange } from "../utils/performance-metrics";
import { HeroesTab } from "./HeroesTab";
```

2. Replace:

```tsx
  useEffect(() => {
    views.set(accountId, latest.current);
  }, [accountId]);
  const { subtab, filter, range, heroId } = view;
  const update = (change: Partial<ViewState>) => {
    const next = { ...latest.current, ...change };
```

with:

```tsx
  useEffect(() => {
    views.set(accountId, latest.current);
  }, [accountId]);
  // And its scroll position: on the website the profile loads again, so
  // the router's own restore finds it still too short.
  useScrollBack(`profile:${accountId}`, restore);
  const { subtab, filter, range, heroId } = view;
  const update = (change: Partial<ViewState>) => {
    const next = { ...latest.current, ...change };
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts`
Expected: PASS (12 tests).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts -g "scrolled as it was|afresh" --repeat-each=8`
Expected: PASS (16 tests).

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck && npm test
npx prettier --write src/shared/ui/useScrollBack.ts src/features/profile/components/ProfileView.tsx tests/web-browser/match-report.spec.ts
npm run test:browser && npm run test:web
git add src/shared/ui/useScrollBack.ts src/features/profile/components/ProfileView.tsx tests/web-browser/match-report.spec.ts
git commit -m "fix(profile): coming back from a report on the website finds the profile scrolled as it was"
```

Expected: 153 desktop and 79 website tests pass.

---

### Task 11: Retry keeps keyboard focus in place

**Files:**
- Modify: `src/features/profile/components/PerformanceTab.tsx`
- Modify: `src/features/match-report/components/Verdicts.tsx`
- Modify: `src/features/profile/styles/profile.css`
- Modify: `src/features/match-report/styles/match-report.css`
- Test: `tests/browser/home.spec.ts`, `tests/browser/match-report.spec.ts`

The notice holding Retry unmounts as soon as Retry is pressed, so focus fell to the page.
- **On the tab,** the four notices' Retry (match details, rank averages, the partial failure and the current rank) first focus the status, which then reads "Updating…".
- **In the report,** the rank note's Retry focuses the note, which then reads "Loading the rank average…".
- **Both** take `tabIndex={-1}` (focusable from script only) and show no ring: places to read from, not controls.
- **Tests:** the two Retry tests press Retry from the keyboard and check where focus went.

- [ ] **Step 1: Write the failing tests**

In `tests/browser/home.spec.ts`:

Replace:

```ts
  const damage = card(page, "Hero damage / min").locator(".perf-card-numbers");
  await expect(notice).toBeVisible();
  fixtures.failTotals = false;
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  await expect(notice).toHaveCount(0);
  // The cards kept while Last 50 loads are the ones from after the Retry.
```

with:

```ts
  const damage = card(page, "Hero damage / min").locator(".perf-card-numbers");
  await expect(notice).toBeVisible();
  fixtures.failTotals = false;
  // From the keyboard: the notice goes, and focus moves to the status
  // rather than falling to the page.
  await notice.getByRole("button", { name: "Retry" }).focus();
  await page.keyboard.press("Enter");
  await expect(view(page).locator(".perf-status")).toBeFocused();
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  await expect(notice).toHaveCount(0);
  // The cards kept while Last 50 loads are the ones from after the Retry.
```

In `tests/browser/match-report.spec.ts`:

Replace:

```ts
    /^Rank average unavailable: Deadlock API unavailable \(500\)\./,
  );
  healthy = true;
  await note.getByRole("button", { name: "Retry" }).click();
  // The player's current rank, looked up again, not all ranks.
  await expect(note).toHaveText(
    `Compared with the average ${lead.name} at Eternus at the same match length, over the last 30 days. This player's rank isn't recorded for this match, so the average uses their current rank.`,
```

with:

```ts
    /^Rank average unavailable: Deadlock API unavailable \(500\)\./,
  );
  healthy = true;
  // From the keyboard: focus stays on the note, which says what loads.
  await note.getByRole("button", { name: "Retry" }).focus();
  await page.keyboard.press("Enter");
  await expect(note).toBeFocused();
  // The player's current rank, looked up again, not all ranks.
  await expect(note).toHaveText(
    `Compared with the average ${lead.name} at Eternus at the same match length, over the last 30 days. This player's rank isn't recorded for this match, so the average uses their current rank.`,
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/home.spec.ts tests/browser/match-report.spec.ts -g "asks for match details again on Retry|Retry asks again for current ranks"`
Expected: FAIL (2 failed: `toBeFocused()` sees `inactive`).

- [ ] **Step 3: Move focus on Retry**

In `src/features/profile/components/PerformanceTab.tsx`:

1. Replace:

```tsx
import { useState } from "react";
import { deadlockApi } from "@/shared/api/DeadlockApi";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
```

with:

```tsx
import { useRef, useState } from "react";
import { deadlockApi } from "@/shared/api/DeadlockApi";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
```

2. Replace:

```tsx
  const shown =
    !settled && last && games.length ? last : { games, totals, averages };
  const stale = shown === last;
  const summaries = PERFORMANCE_METRICS.map((metric) =>
    summarizeMetric(
      metric,
```

with:

```tsx
  const shown =
    !settled && last && games.length ? last : { games, totals, averages };
  const stale = shown === last;
  // A notice's Retry goes with the notice as soon as it's pressed: focus
  // moves to the status, which then says "Updating…", rather than falling
  // to the page.
  const status = useRef<HTMLParagraphElement>(null);
  const retry = (again: () => void) => () => {
    status.current?.focus();
    again();
  };
  const summaries = PERFORMANCE_METRICS.map((metric) =>
    summarizeMetric(
      metric,
```

3. Replace:

```tsx
          </div>
          {/* Always there, so screen readers announce it; it takes no space
              of its own, so the controls never move. */}
          <p className="perf-status" role="status">
            <span>{stale ? "Updating…" : ""}</span>
          </p>
        </div>
```

with:

```tsx
          </div>
          {/* Always there, so screen readers announce it; it takes no space
              of its own, so the controls never move. */}
          <p className="perf-status" role="status" ref={status} tabIndex={-1}>
            <span>{stale ? "Updating…" : ""}</span>
          </p>
        </div>
```

4. Replace:

```tsx
          {!stale && totals.error && (
            <p className="notice warning" role="status">
              Match details unavailable: {totals.error}
              <button type="button" onClick={totals.retry}>
                Retry
              </button>
            </p>
```

with:

```tsx
          {!stale && totals.error && (
            <p className="notice warning" role="status">
              Match details unavailable: {totals.error}
              <button type="button" onClick={retry(totals.retry)}>
                Retry
              </button>
            </p>
```

5. Replace:

```tsx
          {!stale && averages.error && (
            <p className="notice warning" role="status">
              Rank averages unavailable: {averages.error}
              <button type="button" onClick={averages.retry}>
                Retry
              </button>
            </p>
```

with:

```tsx
          {!stale && averages.error && (
            <p className="notice warning" role="status">
              Rank averages unavailable: {averages.error}
              <button type="button" onClick={retry(averages.retry)}>
                Retry
              </button>
            </p>
```

6. Replace:

```tsx
            <p className="notice warning" role="status">
              Rank averages unavailable for {averages.data.failed.size} of{" "}
              {count(games.length)}: {averages.data.error}
              <button type="button" onClick={averages.retry}>
                Retry
              </button>
            </p>
```

with:

```tsx
            <p className="notice warning" role="status">
              Rank averages unavailable for {averages.data.failed.size} of{" "}
              {count(games.length)}: {averages.data.error}
              <button type="button" onClick={retry(averages.retry)}>
                Retry
              </button>
            </p>
```

7. Replace:

```tsx
          {!stale && averages.data?.rankError && (
            <p className="notice warning" role="status">
              Current rank unavailable: {averages.data.rankError}
              <button type="button" onClick={averages.retry}>
                Retry
              </button>
            </p>
```

with:

```tsx
          {!stale && averages.data?.rankError && (
            <p className="notice warning" role="status">
              Current rank unavailable: {averages.data.rankError}
              <button type="button" onClick={retry(averages.retry)}>
                Retry
              </button>
            </p>
```

In `src/features/match-report/components/Verdicts.tsx`:

1. Replace:

```tsx
import type { AsyncState } from "@/shared/api/useAsync";
import { clock, percent } from "../utils/format";
import { verdicts } from "../utils/insights";
```

with:

```tsx
import { useRef } from "react";
import type { AsyncState } from "@/shared/api/useAsync";
import { clock, percent } from "../utils/format";
import { verdicts } from "../utils/insights";
```

2. Replace:

```tsx
}) {
  const hero = heroName(player.heroId);
  const band = curve.data?.band.label;
  return (
    <>
      <div className="report-verdicts">
```

with:

```tsx
}) {
  const hero = heroName(player.heroId);
  const band = curve.data?.band.label;
  // Retry goes as soon as it's pressed: focus stays on the note, which then
  // says what loads, rather than falling to the page.
  const note = useRef<HTMLParagraphElement>(null);
  return (
    <>
      <div className="report-verdicts">
```

3. Replace:

```tsx
          </div>
        ))}
      </div>
      <p className="data-note">
        {curveNote(hero, curve, normal, durationS, rank, rankFailed)}
        {/* The curve's Retry also asks again for the current rank. */}
        {(curve.error || (rankFailed && !curve.loading)) && (
          <>
            {" "}
            <button type="button" className="retry" onClick={curve.retry}>
              Retry
            </button>
          </>
```

with:

```tsx
          </div>
        ))}
      </div>
      <p className="data-note" ref={note} tabIndex={-1}>
        {curveNote(hero, curve, normal, durationS, rank, rankFailed)}
        {/* The curve's Retry also asks again for the current rank. */}
        {(curve.error || (rankFailed && !curve.loading)) && (
          <>
            {" "}
            <button
              type="button"
              className="retry"
              onClick={() => {
                note.current?.focus();
                curve.retry();
              }}
            >
              Retry
            </button>
          </>
```

- [ ] **Step 4: No ring where it lands**

In `src/features/profile/styles/profile.css`:

Replace:

```css
    min-width: 5.25em;
  }
}
.perf-status span {
  position: absolute;
  top: 50%;
```

with:

```css
    min-width: 5.25em;
  }
}
/* Where Retry leaves focus: a place to read from, not a control, so no
   ring. */
.perf-status:focus {
  outline: none;
}
.perf-status span {
  position: absolute;
  top: 50%;
```

In `src/features/match-report/styles/match-report.css`:

Replace:

```css
}
.report-verdicts + .data-note {
  margin-top: 8px;
}
.report-pick {
  margin-top: 16px;
```

with:

```css
}
.report-verdicts + .data-note {
  margin-top: 8px;
}
/* Where Retry leaves focus: a note to read, not a control, so no ring. */
.report-verdicts + .data-note:focus {
  outline: none;
}
.report-pick {
  margin-top: 16px;
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/home.spec.ts tests/browser/match-report.spec.ts -g "Retry"`
Expected: PASS (7 tests).

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck && npm test
npx prettier --write src/features/profile/components/PerformanceTab.tsx src/features/match-report/components/Verdicts.tsx src/features/profile/styles/profile.css src/features/match-report/styles/match-report.css tests/browser/home.spec.ts tests/browser/match-report.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/components/PerformanceTab.tsx src/features/match-report/components/Verdicts.tsx src/features/profile/styles/profile.css src/features/match-report/styles/match-report.css tests/browser/home.spec.ts tests/browser/match-report.spec.ts
git commit -m "fix(profile): Retry keeps keyboard focus in place, on the tab's status or the report's note"
```

Expected: 153 desktop and 79 website tests pass.

---

### Task 12: A partial failure and its Retry while older cards are kept

**Files:**
- Test: `tests/browser/home.spec.ts`

Both work already (the first pass checked them by probe); this test holds them. Last 50 adds 20 games on `heroes[2]`, whose curve fails:
- **While Last 50's match details are held,** its averages fail in part: the Last 20 cards stay, dimmed, "Updating…" shows, and the partial-failure notice waits.
- **Released,** the notice shows ("Rank averages unavailable for 20 of 40 games: …") over the Last 50 cards.
- **Its Retry, held,** keeps those partial cards, dimmed, without the notice; released, every game has its average and the notice is gone.

- [ ] **Step 1: Add the test**

In `tests/browser/home.spec.ts`:

Replace:

```ts
  await expect(status).toHaveText("");
});

test("performance tab drops the rank averages of a range it has left", async ({
  page,
}) => {
```

with:

```ts
  await expect(status).toHaveText("");
});

test("performance tab keeps older cards through a partial failure and its Retry", async ({
  page,
}) => {
  // Last 50 adds 20 older games on heroes[2], whose curve fails.
  const older = Array.from({ length: 20 }, (_, i) =>
    historyRow(4000 + i, heroes[2], 1, 4, true, now - 3600 * (30 + i)),
  );
  const failCurveFor = new Set([heroes[2]]);
  let holdTotals: Promise<void> | null = null;
  let holdCurves: Promise<void> | null = null;
  let release = () => {};
  await storeAccount(page);
  await routeApi(page, {
    history: [...performanceHistory.slice(0, 20), ...older],
    failCurveFor,
    gate: (url) =>
      (url.pathname === "/v1/matches/metadata" && holdTotals) ||
      (url.pathname === "/v1/analytics/player-performance-curve" &&
        holdCurves) ||
      Promise.resolve(),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const damage = card(page, "Hero damage / min").locator(".perf-card-numbers");
  const cards = view(page).locator(".perf-cards");
  const status = view(page).locator(".perf-status");
  const notice = view(page).getByText(
    "Rank averages unavailable for 20 of 40 games: Deadlock API unavailable (500).",
  );
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  // Last 50's averages fail in part while its match details are held: the
  // Last 20 cards stay, and the notice waits for them.
  holdTotals = new Promise((resolve) => (release = resolve));
  const failed = page.waitForResponse(
    (response) =>
      response.url().includes("player-performance-curve") &&
      response.url().includes(`hero_ids=${heroes[2]}`),
  );
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await failed;
  await expect(cards).toHaveAttribute("aria-busy", "true");
  await expect(status).toHaveText("Updating…");
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  await expect(notice).toHaveCount(0);
  release();
  holdTotals = null;
  await expect(notice).toBeVisible();
  await expect(damage).toHaveText(
    "1,000 40 games · 20 with a rank average: 1,000 vs 500",
  );
  // Its Retry, held: the partial cards stay, dimmed, without the notice.
  failCurveFor.clear();
  holdCurves = new Promise((resolve) => (release = resolve));
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(cards).toHaveAttribute("aria-busy", "true");
  await expect(status).toHaveText("Updating…");
  await expect(damage).toHaveText(
    "1,000 40 games · 20 with a rank average: 1,000 vs 500",
  );
  await expect(notice).toHaveCount(0);
  release();
  await expect(damage).toHaveText("1,000 40 games · rank avg 500");
  await expect(cards).toHaveAttribute("aria-busy", "false");
  await expect(notice).toHaveCount(0);
});

test("performance tab drops the rank averages of a range it has left", async ({
  page,
}) => {
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/browser/home.spec.ts -g "through a partial failure|drops the rank averages" --repeat-each=10`
Expected: PASS (20 tests).

- [ ] **Step 3: Check and commit**

```bash
npx tsc --noEmit
npx prettier --write tests/browser/home.spec.ts
npm run test:browser
git add tests/browser/home.spec.ts
git commit -m "test(profile): a partial failure and its Retry while older Performance cards are kept"
```

Expected: 154 desktop tests pass.

---

### Task 13: Docs and final check

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-21-redesign-design.md`

- [ ] **Step 1: README**

The two table rows keep the column's width, so prettier leaves the table as it is.

In `README.md`:

1. Replace:

```markdown

- **Live** shows the current match roster, builds and counters, or a "Deadlock isn't running" / "Waiting for a match" state. The app opens on Live when Deadlock is detected running (unless you have already picked a tab); otherwise it opens on Home. It also switches to Live once per match when live data first arrives.
- **Home** is a search (**Find a player**) followed by a **You** section for the remembered account (rank, recent form and latest match, each number explained) and **Top of the city**, the strongest heroes right now.
- **Profile** is its own page, opened from search, **You** or the header's **My profile**: rank badge, ranked games, KDA, souls per minute, top heroes, frequent teammates and a filterable match history, in the tabs Overview, Matches, Performance and Heroes. Click a match for its match report. **Performance** follows the last 20, 50 or 100 normal and ranked games, for all heroes or one, against the average player on the same hero at the same rank; pick a game on a chart to see it and open its match report. The profile keeps its tab and filters for the session, so coming back from a report finds them as they were. **This is me** remembers the account; **Not you? Switch account** forgets it.
- **Match report** opens from any match row, from Home's latest match or from a shared link, for any player. **Viewing as** picks whose point of view it takes (any of the 12 players, or the whole match); it opens as you if you played, otherwise as the player you came from. It shows win or loss, verdicts (souls / min, hero damage and creep kills against the average player on that hero at that rank), **the Graph** (nine stat tabs plus "More stats…", player against the rank average, team totals, team lead or everyone, per minute, time ranges, death, item and objective markers, hover and a ranking that switches the point of view), best and worst stretches, impact, permanent buffs and a scoreboard for both teams. **Copy link** copies the website address of the report. See [Match report](#match-report).
- **Tier list** ranks heroes S to D by win-rate percentile over the last 30 days across all ranks, with a role filter.
- **Heroes** is the full roster with search and a role filter. A hero page (with a rank filter) shows abilities (hover, focus or tap one for its tooltip), then two tabs: **Build**, the main build (the most-bought items in each phase: Early 0–10 min, Mid 10–20 min and Late 20+ min, up to eight each), and **Popular builds**, the hero's most-favourited community builds, shown exactly as their authors set them up. **Counter items** come next: pick up to six enemy heroes to see the items, not already in the main build, that gain the most win rate against them (during a match, the desktop app uses the live enemy team instead on the pages of heroes on your team). Then come skill order, matchups, best partners, best items and **Items that beat {Hero}**, which compares an item's win rate against this hero with its overall win rate, adjusted for the hero's overall win rate. Both counter lists fall back to hero-trait heuristics, labelled "Based on hero traits", when the data is too thin. See [Hero page builds and counter items](#hero-page-builds-and-counter-items).
```

with:

```markdown

- **Live** shows the current match roster, builds and counters, or a "Deadlock isn't running" / "Waiting for a match" state. The app opens on Live when Deadlock is detected running (unless you have already picked a tab); otherwise it opens on Home. It also switches to Live once per match when live data first arrives.
- **Home** is a search (**Find a player**) followed by a **You** section for the remembered account (rank, recent form and latest match, each number explained) and **Top of the city**, the strongest heroes right now.
- **Profile** is its own page, opened from search, **You** or the header's **My profile**: rank badge, ranked games, KDA, souls per minute, top heroes, frequent teammates and a filterable match history, in the tabs Overview, Matches, Performance and Heroes. Click a match for its match report. **Performance** follows the last 20, 50 or 100 normal and ranked games, for all heroes or one, against the average player on the same hero at the same rank; pick a game on a chart to see it and open its match report. Coming back from a match report, or with the browser's Back, finds the profile as it was left: its tab, filters and, on the website, scroll position. Opened any other way, it starts at Overview. **This is me** remembers the account; **Not you? Switch account** forgets it.
- **Match report** opens from any match row, from Home's latest match or from a shared link, for any player. **Viewing as** picks whose point of view it takes (any of the 12 players, or the whole match); it opens as you if you played, otherwise as the player you came from. It shows win or loss, verdicts (souls / min, hero damage and creep kills against the average player on that hero at that rank), **the Graph** (nine stat tabs plus "More stats…", player against the rank average, team totals, team lead or everyone, per minute, time ranges, death, item and objective markers, hover and a ranking that switches the point of view), best and worst stretches, impact, permanent buffs and a scoreboard for both teams. **Copy link** copies the website address of the report. See [Match report](#match-report).
- **Tier list** ranks heroes S to D by win-rate percentile over the last 30 days across all ranks, with a role filter.
- **Heroes** is the full roster with search and a role filter. A hero page (with a rank filter) shows abilities (hover, focus or tap one for its tooltip), then two tabs: **Build**, the main build (the most-bought items in each phase: Early 0–10 min, Mid 10–20 min and Late 20+ min, up to eight each), and **Popular builds**, the hero's most-favourited community builds, shown exactly as their authors set them up. **Counter items** come next: pick up to six enemy heroes to see the items, not already in the main build, that gain the most win rate against them (during a match, the desktop app uses the live enemy team instead on the pages of heroes on your team). Then come skill order, matchups, best partners, best items and **Items that beat {Hero}**, which compares an item's win rate against this hero with its overall win rate, adjusted for the hero's overall win rate. Both counter lists fall back to hero-trait heuristics, labelled "Based on hero traits", when the data is too thin. See [Hero page builds and counter items](#hero-page-builds-and-counter-items).
```

2. Replace:

```markdown

Everything comes from `GET /v1/matches/{id}/metadata`: per-player stat snapshots (every 3 min until 15:00, then every 5 min, plus one at the end; lines connect them), deaths, purchases, permanent buff pickups, objectives and Mid Boss. Player names come from one batched `GET /v1/players/steam`. Teams are named Amber and Sapphire.

- **Rank average:** `GET /v1/analytics/player-performance-curve?hero_ids=…&min_average_badge=…&max_average_badge=…&resolution=0` (absolute game time) for the selected player's hero and the whole tier of their rank at match start (from the metadata; when the match recorded none, as in unranked games, their current rank from `/v1/players/rank`, one request covering every such player; all ranks when that is unknown too), last 30 days, normal matches only. When the tier has fewer than 100 games at 3:00, or its games stop before the match ends, it widens one tier each way and says so; steps with fewer than 30 games are dropped. The graph shades ±1 standard deviation around the average.
- **Verdicts** compare the match's end values with the average at the same match length. The graph and verdicts use **creep kills**, which the snapshots and the average both have; the banner and scoreboard show the game's **last hits**, which is a different count.
- **Stretches** are rule-based: the moments with the most and fewest souls against the average, where the player ended up against the normal range (the average ± 1 standard deviation) and since when, every death, and any 3+ deaths within 5 minutes. When the average stops before the match ends, they say so.
- **Team lead** is Amber's advantage: Amber minus Sapphire, flipped for deaths so above the line always means Amber is ahead.
- **Impact** is the player's share of their team's hero damage, objective damage and healing (bars fill at half the team's total; the line marks an even 1/6), plus kill participation.
- **Permanent buffs** counts permanent pickups against the rank average.
- **Copy link** copies `{VITE_SITE_URL}/matches/{id}?player={account}`; the desktop app uses Overwolf's clipboard (the manifest's "Clipboard" permission).

### Performance tab

Ten cards, each with one point per game (oldest on the left, dotted by win or loss), the dashed rank average where there is one, and the value over the range. A range adds up the games rather than averaging each game's value, so longer games count for more.

Pointing at a chart, or its arrow keys, picks the nearest game and shows its hero, result, age, value and rank average above the chart; a click, Enter or the tip's **Report →** opens that game's match report. On a touch screen a tap only picks the game, and the tip's link opens it. Dots shrink as games crowd together, but never below a 2 px radius, with an outline in the card's colour. While a new range or hero loads, the cards keep the last ones, dimmed.

- **From match history:** souls / min and the K/D/A ratio, (kills + assists) ÷ deaths, with deaths counted as at least one after adding up the games.
- **From each game's totals:** hero damage, objective damage, healing and creep kills per minute, and the four shares: kill participation and the player's share of their team's hero damage, objective damage and healing. They come from `GET /v1/matches/metadata?match_ids=…&include_player_kda=true&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills&limit=…` (bulk metadata, every player's stat snapshots; the last one is the final total; `limit` is the number of games asked for), at most 50 games per request and kept per match, so a wider range only asks for the games it adds. Games the API hasn't stored yet are left out and the note says how many. Bulk metadata allows 30 requests per minute per IP; the client holds requests back rather than go over it, so switching heroes quickly on Last 100 slows down rather than stopping.
- **Rank average:** the match report's curve, read at each game's length: the tier of the game's rank (match history's `ranked_display_badge`), the player's current rank (`/v1/players/rank`, asked only when a game has none) for games without one, such as unranked games, or all ranks when neither is known. Games of one hero and rank tier share their requests (one, plus one when it widens as in the match report); at most four such groups load at once, and a group whose curve fails leaves only its own games without an average, with a notice and Retry; a card with a rank average then claims no trend if any of those games has a value on it (the four shares keep theirs). The match report uses the same rank rule. As there, **creep kills** stand in for last hits. The four shares have no rank average: the curve has no team totals.
- **Improving / Flat / Slipping** compares the recent half of the games with the earlier half (at least 6 games with a value and, where the metric has one, a rank average), each game as its value ÷ its rank average, so changing hero or rank doesn't read as a change in form; the four shares use their values. It says improving or slipping only when Welch's t-test finds the halves differ at the 95% level, and flat otherwise. When some games run past the end of the rank average, the card compares the player and the average over the games that have one.

## Website

```

with:

```markdown

Everything comes from `GET /v1/matches/{id}/metadata`: per-player stat snapshots (every 3 min until 15:00, then every 5 min, plus one at the end; lines connect them), deaths, purchases, permanent buff pickups, objectives and Mid Boss. Player names come from one batched `GET /v1/players/steam`. Teams are named Amber and Sapphire.

- **Rank average:** `GET /v1/analytics/player-performance-curve?hero_ids=…&min_average_badge=…&max_average_badge=…&resolution=0` (absolute game time) for the selected player's hero and the whole tier of their rank at match start (from the metadata; when the match recorded none, as in unranked games, their current rank from `/v1/players/rank`, one request covering every such player; all ranks when that is unknown too, or didn't load, which the note says, with Retry), last 30 days, normal matches only. When the tier has fewer than 100 games at 3:00, or its games stop before the match ends, it widens one tier each way and says so; steps with fewer than 30 games are dropped. The graph shades ±1 standard deviation around the average.
- **Verdicts** compare the match's end values with the average at the same match length. The graph and verdicts use **creep kills**, which the snapshots and the average both have; the banner and scoreboard show the game's **last hits**, which is a different count.
- **Stretches** are rule-based: the moments with the most and fewest souls against the average, where the player ended up against the normal range (the average ± 1 standard deviation) and since when, every death, and any 3+ deaths within 5 minutes. When the average stops before the match ends, they say so.
- **Team lead** is Amber's advantage: Amber minus Sapphire, flipped for deaths so above the line always means Amber is ahead.
- **Impact** is the player's share of their team's hero damage, objective damage and healing (bars fill at half the team's total; the line marks an even 1/6), plus kill participation; a team total of 0 has no share ("—").
- **Permanent buffs** counts permanent pickups against the rank average.
- **Copy link** copies `{VITE_SITE_URL}/matches/{id}?player={account}`; the desktop app uses Overwolf's clipboard (the manifest's "Clipboard" permission).

### Performance tab

Ten cards, five a row where there is room (each share under its per-minute card), each with one point per game (oldest on the left, dotted by win or loss), the dashed rank average where there is one, and the value over the range. A range adds up the games rather than averaging each game's value, so longer games count for more.

Pointing at a chart, or its arrow keys, picks the nearest game and shows its hero, result, age, value and rank average above the chart; a click, Enter or the tip's **Report →** opens that game's match report. On a touch screen a tap only picks the game, and the tip's link opens it. Dots shrink as games crowd together, but never below a 2 px radius, with an outline in the card's colour. While a new range or hero loads, the cards keep the last ones, dimmed; a range or hero left before it loads drops the requests it still waits for.

- **From match history:** souls / min and the K/D/A ratio, (kills + assists) ÷ deaths, with deaths counted as at least one after adding up the games.
- **From each game's totals:** hero damage, objective damage, healing and creep kills per minute, and the four shares: kill participation and the player's share of their team's hero damage, objective damage and healing. They come from `GET /v1/matches/metadata?match_ids=…&include_player_kda=true&extra_player_columns=stats.player_damage,stats.boss_damage,stats.player_healing,stats.creep_kills&limit=…` (bulk metadata, every player's stat snapshots; the last one is the final total; `limit` is the number of games asked for), at most 50 games per request and kept per match, so a wider range only asks for the games it adds. Games the API hasn't stored yet are left out and the note says how many. Bulk metadata allows 30 requests per minute per IP; the client holds requests back rather than go over it, so switching heroes quickly on Last 100 slows down rather than stopping.
- **Rank average:** the match report's curve, read at each game's length: the tier of the game's rank (match history's `ranked_display_badge`), the player's current rank (`/v1/players/rank`, asked only when a game has none) for games without one, such as unranked games, or all ranks when neither is known (or the current rank didn't load: a notice says so, with Retry). Games of one hero and rank tier share their requests (one, plus one when it widens as in the match report); at most four such groups load at once, and a group whose curve fails leaves only its own games without an average, with a notice and Retry; a card with a rank average then claims no trend if any of those games has a value on it (the four shares keep theirs). The match report uses the same rank rule. As there, **creep kills** stand in for last hits. The four shares have no rank average: the curve has no team totals.
- **Improving / Flat / Slipping** compares the recent half of the games with the earlier half (at least 6 games with a value and, where the metric has one, a rank average), each game as its value ÷ its rank average, so changing hero or rank doesn't read as a change in form; the four shares use their values, so over games on more than one hero they claim no trend: a change of hero moves them more than form does. It says improving or slipping only when Welch's t-test finds the halves differ at the 95% level, and flat otherwise. When some games run past the end of the rank average, the card compares the player and the average over the games that have one.

## Website

```

3. Replace:

```markdown

### Website privacy

The website has no backend, analytics or cookies. The remembered Steam account is stored only in the visitor's browser, in `localStorage` under `counterlock.web.account`; **Switch account** clears it. Search text and public player IDs are sent to Deadlock API to fetch statistics. Fonts load from Google Fonts, hero and item images load from the Deadlock API asset CDN, and Steam avatars load from Steam, so those providers also see the visitor's request. The /about page explains this; every page's footer links to it.

## The look

```

with:

```markdown

### Website privacy

The website has no backend, analytics or cookies. The remembered Steam account is stored only in the visitor's browser, in `localStorage` under `counterlock.web.account`; **Switch account** clears it. The times of recent API requests and the cooldowns the API asked for are kept there too (`counterlock.api.*`), so the open tabs together keep to its rate limits. Search text and public player IDs are sent to Deadlock API to fetch statistics. Fonts load from Google Fonts, hero and item images load from the Deadlock API asset CDN, and Steam avatars load from Steam, so those providers also see the visitor's request. The /about page explains this; every page's footer links to it.

## The look

```

4. Replace:

```markdown

This fetches active heroes (with roles and abilities), popular items, shop items (with tiers and stats) and ranks from the current Deadlock API asset endpoints into `src/shared/catalog/catalog.json`, then downloads the shop artwork into `public/items/`. Run `npm run assets:sync` to retry only the artwork download. Review `src/features/counters/utils/recommendations.ts` when a patch changes heroes or item effects. Coverage tests validate counter advice for every active hero. Removed items are excluded automatically because recommendations resolve IDs against the current snapshot. Future heroes without profiles have a manual threat fallback in the UI.

Catalog metadata and item icons are bundled, while portraits, rank images and fonts load from their providers. Item icons use the local file first, then the source URL if it fails, then text. No backend, analytics or persistent player database is included. Public player IDs are sent to Deadlock API to retrieve statistics. API responses are cached only in memory. Home also remembers the last account ID on this PC in `localStorage` under `counterlock.profile.account`, alongside the existing overlay preferences. Production distribution should include the appropriate privacy notice and asset attribution.

## Validation

```

with:

```markdown

This fetches active heroes (with roles and abilities), popular items, shop items (with tiers and stats) and ranks from the current Deadlock API asset endpoints into `src/shared/catalog/catalog.json`, then downloads the shop artwork into `public/items/`. Run `npm run assets:sync` to retry only the artwork download. Review `src/features/counters/utils/recommendations.ts` when a patch changes heroes or item effects. Coverage tests validate counter advice for every active hero. Removed items are excluded automatically because recommendations resolve IDs against the current snapshot. Future heroes without profiles have a manual threat fallback in the UI.

Catalog metadata and item icons are bundled, while portraits, rank images and fonts load from their providers. Item icons use the local file first, then the source URL if it fails, then text. No backend, analytics or persistent player database is included. Public player IDs are sent to Deadlock API to retrieve statistics. API responses are cached only in memory. Home also remembers the last account ID on this PC in `localStorage` under `counterlock.profile.account`, alongside the existing overlay preferences and the times of recent API requests (`counterlock.api.*`), which the app's windows count together. Production distribution should include the appropriate privacy notice and asset attribution.

## Validation

```

5. Replace:

```markdown
| `src/features/counters/`                          | Hero-page counter items and enemy picker, counter rules, threat types, desktop/compact panels      |
| `src/features/overlay/`                           | Visibility preferences, persisted keys, settings UI, overlay styles                                |
| `src/platform/overwolf/`                          | Background lifecycle, store bridge, game detection, window controls and native window hooks        |
| `src/shared/api/`                                 | Shared Deadlock API client (cache, rate limits, cooldowns) and async request hook                  |
| `src/shared/catalog/`                             | Typed catalog access (heroes, roles, abilities, items), metadata types and the dated JSON snapshot |
| `src/shared/ui/`                                  | Reusable icons, images, item artwork, page title, ribbon, section header and element-width hook    |
| `src/background/`, `src/desktop/`, `src/in_game/` | Stable HTML and minimal TypeScript entrypoints used by the manifest                                |
| `web/`                                            | Website: React Router app, routes, SEO, phone styles, static-host scripts; reuses `src/` features  |
| `tests/`                                          | Unit suites grouped by feature, browser integration tests, and demo fixtures                       |
```

with:

```markdown
| `src/features/counters/`                          | Hero-page counter items and enemy picker, counter rules, threat types, desktop/compact panels      |
| `src/features/overlay/`                           | Visibility preferences, persisted keys, settings UI, overlay styles                                |
| `src/platform/overwolf/`                          | Background lifecycle, store bridge, game detection, window controls and native window hooks        |
| `src/shared/api/`                                 | Shared Deadlock API client (cache, rate limits and cooldowns across tabs) and async request hook   |
| `src/shared/catalog/`                             | Typed catalog access (heroes, roles, abilities, items), metadata types and the dated JSON snapshot |
| `src/shared/ui/`                                  | Icons, images, item art, page title, ribbon, section header, element-width and scroll-back hooks   |
| `src/background/`, `src/desktop/`, `src/in_game/` | Stable HTML and minimal TypeScript entrypoints used by the manifest                                |
| `web/`                                            | Website: React Router app, routes, SEO, phone styles, static-host scripts; reuses `src/` features  |
| `tests/`                                          | Unit suites grouped by feature, browser integration tests, and demo fixtures                       |
```

6. Replace:

```markdown

## API endpoints

Live player statistics and the compact overlay's community build use `/v1/players/hero-stats`, `/v1/players/rank`, `/v1/analytics/hero-build-stats` and `/v1/builds`, and the catalog uses `/v1/assets/*`. The companion pages add these routes, all fetched through the shared client in `src/shared/api`:

- `/v1/players/steam`, `/v1/players/rank`, `/v1/players/hero-stats`
- `/v1/players/{id}/match-history` and `/v1/players/{id}/mate-stats`
```

with:

```markdown

## API endpoints

Live player statistics and the compact overlay's community build use `/v1/players/hero-stats`, `/v1/players/rank`, `/v1/analytics/hero-build-stats` and `/v1/builds`, and the catalog uses `/v1/assets/*`. The companion pages add these routes. All of them but the assets are fetched through the shared client in `src/shared/api`:

- `/v1/players/steam`, `/v1/players/rank`, `/v1/players/hero-stats`
- `/v1/players/{id}/match-history` and `/v1/players/{id}/mate-stats`
```

7. Replace:

```markdown
- `/v1/analytics/hero-stats`, `hero-counter-stats`, `hero-synergy-stats`, `ability-order-stats` and `item-stats` (also per build phase and per picked enemy)
- `/v1/builds` (popular builds on the hero page)

The client caches in memory (two to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests. It keeps its own requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding requests back; the Live statistics client, the compact overlay's build and other browser tabs aren't counted. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum. The Performance tab also keeps each stored game's totals for the session.

## Sources

```

with:

```markdown
- `/v1/analytics/hero-stats`, `hero-counter-stats`, `hero-synergy-stats`, `ability-order-stats` and `item-stats` (also per build phase and per picked enemy)
- `/v1/builds` (popular builds on the hero page)

The client caches in memory (two to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests. It keeps requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding them back, counting every tab of the website and every window of the app together: the counts, and the cooldowns of those three groups and of a 503 (below), are kept in `localStorage`, claimed under a Web Lock where the browser has one. A request no one waits for any more leaves the queue, and a cooldown fails the waiting ones at once. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum. The Performance tab also keeps each stored game's totals for the session.

## Sources

```

- [ ] **Step 2: Spec**

The phase records stay as written; a paragraph after the first pass's records what changed.

In `docs/superpowers/specs/2026-10-21-redesign-design.md`:

Replace:

```markdown

Changed after phase 4 (follow-up pass): objective damage and healing shares join kill participation and hero damage share, so the tab has all four of the match report's Impact shares (ten cards). Picking a game on a chart (pointer, tap or arrow keys) shows it; a click, Enter or the tip's link opens its match report, and on a touch screen a tap only picks it. Dots keep at least a 2 px radius. The profile keeps its tab, filter, range and hero for the session, and the cards stay, dimmed, while a new range or hero loads. Rank averages load per hero and rank tier, four groups at a time, and a failed one leaves only its own games without an average. The match report now compares a player whose rank the match didn't record at their current rank, as the tab does, instead of the lobby's rank. The API client keeps to the per-IP rate limits of analytics, bulk metadata and rank lookups, cools down only what a 429 refused (a 503 still pauses everything), and drops expired responses.

### Profile Live tab (app and website)

- **Your own account, in the desktop app:** use GEP. In a match, show the
```

with:

```markdown

Changed after phase 4 (follow-up pass): objective damage and healing shares join kill participation and hero damage share, so the tab has all four of the match report's Impact shares (ten cards). Picking a game on a chart (pointer, tap or arrow keys) shows it; a click, Enter or the tip's link opens its match report, and on a touch screen a tap only picks it. Dots keep at least a 2 px radius. The profile keeps its tab, filter, range and hero for the session, and the cards stay, dimmed, while a new range or hero loads. Rank averages load per hero and rank tier, four groups at a time, and a failed one leaves only its own games without an average. The match report now compares a player whose rank the match didn't record at their current rank, as the tab does, instead of the lobby's rank. The API client keeps to the per-IP rate limits of analytics, bulk metadata and rank lookups, cools down only what a 429 refused (a 503 still pauses everything), and drops expired responses.

Changed after phase 4 (second follow-up pass): the ten cards run five a row where there is room, each share under its per-minute card. Over games on more than one hero the shares claim no trend, as the hero mix moves them more than form does. A range or hero left before it loads drops the requests it still waits for. A profile opened afresh starts at Overview; coming back from its match report, or with the browser's Back, finds it as it was left, on the website its scroll position too. The report and the tab share one rank rule, and a current rank that didn't load says so, with Retry. Retry keeps keyboard focus in place. The report's Impact gives no share of a team total of 0. The API client counts every tab and window of the app against one budget, with the Live statistics and the compact build now going through it, and a cooldown fails waiting requests at once. Kept as they were, by the owner's decision: the tip covers the card's numbers, so the whole line stays in sight; it sits right under the title row; and Enter on a chart opens the picked game's report, which the slider pattern doesn't define but the chart's label announces.

### Profile Live tab (app and website)

- **Your own account, in the desktop app:** use GEP. In a match, show the
```

- [ ] **Step 3: Final check**

Run all of these; every one must pass:
- `npm test` (397)
- `npx tsc --noEmit`
- `npm run web:typecheck`
- `npm run test:browser` (154)
- `npm run test:web` (79)
- `npm run build`
- `npm run web:build`
- `npm run validate:manifest`

- [ ] **Step 4: Commit**

Check only the README with prettier; the spec has never been prettier-formatted, so leave its existing formatting alone.

```bash
npx prettier --check README.md
git add README.md docs/superpowers/specs/2026-10-21-redesign-design.md
git commit -m "docs: Performance tab and API follow-ups, second pass"
```

---

### Task 14: A request every caller left before its slot is never sent

**Files:**
- Modify: `src/shared/api/rate-store.ts`
- Modify: `src/shared/api/DeadlockApi.ts`
- Test: `tests/shared/DeadlockApi.test.ts`, `tests/shared/rate-store.test.ts`

What changes:
- **`RateStore.take(group, limit, keys, claim)`:** `claim` runs just before the request is counted, in the same step: inside the shared store's lock callback, synchronously in the memory store. If it throws, nothing is counted and `take` rejects with its error; the lock is released (`navigator.locks` and `serialLocks` both release on a throw).
- **The client's `claim`** throws if every caller has left, else marks the request claimed (`queued = false`). From then on a leave can't drop it: it goes out, stays shared and is cached. A group without a limit claims at once, as before.
- **Why:** `send()` checked the abandon signal only before `take`. A request every caller left while `take` waited for the lock, or in the microtasks after a memory-store `take`, had left `inFlight` yet was sent and spent its slot, and the next caller sent it again. Under React's StrictMode (the website's dev build) every Performance and report request went out twice. Passing a signal to `take` would not do: in the memory store the count happens inside `get()`, before StrictMode's abort. The signal isn't passed to `navigator.locks.request`; `Locks` is unchanged.
- **`pause()`** loses its `woken.abort()` in `finally`, which cleared nothing, and the comment that said it did.
- **Tests:**
  - **Client (memory store):** a waiting lookup with two callers that have signals, one leaving, goes when the window has room (a gap in coverage; it passed before too). A lookup left and asked for again at once, as StrictMode does, goes out once and uses one slot: the limit's other 19 go without waiting.
  - **Shared store:** the same while the lock is still to be granted: one request, one count in storage. A caller that leaves once the slot is claimed (inside the lock) doesn't stop the request: a new caller shares it, and its answer is cached.
  - The two store tests that call `take` themselves pass a `claim`.

- [ ] **Step 1: Write the failing tests**

In `tests/shared/DeadlockApi.test.ts`:

Replace:

```ts
      expect(request).toHaveBeenCalledTimes(22);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a sent request's answer when its caller has left", async () => {
```

with:

```ts
      expect(request).toHaveBeenCalledTimes(22);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a waiting request one of its two callers still wants", async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => json([]));
      const api = new DeadlockApi(request);
      const rank = (id: number, signal?: AbortSignal) =>
        api.get(`/v1/players/rank?account_ids=${id}`, 1, signal);
      await Promise.all(Array.from({ length: 20 }, (_, i) => rank(i)));
      const leaves = new AbortController();
      const goes = rank(20, leaves.signal);
      const stays = rank(20, new AbortController().signal);
      leaves.abort();
      await expect(goes).rejects.toThrow(/abort/i);
      await vi.advanceTimersByTimeAsync(RATE_WINDOW);
      await expect(stays).resolves.toEqual([]);
      expect(request).toHaveBeenCalledTimes(21);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a request asked for again just after its caller left once, using one slot", async () => {
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
    const rank = (id: number, signal?: AbortSignal) =>
      api.get(`/v1/players/rank?account_ids=${id}`, 1, signal);
    // As React's StrictMode does: a load, its cleanup, the load again.
    const first = new AbortController();
    const left = rank(0, first.signal);
    first.abort();
    const again = rank(0, new AbortController().signal);
    await expect(left).rejects.toThrow(/abort/i);
    await expect(again).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
    // The window still has room for the limit's other 19.
    await Promise.all(Array.from({ length: 19 }, (_, i) => rank(1 + i)));
    expect(waits).toEqual([]);
    expect(request).toHaveBeenCalledTimes(20);
  });

  it("keeps a sent request's answer when its caller has left", async () => {
```

In `tests/shared/rate-store.test.ts`:

1. Replace:

```ts
  sharedRateStore,
  type RateStore,
} from "@/shared/api/rate-store";
```

with:

```ts
  sharedRateStore,
  type Locks,
  type RateStore,
} from "@/shared/api/rate-store";
```

2. Replace:

```ts
      expect(request).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads damaged entries as empty", async () => {
```

with:

```ts
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
```

3. Replace:

```ts
    expect(store.cooling(["*"])).toBe(false);
    await expect(store.take("/v1/players/rank", 20, ["*"])).resolves.toBe(0);
```

with:

```ts
    expect(store.cooling(["*"])).toBe(false);
    await expect(
      store.take("/v1/players/rank", 20, ["*"], () => {}),
    ).resolves.toBe(0);
```

4. Replace:

```ts
    const store = defaultRateStore(() => 0);
    await expect(store.take("/v1/players/rank", 1, [])).resolves.toBe(0);
    await expect(store.take("/v1/players/rank", 1, [])).resolves.toBe(
      RATE_WINDOW,
    );
```

with:

```ts
    const store = defaultRateStore(() => 0);
    await expect(store.take("/v1/players/rank", 1, [], () => {})).resolves.toBe(
      0,
    );
    await expect(store.take("/v1/players/rank", 1, [], () => {})).resolves.toBe(
      RATE_WINDOW,
    );
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts`
Expected: FAIL (3 failed, 28 passed: a request every caller left goes out beside the one asked for again, or the one shared after the slot was claimed (`expected "vi.fn()" to be called 1 times, but got 2 times` in each)).

- [ ] **Step 3: Claim the slot with the count**

In `src/shared/api/rate-store.ts`:

1. Replace:

```ts
   * Otherwise null while cooling down, or how long until the oldest
   * request leaves the window.
   */
  take(group: string, limit: number, keys: string[]): Promise<number | null>;
```

with:

```ts
   * Otherwise null while cooling down, or how long until the oldest
   * request leaves the window. `claim` runs just before the request is
   * counted, in the same step: if it throws, as for a request no one wants
   * any more, nothing is counted and the promise rejects with its error.
   */
  take(
    group: string,
    limit: number,
    keys: string[],
    claim: () => void,
  ): Promise<number | null>;
```

2. Replace:

```ts
    async take(group, limit, keys) {
      if (cooling(keys)) return null;
      const at = now();
      const times = recent(sent.get(group) ?? [], at);
      sent.set(group, times);
      if (times.length >= limit) return times[0] + RATE_WINDOW - at;
      times.push(at);
```

with:

```ts
    async take(group, limit, keys, claim) {
      if (cooling(keys)) return null;
      const at = now();
      const times = recent(sent.get(group) ?? [], at);
      sent.set(group, times);
      if (times.length >= limit) return times[0] + RATE_WINDOW - at;
      claim();
      times.push(at);
```

3. Replace:

```ts
    take: (group, limit, keys) =>
```

with:

```ts
    take: (group, limit, keys, claim) =>
```

4. Replace:

```ts
          at,
        );
        if (times.length >= limit) return times[0] + RATE_WINDOW - at;
        storage.setItem(
```

with:

```ts
          at,
        );
        if (times.length >= limit) return times[0] + RATE_WINDOW - at;
        claim();
        storage.setItem(
```

In `src/shared/api/DeadlockApi.ts`:

1. Replace:

```ts
  // Aborted when every caller has left while it still waits for room.
  abandon: AbortController;
  queued: boolean;
}
```

with:

```ts
  // Aborted when every caller has left before it claimed its slot.
  abandon: AbortController;
  // Until it claims its slot in the group's rate limit (at once where the
  // group has none): every caller leaving before then drops it, and once
  // claimed it goes out.
  queued: boolean;
}
```

2. Replace:

```ts
   * hasn't gone out yet and no one else still wants it.
```

with:

```ts
   * hasn't claimed its slot yet and no one else still wants it.
```

3. Replace:

```ts
        // No one wants it any more, and it hasn't gone out.
```

with:

```ts
        // No one wants it any more, and it hasn't claimed its slot.
```

4. Replace:

```ts
    const limit = RATE_LIMITS[group];
    if (limit) await this.throttle(path, group, limit, pending.abandon.signal);
    pending.queued = false;
    return this.fetchJson<T>(path, group);
  }

  /**
   * Waits until the group has had fewer than `limit` requests in the window
   * (in every tab), then counts this one. A cooldown that starts while it
   * waits fails it at once, before it takes a slot, as does every caller
   * leaving.
   */
  private async throttle(
    path: string,
    group: string,
    limit: number,
    abandoned: AbortSignal,
  ) {
    for (;;) {
      abandoned.throwIfAborted();
      const wait = await this.limits.take(group, limit, sharedKeys(group));
```

with:

```ts
    const limit = RATE_LIMITS[group];
    if (limit) await this.throttle(path, group, limit, pending);
    else pending.queued = false;
    return this.fetchJson<T>(path, group);
  }

  /**
   * Waits until the group has had fewer than `limit` requests in the window
   * (in every tab), then counts this one: from then on it goes out, even
   * if every caller leaves. A cooldown that starts while it waits fails it
   * at once, before it takes a slot, as does every caller leaving.
   */
  private async throttle(
    path: string,
    group: string,
    limit: number,
    pending: Pending,
  ) {
    const abandoned = pending.abandon.signal;
    // In the same step as the count, so no caller can leave between the two.
    const claim = () => {
      abandoned.throwIfAborted();
      pending.queued = false;
    };
    for (;;) {
      abandoned.throwIfAborted();
      const wait = await this.limits.take(
        group,
        limit,
        sharedKeys(group),
        claim,
      );
```

5. Replace:

```ts
      abandoned.removeEventListener("abort", wake);
      // Clears the timer of a wait cut short.
      woken.abort();
    }
```

with:

```ts
      abandoned.removeEventListener("abort", wake);
    }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts`
Expected: PASS (31 tests).

Run: `npm test`
Expected: PASS (401 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/shared/api tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts
npm run test:browser && npm run test:web
git add src/shared/api tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts
git commit -m "fix(api): a request every caller left before its slot is never sent"
```

Expected: 154 desktop and 79 website tests pass.

---

### Task 15: A stored cooldown lasts at most ten minutes

**Files:**
- Modify: `src/shared/api/rate-store.ts`
- Modify: `src/shared/api/DeadlockApi.ts`
- Test: `tests/shared/DeadlockApi.test.ts`, `tests/shared/rate-store.test.ts`

What changes:
- **`MAX_COOLDOWN`** (ten minutes) is exported from `rate-store.ts`.
- **The client** caps a cooldown's end: at least 30 seconds, at most `MAX_COOLDOWN`, whatever `Retry-After` says.
- **The shared store** ignores a stored end more than `MAX_COOLDOWN` ahead: it reads as not cooling, rather than clamped, so it can't slide, and the next `cool` replaces it. `RateStore.cool`'s doc says it keeps the later end.
- **Why:** cooldowns persist in `localStorage`, so a far-off `Retry-After` date, a clock moved back or a long 503 wait locked every tab, reload and app restart out. Overwolf gives no way to clear it.
- **Tests:** a 503 with a `Retry-After` date in 2031 holds requests back for ten minutes, not longer. A stored cooldown an hour ahead holds nothing back; one five minutes ahead still does.

- [ ] **Step 1: Write the failing tests**

In `tests/shared/DeadlockApi.test.ts`:

Replace:

```ts
    await expect(api.get("/v1/x", 1000)).rejects.toThrow("API busy");
  });

  it("maps 403 and other errors, and does not cache failures", async () => {
```

with:

```ts
    await expect(api.get("/v1/x", 1000)).rejects.toThrow("API busy");
  });

  it("ends a cooldown within ten minutes, however far ahead Retry-After is", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", {
          status: 503,
          headers: { "Retry-After": "Wed, 01 Jan 2031 00:00:00 GMT" },
        }),
      )
      .mockImplementation(async () => json([]));
    let now = Date.parse("2026-10-23T12:00:00Z");
    const api = new DeadlockApi(request, () => now);
    await expect(api.get("/v1/x", 1000)).rejects.toThrow(
      "API busy. Retry after the cooldown.",
    );
    now += 10 * 60_000 - 1;
    await expect(api.get("/v1/x", 1000)).rejects.toThrow("API busy");
    now += 1;
    await expect(api.get("/v1/x", 1000)).resolves.toEqual([]);
  });

  it("maps 403 and other errors, and does not cache failures", async () => {
```

In `tests/shared/rate-store.test.ts`:

Replace:

```ts
    ).toHaveLength(1);
  });

  it("reads damaged entries as empty", async () => {
```

with:

```ts
    ).toHaveLength(1);
  });

  it("holds nothing back for a stored cooldown further ahead than any is set for", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json([]));
    const { storage } = sharedStorage();
    const now = 1_000_000;
    const store = sharedRateStore(
      storage,
      serialLocks(),
      () => now,
      new EventTarget(),
    );
    const api = new DeadlockApi(request, () => now, undefined, store);
    // An hour ahead, as after the clock was moved back, or written by hand.
    storage.setItem("counterlock.api.cooldown.*", String(now + 60 * 60_000));
    await expect(api.get("/v1/players/rank?account_ids=1", 1)).resolves.toEqual(
      [],
    );
    // An ordinary cooldown still holds every request back.
    storage.setItem("counterlock.api.cooldown.*", String(now + 5 * 60_000));
    await expect(api.get("/v1/players/rank?account_ids=2", 1)).rejects.toThrow(
      "API busy",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reads damaged entries as empty", async () => {
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts`
Expected: FAIL (2 failed, 31 passed: both cooldowns still hold requests back (`promise rejected "Error: API busy. Retry after the cooldown." instead of resolving`)).

- [ ] **Step 3: Cap the cooldown**

In `src/shared/api/rate-store.ts`:

1. Replace:

```ts
export const RATE_WINDOW = 61_000;

```

with:

```ts
export const RATE_WINDOW = 61_000;

// The longest a cooldown lasts. It outlives a reload, so one set from a date
// far ahead, or by a clock that was wrong, mustn't lock the app out.
export const MAX_COOLDOWN = 10 * 60_000;

```

2. Replace:

```ts
  cooling(keys: string[]): boolean;
  cool(key: string, until: number): void;
```

with:

```ts
  cooling(keys: string[]): boolean;
  /** Cools `key` down until `until`, or keeps a later end it already has. */
  cool(key: string, until: number): void;
```

3. Replace:

```ts
  const until = (key: string) => {
    const value = read(`cooldown.${key}`);
    return typeof value === "number" ? value : 0;
  };
```

with:

```ts
  // An end further ahead than any cooldown is set for (the clock was moved
  // back, or it was written by hand) is ignored rather than waited out.
  const until = (key: string) => {
    const value = read(`cooldown.${key}`);
    return typeof value === "number" && value - now() <= MAX_COOLDOWN
      ? value
      : 0;
  };
```

In `src/shared/api/DeadlockApi.ts`:

1. Replace:

```ts
import { RATE_WINDOW, defaultRateStore, type RateStore } from "./rate-store";
```

with:

```ts
import {
  MAX_COOLDOWN,
  RATE_WINDOW,
  defaultRateStore,
  type RateStore,
} from "./rate-store";
```

2. Replace:

```ts
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get("Retry-After");
      const seconds = header ? Number(header) : NaN;
      const until = Number.isFinite(seconds)
        ? this.now() + seconds * 1000
        : Date.parse(header ?? "");
      this.cool(
        response.status === 503 ? EVERYTHING : refused(path, group),
        Math.max(this.now() + 30_000, Number.isFinite(until) ? until : 0),
      );
```

with:

```ts
    if (response.status === 429 || response.status === 503) {
      const now = this.now();
      const header = response.headers.get("Retry-After");
      const seconds = header ? Number(header) : NaN;
      const until = Number.isFinite(seconds)
        ? now + seconds * 1000
        : Date.parse(header ?? "");
      // At least 30 seconds, and at most MAX_COOLDOWN, whatever the header
      // says: the cooldown outlives a reload.
      this.cool(
        response.status === 503 ? EVERYTHING : refused(path, group),
        Math.min(
          now + MAX_COOLDOWN,
          Math.max(now + 30_000, Number.isFinite(until) ? until : 0),
        ),
      );
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts`
Expected: PASS (33 tests).

Run: `npm test`
Expected: PASS (403 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/shared/api tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts
npm run test:browser && npm run test:web
git add src/shared/api tests/shared/DeadlockApi.test.ts tests/shared/rate-store.test.ts
git commit -m "fix(api): a stored cooldown lasts at most ten minutes"
```

Expected: 154 desktop and 79 website tests pass.

---

### Task 16: The Live roster asks again for stats that failed

**Files:**
- Modify: `src/features/player-stats/services/StatsClient.ts`
- Test: `tests/player-stats/StatsClient.test.ts`

What changes:
- **An entry with an error is never fresh:** `load` asks again for stats that failed. Cooldowns from any tab or window now fail the roster's requests at once, so a cached error stood for five minutes, and Refresh served it.
- **A half that fails again keeps the half that had loaded**, while it is fresh: a changed roster asks for other paths, which the shared client hasn't cached, so a failure during a cooldown overwrote loaded hero stats. Kept data keeps its saved `fetchedAt`, so nothing outlives its ttl. A rank that loaded may be none.
- A lasting failure (a 403) is asked for again on each `load`. `load` runs only on a roster change and on Refresh, so this is not polling.
- The comment and the cooldown test's name no longer say the requests "wait out" cooldowns: they fail at once.
- **Tests:**
  - **Asked again:** another view's rank lookup is refused; the roster's rank fails at once and its hero stats load. Once the cooldown is over only the rank lookup goes out again, and what loaded is kept for `TTL.profile`.
  - **Kept through a roster change:** during a 503's cooldown, player 10's hero stats stay when player 11 joins; they last `TTL.profile` from when they loaded, not longer. This one passes before the fix too: it pins the kept stats' ttl.

- [ ] **Step 1: Write the failing tests**

In `tests/player-stats/StatsClient.test.ts`:

1. Replace:

```ts
import { DeadlockApi } from "@/shared/api/DeadlockApi";
```

with:

```ts
import { DeadlockApi, TTL } from "@/shared/api/DeadlockApi";
```

2. Replace:

```ts
  it("waits out cooldowns as the app's other requests do", async () => {
```

with:

```ts
  it("fails at once during a cooldown, as the app's other requests do", async () => {
```

3. Replace:

```ts
    await stats.load([3], "normal");
    expect(request).toHaveBeenCalledTimes(5);
  });
```

with:

```ts
    await stats.load([3], "normal");
    expect(request).toHaveBeenCalledTimes(5);
  });
  it("asks again for stats that failed, and keeps those that loaded", async () => {
    let now = 0;
    const heroes = [
      { account_id: 10, hero_id: 13, wins: 5, matches_played: 10 },
    ];
    const ranks = [{ account_id: 10, badge: 81, rank: 8, subrank: 1 }];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).includes("account_ids=99")
          ? new Response("Busy", { status: 429 })
          : new Response(
              JSON.stringify(
                String(url).includes("hero-stats") ? heroes : ranks,
              ),
            ),
      );
    const api = new DeadlockApi(request, () => now);
    const stats = new StatsClient(api, () => now);
    // Another view's rank lookup is refused: rank lookups pause for all.
    await expect(
      api.get("/v1/players/rank?account_ids=99", TTL.profile),
    ).rejects.toThrow("API busy");
    const busy = await stats.load([10], "normal");
    expect(busy[10].heroes?.[0].wins).toBe(5);
    expect(busy[10].rankError).toBe("API busy. Retry after the cooldown.");
    expect(request).toHaveBeenCalledTimes(2);
    // Once the cooldown is over, only the rank lookup goes out again.
    now = 30_000;
    const loaded = await stats.load([10], "normal");
    expect(loaded[10].rank?.badge).toBe(81);
    expect(loaded[10].rankError).toBeUndefined();
    expect(loaded[10].heroes?.[0].wins).toBe(5);
    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[2][0])).toContain("/players/rank?");
    // Stats that loaded are kept for TTL.profile.
    now += TTL.profile - 1;
    await stats.load([10], "normal");
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("keeps the stats that loaded when the roster changes during a cooldown", async () => {
    let now = 0;
    const heroes = [
      { account_id: 10, hero_id: 13, wins: 5, matches_played: 10 },
    ];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).includes("/players/rank")
          ? new Response("Busy", { status: 503 })
          : new Response(JSON.stringify(heroes)),
      );
    const stats = client(request, () => now);
    await stats.load([10], "normal");
    // A player joins during the 503's cooldown: the new roster's requests
    // fail at once, and player 10's hero stats stay.
    now = 1_000;
    const joined = await stats.load([10, 11], "normal");
    expect(request).toHaveBeenCalledTimes(2);
    expect(joined[10].heroes?.[0].wins).toBe(5);
    expect(joined[10].heroError).toBeUndefined();
    expect(joined[10].rankError).toBe("API busy. Retry after the cooldown.");
    expect(joined[11].heroError).toBe("API busy. Retry after the cooldown.");
    // Kept for TTL.profile from when they loaded, not longer: in a later
    // cooldown (player 12's rank lookup starts one), they are gone.
    now = TTL.profile;
    await stats.load([12], "normal");
    const stale = await stats.load([10, 11], "normal");
    expect(request).toHaveBeenCalledTimes(4);
    expect(stale[10].heroes).toBeUndefined();
    expect(stale[10].heroError).toBe("API busy. Retry after the cooldown.");
  });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/player-stats/StatsClient.test.ts`
Expected: FAIL (1 failed, 5 passed: the failed rank is served from the cache after the cooldown (`expected undefined to be 81`)).

- [ ] **Step 3: Ask again for what failed**

In `src/features/player-stats/services/StatsClient.ts`:

1. Replace:

```ts
  // rate limits along with every other, and wait out its cooldowns.
```

with:

```ts
  // rate limits along with every other, and fail at once during its
  // cooldowns.
```

2. Replace:

```ts
      const saved = this.cache.get(`${mode}:${id}`);
      return !saved || this.now() - saved.fetchedAt >= TTL.profile;
```

with:

```ts
      const saved = this.cache.get(`${mode}:${id}`);
      // Stats that failed are asked for again: what loaded is kept (below),
      // and during a cooldown the shared client fails without asking.
      return (
        !saved ||
        saved.heroError !== undefined ||
        saved.rankError !== undefined ||
        this.now() - saved.fetchedAt >= TTL.profile
      );
```

3. Replace:

```ts
      for (const id of pending) {
        this.cache.set(`${mode}:${id}`, {
          heroes: heroError
            ? undefined
            : heroes.filter((h) => h.account_id === id),
          rank: ranks.find((r) => r.account_id === id),
          heroError,
          rankError,
          fetchedAt: this.now(),
        });
      }
```

with:

```ts
      for (const id of pending) {
        const saved = this.cache.get(`${mode}:${id}`);
        // A half that fails keeps what had loaded while it is fresh: a
        // changed roster asks for other paths, which the shared client
        // hasn't cached. A rank that loaded may be none.
        const fresh =
          saved !== undefined && this.now() - saved.fetchedAt < TTL.profile;
        const keepHeroes =
          heroError !== undefined && fresh && saved.heroError === undefined;
        const keepRank =
          rankError !== undefined && fresh && saved.rankError === undefined;
        this.cache.set(`${mode}:${id}`, {
          heroes: keepHeroes
            ? saved.heroes
            : heroError
              ? undefined
              : heroes.filter((h) => h.account_id === id),
          rank: keepRank ? saved.rank : ranks.find((r) => r.account_id === id),
          heroError: keepHeroes ? undefined : heroError,
          rankError: keepRank ? undefined : rankError,
          // What was kept still dates from when it loaded.
          fetchedAt: keepHeroes || keepRank ? saved.fetchedAt : this.now(),
        });
      }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/player-stats/StatsClient.test.ts`
Expected: PASS (6 tests).

Run: `npm test`
Expected: PASS (405 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/player-stats/services/StatsClient.ts tests/player-stats/StatsClient.test.ts
npm run test:browser && npm run test:web
git add src/features/player-stats/services/StatsClient.ts tests/player-stats/StatsClient.test.ts
git commit -m "fix(player-stats): the Live roster asks again for stats that failed"
```

Expected: 154 desktop and 79 website tests pass.

---

### Task 17: Coming back on the website keeps Matches' Show more and the Heroes sort

**Files:**
- Modify: `src/features/profile/components/MatchHistory.tsx`
- Modify: `src/features/profile/components/HeroesTab.tsx`
- Modify: `src/features/profile/components/ProfileView.tsx`
- Test: `tests/web-browser/match-report.spec.ts`

What changes (owner's choice: fix both):
- **`ViewState`** holds `shown` (the Matches tab's rows, default `PAGE_SIZE`) and `sort` (the Heroes tab's, default `FIRST_SORT`), kept and restored with the rest of the view.
- **`setFilter`** resets `shown` in the same `update()` that changes the filter, in place of `MatchHistory`'s effect, and only on a real change, as before. The filter is shared, so a filter change on Heroes resets the count too, as before.
- **`MatchHistory`** takes `shown` and `onShowMore`, from the full Matches list only (not the Overview preview), and exports `PAGE_SIZE`. **`HeroesTab`** takes `sort` and `onSort`, and exports `HeroSort` and `FIRST_SORT`.
- **Why:** the website mounts the profile again on coming back, so "Show more" went back to 20 rows (and a scroll position past row 20 never came back: the page never grew tall enough), and the Heroes sort went back to Games.
- **Side effect, in both apps:** both now survive switching tabs too, where a tab switch reset them, as "Switching tabs keeps them anyway" says.
- **Tests (website):**
  - **Show more:** thirty matches, Show more, scrolled to row 28. Browser Back, then the report's "← Back to profile", find 30 rows and the scroll position. Opened afresh from the report's scoreboard, the Matches tab shows 20; Show more, then another filter and back to All, shows 20 again.
  - **The sort:** WR, ascending. Back from a hero's page, and the report's "← Back to profile", keep it; opened afresh, it sorts by Games, descending.

- [ ] **Step 1: Write the failing tests**

In `tests/web-browser/match-report.spec.ts`:

1. Replace:

```ts
import { expect, test } from "@playwright/test";
import { heroes } from "../fixtures/match-report";
import { FARGO, mockApi } from "./fixtures";

const viewingAs = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: "Viewing as" });

```

with:

```ts
import { expect, test, type Page } from "@playwright/test";
import { heroes, matchMetadata } from "../fixtures/match-report";
import { FARGO, cors, historyRow, mockApi } from "./fixtures";

const viewingAs = (page: Page) =>
  page.getByRole("combobox", { name: "Viewing as" });

// Thirty matches, a page and a half of the Matches tab, each with its
// report.
async function mockLongHistory(page: Page) {
  const now = Math.floor(Date.now() / 1000);
  await page.route(
    `https://api.deadlock-api.com/v1/players/${FARGO}/match-history`,
    (route) =>
      route.fulfill({
        json: Array.from({ length: 30 }, (_, index) => ({
          ...historyRow(2001 + index, index % 2 === 0),
          start_time: now - 3600 * (index + 1),
        })),
        headers: cors,
      }),
  );
  await page.route(/\/v1\/matches\/\d+\/metadata$/, (route) => {
    const matchId = Number(/matches\/(\d+)/.exec(route.request().url())![1]);
    return route.fulfill({
      json: matchMetadata(FARGO, matchId),
      headers: cors,
    });
  });
}

// From a report, the scoreboard's link to its player: a fresh visit.
const openProfileAfresh = async (page: Page) => {
  await page
    .locator(".report-table")
    .first()
    .getByRole("link", { name: "A Rather Long Persona Name Fixture" })
    .click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
};

```

2. Replace:

```ts
  ).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveValue(picked);
});
```

with:

```ts
  ).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveValue(picked);
});

test("coming back keeps the matches shown, and the scroll past the first page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1260, height: 600 });
  await mockApi(page);
  await mockLongHistory(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Matches" }).click();
  const rows = page.locator(".match-row");
  await expect(rows).toHaveCount(20);
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(rows).toHaveCount(30);
  // Past the first page: its rows alone leave the page too short for it.
  await rows.nth(27).scrollIntoViewIfNeeded();
  await expect(rows.nth(19)).not.toBeInViewport();
  const scrolled = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrolled();
  const open = async () => {
    await rows.nth(27).locator("a.match-open").click();
    await expect(page).toHaveURL(`/matches/2028?player=${FARGO}`);
  };
  // Browser Back.
  await open();
  await page.goBack();
  await expect(rows).toHaveCount(30);
  await expect.poll(scrolled).toBe(before);
  // The report's "Back to profile".
  await open();
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(rows).toHaveCount(30);
  await expect.poll(scrolled).toBe(before);
  // Opened afresh, it shows the first page.
  await open();
  await openProfileAfresh(page);
  await page.getByRole("tab", { name: "Matches" }).click();
  await expect(rows).toHaveCount(20);
  // So does another filter.
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(rows).toHaveCount(30);
  await page.getByRole("button", { name: "Street Brawl", exact: true }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(rows).toHaveCount(20);
});

test("coming back keeps the Heroes tab's sort; opened afresh, it sorts by games", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Heroes" }).click();
  const wr = page.getByRole("button", { name: "WR", exact: true });
  await wr.click();
  await wr.click();
  const sorted = (name: RegExp, order: string) =>
    expect(page.getByRole("columnheader", { name })).toHaveAttribute(
      "aria-sort",
      order,
    );
  await sorted(/WR/, "ascending");
  // Browser Back from a hero's page.
  await page.locator(".hero-row .hero-link").first().click();
  await expect(page).toHaveURL(/\/heroes\/[a-z-]+$/);
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Heroes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await sorted(/WR/, "ascending");
  // The report's "Back to profile".
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await page.getByRole("tab", { name: "Heroes" }).click();
  await sorted(/WR/, "ascending");
  // Opened afresh, by games.
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await openProfileAfresh(page);
  await page.getByRole("tab", { name: "Heroes" }).click();
  await sorted(/Games/, "descending");
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts -g "coming back keeps"`
Expected: FAIL (2 failed: browser Back finds the first page again (`Expected: 30`, `Received: 20`), and Back from a hero's page sorts by Games again (`Expected: "ascending"`, `Received: ""` for WR's `aria-sort`)).

- [ ] **Step 3: The rows shown and the sort as props**

In `src/features/profile/components/MatchHistory.tsx`:

1. Replace:

```tsx
import { useEffect, useState } from "react";
import { RouteLink } from "@/app/links";
```

with:

```tsx
import { RouteLink } from "@/app/links";
```

2. Replace:

```tsx
const PAGE_SIZE = 20;
const PREVIEW_SIZE = 3;

export function MatchHistory({
  matches,
  filter = "all",
  onFilter = () => undefined,
  accountId,
  preview = false,
  onShowAll,
}: {
  matches: HistoryMatch[];
  filter?: HistoryFilter;
  onFilter?(filter: HistoryFilter): void;
  accountId: number;
  preview?: boolean;
  onShowAll?(): void;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => setVisible(PAGE_SIZE), [filter]);
  const filtered = preview
```

with:

```tsx
export const PAGE_SIZE = 20;
const PREVIEW_SIZE = 3;

export function MatchHistory({
  matches,
  filter = "all",
  onFilter = () => undefined,
  shown = PAGE_SIZE,
  onShowMore = () => undefined,
  accountId,
  preview = false,
  onShowAll,
}: {
  matches: HistoryMatch[];
  filter?: HistoryFilter;
  onFilter?(filter: HistoryFilter): void;
  // How many the full list shows: "Show more" adds a page.
  shown?: number;
  onShowMore?(shown: number): void;
  accountId: number;
  preview?: boolean;
  onShowAll?(): void;
}) {
  const filtered = preview
```

3. Replace:

```tsx
        {filtered.slice(0, visible).map((match) => {
```

with:

```tsx
        {filtered.slice(0, shown).map((match) => {
```

4. Replace:

```tsx
      {!preview && filtered.length > visible && (
        <button
          className="show-more"
          onClick={() => setVisible(visible + PAGE_SIZE)}
        >
```

with:

```tsx
      {!preview && filtered.length > shown && (
        <button
          className="show-more"
          onClick={() => onShowMore(shown + PAGE_SIZE)}
        >
```

In `src/features/profile/components/HeroesTab.tsx`:

1. Replace:

```tsx
import { useState } from "react";
import { RouteLink } from "@/app/links";
```

with:

```tsx
import { RouteLink } from "@/app/links";
```

2. Replace:

```tsx
  value === null ? NONE : format(value);

interface Column {
```

with:

```tsx
  value === null ? NONE : format(value);

export interface HeroSort {
  // The column, by its label: KDA and K/D/A both sort by `kda`.
  label: string;
  key: keyof Line;
  dir: SortDir;
}
export const FIRST_SORT: HeroSort = {
  label: "Games",
  key: "games",
  dir: "desc",
};

interface Column {
```

3. Replace:

```tsx
  filter,
  onFilter,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  filter: HistoryFilter;
  onFilter(filter: HistoryFilter): void;
}) {
  const [sort, setSort] = useState<{
    label: string;
    key: keyof Line;
    dir: SortDir;
  }>({ label: "Games", key: "games", dir: "desc" });
  const stats = useAsync(
```

with:

```tsx
  filter,
  onFilter,
  sort,
  onSort,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  filter: HistoryFilter;
  onFilter(filter: HistoryFilter): void;
  sort: HeroSort;
  onSort(sort: HeroSort): void;
}) {
  const stats = useAsync(
```

4. Replace:

```tsx
    setSort((current) =>
      current.label === label
        ? { label, key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { label, key, dir: firstDir },
    );
```

with:

```tsx
    onSort(
      sort.label === label
        ? { label, key, dir: sort.dir === "desc" ? "asc" : "desc" }
        : { label, key, dir: firstDir },
    );
```

- [ ] **Step 4: Keep them in the view**

In `src/features/profile/components/ProfileView.tsx`:

1. Replace:

```tsx
import { HeroesTab } from "./HeroesTab";
import { MatchHistory } from "./MatchHistory";
```

with:

```tsx
import { FIRST_SORT, HeroesTab, type HeroSort } from "./HeroesTab";
import { MatchHistory, PAGE_SIZE } from "./MatchHistory";
```

2. Replace:

```tsx
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
// Each profile's tab and filters as last left, for the session: coming back
// from a match report (a page of its own on the website) finds them as they
// were. Switching tabs keeps them anyway.
```

with:

```tsx
  filter: HistoryFilter;
  // The Matches tab's rows, a page more for each "Show more".
  shown: number;
  // The Heroes tab's.
  sort: HeroSort;
  range: PerformanceRange;
  // Null for all heroes.
  heroId: number | null;
}
const FIRST_VIEW: ViewState = {
  subtab: "overview",
  filter: "all",
  shown: PAGE_SIZE,
  sort: FIRST_SORT,
  range: 20,
  heroId: null,
};
// Each profile's tab, filters, rows shown and sort as last left, for the
// session: coming back from a match report (a page of its own on the
// website) finds them as they were. Switching tabs keeps them anyway.
```

3. Replace:

```tsx
  const { subtab, filter, range, heroId } = view;
```

with:

```tsx
  const { subtab, filter, shown, sort, range, heroId } = view;
```

4. Replace:

```tsx
  const setFilter = (next: HistoryFilter) => update({ filter: next });
```

with:

```tsx
  const setFilter = (next: HistoryFilter) => {
    // Another filter shows its first page.
    if (next !== latest.current.filter)
      update({ filter: next, shown: PAGE_SIZE });
  };
```

5. Replace:

```tsx
                  {...{ filter, accountId }}
                  onFilter={setFilter}
                />
```

with:

```tsx
                  {...{ filter, shown, accountId }}
                  onFilter={setFilter}
                  onShowMore={(next) => update({ shown: next })}
                />
```

6. Replace:

```tsx
          <HeroesTab {...{ accountId, history, filter }} onFilter={setFilter} />
```

with:

```tsx
          <HeroesTab
            {...{ accountId, history, filter, sort }}
            onFilter={setFilter}
            onSort={(next) => update({ sort: next })}
          />
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts`
Expected: PASS (14 tests).

Run: `npm test`
Expected: PASS (405 tests).

- [ ] **Step 6: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile/components tests/web-browser/match-report.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/components tests/web-browser/match-report.spec.ts
git commit -m "fix(profile): coming back on the website keeps Matches' Show more and the Heroes sort"
```

Expected: 154 desktop and 81 website tests pass.

---

### Task 18: A scroll position still waiting to come back is kept

**Files:**
- Modify: `src/shared/ui/useScrollBack.ts`
- Test: `tests/web-browser/match-report.spec.ts`

What changes:
- **`useScrollBack`** keeps a position still to come back: `pending` is true while a restore waits, and `stop()` clears it. The cleanup saves `scrollY` only when nothing is pending.
- **Why:** the cleanup always saved `scrollY`, even while a restore was pending. Under StrictMode (`npm run web:dev`) the first cleanup saved the router's clamped 0, so nothing came back. In production, leaving before the page had grown lost the kept position: the toolbar's Back and Forward buttons fire no takeover event.
- **Test (website):** scrolled down the Matches tab, then a report. Time moves on three minutes (Playwright's clock, used here for the first time), so the history's two-minute cache has expired. Back while the history loads again, held; Forward before it has; then, released, Back again: the position comes back. `mockLongHistory` takes a `held` promise for this.
- **Checked by hand:** `match-report.spec.ts` passes against `npm run web:dev` (StrictMode).

- [ ] **Step 1: Write the failing test**

In `tests/web-browser/match-report.spec.ts`:

1. Replace:

```ts
// Thirty matches, a page and a half of the Matches tab, each with its
// report.
async function mockLongHistory(page: Page) {
  const now = Math.floor(Date.now() / 1000);
  await page.route(
    `https://api.deadlock-api.com/v1/players/${FARGO}/match-history`,
    (route) =>
      route.fulfill({
        json: Array.from({ length: 30 }, (_, index) => ({
          ...historyRow(2001 + index, index % 2 === 0),
          start_time: now - 3600 * (index + 1),
        })),
        headers: cors,
      }),
  );
```

with:

```ts
// Thirty matches, a page and a half of the Matches tab, each with its
// report. The history is awaited on `held` first, so a test can hold it
// back.
async function mockLongHistory(
  page: Page,
  held: () => Promise<void> = () => Promise.resolve(),
) {
  const now = Math.floor(Date.now() / 1000);
  await page.route(
    `https://api.deadlock-api.com/v1/players/${FARGO}/match-history`,
    async (route) => {
      await held();
      return route.fulfill({
        json: Array.from({ length: 30 }, (_, index) => ({
          ...historyRow(2001 + index, index % 2 === 0),
          start_time: now - 3600 * (index + 1),
        })),
        headers: cors,
      });
    },
  );
```

2. Replace:

```ts
  await expect.poll(scrolled).toBe(before);
});

test("the profile keeps its tab, range and hero after a match report", async ({
```

with:

```ts
  await expect.poll(scrolled).toBe(before);
});

test("a scroll position still waiting to come back is kept", async ({
  page,
}) => {
  let hold: Promise<void> | null = null;
  let release = () => {};
  // Time is the test's to move on: the history, cached for two minutes,
  // then loads again.
  await page.clock.install();
  await page.setViewportSize({ width: 1260, height: 600 });
  await mockApi(page);
  await mockLongHistory(page, () => hold ?? Promise.resolve());
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Matches" }).click();
  const rows = page.locator(".match-row");
  await rows.nth(15).scrollIntoViewIfNeeded();
  const scrolled = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrolled();
  expect(before).toBeGreaterThan(200);
  await rows.nth(15).locator("a.match-open").click();
  await expect(page).toHaveURL(`/matches/2016?player=${FARGO}`);
  // Back while the history loads again, and Forward before it has: the
  // browser's buttons give the page no sign of the viewer scrolling.
  hold = new Promise((resolve) => (release = resolve));
  await page.clock.fastForward("03:00");
  await page.goBack();
  await expect(page.getByText("Loading match history…")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(`/matches/2016?player=${FARGO}`);
  release();
  hold = null;
  // Back again, the history loads and the position comes back.
  await page.goBack();
  await expect(rows).toHaveCount(20);
  await expect.poll(scrolled).toBe(before);
});

test("the profile keeps its tab, range and hero after a match report", async ({
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts -g "still waiting to come back"`
Expected: FAIL (`Expected: 913`, `Received: 0`: leaving before the history loaded again kept the top of the page).

- [ ] **Step 3: Keep what is still to come back**

In `src/shared/ui/useScrollBack.ts`:

1. Replace:

```ts
    let stop = () => {};
    if (y > 0) {
```

with:

```ts
    let pending = y > 0;
    let stop = () => {};
    if (pending) {
```

2. Replace:

```ts
      stop = () => {
        observer.disconnect();
```

with:

```ts
      stop = () => {
        pending = false;
        observer.disconnect();
```

3. Replace:

```ts
    return () => {
      stop();
      positions.set(key, window.scrollY);
    };
```

with:

```ts
    return () => {
      // A position still to come back stays kept: the window is only where
      // the page, too short yet, left it (left early, or StrictMode's
      // remount in development).
      if (!pending) positions.set(key, window.scrollY);
      stop();
    };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts`
Expected: PASS (15 tests).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/match-report.spec.ts -g "still waiting to come back|scrolled|keeps the matches shown" --repeat-each=5`
Expected: PASS (15 tests).

Run: `npm test`
Expected: PASS (405 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/shared/ui/useScrollBack.ts tests/web-browser/match-report.spec.ts
npm run test:browser && npm run test:web
git add src/shared/ui/useScrollBack.ts tests/web-browser/match-report.spec.ts
git commit -m "fix(profile): a scroll position still waiting to come back is kept"
```

Expected: 154 desktop and 82 website tests pass.

---

### Task 19: The chart's tip covers a shorter card's numbers

**Files:**
- Modify: `src/features/profile/styles/profile.css`
- Test: `tests/browser/home.spec.ts`

What changes (owner's choice: numbers at the foot), in CSS only:
- **`.perf-card-numbers`** takes `margin-top: auto` (keeping `margin-bottom: 6px`) in place of `.sparkline-box`, so the numbers and the chart sit together at the card's foot. The charts still line up, and the tip, which hangs from the chart, covers the numbers in every card. A card shorter than its row's tallest has a gap under its title instead.
- **A card without a chart** (no game with a value yet: "Loading match details…", "No match details") keeps its numbers under its title: `.perf-card-numbers:last-child { margin-top: 0 }`.
- **Why:** with the chart alone at the foot, a shorter card's spare height sat between its numbers and its chart, and the top of the big number showed above the tip (K/D/A at 1260 px).
- **Tests (desktop):**
  - **Five columns:** the line-up check no longer depends on the fallback font wrapping a title: a style tag makes Souls / min's title row taller. The row's charts still line up, and in K/D/A's shorter card the focused chart's tip covers the big number.
  - **Still loading:** a card without a chart has its numbers as high as Souls / min's. This passes before the fix too: it pins the `:last-child` rule.

- [ ] **Step 1: Write the failing tests**

In `tests/browser/home.spec.ts`:

1. Replace:

```ts
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
  release();
```

with:

```ts
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
  // Without a chart yet, its numbers stay under the title, as high as
  // those of a charted card in its row.
  const top = (label: string) =>
    card(page, label)
      .locator(".perf-card-numbers")
      .evaluate((el) => el.getBoundingClientRect().top);
  expect(await top("Hero damage / min")).toBe(await top("Souls / min"));
  release();
```

2. Replace:

```ts
  // A title takes two lines ("Objective damage / min"), yet the first
  // row's charts line up.
  const tops = await view(page)
    .locator(".perf-card .sparkline")
    .evaluateAll((charts) =>
      charts.slice(0, 5).map((chart) => chart.getBoundingClientRect().top),
    );
  expect(new Set(tops).size).toBe(1);
```

with:

```ts
  // One card's title row taller than the rest of its row's (as a title on
  // two lines makes it), yet the row's charts line up.
  await page.addStyleTag({
    content:
      '.perf-card[aria-label="Souls / min"] .perf-card-head { padding-bottom: 40px; }',
  });
  const head = (label: string) =>
    card(page, label).locator(".perf-card-head").boundingBox();
  expect((await head("Souls / min"))!.height).toBeGreaterThan(
    (await head("K/D/A ratio"))!.height,
  );
  const tops = await view(page)
    .locator(".perf-card .sparkline")
    .evaluateAll((charts) =>
      charts.slice(0, 5).map((chart) => chart.getBoundingClientRect().top),
    );
  expect(new Set(tops).size).toBe(1);
  // In the shorter card, a game's tip covers the numbers it stands for.
  const kda = card(page, "K/D/A ratio");
  await kda.getByRole("slider").focus();
  const tip = (await kda.locator(".spark-tip").boundingBox())!;
  const number = (await kda.locator(".perf-card-numbers b").boundingBox())!;
  expect(tip.y).toBeLessThanOrEqual(number.y);
  expect(tip.y + tip.height).toBeGreaterThanOrEqual(number.y + number.height);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/home.spec.ts -g "five columns|says what is still loading"`
Expected: FAIL (1 failed, 1 passed: in K/D/A's card the tip starts below the top of the big number (`Expected: <= 505`, `Received: 558`)).

- [ ] **Step 3: Numbers and chart at the foot**

In `src/features/profile/styles/profile.css`:

1. Replace:

```css
/* A column, its chart at the foot: in a row where one title wraps to two
   lines, the charts still line up. */
```

with:

```css
/* A column, its numbers and chart at the foot: in a row where one title
   wraps to two lines, the charts still line up, and the chart's tip still
   covers the numbers above it. */
```

2. Replace:

```css
.perf-card-numbers {
  margin-bottom: 6px;
}
```

with:

```css
.perf-card-numbers {
  margin-top: auto;
  margin-bottom: 6px;
}
/* A card without a chart (no game with a value yet) keeps its numbers
   under the title, not at the foot of a row the charts make tall. */
.perf-card-numbers:last-child {
  margin-top: 0;
}
```

3. Replace:

```css
.sparkline-box {
  position: relative;
  margin-top: auto;
}
```

with:

```css
.sparkline-box {
  position: relative;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/home.spec.ts -g "performance"`
Expected: PASS (23 tests).

Run: `npm test`
Expected: PASS (405 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npx prettier --write src/features/profile/styles/profile.css tests/browser/home.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/styles/profile.css tests/browser/home.spec.ts
git commit -m "fix(profile): the chart's tip covers a shorter card's numbers"
```

Expected: 154 desktop and 82 website tests pass.

---

### Task 20: Docs after the final review, and final check

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-21-redesign-design.md`
- Modify: `src/features/profile/utils/performance-metrics.ts` (two comments)

- [ ] **Step 1: README**

A cooldown's ten-minute maximum. The paragraph is one line, so prettier leaves it as it is.

In `README.md`:

Replace:

```markdown
The client caches in memory (two to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests. It keeps requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding them back, counting every tab of the website and every window of the app together: the counts, and the cooldowns of those three groups and of a 503 (below), are kept in `localStorage`, claimed under a Web Lock where the browser has one. A request no one waits for any more leaves the queue, and a cooldown fails the waiting ones at once. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum. The Performance tab also keeps each stored game's totals for the session.
```

with:

```markdown
The client caches in memory (two to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests. It keeps requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding them back, counting every tab of the website and every window of the app together: the counts, and the cooldowns of those three groups and of a 503 (below), are kept in `localStorage`, claimed under a Web Lock where the browser has one. A request no one waits for any more leaves the queue, and a cooldown fails the waiting ones at once. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum and, as a cooldown outlives a reload, a ten-minute maximum. The Performance tab also keeps each stored game's totals for the session.
```

- [ ] **Step 2: Spec**

The second pass's paragraph, corrected: Retry keeps focus on the tab's match-details and rank notices and the report's rank note (not every Retry); a cooldown lasts at most ten minutes; the tip sits right under the title row only in a row's tallest card.

In `docs/superpowers/specs/2026-10-21-redesign-design.md`:

Replace:

```markdown
Changed after phase 4 (second follow-up pass): the ten cards run five a row where there is room, each share under its per-minute card. Over games on more than one hero the shares claim no trend, as the hero mix moves them more than form does. A range or hero left before it loads drops the requests it still waits for. A profile opened afresh starts at Overview; coming back from its match report, or with the browser's Back, finds it as it was left, on the website its scroll position too. The report and the tab share one rank rule, and a current rank that didn't load says so, with Retry. Retry keeps keyboard focus in place. The report's Impact gives no share of a team total of 0. The API client counts every tab and window of the app against one budget, with the Live statistics and the compact build now going through it, and a cooldown fails waiting requests at once. Kept as they were, by the owner's decision: the tip covers the card's numbers, so the whole line stays in sight; it sits right under the title row; and Enter on a chart opens the picked game's report, which the slider pattern doesn't define but the chart's label announces.
```

with:

```markdown
Changed after phase 4 (second follow-up pass): the ten cards run five a row where there is room, each share under its per-minute card. Over games on more than one hero the shares claim no trend, as the hero mix moves them more than form does. A range or hero left before it loads drops the requests it still waits for. A profile opened afresh starts at Overview; coming back from its match report, or with the browser's Back, finds it as it was left, on the website its scroll position too. The report and the tab share one rank rule, and a current rank that didn't load says so, with Retry. Retry on the tab's match-details and rank notices, and on the report's rank note, keeps keyboard focus in place. The report's Impact gives no share of a team total of 0. The API client counts every tab and window of the app against one budget, with the Live statistics and the compact build now going through it, and a cooldown fails waiting requests at once and lasts at most ten minutes. Kept as they were, by the owner's decision: the tip covers the card's numbers, so the whole line stays in sight, and in a row's tallest card it sits right under the title row (the numbers now sit with the chart at the card's foot, so a shorter card has a gap under its title); and Enter on a chart opens the picked game's report, which the slider pattern doesn't define but the chart's label announces.
```

The spec has never been prettier-formatted: leave its existing formatting alone. Check that the edit adds no new differences (prettier's differences from the file are the ones it had before the edit):

```bash
spec=docs/superpowers/specs/2026-10-21-redesign-design.md
diff <(git show HEAD:$spec | npx prettier --stdin-filepath $spec | diff - <(git show HEAD:$spec)) <(npx prettier $spec | diff - $spec)
```

Expected: no output.

- [ ] **Step 3: Two comments**

In `src/features/profile/utils/performance-metrics.ts`:

1. Replace:

```ts
  // change of hero moves it as much as form does, so it claims no trend.
```

with:

```ts
  // change of hero moves it more than form does, so it claims no trend.
```

2. Replace:

```ts
 * doesn't read as a change in form; otherwise the values themselves.
 */
```

with:

```ts
 * doesn't read as a change in form; otherwise the values themselves, and
 * only over one hero's games (`heroMix`).
 */
```

- [ ] **Step 4: Final check**

Run all of these; every one must pass:
- `npm test` (405)
- `npx tsc --noEmit`
- `npm run web:typecheck`
- `npm run test:browser` (154)
- `npm run test:web` (82)
- `npm run build`
- `npm run web:build`
- `npm run validate:manifest`

- [ ] **Step 5: Commit**

Check the README and the comments with prettier; the spec was checked in Step 2.

```bash
npx prettier --check README.md src/features/profile/utils/performance-metrics.ts
git add README.md docs/superpowers/specs/2026-10-21-redesign-design.md src/features/profile/utils/performance-metrics.ts
git commit -m "docs: the second pass's notes after its final review"
```
