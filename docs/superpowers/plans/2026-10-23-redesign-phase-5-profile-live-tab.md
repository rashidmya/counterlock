# Redesign phase 5 — the profile's Live tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every profile a fifth tab, **Live**, in the app and on the website (spec: "Profile Live tab (app and website)"):
- **Any player** (the website, and anyone but your own account in the app): their match from the game's Watch list, when it lists them: both teams' heroes and players, the souls lead (rounds won in Street Brawl), the mode, how long it has been running and each team's objectives still standing. Otherwise **No live match found** and why, never "Not in a game".
- **Checked again every minute** while the tab is on screen, keeping the last answer meanwhile.
- **Your own account in the desktop app:** your match from Overwolf, as on the Live page, or **Not in a game**.
- **The final review's fixes (Tasks 6–9):** a check that finds the match over, or a new match in its place, leaves focus in the tab; the tests wait for each answer and name headings exactly; the objectives' labels are readable, and your own tab's error has room under it; the docs and three comments say what the code does.

**Architecture:**
- **`src/features/profile/utils/live-match.ts`** (new, pure): `parseLiveMatch()` reads `GET /v1/matches/active` into a `LiveMatch`; `standing()` decodes a team's objectives mask; `elapsedS()` and `soulLead()`. **`services/live-api.ts`** (new): `fetchLiveMatch()` through the shared client, with a new `TTL.live`.
- **`hooks/useLiveMatch.ts`** (new) loads the match, asks again every minute while the tab's element is on screen (the desktop app keeps visited pages mounted, hidden) and keeps the last answer through a check or Retry. **`DeadlockApi.get`** gains `{ fresh }`, to ask past the browser's HTTP cache.
- **`components/LiveTab.tsx`** (new): the tab; `LiveNotice`, a notice with Retry, and `LiveMatchView`, the match (keyed by its id), each handing focus still inside it to the status line when a check takes it away (`useKeepFocus`, Task 6); and `LiveEmpty`, the empty state both sources use. `ProfileView` gains the `live` subtab and an optional `live` node, which `ProfilePage` passes on.
- **`src/features/live/components/OwnLiveTab.tsx`** (new): your own account's tab in the app, `MatchOverview` (now with `embedded`, a section header instead of the page title) or "Not in a game". `DesktopApp` passes it for the account Overwolf reports playing on this PC, or else the remembered one.
- **CSS:** the tab's styles at the end of `profile.css`; on phones (`web/app/styles/phone.css`) the stats and teams take one column and the five profile tabs spread over one row.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8 (web), plain global CSS with the noir tokens, Vitest 5, Playwright 1.64 (its `page.clock` for the refresh tests).

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md` ("Profile Live tab (app and website)", the Decisions' "Profile Live tab empty state" call, "Delivery phases" item 5). The owner asked on 2026-10-23 for the plan to be written and reviewed without stopping for questions; the design calls below are marked as the builder's, and the ones worth the owner's eye are under "Follow-ups for the owner".

**Every code block in this plan was built and run before the plan was written** (reference commits in a scratch worktree, replayed from this plan's blocks). Tasks 6–9, the final review's fixes, were built and checked the same way after Tasks 1–5 ran. The full result:
- `npm test` 417 passed;
- `npm run test:browser` 160 passed;
- `npm run test:web` 96 passed;
- both type checks, `npm run build`, `npm run web:build` and `npm run validate:manifest` passed.

Each task's end state was also checked on its own: type check and unit tests after every task (417 after each, Tasks 6–9 too), and both browser suites after every task (desktop 154, 155, 156, 159 and 159, then 159, 159, 160 and 160 for Tasks 6–9; website 82, 89, 94, 94 and 94, then 96, 96, 96 and 96).

Before the plan was written, the reference commits were reviewed twice, and every finding was fixed in the task it belonged to (listed under the decisions below: the browser's cache, quiet checks and focus, nothing made up, accounts of 0, the visibility check, your own account, the duplicate id, the objective cards' alignment). After Tasks 1–5 ran, the final review's findings were fixed in Tasks 6–9 (under "Final review fixes" below) or listed for the owner. Tasks 6–9 ran on main on 2026-10-24; their final review found nothing worse than Minor (the last two follow-ups).

Copy the code as given. If something fails, fix the cause rather than the test.

## Decisions made while planning (checked against the live API on 2026-10-23)

- **One player's match.** `GET /v1/matches/active?account_ids={id}` answers with that player's match, or `[]` (checked with curl; a non-numeric id gives 400). The unfiltered list held 150 matches (117 normal, 33 Street Brawl; 250 KB). The endpoint allows 100 requests a second per IP, so it isn't one of the client's rate-limited groups.
- **Past the browser's cache.** The answers carry `cache-control: public, max-age=120, stale-while-revalidate=120` (Cloudflare). A real browser kept serving its own copy for over two minutes (the review measured it: the same answer at 0, 60 and 125 s), so every other check would have been a no-op. `DeadlockApi.get` takes a fourth argument, `{ fresh }`, which adds `cache: "no-cache"` to the request (no CORS preflight); `fetchLiveMatch` passes `{ fresh: true }`. Cloudflare's own copy can still be a couple of minutes old (an `age` of 125 s was seen), so the tab's note says "a few minutes". `TTL.live` is 30 s, under the minute between checks. No refresh button: it couldn't fetch anything newer.
- **Match time.** `duration_s` was null in all 150 matches, so the tab shows the minutes since `start_time` ("23 min, since it started"); `elapsedS()` takes `duration_s` instead should the API fill it.
- **Objectives.** Each team's `team_stats[].objectives_mask` (the same value as `objectives_mask_team0/1`) has one bit per objective, as numbered in the game's `ECitadelObjective` (SteamDatabase's Protobufs, `deadlock/citadel_gcmessages_common.proto`): 0 Core, 1–4 the Tier 1 and 5–8 the Tier 2 objectives of lanes 1–4, 9 Titan, 10–11 the two Titan shield generators, 12–15 the barrack bosses of lanes 1–4.
  - **Set while standing:** masks start at 65535 and lose bits as the match goes on.
  - **Lanes 1, 3 and 4:** lane 2's bits (2, 6 and 13) never cleared, even in a 51-minute match whose team had lost every other objective but the Core.
  - **The Patron's two phases:** in finished match 122103973's metadata, Titan fell at 27:07, ten seconds after the second shield generator, and the Core at 31:47, when the match ended (1,908 s). The tab shows the Patron "Standing" while bit 9 is set, "Weakened" once it clears and "Destroyed" once bit 0 does.
  - **Names** are the game's: Guardians (Tier 1), Walkers (Tier 2), Base Guardians (barrack bosses), Shrines (shield generators) and Patron, each counted out of 3, 3, 3 and 2.
- **Street Brawl** (game mode 4, eight players): its masks never change (65093) and both teams' souls are equal (for example 192,000 each), so the tab shows the rounds each team has won (`brawl_score`) in place of the souls lead, and no objectives.
- **Teams:** API team 0 is Amber and team 1 Sapphire, as in the match report (`TEAM_NAMES`), in the report's scoreboard colours (`--ally`, `--enemy`).
- **Mode:** `game_mode` and `match_mode` use match history's codes, so the profile's `modeLabel()` names it ("Ranked", "Normal", "Street Brawl"); it now takes any `{ gameMode, matchMode }`.
- **Names and links:** one `GET /v1/players/steam` for everyone in the match ("Player {id}" where it has no name); every other player links to their profile. A player whose account is 0 (none in the sample, but the schema allows it) shows their hero alone, with no link, as the match report's scoreboard does. No ranks: a rank lookup per roster would spend the rank budget (20 a minute) for something the spec doesn't ask for.
- **Nothing made up:** a team's souls and objectives come from `team_stats`, or else the match's own `net_worth_team_{n}` and `objectives_mask_team{n}`; where neither has them the card shows "—" ("not given") rather than a lead built on a 0.
- **Only while shown.** The desktop app keeps visited pages mounted, hidden, and the website can sit in a background tab: before each check the tab looks at `document.visibilityState` and whether its own element has a box (`getClientRects()`, which every browser has; Safari before 17.4 has no `checkVisibility()`). A check that falls due while it is hidden waits, looking every 5 s, and goes out once it is back.
- **Quiet checks, and focus.** The minute's checks don't set `loading`, so they aren't announced, and an error notice and its Retry stay where they are while one runs. A check that fails says "Couldn't check again: {error}" with Retry and keeps the last answer. Retry moves focus to the tab's status line first, as the Performance tab's Retry does (not every browser focuses a clicked button). A check that goes well takes the notice away, and one that finds the match over, or a new match in its place, takes the match away (`LiveMatchView` is keyed by match id): the layout-effect cleanup both use (`useKeepFocus`, Task 6), which React runs before it removes them, moves focus that is still inside them to the status line, and leaves focus anywhere else alone.
- **Your own account** in the app is the account Overwolf reports playing on this PC (`state.localAccountId`, kept across matches), or else the remembered one (`me.meId`). Its Live tab never asks the Watch list. In a match it shows `MatchOverview` with `embedded`: a section header ("Live match · {hero}") instead of the Live page's title, so the profile keeps its single `h1`. Otherwise "Not in a game", with "Deadlock is running: your match shows here as soon as it loads." or "Deadlock isn't running. Your match shows here once you're in one."
- **One id fewer:** `BuildPanel`'s `id="build-content"` (nothing refers to it) goes, as the Live page and your own Live tab can be mounted at once.
- **Objective cards** keep their value at the foot, so "Base Guardians", whose label takes two lines in a narrow card, lines up with the rest.
- **Phones:** the five profile tabs spread over one row (`space-between`, at least 10 px apart; they wrap only below about 340 px), and the stats and teams take one column. Checked at 375 and 360 px.
- **Kept as decided (owner's choice):** your own Live tab's waiting copy, "Deadlock is running: your match shows here as soon as it loads.", stays, though the app switches to the Live page once per match when your match loads, and "My profile" then opens the profile afresh at Overview.
- **Final review fixes (2026-10-24), Tasks 6–9,** from the final review and the review of its fixes, after Tasks 1–5 ran:
  - **A check that ends or replaces the match leaves focus in the tab.** With focus on a player's link, a check that found the match over put "No live match found" in its place and focus fell to the page. So did a new match in place of the last: rows go by position, so the focused row could become the player's own (no link), one with an account of 0 or a row past the team's new size. `LiveNotice`'s cleanup becomes `useKeepFocus(inside, status)`, which `LiveMatchView` uses too, on `.live-teams`, and the view is keyed by match id, so a new match is a new view (the last one's failed portraits go with it). Rows stay keyed by position: within one match, focus stays on the same link (while the API keeps the players in order). The comment by Retry says why it moves focus itself: not every browser focuses a clicked button, so the notice's cleanup could find no focus in it.
  - **The tests wait for each answer.** "The minute's checks leave the notice…" counted a request when it reached the route, then moved the clock a minute at once: an answer the page handled late scheduled its next check after the jump (with the answer held 150 ms, the test failed 3 times in 3). It now waits 300 ms after the count, the file's way, and so does the check that nothing was asked at 30 s. The desktop test that finds "Live match" names it exactly, and the unit test of lane 2's Guardian starts from a full mask, so it can fail.
  - **Readable objective labels:** `--muted` (6.8:1 on `--surface-2`) rather than `--dim` (3.9:1, under AA's 4.5:1 at 10.5 px), as the tab's other labels.
  - **Room under your own tab's error:** `.live-tab > .notice`, meant for the Watch list's notice, also caught `MatchOverview`'s error banner, whose bottom border then met the build panel's. `.live-tab.own > .notice` gives it 14 px under it and keeps it flush with the profile's padding at every width (checked at 1260, 1000 and 850 px).
  - **The docs** say every other player links to their profile, `duration_s` has been empty so far, the website has no live data from your own game, and the Live tab's requests are checked with the API rather than skipping the browser's cache; the Windows checklist covers the Live tab. Three comments: the API's copy "can be two minutes old", bit 9 is the Patron's first phase, and a path is always asked for `fresh`, or never.

## Follow-ups for the owner (not built)

Update 2026-10-24: this list records the state after phase 5. The implementation and current manual checks are tracked in [Phase 4 and phase 5 follow-ups](2026-10-24-phase-4-5-follow-ups.md).

- **Ranks** of the players in a live match aren't shown (above). The Live page shows them for your own match.
- **Region and spectators:** the API gives both (`region_mode_parsed`, `spectators`); the tab shows neither.
- **After the match:** the tab drops to "No live match found" once the Watch list does; it doesn't link to the match report, which only exists once the API has stored the match.
- **No live mark on the tab's label:** the profile's **Live** tab doesn't show whether the player is in a match until it is opened.
- **"Weakened" and the Core** come from one finished match and the protobuf names; the in-game wording is unchecked.
- **Match time** counts from the API's `start_time`, which may include the time before the match clock starts; unchecked against the game's clock.
- **Before Overwolf reports this PC's account**, the remembered account counts as yours. "This PC's account" is also decided two ways: `recordDetectedAccount` takes the local player's account from the match roster too, while `DesktopApp` uses `state.localAccountId` alone, so for a moment the remembered account can count.
- **Overwolf:** `visibilityState` in hidden or minimised Overwolf windows is unchecked (it needs Windows and Overwolf); it is on the README's Windows checklist.
- **Your own tab's waiting copy (kept, owner's choice; may revisit):** "Deadlock is running: your match shows here as soon as it loads." The app switches to the Live page once per match when your match loads, so the profile is hidden by then, and "My profile" opens it afresh at Overview. "Your match shows here once you're in one." reads the same way.
- **Names** show "Player {id}", the viewed player's too, until the name lookup answers, and a failed lookup isn't asked again (Retry asks the Watch list only), as the profile header does.
- **Screen readers** hear neither "found" nor "No live match found" when the first look ends, and a failure's notice is a newly inserted `role="status"`, which VoiceOver may not read, as on the Performance tab.
- **Focus handed back by a quiet check** lands on the status line, which may be empty and shows no ring, and scrolls the page up to it (on a phone, from a Sapphire player's link most of a screen).
- **Your own tab drops focus to the page** when Overwolf reports the match over, as the Live page does.
- **A Watch-list tab that appears while its profile is hidden** (Switch account from your own profile) makes one request before it looks at visibility.
- **The player's own row without a hero drops the whole match:** rows without an id, hero or team are left out before the player is looked for. None in the sample.
- **Names could flicker each minute** if the API reordered the players: the lookup is keyed by the ids in order. A focused link could then show another player, or fall to the page if it became the player's own row. Unchecked.
- **A profile hidden in the app looks every 5 s** while hidden; `visibilitychange` and a `ResizeObserver` would make it event-driven.
- **Tests not written:** browser tests of "Even", "Destroyed" and Street Brawl's "—" (unit tests cover them); `team_stats` winning over the top-level fields when they differ; `fetchLiveMatch` passing its signal.
- **Retry shifts the tab a little:** while it runs, the notice gives way to the status line ("Checking again…"), which is shorter. The Performance tab's status takes no space of its own; this one does.
- **A hidden profile in the desktop app isn't shown again:** every way back to a profile but the match report's "Back to profile" opens it afresh, so a Live tab left behind another page only stops checking. Coming back on the website is tested.
- **Objectives the API leaves out:** a team with neither `team_stats[].objectives_mask` nor `objectives_mask_team{n}` has no "Objectives standing" block, and nothing says why. The README and the spec say a value the API leaves out shows "—", which holds for souls and rounds only. None in the sample.
- **Three nits from the fix pass's final review:** the comment on `LiveMatchView`'s ref ("the players' links are all the view has to focus" reads as "must"; say they are "the only things in the view that take focus"); `profile.css`'s `/* MatchOverview's error. */` sits over `.live-tab.own .workspace` too (move the rule below it, saying it overrides the Watch list notice's margin); and the desktop test `a profile hidden behind another page of the app checks nothing` moves the clock on after an answer it can't see without the 300 ms wait Review Focus 4 asks for (it still catches a broken visibility check: 15 times in 15 with the answer held).
- The second follow-up pass's list (`docs/superpowers/plans/2026-10-23-redesign-phase-4-second-follow-ups.md`, "Follow-ups for the owner") still stands.

## Global Constraints

- Every colour comes from `src/app/styles/tokens.css` (`var(--token)` or `rgb(from var(--token) r g b / a)`). `tests/app/theme.test.ts` fails on any hex literal in `src/**/*.css`, `web/app/**/*.css` or `src/**/*.tsx`.
- One shared copy of the feature code for the app and the website. Never match players by nickname; no demo data outside test fixtures.
- **Exported, and imported by tests:** `parseLiveMatch`, `standing`, `elapsedS` and `soulLead` (now `soulLead(amber, sapphire)`) from `live-match.ts`; `fetchLiveMatch` from `live-api.ts`; `TTL.live`. `DeadlockApi.get(path, ttl, signal?, { fresh }?)` takes a fourth argument. The fixture `tests/fixtures/live-match.ts` uses relative imports only (Playwright loads it too).
- **Exported for other modules:** `LiveEmpty` from `LiveTab.tsx` (`OwnLiveTab` uses it); `MatchOverview` takes `embedded`; `ProfilePage` and `ProfileView` take `live`.
- **New copy strings (tests assert them; Tasks 6–9 add none):**
  - "Live match", "Match time", "since it started", "Souls lead", "Even", "Amber {souls} – {souls} Sapphire", "not given", "Rounds won", "Amber – Sapphire", "Mode", "Match {id}", "Objectives standing", "Guardians", "Walkers", "Base Guardians", "Shrines", "Patron", "Standing", "Weakened", "Destroyed".
  - **Empty:** "No live match found" with "Live matches show here only while the game's Watch list has them: about the top 200 matches being played. This tab checks again every minute."
  - **Status:** "Looking for a live match…", "Checking again…".
  - **Notices:** "Live matches unavailable: {error}" and "Couldn't check again: {error}", each with Retry.
  - **Note:** "From the game's Watch list, through Deadlock API, checked again every minute while this tab is open. The API's copy of the list can be a few minutes old."
  - **Own account:** "Live match · {hero}", "Not in a game", "Deadlock is running: your match shows here as soon as it loads.", "Deadlock isn't running. Your match shows here once you're in one."
- **Before every commit**, run `npm test`, `npx tsc --noEmit` and `npm run web:typecheck`.
- **Browser suites:** `npm run test:browser` (desktop, port 5186) and `npm run test:web` (website, builds and serves on 5187). If a port is busy, free it with `fuser -k <port>/tcp`; never `pkill -f`.
- **Formatting:** format touched files with `npx prettier --write <files>`. The spec file has never been prettier-formatted: leave its existing formatting alone and check only that your edit adds no new differences.
- **Commits:** plain conventional commits with **no AI attribution lines or trailers** (owner rule).

## Review Focus

1. **Reading the Watch list.** One player's match, both teams, the mode; a team without stats falls back to the match's own fields, and nothing stands in for what neither has. Tests: `reads the account's match: players, teams and modes`, `falls back to the match's own fields for a team without stats, and has nothing where neither has it`, `leaves out players without an id, hero or team, and keeps one without an account`, `nothing stands in for souls the API didn't give, nor a link for a player without an account`.
2. **Objectives.** Lanes 1, 3 and 4 only; the Patron standing, weakened or destroyed. Tests: `counts everything at the start`, `counts lanes 1, 3 and 4 only`, `has the Patron weakened once its first phase is down, and destroyed with the last`, `the Live tab shows the player's live match from the Watch list`.
3. **Fresh answers.** Only the live request asks past the browser's cache. Tests: `asks past the browser's cache for a fresh request only`, `asks the Watch list for the account alone, past the browser's cache`.
4. **The minute's checks.** Every minute while shown; nothing while hidden; a check that fell due while hidden goes out once the page is back. A test that checks nothing was asked, or moves the clock on after an answer it can't see, first waits 300 ms (Task 7). Tests: `the Live tab checks again every minute while it's open`, `a check that falls due while the page is hidden waits until it's back`, `a profile hidden behind another page of the app checks nothing`.
5. **Failures and focus.** A failure keeps the last answer and offers Retry; Retry, a quiet check, a check that goes well and one that finds the match over or a new match never drop focus to the page, nor take it from elsewhere. Tests: `a failed lookup says so; Retry keeps focus in place and asks again`, `a check that fails keeps the match shown and says so; Retry asks again`, `the minute's checks leave the notice, and focus on its Retry, in place`, `a check that goes well leaves alone focus that has left the notice`, `a check that finds the match over leaves focus in the tab`, `a new match in place of the last leaves focus in the tab`.
6. **The empty state.** "No live match found", never "Not in a game", for the Watch list. Test: `a player off the Watch list has no live match found, never 'Not in a game'`.
7. **Your own account.** Overwolf's match, or "Not in a game", never the Watch list, for the account Overwolf reports on this PC or else the remembered one; an error from Overwolf keeps clear of the build below it. Tests: `your own Live tab in the app shows the match from Overwolf, not the Watch list`, `your own Live tab says Deadlock isn't running`, `your own Live tab keeps an error clear of the build below it`, `the account Overwolf reports on this PC gets the Overwolf tab, whichever account is remembered`.
8. **Phones.** Tests: `the profile's Live tab stacks the teams, with its five tabs in one row`, and the existing `profile page has no page scroll; wide tables scroll inside their container`.

## File structure

| File | Responsibility |
|---|---|
| `src/features/profile/utils/live-match.ts` (new) | `LiveMatch` from the Watch list; a team's objectives still standing; match time; the souls lead |
| `src/features/profile/services/live-api.ts` (new) | `fetchLiveMatch()` through the shared client, fresh |
| `src/shared/api/DeadlockApi.ts` | `TTL.live`; `get(…, { fresh })` asks past the browser's cache |
| `src/features/profile/utils/match-history.ts` | `modeLabel()` takes any `{ gameMode, matchMode }` |
| `src/features/profile/hooks/useLiveMatch.ts` (new) | The live match, checked again every minute while shown, quietly |
| `src/features/profile/components/LiveTab.tsx` (new) | The tab: status, notice with Retry (`LiveNotice`), empty state (`LiveEmpty`), stats, teams and objectives; focus handed to the status when a check takes the notice or the match away (`useKeepFocus`) |
| `src/features/profile/components/ProfileView.tsx` | The `live` subtab; a `live` node in place of the Watch list's tab |
| `src/features/profile/components/ProfilePage.tsx` | Passes `live` on |
| `src/features/live/components/OwnLiveTab.tsx` (new) | Your own account's tab in the app: `MatchOverview` or "Not in a game" |
| `src/features/match/components/MatchOverview.tsx` | `embedded`: a section header instead of the page title |
| `src/app/DesktopApp.tsx` | `OwnLiveTab` for the account Overwolf reports, or else the remembered one |
| `src/features/builds/components/BuildPanel.tsx` | No `id="build-content"` |
| `src/features/profile/styles/profile.css` | The tab's styles; your own match inside the profile's padding |
| `web/app/styles/phone.css` | One column for the stats and teams; five tabs over one row |
| `tests/fixtures/live-match.ts` (new) | `activeMatch()`, a Watch list entry shaped like the API's |
| `tests/profile/live-match.test.ts` (new) | Parsing, objectives, match time, souls lead, the request |
| `tests/browser/profile-live.spec.ts` (new) | The app: another player's tab, a hidden page, your own account |
| `tests/web-browser/profile-live.spec.ts` (new) | The website: the match, Street Brawl, missing data, the empty state, failures, the minute's checks, focus |

---

### Task 1: Read a player's live match from the game's Watch list

**Files:**
- Create: `src/features/profile/utils/live-match.ts`, `src/features/profile/services/live-api.ts`, `tests/fixtures/live-match.ts`
- Modify: `src/shared/api/DeadlockApi.ts`, `src/features/profile/utils/match-history.ts`
- Test: `tests/profile/live-match.test.ts` (new), `tests/shared/DeadlockApi.test.ts`

`parseLiveMatch()` reads `GET /v1/matches/active?account_ids={id}` into a `LiveMatch` (or null), `standing()` decodes a team's objectives mask (see "Decisions made while planning"), and `elapsedS()` and `soulLead()` give the match time and the souls lead. `fetchLiveMatch()` asks through the shared client, past the browser's HTTP cache: `DeadlockApi.get` takes a fourth argument, `{ fresh }`, which adds `cache: "no-cache"` to the request. `modeLabel()` takes any `{ gameMode, matchMode }`, so the tab can name the mode.

- [ ] **Step 1: Write the failing tests**

Create `tests/fixtures/live-match.ts`:

```ts
// Synthetic `GET /v1/matches/active` entries, shaped like the API's (checked
// 2026-10-23), for the profile Live tab tests (unit, desktop and website).
// Relative imports only: Playwright loads this file too.
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

export const LIVE_MATCH_ID = 123009323;
export const liveHeroes = catalog.heroes.slice(0, 12);
// Every objective standing.
export const ALL_STANDING = 65535;

export interface LiveOptions {
  matchId?: number;
  // Unix seconds; 23 minutes ago unless a test says otherwise.
  startTime?: number;
  gameMode?: number;
  matchMode?: number;
  netWorth?: [number, number];
  masks?: [number, number];
  rounds?: [number, number];
  spectators?: number;
}

/**
 * One live match: `accountId` plays the first hero, on Amber (team 0), with
 * 7001… for everyone else; Street Brawl (game mode 4) has eight players.
 */
export function activeMatch(accountId: number, options: LiveOptions = {}) {
  const {
    matchId = LIVE_MATCH_ID,
    startTime = Math.floor(Date.now() / 1000) - 23 * 60,
    gameMode = 1,
    matchMode = 4,
    netWorth = [111527, 106101],
    masks = [ALL_STANDING, ALL_STANDING],
    rounds = [0, 0],
    spectators = 3,
  } = options;
  const size = gameMode === 4 ? 8 : 12;
  const team = (index: number) => (index < size / 2 ? 0 : 1);
  return {
    start_time: startTime,
    winning_team: null,
    winning_team_parsed: null,
    match_id: matchId,
    players: liveHeroes.slice(0, size).map((hero, index) => ({
      account_id: index === 0 ? accountId : 7000 + index,
      team: team(index),
      team_parsed: `Team${team(index)}`,
      abandoned: null,
      hero_id: hero.id,
    })),
    lobby_id: 102134168838182752,
    game_mode_version: 1,
    net_worth_team_0: netWorth[0],
    net_worth_team_1: netWorth[1],
    duration_s: null,
    spectators,
    open_spectator_slots: 10 - spectators,
    objectives_mask_team0: masks[0],
    objectives_mask_team1: masks[1],
    match_mode: matchMode,
    match_mode_parsed: matchMode === 4 ? "Ranked" : "Unranked",
    game_mode: gameMode,
    game_mode_parsed:
      gameMode === 4
        ? "KECitadelGameModeStreetBrawl"
        : "KECitadelGameModeNormal",
    match_score: 2200,
    region_mode: 1,
    region_mode_parsed: "europe",
    compat_version: 6819,
    low_pri_pool: false,
    team_stats: [0, 1].map((id) => ({
      team: id,
      team_parsed: `Team${id}`,
      net_worth: netWorth[id],
      objectives_mask: masks[id],
      brawl_score: rounds[id],
    })),
  };
}
```

Create `tests/profile/live-match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TTL, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchLiveMatch } from "@/features/profile/services/live-api";
import {
  elapsedS,
  parseLiveMatch,
  soulLead,
  standing,
} from "@/features/profile/utils/live-match";
import { modeLabel } from "@/features/profile/utils/match-history";
import {
  ALL_STANDING,
  LIVE_MATCH_ID,
  activeMatch,
  liveHeroes,
} from "../fixtures/live-match";

const ME = 42;

describe("parseLiveMatch", () => {
  it("reads the account's match: players, teams and modes", () => {
    const match = parseLiveMatch(
      [
        activeMatch(9, { matchId: 1 }),
        activeMatch(ME, {
          startTime: 1_792_770_000,
          netWorth: [90000, 95000],
          masks: [ALL_STANDING, 0b1111111111100101],
        }),
      ],
      ME,
    );
    expect(match).toMatchObject({
      matchId: LIVE_MATCH_ID,
      startTime: 1_792_770_000,
      durationS: null,
      gameMode: 1,
      matchMode: 4,
      teams: {
        0: { netWorth: 90000, objectives: ALL_STANDING, rounds: 0 },
        1: { netWorth: 95000, objectives: 0b1111111111100101, rounds: 0 },
      },
    });
    expect(match?.players).toHaveLength(12);
    expect(match?.players[0]).toEqual({
      accountId: ME,
      heroId: liveHeroes[0].id,
      team: 0,
    });
    expect(match?.players.filter((p) => p.team === 1)).toHaveLength(6);
    expect(modeLabel(match!)).toBe("Ranked");
  });

  it("reads Street Brawl's rounds", () => {
    const match = parseLiveMatch(
      [activeMatch(ME, { gameMode: 4, matchMode: 1, rounds: [2, 1] })],
      ME,
    );
    expect(match?.players).toHaveLength(8);
    expect(match?.teams[0].rounds).toBe(2);
    expect(match?.teams[1].rounds).toBe(1);
    expect(modeLabel(match!)).toBe("Street Brawl");
  });

  it("is null when the account isn't in any listed match", () => {
    expect(parseLiveMatch([activeMatch(9)], ME)).toBeNull();
    expect(parseLiveMatch([], ME)).toBeNull();
    expect(parseLiveMatch({ error: "busy" }, ME)).toBeNull();
  });

  it("leaves out players without an id, hero or team, and keeps one without an account", () => {
    const raw = activeMatch(ME);
    raw.players[1] = { ...raw.players[1], account_id: null as never };
    raw.players[2] = { ...raw.players[2], team: 2 };
    raw.players[3] = { ...raw.players[3], account_id: 0 };
    const players = parseLiveMatch([raw], ME)?.players;
    expect(players).toHaveLength(10);
    expect(players?.filter((p) => p.accountId === 0)).toHaveLength(1);
  });

  it("falls back to the match's own fields for a team without stats, and has nothing where neither has it", () => {
    const raw = activeMatch(ME, {
      netWorth: [90000, 95000],
      masks: [ALL_STANDING, 12345],
    });
    raw.team_stats = [raw.team_stats[0]];
    expect(parseLiveMatch([raw], ME)?.teams[1]).toEqual({
      netWorth: 95000,
      objectives: 12345,
      rounds: null,
    });
    const bare: Record<string, unknown> = { ...raw };
    delete bare.net_worth_team_1;
    delete bare.objectives_mask_team1;
    expect(parseLiveMatch([bare], ME)?.teams[1]).toEqual({
      netWorth: null,
      objectives: null,
      rounds: null,
    });
  });
});

describe("standing", () => {
  it("counts everything at the start", () => {
    expect(standing(ALL_STANDING)).toEqual({
      guardians: 3,
      walkers: 3,
      baseGuardians: 3,
      shrines: 2,
      patron: "standing",
    });
  });

  it("counts lanes 1, 3 and 4 only", () => {
    // 24 minutes in (a real mask): the three Guardians are down.
    expect(standing(0b1111111111100101)).toMatchObject({
      guardians: 0,
      walkers: 3,
    });
    // Lane 2's Guardian bit gone too changes nothing.
    expect(standing(0b1111111111100001).guardians).toBe(0);
  });

  it("has the Patron weakened once its first phase is down, and destroyed with the last", () => {
    // 51 minutes in (a real mask): only the last phase and lane 2's bits.
    expect(standing(0b10000001000101)).toEqual({
      guardians: 0,
      walkers: 0,
      baseGuardians: 0,
      shrines: 0,
      patron: "weakened",
    });
    expect(standing(0b10000001000100).patron).toBe("destroyed");
  });
});

describe("elapsedS", () => {
  it("counts from the start, or takes the API's duration when it has one", () => {
    const match = parseLiveMatch([activeMatch(ME, { startTime: 1000 })], ME)!;
    expect(elapsedS(match, 1_381_900)).toBe(381);
    expect(elapsedS(match, 0)).toBe(0);
    expect(elapsedS({ ...match, durationS: 600 }, 1_381_000)).toBe(600);
  });
});

describe("soulLead", () => {
  it("names the team ahead and by how many souls", () => {
    expect(soulLead(111527, 106101)).toEqual({ team: 0, souls: 5426 });
    expect(soulLead(90000, 95000)).toEqual({ team: 1, souls: 5000 });
    expect(soulLead(192000, 192000)).toBeNull();
  });
});

describe("fetchLiveMatch", () => {
  it("asks the Watch list for the account alone, past the browser's cache", async () => {
    const calls: unknown[][] = [];
    const api = {
      get: async (path: string, ttl: number, _: unknown, options: unknown) => {
        calls.push([path, ttl, options]);
        return [activeMatch(ME)];
      },
    } as unknown as DeadlockApi;
    const match = await fetchLiveMatch(ME, api);
    expect(calls).toEqual([
      [`/v1/matches/active?account_ids=${ME}`, TTL.live, { fresh: true }],
    ]);
    expect(match?.matchId).toBe(LIVE_MATCH_ID);
  });
});
```

In `tests/shared/DeadlockApi.test.ts`:

1. Replace:

```ts
  });

  it("exposes ttl presets", () => {
    expect(TTL).toEqual({
```

with:

```ts
  });

  it("asks past the browser's cache for a fresh request only", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json([]));
    const api = new DeadlockApi(request, () => 0);
    await api.get("/v1/matches/active?account_ids=1", 30_000, undefined, {
      fresh: true,
    });
    await api.get("/v1/players/steam?account_ids=1", 30_000);
    expect(request.mock.calls[0][1]).toMatchObject({ cache: "no-cache" });
    expect(request.mock.calls[1][1]).not.toHaveProperty("cache");
  });

  it("exposes ttl presets", () => {
    expect(TTL).toEqual({
```

2. Replace:

```ts
      profile: 300_000,
      history: 120_000,
    });
  });
```

with:

```ts
      profile: 300_000,
      history: 120_000,
      live: 30_000,
    });
  });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/profile/live-match.test.ts tests/shared/DeadlockApi.test.ts`
Expected: FAIL. `tests/profile/live-match.test.ts` can't load (`Cannot find package '@/features/profile/services/live-api'`), and 2 of the client's 26 tests fail: `asks past the browser's cache for a fresh request only` (`expected { …(1) } to match object { cache: 'no-cache' }`) and `exposes ttl presets`.

- [ ] **Step 3: Write the parser and the request**

In `src/shared/api/DeadlockApi.ts`:

1. Replace:

```ts
  profile: 5 * 60_000,
  history: 2 * 60_000,
};

```

with:

```ts
  profile: 5 * 60_000,
  history: 2 * 60_000,
  // Under the minute between the profile Live tab's checks, so each one
  // asks again.
  live: 30_000,
};

```

2. Replace:

```ts
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree.
 */
export class DeadlockApi {
```

with:

```ts
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree; and always fresh or never.
 */
export class DeadlockApi {
```

3. Replace:

```ts
   * The response for `path`, cached for `ttlMs`. A caller whose `signal`
   * aborts stops waiting at once; the request itself is dropped only if it
   * hasn't claimed its slot yet and no one else still wants it.
   */
  get<T>(path: string, ttlMs: number, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const saved = this.cache.get(path);
```

with:

```ts
   * The response for `path`, cached for `ttlMs`. A caller whose `signal`
   * aborts stops waiting at once; the request itself is dropped only if it
   * hasn't claimed its slot yet and no one else still wants it. `fresh`
   * asks past the browser's HTTP cache, for answers it would keep longer
   * than they stay true.
   */
  get<T>(
    path: string,
    ttlMs: number,
    signal?: AbortSignal,
    { fresh = false } = {},
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const saved = this.cache.get(path);
```

4. Replace:

```ts
      const group = endpointGroup(path);
      if (this.cooling(path, group)) return Promise.reject(new Error(BUSY));
      pending = this.start(path, group, ttlMs);
    }
    return this.follow(path, pending, signal) as Promise<T>;
```

with:

```ts
      const group = endpointGroup(path);
      if (this.cooling(path, group)) return Promise.reject(new Error(BUSY));
      pending = this.start(path, group, ttlMs, fresh);
    }
    return this.follow(path, pending, signal) as Promise<T>;
```

5. Replace:

```ts
  }

  private start(path: string, group: string, ttlMs: number) {
    const pending: Pending = {
      promise: Promise.resolve(),
```

with:

```ts
  }

  private start(path: string, group: string, ttlMs: number, fresh: boolean) {
    const pending: Pending = {
      promise: Promise.resolve(),
```

6. Replace:

```ts
      queued: true,
    };
    pending.promise = this.send(path, group, pending)
      .then((data) => {
        this.store(path, data, ttlMs);
```

with:

```ts
      queued: true,
    };
    pending.promise = this.send(path, group, pending, fresh)
      .then((data) => {
        this.store(path, data, ttlMs);
```

7. Replace:

```ts
    group: string,
    pending: Pending,
  ): Promise<T> {
    const limit = RATE_LIMITS[group];
```

with:

```ts
    group: string,
    pending: Pending,
    fresh: boolean,
  ): Promise<T> {
    const limit = RATE_LIMITS[group];
```

8. Replace:

```ts
    if (limit) await this.throttle(path, group, limit, pending);
    else pending.queued = false;
    return this.fetchJson<T>(path, group);
  }

```

with:

```ts
    if (limit) await this.throttle(path, group, limit, pending);
    else pending.queued = false;
    return this.fetchJson<T>(path, group, fresh);
  }

```

9. Replace:

```ts
  }

  private async fetchJson<T>(path: string, group: string): Promise<T> {
    let response: Response;
    try {
```

with:

```ts
  }

  private async fetchJson<T>(
    path: string,
    group: string,
    fresh: boolean,
  ): Promise<T> {
    let response: Response;
    try {
```

10. Replace:

```ts
      response = await this.request(`${BASE}${path}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
```

with:

```ts
      response = await this.request(`${BASE}${path}`, {
        signal: AbortSignal.timeout(15_000),
        // Checked with the API rather than taken from the browser's cache.
        ...(fresh ? { cache: "no-cache" as const } : {}),
      });
    } catch (error) {
```

In `src/features/profile/utils/match-history.ts`:

Replace:

```ts
export const isWin = (m: HistoryMatch) => m.result === m.team;

export function modeLabel(m: HistoryMatch) {
  if (m.gameMode === STREET_BRAWL) return "Street Brawl";
  if (m.gameMode === NORMAL && m.matchMode === RANKED) return "Ranked";
```

with:

```ts
export const isWin = (m: HistoryMatch) => m.result === m.team;

export function modeLabel(m: Pick<HistoryMatch, "gameMode" | "matchMode">) {
  if (m.gameMode === STREET_BRAWL) return "Street Brawl";
  if (m.gameMode === NORMAL && m.matchMode === RANKED) return "Ranked";
```

Create `src/features/profile/utils/live-match.ts`:

```ts
import type { Team } from "@/features/match-report/utils/report";

export interface LivePlayer {
  accountId: number;
  heroId: number;
  team: Team;
}
// Each null where the API gave none.
export interface LiveTeam {
  netWorth: number | null;
  // The team's objectives mask.
  objectives: number | null;
  // Street Brawl rounds won.
  rounds: number | null;
}
export interface LiveMatch {
  matchId: number;
  // Unix seconds.
  startTime: number;
  // The API's own; it has always been null so far.
  durationS: number | null;
  gameMode: number;
  matchMode: number;
  players: LivePlayer[];
  teams: Record<Team, LiveTeam>;
}
export interface Standing {
  guardians: number;
  walkers: number;
  baseGuardians: number;
  shrines: number;
  patron: "standing" | "weakened" | "destroyed";
}

type Row = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isTeam = (value: unknown): value is Team => value === 0 || value === 1;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === "object")
    : [];

/**
 * The live match `accountId` plays in, from `GET /v1/matches/active`, or
 * null when the list has none.
 */
export function parseLiveMatch(
  data: unknown,
  accountId: number,
): LiveMatch | null {
  for (const match of rows(data)) {
    const players = rows(match.players).flatMap((p) =>
      isNumber(p.account_id) && isNumber(p.hero_id) && isTeam(p.team)
        ? [{ accountId: p.account_id, heroId: p.hero_id, team: p.team }]
        : [],
    );
    if (
      !isNumber(match.match_id) ||
      !isNumber(match.start_time) ||
      !players.some((p) => p.accountId === accountId)
    )
      continue;
    // The team's stats, or else the match's own fields for them.
    const team = (id: Team): LiveTeam => {
      const stats = rows(match.team_stats).find((t) => t.team === id);
      const first = (...values: unknown[]) => values.find(isNumber) ?? null;
      return {
        netWorth: first(stats?.net_worth, match[`net_worth_team_${id}`]),
        objectives: first(
          stats?.objectives_mask,
          match[`objectives_mask_team${id}`],
        ),
        rounds: first(stats?.brawl_score),
      };
    };
    return {
      matchId: match.match_id,
      startTime: match.start_time,
      durationS: isNumber(match.duration_s) ? match.duration_s : null,
      gameMode: isNumber(match.game_mode) ? match.game_mode : 0,
      matchMode: isNumber(match.match_mode) ? match.match_mode : 0,
      players,
      teams: { 0: team(0), 1: team(1) },
    };
  }
  return null;
}

// A team's objectives mask has a bit per objective, set while it stands, as
// numbered in the game's ECitadelObjective: 0 the Patron's last phase
// ("Core"), 1–4 the Guardians and 5–8 the Walkers of lanes 1–4, 9 the
// Patron ("Titan"), 10–11 the Shrines and 12–15 the Base Guardians of lanes
// 1–4. The map has lanes 1, 3 and 4: lane 2's bits never clear.
const LANES = [1, 3, 4];

/** What still stands of a team's objectives. */
export function standing(mask: number): Standing {
  const up = (bit: number) => ((mask >> bit) & 1) === 1;
  const lanes = (first: number) =>
    LANES.filter((lane) => up(first + lane - 1)).length;
  return {
    guardians: lanes(1),
    walkers: lanes(5),
    baseGuardians: lanes(12),
    shrines: [10, 11].filter(up).length,
    patron: !up(0) ? "destroyed" : up(9) ? "standing" : "weakened",
  };
}

/** Seconds played: the API's duration, or else since the match started. */
export const elapsedS = (match: LiveMatch, nowMs: number) =>
  match.durationS ?? Math.max(0, Math.floor(nowMs / 1000) - match.startTime);

/** The team ahead on souls and by how many; null when even. */
export function soulLead(amber: number, sapphire: number) {
  const lead = amber - sapphire;
  if (!lead) return null;
  return { team: (lead > 0 ? 0 : 1) as Team, souls: Math.abs(lead) };
}
```

Create `src/features/profile/services/live-api.ts`:

```ts
import { DeadlockApi, TTL, deadlockApi } from "@/shared/api/DeadlockApi";
import { parseLiveMatch, type LiveMatch } from "../utils/live-match";

/**
 * The account's live match from the game's Watch list (about the top 200
 * matches being played), or null when it isn't on it. Fresh: the browser
 * would keep the API's answer for up to four minutes (max-age=120 and
 * stale-while-revalidate=120), when the API's own copy can be two old.
 */
export async function fetchLiveMatch(
  accountId: number,
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<LiveMatch | null> {
  return parseLiveMatch(
    await api.get<unknown>(
      `/v1/matches/active?account_ids=${accountId}`,
      TTL.live,
      signal,
      { fresh: true },
    ),
    accountId,
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/live-match.test.ts tests/shared/DeadlockApi.test.ts`
Expected: PASS (37 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npm test
npx prettier --write src/shared/api/DeadlockApi.ts src/features/profile/utils/match-history.ts src/features/profile/utils/live-match.ts src/features/profile/services/live-api.ts tests/fixtures/live-match.ts tests/profile/live-match.test.ts tests/shared/DeadlockApi.test.ts
npm run test:browser && npm run test:web
git add src/shared/api/DeadlockApi.ts src/features/profile/utils/match-history.ts src/features/profile/utils/live-match.ts src/features/profile/services/live-api.ts tests/fixtures/live-match.ts tests/profile/live-match.test.ts tests/shared/DeadlockApi.test.ts
git commit -m "feat(profile): read a player's live match from the game's Watch list"
```

Expected: 417 unit, 154 desktop and 82 website tests pass.

---

### Task 2: A Live tab with the player's match from the Watch list

**Files:**
- Create: `src/features/profile/hooks/useLiveMatch.ts`, `src/features/profile/components/LiveTab.tsx`
- Modify: `src/features/profile/components/ProfileView.tsx`, `src/features/profile/styles/profile.css`, `web/app/styles/phone.css`
- Test: `tests/browser/profile-live.spec.ts` (new), `tests/web-browser/profile-live.spec.ts` (new), `tests/web-browser/mobile.spec.ts`

The profile's fifth tab. It looks once (Task 3 adds the minute's checks): "Looking for a live match…"; a failure with Retry, which moves focus to the status line first, as on the Performance tab; "No live match found" and why; or the match. The match has three cards (Match time, Souls lead or, in Street Brawl, Rounds won, and Mode), then each team's players, the viewed player marked and the others linked to their profiles, and the team's objectives still standing. On phones the cards and teams take one column and the five profile tabs spread over one row.

- [ ] **Step 1: Write the failing tests**

Create `tests/web-browser/profile-live.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  ALL_STANDING,
  activeMatch,
  liveHeroes,
  type LiveOptions,
} from "../fixtures/live-match";
import { FARGO, cors, mockApi } from "./fixtures";

// Answers the Watch list with the given matches, in turn (the last one
// again once they run out); a number answers with that status.
async function mockLive(page: Page, answers: (LiveOptions | null | number)[]) {
  const asked: string[] = [];
  await page.route(
    "https://api.deadlock-api.com/v1/matches/active**",
    (route) => {
      const url = new URL(route.request().url());
      asked.push(url.searchParams.get("account_ids") ?? "");
      const answer = answers[Math.min(asked.length, answers.length) - 1];
      if (typeof answer === "number")
        return route.fulfill({ status: answer, json: {}, headers: cors });
      return route.fulfill({
        json: answer === null ? [] : [activeMatch(FARGO, answer)],
        headers: cors,
      });
    },
  );
  return asked;
}

const openLive = async (page: Page) => {
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Live" }).click();
};

test("the Live tab shows the player's live match from the Watch list", async ({
  page,
}) => {
  await mockApi(page);
  const asked = await mockLive(page, [
    { masks: [ALL_STANDING, 0b10000001000101] },
  ]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  expect(asked).toEqual([String(FARGO)]);
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(0)).toHaveText("Match time23 minsince it started");
  await expect(stats.nth(1)).toHaveText(
    "Souls leadAmber +5,426Amber 111,527 – 106,101 Sapphire",
  );
  await expect(stats.nth(2)).toHaveText(/^ModeRankedMatch \d+$/);

  const amber = page.locator(".live-team.team-0");
  const sapphire = page.locator(".live-team.team-1");
  await expect(amber.getByRole("heading", { level: 3 })).toHaveText("Amber");
  await expect(amber.locator(".live-players li")).toHaveCount(6);
  await expect(sapphire.locator(".live-players li")).toHaveCount(6);
  // The player, by name, with no link to the profile already open.
  const current = amber.locator('li[aria-current="true"]');
  await expect(current).toContainText(liveHeroes[0].name);
  await expect(current).toContainText("A Rather Long Persona Name Fixture");
  await expect(current.getByRole("link")).toHaveCount(0);
  // Everyone else links to their profile.
  const other = sapphire.locator(".live-players li").first();
  await expect(other).toContainText(liveHeroes[6].name);
  await expect(
    other.getByRole("link", { name: "Player 7006" }),
  ).toHaveAttribute("href", "/players/7006");

  await expect(amber.locator(".live-objectives")).toHaveText(
    "Guardians3 / 3Walkers3 / 3Base Guardians3 / 3Shrines2 / 2PatronStanding",
  );
  await expect(sapphire.locator(".live-objectives")).toHaveText(
    "Guardians0 / 3Walkers0 / 3Base Guardians0 / 3Shrines0 / 2PatronWeakened",
  );
  await expect(page.getByText("From the game's Watch list")).toBeVisible();
});

test("nothing stands in for souls the API didn't give, nor a link for a player without an account", async ({
  page,
}) => {
  await mockApi(page);
  const raw = activeMatch(FARGO);
  raw.team_stats = [raw.team_stats[0]];
  delete (raw as unknown as Record<string, unknown>).net_worth_team_1;
  raw.players[7] = { ...raw.players[7], account_id: 0 };
  await page.route(
    "https://api.deadlock-api.com/v1/matches/active**",
    (route) => route.fulfill({ json: [raw], headers: cors }),
  );
  await openLive(page);
  await expect(page.locator(".live-stats .stat-card").nth(1)).toHaveText(
    "Souls lead—not given",
  );
  const rows = page.locator(".live-team.team-1 .live-players li");
  const nobody = rows.nth(1);
  await expect(nobody).toHaveText(liveHeroes[7].name);
  await expect(nobody.getByRole("link")).toHaveCount(0);
  // Its hero's name looks like everyone else's.
  const size = (row: typeof nobody) =>
    row.locator("b").evaluate((node) => getComputedStyle(node).fontSize);
  expect(await size(nobody)).toBe(await size(rows.nth(0)));
});

test("Street Brawl shows rounds won rather than souls and objectives", async ({
  page,
}) => {
  await mockApi(page);
  await mockLive(page, [{ gameMode: 4, matchMode: 1, rounds: [2, 1] }]);
  await openLive(page);
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(1)).toHaveText("Rounds won2 – 1Amber – Sapphire");
  await expect(stats.nth(2)).toContainText("Street Brawl");
  await expect(page.locator(".live-players li")).toHaveCount(8);
  await expect(page.locator(".live-objectives")).toHaveCount(0);
});

test("a player off the Watch list has no live match found, never 'Not in a game'", async ({
  page,
}) => {
  await mockApi(page);
  await mockLive(page, [null]);
  await openLive(page);
  await expect(
    page.getByRole("heading", { name: "No live match found" }),
  ).toBeVisible();
  await expect(
    page.getByText("about the top 200 matches being played"),
  ).toBeVisible();
  await expect(page.getByText("Not in a game")).toHaveCount(0);
});

test("a failed lookup says so; Retry keeps focus in place and asks again", async ({
  page,
}) => {
  await mockApi(page);
  const asked = await mockLive(page, [500, {}]);
  await openLive(page);
  const notice = page.locator(".live-tab .notice");
  await expect(notice).toContainText(
    "Live matches unavailable: Deadlock API unavailable (500).",
  );
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeFocused();
  expect(asked).toHaveLength(2);
});

test("coming back from another page finds the profile on its Live tab", async ({
  page,
}) => {
  await mockApi(page);
  await mockLive(page, [{}]);
  await openLive(page);
  await page
    .locator(".live-team.team-1")
    .getByRole("link", { name: "Player 7006" })
    .click();
  await expect(page).toHaveURL("/players/7006");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Live" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
});
```

Create `tests/browser/profile-live.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { activeMatch } from "../fixtures/live-match";

const ACCOUNT = 100000000;
const STEAM_ID = "76561198060265728";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const cors = { "access-control-allow-origin": "*" };

// Every account is in a live match, as its first hero; `asked` collects the
// accounts the Watch list was asked about.
async function routeApi(page: Page) {
  const asked: string[] = [];
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
    if (url.pathname === "/v1/players/steam")
      return json(
        (url.searchParams.get("account_ids") ?? "")
          .split(",")
          .map(Number)
          .filter((id) => id === ACCOUNT)
          .map((id) => ({ account_id: id, personaname: "Fixture Persona" })),
      );
    if (url.pathname === "/v1/matches/active") {
      const id = url.searchParams.get("account_ids") ?? "";
      asked.push(id);
      return json([activeMatch(Number(id))]);
    }
    return json([]);
  });
  return asked;
}

// Pages stay mounted (hidden) once visited, so scope locators to the visible one.
const view = (page: Page) => page.locator(".page:not([hidden])");

async function openProfile(page: Page) {
  await page.goto("/");
  await page.getByLabel("Find a player").fill(STEAM_ID);
  await page.getByRole("button", { name: /Use this ID/ }).click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Fixture Persona",
  );
}

test("another player's Live tab in the app shows their match; a name opens that profile", async ({
  page,
}) => {
  const asked = await routeApi(page);
  await openProfile(page);
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match" }),
  ).toBeVisible();
  expect(asked).toEqual([String(ACCOUNT)]);
  await expect(view(page).locator('li[aria-current="true"]')).toContainText(
    "Fixture Persona",
  );
  await view(page)
    .locator(".live-team.team-1")
    .getByRole("button", { name: "Player 7006" })
    .click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Player 7006",
  );
});
```

In `tests/web-browser/mobile.spec.ts`:

1. Replace:

```ts
import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { FARGO, cors, mockApi } from "./fixtures";

```

with:

```ts
import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { activeMatch } from "../fixtures/live-match";
import { FARGO, cors, mockApi } from "./fixtures";

```

2. Replace:

```ts
  });

  test("match report has no page scroll; the scoreboard scrolls inside its container", async ({
    page,
```

with:

```ts
  });

  test("the profile's Live tab stacks the teams, with its five tabs in one row", async ({
    page,
  }) => {
    await mockApi(page);
    await page.route(
      "https://api.deadlock-api.com/v1/matches/active**",
      (route) => route.fulfill({ json: [activeMatch(FARGO)], headers: cors }),
    );
    await page.goto(`/players/${FARGO}`);
    await page.getByRole("tab", { name: "Live" }).click();
    await expect(page.locator(".live-objectives")).toHaveCount(2);
    for (const width of [375, 360]) {
      await page.setViewportSize({ width, height: 812 });
      expect(
        await page
          .getByRole("tab")
          .evaluateAll(
            (tabs) =>
              new Set(tabs.map((tab) => tab.getBoundingClientRect().top)).size,
          ),
      ).toBe(1);
      expect(
        await page
          .locator(".live-team")
          .evaluateAll(
            (teams) =>
              new Set(teams.map((team) => team.getBoundingClientRect().left))
                .size,
          ),
      ).toBe(1);
      expect((await overflow(page)).scroll).toBeLessThanOrEqual(width);
      expect(await clipped(page, width)).toEqual([]);
    }
  });

  test("match report has no page scroll; the scoreboard scrolls inside its container", async ({
    page,
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: FAIL (1 failed: `locator.click: Test timeout of 30000ms exceeded`, as the profile has no Live tab yet).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/profile-live.spec.ts tests/web-browser/mobile.spec.ts -g "Live"`
Expected: FAIL (7 failed, each `locator.click: Test timeout of 30000ms exceeded`).

- [ ] **Step 3: Write the tab**

Create `src/features/profile/hooks/useLiveMatch.ts`:

```ts
import { useEffect, useState } from "react";
import { fetchLiveMatch } from "../services/live-api";
import type { LiveMatch } from "../utils/live-match";

interface Live {
  // Undefined until the first answer; null when no live match was found.
  match?: LiveMatch | null;
  error?: string;
  loading: boolean;
}

/**
 * The account's live match. Retry keeps the last answer until the next one
 * comes. (Per account: ProfilePage keys the view by account.)
 */
export function useLiveMatch(accountId: number) {
  const [live, setLive] = useState<Live>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const left = new AbortController();
    setLive((last) => ({ ...last, loading: true }));
    fetchLiveMatch(accountId, undefined, left.signal).then(
      (match) => {
        if (!left.signal.aborted) setLive({ match, loading: false });
      },
      (error: unknown) => {
        if (left.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setLive((last) => ({ ...last, error: message, loading: false }));
      },
    );
    return () => left.abort();
  }, [accountId, attempt]);
  return { ...live, retry: () => setAttempt((count) => count + 1) };
}
```

Create `src/features/profile/components/LiveTab.tsx`:

```tsx
import { useRef, type ReactNode } from "react";
import { RouteLink } from "@/app/links";
import {
  STREET_BRAWL_MODE,
  TEAM_NAMES,
  type Team,
} from "@/features/match-report/utils/report";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { useLiveMatch } from "../hooks/useLiveMatch";
import { fetchSteamProfiles } from "../services/profile-api";
import {
  elapsedS,
  soulLead,
  standing,
  type LiveMatch,
} from "../utils/live-match";
import { modeLabel } from "../utils/match-history";

const TEAMS: Team[] = [0, 1];
const PATRON = {
  standing: "Standing",
  weakened: "Weakened",
  destroyed: "Destroyed",
};
const souls = (value: number) => value.toLocaleString("en-US");

/** The Live tab when there's no match to show, and why. */
export function LiveEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="live-empty-tab">
      <h2>{title}</h2>
      <p className="muted">{children}</p>
    </div>
  );
}

function LiveTeam({
  match,
  team,
  accountId,
  names,
}: {
  match: LiveMatch;
  team: Team;
  accountId: number;
  names: Map<number, string>;
}) {
  const mask = match.teams[team].objectives;
  // Street Brawl has no lanes to push: its masks never change.
  const left =
    mask === null || match.gameMode === STREET_BRAWL_MODE
      ? null
      : standing(mask);
  return (
    <section className={`live-team team-${team}`}>
      <h3>{TEAM_NAMES[team]}</h3>
      <ul className="live-players">
        {match.players
          .filter((p) => p.team === team)
          .map((p, index) => {
            const hero = heroById.get(p.heroId);
            const heroName = hero?.name ?? `Hero ${p.heroId}`;
            const name = names.get(p.accountId) ?? `Player ${p.accountId}`;
            const current = p.accountId === accountId;
            return (
              <li
                key={index}
                className={current ? "current" : undefined}
                aria-current={current ? "true" : undefined}
              >
                <Picture
                  className="hero-portrait"
                  src={hero?.image}
                  label={heroName}
                />
                <span>
                  <b>{heroName}</b>
                  {/* An account of 0 has no profile, nor a name. */}
                  {current ? (
                    <span className="live-name">{name}</span>
                  ) : (
                    p.accountId > 0 && (
                      <RouteLink
                        className="live-name"
                        route={{ page: "profile", accountId: p.accountId }}
                      >
                        {name}
                      </RouteLink>
                    )
                  )}
                </span>
              </li>
            );
          })}
      </ul>
      {left && (
        <>
          <h4>Objectives standing</h4>
          <dl className="live-objectives">
            <div>
              <dt>Guardians</dt>
              <dd>{left.guardians} / 3</dd>
            </div>
            <div>
              <dt>Walkers</dt>
              <dd>{left.walkers} / 3</dd>
            </div>
            <div>
              <dt>Base Guardians</dt>
              <dd>{left.baseGuardians} / 3</dd>
            </div>
            <div>
              <dt>Shrines</dt>
              <dd>{left.shrines} / 2</dd>
            </div>
            <div>
              <dt>Patron</dt>
              <dd>{PATRON[left.patron]}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}

function SoulsLead({
  amber,
  sapphire,
}: {
  amber: number | null;
  sapphire: number | null;
}) {
  if (amber === null || sapphire === null)
    return (
      <>
        <strong>—</strong>
        <em>not given</em>
      </>
    );
  const lead = soulLead(amber, sapphire);
  return (
    <>
      <strong className={lead ? `team-${lead.team}` : undefined}>
        {lead ? `${TEAM_NAMES[lead.team]} +${souls(lead.souls)}` : "Even"}
      </strong>
      <em>
        Amber {souls(amber)} – {souls(sapphire)} Sapphire
      </em>
    </>
  );
}

function LiveMatchView({
  match,
  accountId,
}: {
  match: LiveMatch;
  accountId: number;
}) {
  const ids = match.players.map((p) => p.accountId).filter((id) => id > 0);
  const { data: profiles } = useAsync(
    () => fetchSteamProfiles(ids),
    [ids.join(",")],
  );
  const names = new Map(profiles?.map((p) => [p.accountId, p.name]));
  const [amber, sapphire] = TEAMS.map((team) => match.teams[team]);
  return (
    <>
      <SectionHeader title="Live match" />
      <div className="stat-row live-stats">
        <div className="stat-card">
          <small>Match time</small>
          <strong>{Math.floor(elapsedS(match, Date.now()) / 60)} min</strong>
          <em>since it started</em>
        </div>
        {match.gameMode === STREET_BRAWL_MODE ? (
          <div className="stat-card">
            <small>Rounds won</small>
            <strong>
              {amber.rounds ?? "—"} – {sapphire.rounds ?? "—"}
            </strong>
            <em>Amber – Sapphire</em>
          </div>
        ) : (
          <div className="stat-card">
            <small>Souls lead</small>
            <SoulsLead amber={amber.netWorth} sapphire={sapphire.netWorth} />
          </div>
        )}
        <div className="stat-card">
          <small>Mode</small>
          <strong>{modeLabel(match)}</strong>
          <em>Match {match.matchId}</em>
        </div>
      </div>
      <div className="live-teams">
        {TEAMS.map((team) => (
          <LiveTeam key={team} {...{ match, team, accountId, names }} />
        ))}
      </div>
      <p className="data-note">
        From the game&apos;s Watch list, through Deadlock API.
      </p>
    </>
  );
}

export function LiveTab({ accountId }: { accountId: number }) {
  const live = useLiveMatch(accountId);
  // Retry goes with its notice as soon as it's pressed: focus moves to the
  // status, which says what is being checked, rather than falling to the
  // page.
  const status = useRef<HTMLParagraphElement>(null);
  const retry = () => {
    status.current?.focus();
    live.retry();
  };
  return (
    <div className="live-tab">
      <p className="live-status" role="status" ref={status} tabIndex={-1}>
        {live.loading &&
          (live.match === undefined
            ? "Looking for a live match…"
            : live.error && "Checking again…")}
      </p>
      {live.error && !live.loading && (
        <p className="notice warning" role="status">
          {live.match === undefined
            ? `Live matches unavailable: ${live.error}`
            : `Couldn't check again: ${live.error}`}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {live.match === null && (
        <LiveEmpty title="No live match found">
          Live matches show here only while the game&apos;s Watch list has them:
          about the top 200 matches being played.
        </LiveEmpty>
      )}
      {live.match && <LiveMatchView match={live.match} accountId={accountId} />}
    </div>
  );
}
```

In `src/features/profile/components/ProfileView.tsx`:

1. Replace:

```tsx
import type { PerformanceRange } from "../utils/performance-metrics";
import { FIRST_SORT, HeroesTab, type HeroSort } from "./HeroesTab";
import { MatchHistory, PAGE_SIZE } from "./MatchHistory";
import { OverviewTab } from "./OverviewTab";
```

with:

```tsx
import type { PerformanceRange } from "../utils/performance-metrics";
import { FIRST_SORT, HeroesTab, type HeroSort } from "./HeroesTab";
import { LiveTab } from "./LiveTab";
import { MatchHistory, PAGE_SIZE } from "./MatchHistory";
import { OverviewTab } from "./OverviewTab";
```

2. Replace:

```tsx
import { PerformanceTab } from "./PerformanceTab";

type Subtab = "overview" | "matches" | "performance" | "heroes";
const subtabs: { id: Subtab; label: string }[] = [
  { id: "overview", label: "Overview" },
```

with:

```tsx
import { PerformanceTab } from "./PerformanceTab";

type Subtab = "overview" | "matches" | "performance" | "heroes" | "live";
const subtabs: { id: Subtab; label: string }[] = [
  { id: "overview", label: "Overview" },
```

3. Replace:

```tsx
  { id: "performance", label: "Performance" },
  { id: "heroes", label: "Heroes" },
];

```

with:

```tsx
  { id: "performance", label: "Performance" },
  { id: "heroes", label: "Heroes" },
  { id: "live", label: "Live" },
];

```

4. Replace:

```tsx
          />
        )}
      </section>
    </LinkScope>
```

with:

```tsx
          />
        )}
        {subtab === "live" && <LiveTab accountId={accountId} />}
      </section>
    </LinkScope>
```

In `src/features/profile/styles/profile.css`:

1. Replace:

```css
.matches-tab .section-header,
.heroes-tab .section-header,
.performance .section-header {
  margin: 22px 0 6px;
}
```

with:

```css
.matches-tab .section-header,
.heroes-tab .section-header,
.performance .section-header,
.live-tab .section-header {
  margin: 22px 0 6px;
}
```

2. Replace:

```css
  color: var(--gold);
  cursor: pointer;
}
```

with:

```css
  color: var(--gold);
  cursor: pointer;
}

/* Live tab. */
.live-status {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--muted);
}
/* Where Retry leaves focus: a place to read from, not a control. */
.live-status:focus {
  outline: none;
}
.live-tab > .notice {
  margin: 12px 0 0;
}
.live-empty-tab {
  margin-top: 22px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  background: var(--surface);
}
.live-empty-tab h2 {
  margin: 0 0 6px;
  font: 700 20px var(--font-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.live-empty-tab p {
  max-width: 62ch;
  margin: 0;
}
.live-stats {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.live-stats .stat-card em {
  display: block;
  margin: 3px 0 0;
}
.live-stats .team-0,
.live-team.team-0 h3 {
  color: var(--ally);
}
.live-stats .team-1,
.live-team.team-1 h3 {
  color: var(--enemy);
}
.live-teams {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.live-team {
  min-width: 0;
  padding: 10px 14px 14px;
  border: 1px solid var(--line);
  border-left: 5px solid var(--ally);
  background: var(--surface);
}
.live-team.team-1 {
  border-left-color: var(--enemy);
}
.live-team h3 {
  margin: 0 0 8px;
  font: 700 13px var(--font-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.live-players {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.live-players li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid transparent;
}
.live-players li.current {
  border-color: var(--gold);
  background: rgb(from var(--gold) r g b / 0.08);
}
.live-players li > span {
  display: grid;
  min-width: 0;
}
.live-players b {
  font-weight: 600;
  color: var(--cream);
}
.live-players .live-name {
  overflow: hidden;
  padding: 0;
  font-size: 12px;
  color: var(--muted);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.live-players a:hover,
.live-players button:hover {
  color: var(--gold);
}
.live-team h4 {
  margin: 14px 0 6px;
  font: 600 11px var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.live-objectives {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
  margin: 0;
}
.live-objectives div {
  display: flex;
  flex-direction: column;
  /* The value at the foot, where a label takes two lines. */
  justify-content: space-between;
  padding: 6px 8px;
  border: 1px solid var(--line-soft);
  background: var(--surface-2);
}
.live-objectives dt {
  font: 600 10.5px var(--font-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dim);
}
.live-objectives dd {
  margin: 0;
  font: 700 16px var(--font-label);
  color: var(--cream);
}
.live-tab > .data-note {
  margin: 10px 0 0;
}
```

In `web/app/styles/phone.css`:

1. Replace:

```css
    gap: 8px;
  }
  .app.web .subtabs {
    gap: 16px;
  }
  .app.web .subtabs button {
```

with:

```css
    gap: 8px;
  }
  /* Five tabs: spread over the row, and a second row only below about
     340 px. */
  .app.web .subtabs {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 10px;
  }
  .app.web .subtabs button {
```

2. Replace:

```css
  .app.web .stat-card.rank-card {
    grid-column: 1 / -1;
  }
  .app.web .stat-card small {
```

with:

```css
  .app.web .stat-card.rank-card {
    grid-column: 1 / -1;
  }
  .app.web .live-stats,
  .app.web .live-teams {
    grid-template-columns: minmax(0, 1fr);
  }
  .app.web .stat-card small {
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: PASS (1 test).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/profile-live.spec.ts tests/web-browser/mobile.spec.ts`
Expected: PASS (25 tests: 6 and 19).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npm test
npx prettier --write src/features/profile/hooks/useLiveMatch.ts src/features/profile/components/LiveTab.tsx src/features/profile/components/ProfileView.tsx src/features/profile/styles/profile.css web/app/styles/phone.css tests/browser/profile-live.spec.ts tests/web-browser/profile-live.spec.ts tests/web-browser/mobile.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/hooks/useLiveMatch.ts src/features/profile/components/LiveTab.tsx src/features/profile/components/ProfileView.tsx src/features/profile/styles/profile.css web/app/styles/phone.css tests/browser/profile-live.spec.ts tests/web-browser/profile-live.spec.ts tests/web-browser/mobile.spec.ts
git commit -m "feat(profile): a Live tab with the player's match from the Watch list"
```

Expected: 417 unit, 155 desktop and 89 website tests pass.

---

### Task 3: The Live tab checks again every minute while it's open

**Files:**
- Modify: `src/features/profile/hooks/useLiveMatch.ts`, `src/features/profile/components/LiveTab.tsx`
- Test: `tests/browser/profile-live.spec.ts`, `tests/web-browser/profile-live.spec.ts`

The tab asks again every minute while its element has a box and the page is visible; a check that falls due while it's hidden waits, looking every 5 s. The minute's checks are quiet: they don't set `loading`, so they aren't announced, and an error notice and its Retry stay put. A check that goes well takes the notice away; `LiveNotice`'s layout-effect cleanup, which React runs before it removes the notice, moves focus still inside it to the status line and leaves focus anywhere else alone. The tests drive time with Playwright's `page.clock`; where they check that nothing was asked, they first give a request 300 ms of real time to reach the route.

- [ ] **Step 1: Write the failing tests**

In `tests/web-browser/profile-live.spec.ts`:

Replace:

```ts
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
});
```

with:

```ts
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
});

test("the Live tab checks again every minute while it's open", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  const startTime = Math.floor(Date.now() / 1000) - 23 * 60;
  const asked = await mockLive(page, [
    { startTime },
    { startTime, netWorth: [120000, 125000] },
  ]);
  await openLive(page);
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(1)).toContainText("Amber +5,426");
  await page.clock.runFor(30_000);
  expect(asked).toHaveLength(1);
  await page.clock.runFor(30_000);
  await expect(stats.nth(1)).toContainText("Sapphire +5,000");
  await expect(stats.nth(0)).toContainText("24 min");
  expect(asked).toHaveLength(2);
  // A check that goes well isn't announced.
  await expect(page.locator(".live-status")).toHaveText("");
});

test("a check that falls due while the page is hidden waits until it's back", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  const asked = await mockLive(page, [{}]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  const visibility = (value: string) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", {
        value,
        configurable: true,
      });
    }, value);
  await visibility("hidden");
  await page.clock.runFor(180_000);
  // Time for a request the page made to reach the route.
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(1);
  await visibility("visible");
  await page.clock.runFor(5_000);
  await expect.poll(() => asked.length).toBe(2);
});

test("a check that fails keeps the match shown and says so; Retry asks again", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  await mockLive(page, [{}, 500, { netWorth: [120000, 125000] }]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await page.clock.runFor(60_000);
  const notice = page.locator(".live-tab .notice");
  await expect(notice).toContainText(
    "Couldn't check again: Deadlock API unavailable (500).",
  );
  await expect(page.locator(".live-stats .stat-card").nth(1)).toContainText(
    "Amber +5,426",
  );
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".live-stats .stat-card").nth(1)).toContainText(
    "Sapphire +5,000",
  );
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeFocused();
});

test("the minute's checks leave the notice, and focus on its Retry, in place", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  const asked = await mockLive(page, [{}, 500, 500, {}]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await page.clock.runFor(60_000);
  const notice = page.locator(".live-tab .notice");
  const retry = notice.getByRole("button", { name: "Retry" });
  await retry.focus();
  // Failing again: the same notice, still focused, and nothing announced.
  await page.clock.runFor(60_000);
  await expect.poll(() => asked.length).toBe(3);
  await expect(retry).toBeFocused();
  await expect(page.locator(".live-status")).toHaveText("");
  // Going well: the notice goes, and focus moves to the status.
  await page.clock.runFor(60_000);
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeFocused();
});

test("a check that goes well leaves alone focus that has left the notice", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  await mockLive(page, [{}, 500, {}]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await page.clock.runFor(60_000);
  const notice = page.locator(".live-tab .notice");
  await notice.getByRole("button", { name: "Retry" }).focus();
  // A click on nothing in particular leaves focus on the page.
  await page.locator(".live-stats").click();
  const onPage = () =>
    page.evaluate(() => document.activeElement === document.body);
  expect(await onPage()).toBe(true);
  await page.clock.runFor(60_000);
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).not.toBeFocused();
  expect(await onPage()).toBe(true);
});
```

In `tests/browser/profile-live.spec.ts`:

Replace:

```ts
  );
});
```

with:

```ts
  );
});

test("a profile hidden behind another page of the app checks nothing", async ({
  page,
}) => {
  await page.clock.install();
  const asked = await routeApi(page);
  await openProfile(page);
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match" }),
  ).toBeVisible();
  await page.clock.runFor(60_000);
  await expect.poll(() => asked.length).toBe(2);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Heroes" })
    .click();
  await page.clock.runFor(180_000);
  // Time for a request the page made to reach the route.
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(2);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: FAIL (1 failed, 1 passed: `a profile hidden behind another page of the app checks nothing` expects a second request after a minute and gets 1).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/profile-live.spec.ts`
Expected: FAIL (5 failed, 6 passed: the five new tests, which wait for a second request, a check's notice or its Retry).

- [ ] **Step 3: Check again every minute**

Replace all of `src/features/profile/hooks/useLiveMatch.ts` with:

```ts
import { useEffect, useState, type RefObject } from "react";
import { fetchLiveMatch } from "../services/live-api";
import type { LiveMatch } from "../utils/live-match";

// Asked again every minute while the tab is shown.
const LIVE_REFRESH = 60_000;
// A check that falls due while the tab is hidden (behind another page of
// the desktop app, or in a browser tab in the background) waits until it's
// back, looking this often.
const HIDDEN_CHECK = 5_000;

interface Live {
  // Undefined until the first answer; null when no live match was found.
  match?: LiveMatch | null;
  error?: string;
  // The first look, or Retry. The minute's checks go unannounced.
  loading: boolean;
}

/**
 * The account's live match, asked for again every minute while `shown` is
 * on screen. The last answer stays through a check or Retry. (Per account:
 * ProfilePage keys the view by account.)
 */
export function useLiveMatch(
  accountId: number,
  shown: RefObject<HTMLElement | null>,
) {
  const [live, setLive] = useState<Live>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const left = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // In a page the app hides, the tab has no box.
    const visible = () =>
      document.visibilityState === "visible" &&
      !!shown.current?.getClientRects().length;
    const next = (ms: number) => {
      timer = setTimeout(() => (visible() ? check() : next(HIDDEN_CHECK)), ms);
    };
    const check = () =>
      fetchLiveMatch(accountId, undefined, left.signal).then(
        (match) => {
          if (left.signal.aborted) return;
          setLive({ match, loading: false });
          next(LIVE_REFRESH);
        },
        (error: unknown) => {
          if (left.signal.aborted) return;
          const message =
            error instanceof Error ? error.message : String(error);
          setLive((last) => ({ ...last, error: message, loading: false }));
          next(LIVE_REFRESH);
        },
      );
    setLive((last) => ({ ...last, loading: true }));
    check();
    return () => {
      left.abort();
      clearTimeout(timer);
    };
  }, [accountId, attempt, shown]);
  return { ...live, retry: () => setAttempt((count) => count + 1) };
}
```

In `src/features/profile/components/LiveTab.tsx`:

1. Replace:

```tsx
import { useRef, type ReactNode } from "react";
import { RouteLink } from "@/app/links";
import {
```

with:

```tsx
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { RouteLink } from "@/app/links";
import {
```

2. Replace:

```tsx
      </div>
      <p className="data-note">
        From the game&apos;s Watch list, through Deadlock API.
      </p>
    </>
```

with:

```tsx
      </div>
      <p className="data-note">
        From the game&apos;s Watch list, through Deadlock API, checked again
        every minute while this tab is open. The API&apos;s copy of the list can
        be a few minutes old.
      </p>
    </>
```

3. Replace:

```tsx
}

export function LiveTab({ accountId }: { accountId: number }) {
  const live = useLiveMatch(accountId);
  // Retry goes with its notice as soon as it's pressed: focus moves to the
  // status, which says what is being checked, rather than falling to the
  // page.
  const status = useRef<HTMLParagraphElement>(null);
  const retry = () => {
```

with:

```tsx
}

/**
 * A notice with Retry. Taken away with focus in it (a check that went well),
 * it leaves focus on `status` rather than let it fall to the page: React
 * runs the cleanup before it removes the notice.
 */
function LiveNotice({
  status,
  onRetry,
  children,
}: {
  status: RefObject<HTMLElement | null>;
  onRetry(): void;
  children: ReactNode;
}) {
  const notice = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const node = notice.current;
    return () => {
      if (node?.contains(document.activeElement)) status.current?.focus();
    };
  }, [status]);
  return (
    <p className="notice warning" role="status" ref={notice}>
      {children}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </p>
  );
}

export function LiveTab({ accountId }: { accountId: number }) {
  const tab = useRef<HTMLDivElement>(null);
  const live = useLiveMatch(accountId, tab);
  // Retry goes with its notice as soon as it's pressed: focus moves to the
  // status, which says what is being checked, rather than falling to the
  // page. (Before the notice goes, as not every browser focuses a button
  // that is clicked.)
  const status = useRef<HTMLParagraphElement>(null);
  const retry = () => {
```

4. Replace:

```tsx
  };
  return (
    <div className="live-tab">
      <p className="live-status" role="status" ref={status} tabIndex={-1}>
        {live.loading &&
```

with:

```tsx
  };
  return (
    <div className="live-tab" ref={tab}>
      <p className="live-status" role="status" ref={status} tabIndex={-1}>
        {live.loading &&
```

5. Replace:

```tsx
          (live.match === undefined
            ? "Looking for a live match…"
            : live.error && "Checking again…")}
      </p>
      {live.error && !live.loading && (
        <p className="notice warning" role="status">
          {live.match === undefined
            ? `Live matches unavailable: ${live.error}`
            : `Couldn't check again: ${live.error}`}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {live.match === null && (
```

with:

```tsx
          (live.match === undefined
            ? "Looking for a live match…"
            : "Checking again…")}
      </p>
      {live.error && !live.loading && (
        <LiveNotice status={status} onRetry={retry}>
          {live.match === undefined
            ? `Live matches unavailable: ${live.error}`
            : `Couldn't check again: ${live.error}`}
        </LiveNotice>
      )}
      {live.match === null && (
```

6. Replace:

```tsx
        <LiveEmpty title="No live match found">
          Live matches show here only while the game&apos;s Watch list has them:
          about the top 200 matches being played.
        </LiveEmpty>
      )}
```

with:

```tsx
        <LiveEmpty title="No live match found">
          Live matches show here only while the game&apos;s Watch list has them:
          about the top 200 matches being played. This tab checks again every
          minute.
        </LiveEmpty>
      )}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: PASS (2 tests).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/profile-live.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npm test
npx prettier --write src/features/profile/hooks/useLiveMatch.ts src/features/profile/components/LiveTab.tsx tests/browser/profile-live.spec.ts tests/web-browser/profile-live.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/hooks/useLiveMatch.ts src/features/profile/components/LiveTab.tsx tests/browser/profile-live.spec.ts tests/web-browser/profile-live.spec.ts
git commit -m "feat(profile): the Live tab checks again every minute while it's open"
```

Expected: 417 unit, 156 desktop and 94 website tests pass.

---

### Task 4: Your own Live tab in the app shows the match from Overwolf

**Files:**
- Create: `src/features/live/components/OwnLiveTab.tsx`
- Modify: `src/features/match/components/MatchOverview.tsx`, `src/features/profile/components/ProfileView.tsx`, `src/features/profile/components/ProfilePage.tsx`, `src/app/DesktopApp.tsx`, `src/features/builds/components/BuildPanel.tsx`, `src/features/profile/styles/profile.css`
- Test: `tests/browser/profile-live.spec.ts`

`ProfileView` and `ProfilePage` take a `live` node, shown on the Live tab in place of the Watch list's. `DesktopApp` passes `OwnLiveTab` for the account Overwolf reports playing on this PC (`state.localAccountId`), or else the remembered one. In a match it shows `MatchOverview` with `embedded`: a section header ("Live match · {hero}") instead of the Live page's title, inside the profile's padding. Otherwise "Not in a game", saying whether Deadlock is running. `BuildPanel` drops its unused `id="build-content"`, which the Live page and this tab would both render.

- [ ] **Step 1: Write the failing tests**

In `tests/browser/profile-live.spec.ts`:

1. Replace:

```ts
import { expect, test, type Page } from "@playwright/test";
import { activeMatch } from "../fixtures/live-match";

const ACCOUNT = 100000000;
```

with:

```ts
import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { activeMatch } from "../fixtures/live-match";
import { nativeWindow, updateMatch } from "./helpers";

const ACCOUNT = 100000000;
```

2. Replace:

```ts
  expect(asked).toHaveLength(2);
});
```

with:

```ts
  expect(asked).toHaveLength(2);
});

async function storeMe(page: Page, accountId = ACCOUNT) {
  await page.addInitScript(
    (accountId) =>
      localStorage.setItem(
        "counterlock.profile.account",
        JSON.stringify({ accountId, seenAt: Date.now(), source: "detected" }),
      ),
    accountId,
  );
}

async function openMyLive(page: Page) {
  await page.goto("/desktop/desktop.html");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Live" }).click();
}

test("your own Live tab in the app shows the match from Overwolf, not the Watch list", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await storeMe(page);
  const asked = await routeApi(page);
  await openMyLive(page);
  const tab = view(page).locator(".live-tab");
  // The local player's hero (id 7), from the catalog.
  const hero = catalog.heroes.find((entry) => entry.id === 7)!.name;
  await expect(
    tab.getByRole("heading", { name: `Live match · ${hero}` }),
  ).toBeVisible();
  await expect(tab.locator(".match-clock strong")).toHaveText("12:34");
  await expect(tab.getByRole("heading", { name: "Your team" })).toBeVisible();
  await expect(tab.getByRole("heading", { name: "Enemy team" })).toBeVisible();
  // The profile keeps its own title.
  await expect(view(page).getByRole("heading", { level: 1 })).toHaveText(
    "Fixture Persona",
  );

  await updateMatch(page, { players: [] });
  await expect(
    tab.getByRole("heading", { name: "Not in a game" }),
  ).toBeVisible();
  await expect(tab).toContainText(
    "Deadlock is running: your match shows here as soon as it loads.",
  );
  expect(asked).toEqual([]);
});

test("your own Live tab says Deadlock isn't running", async ({ page }) => {
  await nativeWindow(page, "desktop", "normal", {
    running: false,
    players: false,
  });
  await storeMe(page);
  const asked = await routeApi(page);
  await openMyLive(page);
  const tab = view(page).locator(".live-tab");
  await expect(
    tab.getByRole("heading", { name: "Not in a game" }),
  ).toBeVisible();
  await expect(tab).toContainText(
    "Deadlock isn't running. Your match shows here once you're in one.",
  );
  expect(asked).toEqual([]);
});

test("the account Overwolf reports on this PC gets the Overwolf tab, whichever account is remembered", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await storeMe(page, 200);
  const asked = await routeApi(page);
  await page.goto("/desktop/desktop.html");
  await updateMatch(page, { localAccountId: ACCOUNT });
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Home" })
    .click();
  await view(page).getByLabel("Find a player").fill(STEAM_ID);
  await view(page)
    .getByRole("button", { name: /Use this ID/ })
    .click();
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(view(page).locator(".live-tab .match-clock")).toBeVisible();
  // The remembered account, another one, gets the Watch list's.
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match" }),
  ).toBeVisible();
  expect(asked).toEqual(["200"]);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: FAIL (3 failed, 2 passed: the three new tests find no Overwolf match or "Not in a game" on the tab, which still shows the Watch list's).

- [ ] **Step 3: Your own account's tab**

In `src/features/match/components/MatchOverview.tsx`:

1. Replace:

```tsx
import { Icon } from "@/shared/ui/Icon";
import { PageTitle } from "@/shared/ui/PageTitle";

interface Props {
```

with:

```tsx
import { Icon } from "@/shared/ui/Icon";
import { PageTitle } from "@/shared/ui/PageTitle";
import { SectionHeader } from "@/shared/ui/SectionHeader";

interface Props {
```

2. Replace:

```tsx
  refresh: () => void;
  query: AnalyticsQuery;
}
export function MatchOverview({
```

with:

```tsx
  refresh: () => void;
  query: AnalyticsQuery;
  // Inside a page with a title of its own (the profile's Live tab): a
  // section header rather than the page title.
  embedded?: boolean;
}
export function MatchOverview({
```

3. Replace:

```tsx
  refresh,
  query,
}: Props) {
  const { teams, selected, setSelected } = counters;
```

with:

```tsx
  refresh,
  query,
  embedded = false,
}: Props) {
  const { teams, selected, setSelected } = counters;
```

4. Replace:

```tsx
    <>
      <div className="intro">
        <PageTitle
          eyebrow="Live match"
          title="Know the match."
          ribbon={myHero ? `You're playing ${myHero}` : undefined}
        />
        <div className="match-clock">
          <span>
```

with:

```tsx
    <>
      <div className="intro">
        {embedded ? (
          <SectionHeader
            title={myHero ? `Live match · ${myHero}` : "Live match"}
          />
        ) : (
          <PageTitle
            eyebrow="Live match"
            title="Know the match."
            ribbon={myHero ? `You're playing ${myHero}` : undefined}
          />
        )}
        <div className="match-clock">
          <span>
```

Create `src/features/live/components/OwnLiveTab.tsx`:

```tsx
import type { ComponentProps } from "react";
import { MatchOverview } from "@/features/match/components/MatchOverview";
import { LiveEmpty } from "@/features/profile/components/LiveTab";
import type { LiveStatus } from "../utils/live-status";

/**
 * The profile's Live tab for your own account in the app: the match from
 * Overwolf's live data, as on the Live page, rather than the Watch list.
 */
export function OwnLiveTab({
  status,
  ...overview
}: { status: LiveStatus } & Omit<
  ComponentProps<typeof MatchOverview>,
  "embedded"
>) {
  return (
    <div className="live-tab own">
      {status === "in-match" ? (
        <MatchOverview embedded {...overview} />
      ) : (
        <LiveEmpty title="Not in a game">
          {status === "waiting"
            ? "Deadlock is running: your match shows here as soon as it loads."
            : "Deadlock isn't running. Your match shows here once you're in one."}
        </LiveEmpty>
      )}
    </div>
  );
}
```

In `src/features/profile/components/ProfileView.tsx`:

1. Replace:

```tsx
  navigate,
  restore,
}: {
  accountId: number;
```

with:

```tsx
  navigate,
  restore,
  live,
}: {
  accountId: number;
```

2. Replace:

```tsx
  // Back): open as it was left. Any other way in starts at Overview.
  restore: boolean;
}) {
  const [view, setView] = useState(
```

with:

```tsx
  // Back): open as it was left. Any other way in starts at Overview.
  restore: boolean;
  // The Live tab, when the app has better than the Watch list (your own
  // account, from Overwolf's live data).
  live?: React.ReactNode;
}) {
  const [view, setView] = useState(
```

3. Replace:

```tsx
          />
        )}
        {subtab === "live" && <LiveTab accountId={accountId} />}
      </section>
    </LinkScope>
```

with:

```tsx
          />
        )}
        {subtab === "live" && (live ?? <LiveTab accountId={accountId} />)}
      </section>
    </LinkScope>
```

In `src/features/profile/components/ProfilePage.tsx`:

1. Replace:

```tsx
import { RouteLink } from "@/app/links";
import type { Navigate } from "@/app/navigation";
```

with:

```tsx
import type { ReactNode } from "react";
import { RouteLink } from "@/app/links";
import type { Navigate } from "@/app/navigation";
```

2. Replace:

```tsx
  subtitle = "Deadlock profile",
  restore = false,
}: {
  accountId: number;
```

with:

```tsx
  subtitle = "Deadlock profile",
  restore = false,
  live,
}: {
  accountId: number;
```

3. Replace:

```tsx
  // Open as it was left (see ProfileView).
  restore?: boolean;
}) {
  const history = useAsync(() => fetchMatchHistory(accountId), [accountId]);
```

with:

```tsx
  // Open as it was left (see ProfileView).
  restore?: boolean;
  // The Live tab in place of the Watch list's (see ProfileView).
  live?: ReactNode;
}) {
  const history = useAsync(() => fetchMatchHistory(accountId), [accountId]);
```

4. Replace:

```tsx
      navigate={navigate}
      restore={restore}
      header={
        <ProfileHeader
```

with:

```tsx
      navigate={navigate}
      restore={restore}
      live={live}
      header={
        <ProfileHeader
```

In `src/app/DesktopApp.tsx`:

1. Replace:

```tsx
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";
import { LivePage } from "@/features/live/components/LivePage";
import {
  liveStatus,
```

with:

```tsx
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";
import { LivePage } from "@/features/live/components/LivePage";
import { OwnLiveTab } from "@/features/live/components/OwnLiveTab";
import {
  liveStatus,
```

2. Replace:

```tsx
                  : undefined
              }
            />
          </div>
```

with:

```tsx
                  : undefined
              }
              // Yours: the account Overwolf reports playing on this PC, or
              // else the remembered one.
              live={
                profileId === (state.localAccountId ?? me.meId) ? (
                  <OwnLiveTab
                    {...{
                      state,
                      status,
                      showBuild,
                      showCounters,
                      counters,
                      query,
                    }}
                    refresh={bridge.refresh}
                  />
                ) : undefined
              }
            />
          </div>
```

In `src/features/builds/components/BuildPanel.tsx`:

Replace:

```tsx
      </div>
      {expanded && (
        <div id="build-content">
          {brawl ? (
            <p className="build-empty" role="status">
```

with:

```tsx
      </div>
      {expanded && (
        <div>
          {brawl ? (
            <p className="build-empty" role="status">
```

In `src/features/profile/styles/profile.css`:

Replace:

```css
  margin: 10px 0 0;
}
```

with:

```css
  margin: 10px 0 0;
}
/* Your own match, from Overwolf, inside the profile's padding. */
.live-tab.own .intro {
  padding: 0 0 14px;
}
.live-tab.own .intro .section-header {
  flex: 1;
  margin: 22px 0 0;
}
.live-tab.own .workspace {
  padding: 0;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npm test
npx prettier --write src/app/DesktopApp.tsx src/features/builds/components/BuildPanel.tsx src/features/live/components/OwnLiveTab.tsx src/features/match/components/MatchOverview.tsx src/features/profile/components/ProfilePage.tsx src/features/profile/components/ProfileView.tsx src/features/profile/styles/profile.css tests/browser/profile-live.spec.ts
npm run test:browser && npm run test:web
git add src/app/DesktopApp.tsx src/features/builds/components/BuildPanel.tsx src/features/live/components/OwnLiveTab.tsx src/features/match/components/MatchOverview.tsx src/features/profile/components/ProfilePage.tsx src/features/profile/components/ProfileView.tsx src/features/profile/styles/profile.css tests/browser/profile-live.spec.ts
git commit -m "feat(profile): your own Live tab in the app shows the match from Overwolf"
```

Expected: 417 unit, 159 desktop and 94 website tests pass.

---

### Task 5: Docs and final check

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-21-redesign-design.md`

- [ ] **Step 1: README and spec**

The README gains a "Profile Live tab" section, the tab in the profile's description and the website's, the endpoint in "API endpoints" and the shorter cache for the Live tab; the spec records what was built in phase 5 and marks the phase done.

In `README.md`:

1. Replace:

```markdown
- **Live** shows the current match roster, builds and counters, or a "Deadlock isn't running" / "Waiting for a match" state. The app opens on Live when Deadlock is detected running (unless you have already picked a tab); otherwise it opens on Home. It also switches to Live once per match when live data first arrives.
- **Home** is a search (**Find a player**) followed by a **You** section for the remembered account (rank, recent form and latest match, each number explained) and **Top of the city**, the strongest heroes right now.
- **Profile** is its own page, opened from search, **You** or the header's **My profile**: rank badge, ranked games, KDA, souls per minute, top heroes, frequent teammates and a filterable match history, in the tabs Overview, Matches, Performance and Heroes. Click a match for its match report. **Performance** follows the last 20, 50 or 100 normal and ranked games, for all heroes or one, against the average player on the same hero at the same rank; pick a game on a chart to see it and open its match report. Coming back from a match report, or with the browser's Back, finds the profile as it was left: its tab, filters and, on the website, scroll position. Opened any other way, it starts at Overview. **This is me** remembers the account; **Not you? Switch account** forgets it.
- **Match report** opens from any match row, from Home's latest match or from a shared link, for any player. **Viewing as** picks whose point of view it takes (any of the 12 players, or the whole match); it opens as you if you played, otherwise as the player you came from. It shows win or loss, verdicts (souls / min, hero damage and creep kills against the average player on that hero at that rank), **the Graph** (nine stat tabs plus "More stats…", player against the rank average, team totals, team lead or everyone, per minute, time ranges, death, item and objective markers, hover and a ranking that switches the point of view), best and worst stretches, impact, permanent buffs and a scoreboard for both teams. **Copy link** copies the website address of the report. See [Match report](#match-report).
- **Tier list** ranks heroes S to D by win-rate percentile over the last 30 days across all ranks, with a role filter.
```

with:

```markdown
- **Live** shows the current match roster, builds and counters, or a "Deadlock isn't running" / "Waiting for a match" state. The app opens on Live when Deadlock is detected running (unless you have already picked a tab); otherwise it opens on Home. It also switches to Live once per match when live data first arrives.
- **Home** is a search (**Find a player**) followed by a **You** section for the remembered account (rank, recent form and latest match, each number explained) and **Top of the city**, the strongest heroes right now.
- **Profile** is its own page, opened from search, **You** or the header's **My profile**: rank badge, ranked games, KDA, souls per minute, top heroes, frequent teammates and a filterable match history, in the tabs Overview, Matches, Performance, Heroes and Live. Click a match for its match report. **Performance** follows the last 20, 50 or 100 normal and ranked games, for all heroes or one, against the average player on the same hero at the same rank; pick a game on a chart to see it and open its match report. Coming back from a match report, or with the browser's Back, finds the profile as it was left: its tab, filters and, on the website, scroll position. Opened any other way, it starts at Overview. **Live** shows the player's match while it is being played, when the game's Watch list has it; for your own account the desktop app shows your match from Overwolf instead. See [Profile Live tab](#profile-live-tab). **This is me** remembers the account; **Not you? Switch account** forgets it.
- **Match report** opens from any match row, from Home's latest match or from a shared link, for any player. **Viewing as** picks whose point of view it takes (any of the 12 players, or the whole match); it opens as you if you played, otherwise as the player you came from. It shows win or loss, verdicts (souls / min, hero damage and creep kills against the average player on that hero at that rank), **the Graph** (nine stat tabs plus "More stats…", player against the rank average, team totals, team lead or everyone, per minute, time ranges, death, item and objective markers, hover and a ranking that switches the point of view), best and worst stretches, impact, permanent buffs and a scoreboard for both teams. **Copy link** copies the website address of the report. See [Match report](#match-report).
- **Tier list** ranks heroes S to D by win-rate percentile over the last 30 days across all ranks, with a role filter.
```

2. Replace:

````markdown
- **Improving / Flat / Slipping** compares the recent half of the games with the earlier half (at least 6 games with a value and, where the metric has one, a rank average), each game as its value ÷ its rank average, so changing hero or rank doesn't read as a change in form; the four shares use their values, so over games on more than one hero they claim no trend: a change of hero moves them more than form does. It says improving or slipping only when Welch's t-test finds the halves differ at the 95% level, and flat otherwise. When some games run past the end of the rank average, the card compares the player and the average over the games that have one.

## Website

Counterlock also builds as a public static website with the nav **Home · Tier list · Heroes · Items** (the tier list lives at `/tier-list`) and player profiles, with real URLs, pre-rendered hero and item pages and share previews. It has no **Live** page, overlay or hotkeys; Home searches for a Steam account by name or ID, and the header's **My profile** opens the remembered account. The layout is full width with side gutters and has phone layouts down to 375px. Hero pages have the same **Build** and **Popular builds** tabs and **Counter items** as the app; the website has no live match, so you always pick the enemy heroes. It lives in `web/` (React Router v8 framework mode on Vite, `ssr: false` with `prerender`) and reuses the feature code in `src/`, so the Overwolf app is unaffected.

```sh
````

with:

````markdown
- **Improving / Flat / Slipping** compares the recent half of the games with the earlier half (at least 6 games with a value and, where the metric has one, a rank average), each game as its value ÷ its rank average, so changing hero or rank doesn't read as a change in form; the four shares use their values, so over games on more than one hero they claim no trend: a change of hero moves them more than form does. It says improving or slipping only when Welch's t-test finds the halves differ at the 95% level, and flat otherwise. When some games run past the end of the rank average, the card compares the player and the average over the games that have one.

### Profile Live tab

- **Any player** (on the website, and for anyone but your own account in the app): `GET /v1/matches/active?account_ids={id}`, the game's Watch list (about the top 200 matches being played) filtered to the player. It shows both teams' heroes and players (each linked to their profile), the souls lead (rounds won in Street Brawl), the mode, the minutes since the match started (the API's `duration_s` is always empty, so they count from `start_time`) and each team's objectives still standing: the Guardians, Walkers and Base Guardians of the three lanes, the two Shrines and the Patron ("Weakened" once its first phase is down). Those come from the team's `objectives_mask`, one bit per objective as the game numbers them (`ECitadelObjective`); Street Brawl has none. A value the API leaves out shows "—", and a player without an account has no link. A player who isn't on the list gets **No live match found** and why, never "Not in a game".
- **Checked again every minute** while the tab is on screen, past the browser's HTTP cache, which would keep an answer for up to four minutes (`max-age=120`, `stale-while-revalidate=120`). A check that falls due while the tab is hidden (behind another page of the app, or in a background browser tab) waits until it is back. The last answer stays while it checks, and the checks aren't announced; one that fails says so, with Retry. The API's own copy of the list can be a few minutes old.
- **Your own account in the desktop app** (the account Overwolf reports playing on this PC, or else the remembered one): your match from Overwolf, as on the Live page (build, rosters and counters), or **Not in a game**, with whether Deadlock is running.

## Website

Counterlock also builds as a public static website with the nav **Home · Tier list · Heroes · Items** (the tier list lives at `/tier-list`) and player profiles, with real URLs, pre-rendered hero and item pages and share previews. It has no **Live** page, overlay or hotkeys; Home searches for a Steam account by name or ID, and the header's **My profile** opens the remembered account. A profile's **Live** tab shows the player's match from the game's Watch list, as in the app. The layout is full width with side gutters and has phone layouts down to 375px. Hero pages have the same **Build** and **Popular builds** tabs and **Counter items** as the app; the website has no live match, so you always pick the enemy heroes. It lives in `web/` (React Router v8 framework mode on Vite, `ssr: false` with `prerender`) and reuses the feature code in `src/`, so the Overwolf app is unaffected.

```sh
````

3. Replace:

```markdown
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app/`                                        | React window composition and mounting; design tokens, global, shell, and responsive layout styles  |
| `src/features/live/`                              | Live tab states (not running, waiting, in match) and once-per-match auto-switch                    |
| `src/features/profile/`                           | Player profile page: account storage, Deadlock API services, overview, history, heroes, trends     |
| `src/features/heroes/`                            | Tier list, hero roster, analytics derivations and services, hero detail with ability tooltips      |
| `src/features/items/`                             | Item shop browser and item detail                                                                  |
```

with:

```markdown
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app/`                                        | React window composition and mounting; design tokens, global, shell, and responsive layout styles  |
| `src/features/live/`                              | Live tab states (not running, waiting, in match), once-per-match auto-switch, own profile Live tab |
| `src/features/profile/`                           | Player profile: account storage, Deadlock API services, overview, history, heroes, trends, live    |
| `src/features/heroes/`                            | Tier list, hero roster, analytics derivations and services, hero detail with ability tooltips      |
| `src/features/items/`                             | Item shop browser and item detail                                                                  |
```

4. Replace:

```markdown
- `/v1/analytics/hero-stats`, `hero-counter-stats`, `hero-synergy-stats`, `ability-order-stats` and `item-stats` (also per build phase and per picked enemy)
- `/v1/builds` (popular builds on the hero page)

The client caches in memory (two to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests. It keeps requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding them back, counting every tab of the website and every window of the app together: the counts, and the cooldowns of those three groups and of a 503 (below), are kept in `localStorage`, claimed under a Web Lock where the browser has one. A request no one waits for any more leaves the queue, and a cooldown fails the waiting ones at once. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum and, as a cooldown outlives a reload, a ten-minute maximum. The Performance tab also keeps each stored game's totals for the session.

## Sources
```

with:

```markdown
- `/v1/analytics/hero-stats`, `hero-counter-stats`, `hero-synergy-stats`, `ability-order-stats` and `item-stats` (also per build phase and per picked enemy)
- `/v1/builds` (popular builds on the hero page)
- `/v1/matches/active?account_ids=…` (the profile's Live tab)

The client caches in memory (30 seconds to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests; the profile Live tab's requests also skip the browser's own HTTP cache. It keeps requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding them back, counting every tab of the website and every window of the app together: the counts, and the cooldowns of those three groups and of a 503 (below), are kept in `localStorage`, claimed under a Web Lock where the browser has one. A request no one waits for any more leaves the queue, and a cooldown fails the waiting ones at once. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum and, as a cooldown outlives a reload, a ten-minute maximum. The Performance tab also keeps each stored game's totals for the session.

## Sources
```

In `docs/superpowers/specs/2026-10-21-redesign-design.md`:

1. Replace:

```markdown
- Refresh while the tab is open (e.g. every 30–60s; builder's call).

### Live tab (desktop app)

```

with:

```markdown
- Refresh while the tab is open (e.g. every 30–60s; builder's call).

Built in phase 5: the website's tab, and the app's for anyone but your own account, asks `GET /v1/matches/active?account_ids=…` for the player alone. It shows each team's heroes and players (linked to their profiles), the souls lead (rounds won in Street Brawl), the mode, the minutes since `start_time` (the API's `duration_s` has always been empty) and each team's objectives still standing, read from its `objectives_mask` (the game's `ECitadelObjective` bits: the Guardians, Walkers and Base Guardians of lanes 1, 3 and 4, the two Shrines and the Patron, "Weakened" once its first phase is down; Street Brawl has none); a value the API leaves out shows "—". It checks again every minute while it is on screen, past the browser's HTTP cache (which would keep an answer for up to four minutes); a check that falls due while it is hidden waits until it is back, and the API's own copy of the list can be a few minutes old. A check that fails keeps the last answer and says so, with Retry; focus stays in place through Retry and the minute's checks. Your own account in the app (the account Overwolf reports playing on this PC, or else the remembered one) shows the Live page's match overview under a section header, or "Not in a game" with whether Deadlock is running. On phones the teams stack and the five profile tabs spread over one row.

### Live tab (desktop app)

```

2. Replace:

```markdown
3. **Match report (done).**
4. **Performance tab (done).**
5. **Profile Live tab** (app + web).
6. **Overlay panels** (five windows, settings, removal of the old
   overlays).
```

with:

```markdown
3. **Match report (done).**
4. **Performance tab (done).**
5. **Profile Live tab (done)** (app + web).
6. **Overlay panels** (five windows, settings, removal of the old
   overlays).
```

- [ ] **Step 2: Final check**

Run all of these; every one must pass:
- `npm test` (417)
- `npx tsc --noEmit`
- `npm run web:typecheck`
- `npm run test:browser` (159)
- `npm run test:web` (94)
- `npm run build`
- `npm run web:build`
- `npm run validate:manifest`

- [ ] **Step 3: Commit**

Check only the README with prettier; the spec has never been prettier-formatted, so leave its existing formatting alone.

```bash
npx prettier --check README.md
git add README.md docs/superpowers/specs/2026-10-21-redesign-design.md
git commit -m "docs: the profile Live tab"
```

---

### Task 6: A check that ends or replaces the match keeps focus in the Live tab

**Files:**
- Modify: `src/features/profile/components/LiveTab.tsx`
- Test: `tests/web-browser/profile-live.spec.ts`

What changes:
- **Why:** with focus on a player's link, a check that finds the match over swaps the match for "No live match found", and focus falls to the page. So does a new match in place of the last: the view stays mounted and its rows go by position, so the focused row can become the player's own (no link), one with an account of 0, or a row past the team's new size. Review Focus 5 says no check drops focus to the page.
- **`useKeepFocus(inside, status)`** is `LiveNotice`'s layout-effect cleanup, lifted into a hook: React runs it before it removes the node, and focus still inside goes to the status line; focus anywhere else stays. `LiveNotice` and `LiveMatchView` (which now takes `status`) both use it. The view's is on `.live-teams`, which holds its only focusable things, the players' links; the view itself is a fragment whose parts the CSS styles as `.live-tab > …`.
- **`LiveMatchView` is keyed by match id:** a new match is a new view: the last one's cleanup hands focus back, and its failed portraits go with it. Rows stay keyed by position, so within one match focus stays on the same link.
- **The comment by Retry** says why Retry moves focus itself rather than leave it to the notice's cleanup: not every browser focuses a clicked button.
- **Tests (website):** focus on a player's link; the minute's check answers `[]`, or a new match with the player in the focused row; focus is on the status line.

- [ ] **Step 1: Write the failing tests**

In `tests/web-browser/profile-live.spec.ts`:

Add at the end of the file:

```ts
test("a check that finds the match over leaves focus in the tab", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  await mockLive(page, [{}, null]);
  await openLive(page);
  await page
    .locator(".live-team.team-1")
    .getByRole("link", { name: "Player 7006" })
    .focus();
  await page.clock.runFor(60_000);
  await expect(
    page.getByRole("heading", { name: "No live match found" }),
  ).toBeVisible();
  await expect(page.locator(".live-status")).toBeFocused();
});

test("a new match in place of the last leaves focus in the tab", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  // The next match has the player where the focused link was.
  const next = activeMatch(FARGO, { matchId: 999 });
  next.players[0].account_id = 7006;
  next.players[6].account_id = FARGO;
  let asked = 0;
  await page.route(
    "https://api.deadlock-api.com/v1/matches/active**",
    (route) =>
      route.fulfill({
        json: [asked++ ? next : activeMatch(FARGO)],
        headers: cors,
      }),
  );
  await openLive(page);
  await page
    .locator(".live-team.team-1")
    .getByRole("link", { name: "Player 7006" })
    .focus();
  await page.clock.runFor(60_000);
  await expect(page.locator(".live-stats")).toContainText("Match 999");
  await expect(page.locator(".live-status")).toBeFocused();
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/profile-live.spec.ts`
Expected: FAIL (2 failed, 11 passed: the two new tests find the status line unfocused (`Received: inactive`)).

- [ ] **Step 3: Keep focus in the tab**

In `src/features/profile/components/LiveTab.tsx`:

1. Replace:

```tsx
function LiveMatchView({
  match,
  accountId,
}: {
  match: LiveMatch;
  accountId: number;
}) {
  const ids = match.players.map((p) => p.accountId).filter((id) => id > 0);
  const { data: profiles } = useAsync(
    () => fetchSteamProfiles(ids),
```

with:

```tsx
function LiveMatchView({
  match,
  accountId,
  status,
}: {
  match: LiveMatch;
  accountId: number;
  status: RefObject<HTMLElement | null>;
}) {
  // The players' links are all the view has to focus.
  const teams = useRef<HTMLDivElement>(null);
  useKeepFocus(teams, status);
  const ids = match.players.map((p) => p.accountId).filter((id) => id > 0);
  const { data: profiles } = useAsync(
    () => fetchSteamProfiles(ids),
```

2. Replace:

```tsx
          <em>Match {match.matchId}</em>
        </div>
      </div>
      <div className="live-teams">
        {TEAMS.map((team) => (
          <LiveTeam key={team} {...{ match, team, accountId, names }} />
        ))}
```

with:

```tsx
          <em>Match {match.matchId}</em>
        </div>
      </div>
      <div className="live-teams" ref={teams}>
        {TEAMS.map((team) => (
          <LiveTeam key={team} {...{ match, team, accountId, names }} />
        ))}
```

3. Replace:

```tsx
}

/**
 * A notice with Retry. Taken away with focus in it (a check that went well),
 * it leaves focus on `status` rather than let it fall to the page: React
 * runs the cleanup before it removes the notice.
 */
function LiveNotice({
  status,
  onRetry,
```

with:

```tsx
}

/**
 * When a check takes `inside` away with focus in it (the notice once a check
 * goes well, the match once it's over or another replaces it), focus moves
 * to `status` rather than fall to the page: React runs the cleanup before it
 * removes the node.
 */
function useKeepFocus(
  inside: RefObject<HTMLElement | null>,
  status: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const node = inside.current;
    return () => {
      if (node?.contains(document.activeElement)) status.current?.focus();
    };
  }, [inside, status]);
}

/** A notice with Retry. */
function LiveNotice({
  status,
  onRetry,
```

4. Replace:

```tsx
  children: ReactNode;
}) {
  const notice = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const node = notice.current;
    return () => {
      if (node?.contains(document.activeElement)) status.current?.focus();
    };
  }, [status]);
  return (
    <p className="notice warning" role="status" ref={notice}>
      {children}
```

with:

```tsx
  children: ReactNode;
}) {
  const notice = useRef<HTMLParagraphElement>(null);
  useKeepFocus(notice, status);
  return (
    <p className="notice warning" role="status" ref={notice}>
      {children}
```

5. Replace:

```tsx
  const live = useLiveMatch(accountId, tab);
  // Retry goes with its notice as soon as it's pressed: focus moves to the
  // status, which says what is being checked, rather than falling to the
  // page. (Before the notice goes, as not every browser focuses a button
  // that is clicked.)
  const status = useRef<HTMLParagraphElement>(null);
  const retry = () => {
    status.current?.focus();
```

with:

```tsx
  const live = useLiveMatch(accountId, tab);
  // Retry goes with its notice as soon as it's pressed: focus moves to the
  // status, which says what is being checked, rather than falling to the
  // page. Here, not in LiveNotice's cleanup: not every browser focuses a
  // clicked button.
  const status = useRef<HTMLParagraphElement>(null);
  const retry = () => {
    status.current?.focus();
```

6. Replace:

```tsx
          minute.
        </LiveEmpty>
      )}
      {live.match && <LiveMatchView match={live.match} accountId={accountId} />}
    </div>
  );
}
```

with:

```tsx
          minute.
        </LiveEmpty>
      )}
      {live.match && (
        <LiveMatchView
          // Another match, another view: its rows go by position, so the
          // focused row could lose its link.
          key={live.match.matchId}
          match={live.match}
          accountId={accountId}
          status={status}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/profile-live.spec.ts --repeat-each 5`
Expected: PASS (65 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npm test
npx prettier --write src/features/profile/components/LiveTab.tsx tests/web-browser/profile-live.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/components/LiveTab.tsx tests/web-browser/profile-live.spec.ts
git commit -m "fix(profile): a check that ends or replaces the match keeps focus in the Live tab"
```

Expected: 417 unit, 159 desktop and 96 website tests pass.

---

### Task 7: The Live tab's tests wait for each answer, name headings exactly and check lane 2

**Files:**
- Test: `tests/web-browser/profile-live.spec.ts`, `tests/browser/profile-live.spec.ts`, `tests/profile/live-match.test.ts`

What changes, in tests only:
- **Each answer reaches the page before the clock moves on.** "The minute's checks leave the notice, and focus on its Retry, in place" counted a request when it reached the route, not when the page had handled its answer, then moved the clock a minute at once: an answer handled late scheduled the next check after the jump, and the test timed out waiting for the notice to go. With the third answer held 150 ms at the route, it failed 3 times in 3; with a 300 ms wait after the count, the file's way, it passes. "The Live tab checks again every minute" checks that nothing was asked at 30 s; it now first gives a request the same 300 ms to reach the route.
- **The heading named exactly:** the desktop test of the account Overwolf reports finds "Live match" with `exact: true`, as its comment means (the name alone also matches "Live match · {hero}" and "No live match found").
- **Lane 2, a real check:** "Lane 2's Guardian bit gone too changes nothing" started from a mask whose Guardians were already 0, so it couldn't fail. It now clears bit 2 from a full mask and expects 3.

- [ ] **Step 1: Wait for each answer**

In `tests/web-browser/profile-live.spec.ts`:

1. Replace:

```ts
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(1)).toContainText("Amber +5,426");
  await page.clock.runFor(30_000);
  expect(asked).toHaveLength(1);
  await page.clock.runFor(30_000);
  await expect(stats.nth(1)).toContainText("Sapphire +5,000");
```

with:

```ts
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(1)).toContainText("Amber +5,426");
  await page.clock.runFor(30_000);
  // Time for a request the page made to reach the route.
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(1);
  await page.clock.runFor(30_000);
  await expect(stats.nth(1)).toContainText("Sapphire +5,000");
```

2. Replace:

```ts
  // Failing again: the same notice, still focused, and nothing announced.
  await page.clock.runFor(60_000);
  await expect.poll(() => asked.length).toBe(3);
  await expect(retry).toBeFocused();
  await expect(page.locator(".live-status")).toHaveText("");
  // Going well: the notice goes, and focus moves to the status.
```

with:

```ts
  // Failing again: the same notice, still focused, and nothing announced.
  await page.clock.runFor(60_000);
  await expect.poll(() => asked.length).toBe(3);
  // Time for the answer to reach the page.
  await page.waitForTimeout(300);
  await expect(retry).toBeFocused();
  await expect(page.locator(".live-status")).toHaveText("");
  // Going well: the notice goes, and focus moves to the status.
```

- [ ] **Step 2: Name the heading exactly**

In `tests/browser/profile-live.spec.ts`:

Replace:

```ts
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match" }),
  ).toBeVisible();
  expect(asked).toEqual(["200"]);
});
```

with:

```ts
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match", exact: true }),
  ).toBeVisible();
  expect(asked).toEqual(["200"]);
});
```

- [ ] **Step 3: Check lane 2 from a full mask**

In `tests/profile/live-match.test.ts`:

Replace:

```ts
      guardians: 0,
      walkers: 3,
    });
    // Lane 2's Guardian bit gone too changes nothing.
    expect(standing(0b1111111111100001).guardians).toBe(0);
  });

  it("has the Patron weakened once its first phase is down, and destroyed with the last", () => {
```

with:

```ts
      guardians: 0,
      walkers: 3,
    });
    // Lane 2's Guardian bit gone from a full mask changes nothing.
    expect(standing(ALL_STANDING & ~0b100).guardians).toBe(3);
  });

  it("has the Patron weakened once its first phase is down, and destroyed with the last", () => {
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/profile/live-match.test.ts`
Expected: PASS (11 tests).

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: PASS (5 tests).

Run: `npx playwright test -c playwright.web.config.ts tests/web-browser/profile-live.spec.ts --repeat-each 5`
Expected: PASS (65 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npm test
npx prettier --write tests/web-browser/profile-live.spec.ts tests/browser/profile-live.spec.ts tests/profile/live-match.test.ts
npm run test:browser && npm run test:web
git add tests/web-browser/profile-live.spec.ts tests/browser/profile-live.spec.ts tests/profile/live-match.test.ts
git commit -m "test(profile): the Live tab's tests wait for each answer, name headings exactly and check lane 2"
```

Expected: 417 unit, 159 desktop and 96 website tests pass.

---

### Task 8: Readable objective labels; room under your own Live tab's error

**Files:**
- Modify: `src/features/profile/styles/profile.css`
- Test: `tests/browser/profile-live.spec.ts`

What changes, in CSS only:
- **Objective labels in `--muted`:** `--dim` on `--surface-2` is 3.9:1 at 10.5 px, under WCAG AA's 4.5:1. `--muted` is 6.8:1, as the tab's other labels (`.stat-card small`, `.live-team h4`) and the match report's and Home's `dt` labels use.
- **Room under your own tab's error:** `.live-tab > .notice` (the Watch list's notice, 12 px under the status line) also caught `MatchOverview`'s error banner in your own tab, which then had nothing under it: its bottom border met the build panel's top border. `.live-tab.own > .notice { margin: 0 0 14px; }` gives it 14 px under it, as the section header's row has, and keeps it flush with the profile's padding like the header and the build (the Live page's own side margins, 30 px or 20 px up to 1100 px wide, would push it in). Checked by eye at 1260, 1000 and 850 px.
- **Test (desktop):** an error from Overwolf on your own tab leaves at least 14 px between the banner and the build panel, and the two line up on the left. The labels' colour has no test.

- [ ] **Step 1: Write the failing test**

In `tests/browser/profile-live.spec.ts`:

Replace:

```ts
  expect(asked).toEqual([]);
});

test("the account Overwolf reports on this PC gets the Overwolf tab, whichever account is remembered", async ({
  page,
}) => {
```

with:

```ts
  expect(asked).toEqual([]);
});

test("your own Live tab keeps an error clear of the build below it", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await storeMe(page);
  await routeApi(page);
  await openMyLive(page);
  await updateMatch(page, { error: "Game events are unavailable." });
  const tab = view(page).locator(".live-tab");
  const error = tab.getByRole("alert");
  await expect(error).toHaveText("Game events are unavailable.");
  const notice = (await error.boundingBox())!;
  const build = (await tab
    .getByRole("region", { name: "Your build" })
    .boundingBox())!;
  // Room between them, and in line.
  expect(build.y - (notice.y + notice.height)).toBeGreaterThanOrEqual(14);
  expect(notice.x).toBe(build.x);
});

test("the account Overwolf reports on this PC gets the Overwolf tab, whichever account is remembered", async ({
  page,
}) => {
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: FAIL (1 failed, 5 passed: the banner meets the build panel (`Expected: >= 14`, `Received: 0`)).

- [ ] **Step 3: The labels' colour and the banner's room**

In `src/features/profile/styles/profile.css`:

1. Replace:

```css
  font: 600 10.5px var(--font-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dim);
}
.live-objectives dd {
  margin: 0;
```

with:

```css
  font: 600 10.5px var(--font-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.live-objectives dd {
  margin: 0;
```

2. Replace:

```css
  flex: 1;
  margin: 22px 0 0;
}
.live-tab.own .workspace {
  padding: 0;
}
```

with:

```css
  flex: 1;
  margin: 22px 0 0;
}
/* MatchOverview's error. */
.live-tab.own > .notice {
  margin: 0 0 14px;
}
.live-tab.own .workspace {
  padding: 0;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/browser/profile-live.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Check and commit**

```bash
npx tsc --noEmit && npm run web:typecheck
npm test
npx prettier --write src/features/profile/styles/profile.css tests/browser/profile-live.spec.ts
npm run test:browser && npm run test:web
git add src/features/profile/styles/profile.css tests/browser/profile-live.spec.ts
git commit -m "fix(profile): readable objective labels; room under your own Live tab's error"
```

Expected: 417 unit, 160 desktop and 96 website tests pass.

---

### Task 9: Docs after the final review, and final check

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-21-redesign-design.md`
- Modify: `src/features/profile/services/live-api.ts`, `src/features/profile/utils/live-match.ts`, `src/shared/api/DeadlockApi.ts` (a comment each)

- [ ] **Step 1: README**

The Live tab's section: every other player links to their profile (the player whose profile it is doesn't), and `duration_s` has been empty so far (`elapsedS()` takes it should the API fill it). The website has no live data from your own game, though its profiles have a Live tab. `cache: "no-cache"` has the browser check with the API rather than skip its cache. The Windows checklist adds the profile's Live tab, as `visibilityState` in hidden or minimised Overwolf windows is unchecked. Each paragraph is one line, so prettier leaves it as it is.

In `README.md`:

1. Replace:

```markdown
- **Any player** (on the website, and for anyone but your own account in the app): `GET /v1/matches/active?account_ids={id}`, the game's Watch list (about the top 200 matches being played) filtered to the player. It shows both teams' heroes and players (each linked to their profile), the souls lead (rounds won in Street Brawl), the mode, the minutes since the match started (the API's `duration_s` is always empty, so they count from `start_time`) and each team's objectives still standing: the Guardians, Walkers and Base Guardians of the three lanes, the two Shrines and the Patron ("Weakened" once its first phase is down). Those come from the team's `objectives_mask`, one bit per objective as the game numbers them (`ECitadelObjective`); Street Brawl has none. A value the API leaves out shows "—", and a player without an account has no link. A player who isn't on the list gets **No live match found** and why, never "Not in a game".
```

with:

```markdown
- **Any player** (on the website, and for anyone but your own account in the app): `GET /v1/matches/active?account_ids={id}`, the game's Watch list (about the top 200 matches being played) filtered to the player. It shows both teams' heroes and players (every other player linked to their profile), the souls lead (rounds won in Street Brawl), the mode, the minutes since the match started (the API's `duration_s` has always been empty so far, so they count from `start_time`) and each team's objectives still standing: the Guardians, Walkers and Base Guardians of the three lanes, the two Shrines and the Patron ("Weakened" once its first phase is down). Those come from the team's `objectives_mask`, one bit per objective as the game numbers them (`ECitadelObjective`); Street Brawl has none. A value the API leaves out shows "—", and a player without an account has no link. A player who isn't on the list gets **No live match found** and why, never "Not in a game".
```

2. Replace:

```markdown
Counterlock also builds as a public static website with the nav **Home · Tier list · Heroes · Items** (the tier list lives at `/tier-list`) and player profiles, with real URLs, pre-rendered hero and item pages and share previews. It has no **Live** page, overlay or hotkeys; Home searches for a Steam account by name or ID, and the header's **My profile** opens the remembered account. A profile's **Live** tab shows the player's match from the game's Watch list, as in the app. The layout is full width with side gutters and has phone layouts down to 375px. Hero pages have the same **Build** and **Popular builds** tabs and **Counter items** as the app; the website has no live match, so you always pick the enemy heroes. It lives in `web/` (React Router v8 framework mode on Vite, `ssr: false` with `prerender`) and reuses the feature code in `src/`, so the Overwolf app is unaffected.
```

with:

```markdown
Counterlock also builds as a public static website with the nav **Home · Tier list · Heroes · Items** (the tier list lives at `/tier-list`) and player profiles, with real URLs, pre-rendered hero and item pages and share previews. It has no **Live** page, overlay or hotkeys; Home searches for a Steam account by name or ID, and the header's **My profile** opens the remembered account. A profile's **Live** tab shows the player's match from the game's Watch list, as in the app. The layout is full width with side gutters and has phone layouts down to 375px. Hero pages have the same **Build** and **Popular builds** tabs and **Counter items** as the app; the website has no live data from your own game, so you always pick the enemy heroes. It lives in `web/` (React Router v8 framework mode on Vite, `ssr: false` with `prerender`) and reuses the feature code in `src/`, so the Overwolf app is unaffected.
```

3. Replace:

```markdown
Before a public release, test in Windows with a live match: game startup and shutdown, joining an existing match, both team assignments, Street Brawl, blank IDs, hero changes, consecutive matches, window drag/resize/hide, changed hotkey bindings, a provider outage, and API throttling. Follow Overwolf's developer review and distribution process before publishing.
```

with:

```markdown
Before a public release, test in Windows with a live match: game startup and shutdown, joining an existing match, both team assignments, Street Brawl, blank IDs, hero changes, consecutive matches, window drag/resize/hide, changed hotkey bindings, a provider outage, API throttling, and the profile's **Live** tab: your own in and out of a match, and whether another player's stops checking while the window is hidden or minimised. Follow Overwolf's developer review and distribution process before publishing.
```

4. Replace:

```markdown
The client caches in memory (30 seconds to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests; the profile Live tab's requests also skip the browser's own HTTP cache. It keeps requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding them back, counting every tab of the website and every window of the app together: the counts, and the cooldowns of those three groups and of a 503 (below), are kept in `localStorage`, claimed under a Web Lock where the browser has one. A request no one waits for any more leaves the queue, and a cooldown fails the waiting ones at once. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum and, as a cooldown outlives a reload, a ten-minute maximum. The Performance tab also keeps each stored game's totals for the session.
```

with:

```markdown
The client caches in memory (30 seconds to ten minutes depending on the data) and drops responses that have expired, times out after 15 seconds and shares in-flight requests; the profile Live tab's requests are also checked with the API rather than taken straight from the browser's HTTP cache. It keeps requests within the API's per-IP limits for analytics (200 a minute, shared by every analytics endpoint), bulk metadata (30) and rank lookups (20) by holding them back, counting every tab of the website and every window of the app together: the counts, and the cooldowns of those three groups and of a 503 (below), are kept in `localStorage`, claimed under a Web Lock where the browser has one. A request no one waits for any more leaves the queue, and a cooldown fails the waiting ones at once. A 429 pauses only what was refused: the whole group for those three, otherwise the one request, as other endpoints' limits depend on where the data comes from. A 503, the API shedding load, pauses everything. Either honours `Retry-After`, with a 30-second minimum and, as a cooldown outlives a reload, a ten-minute maximum. The Performance tab also keeps each stored game's totals for the session.
```

- [ ] **Step 2: Spec**

Phase 5's paragraph: the players linked to their profiles are the other players. Its "focus stays in place through Retry and the minute's checks" holds once Task 6 is in.

In `docs/superpowers/specs/2026-10-21-redesign-design.md`:

Replace:

```markdown
Built in phase 5: the website's tab, and the app's for anyone but your own account, asks `GET /v1/matches/active?account_ids=…` for the player alone. It shows each team's heroes and players (linked to their profiles), the souls lead (rounds won in Street Brawl), the mode, the minutes since `start_time` (the API's `duration_s` has always been empty) and each team's objectives still standing, read from its `objectives_mask` (the game's `ECitadelObjective` bits: the Guardians, Walkers and Base Guardians of lanes 1, 3 and 4, the two Shrines and the Patron, "Weakened" once its first phase is down; Street Brawl has none); a value the API leaves out shows "—". It checks again every minute while it is on screen, past the browser's HTTP cache (which would keep an answer for up to four minutes); a check that falls due while it is hidden waits until it is back, and the API's own copy of the list can be a few minutes old. A check that fails keeps the last answer and says so, with Retry; focus stays in place through Retry and the minute's checks. Your own account in the app (the account Overwolf reports playing on this PC, or else the remembered one) shows the Live page's match overview under a section header, or "Not in a game" with whether Deadlock is running. On phones the teams stack and the five profile tabs spread over one row.
```

with:

```markdown
Built in phase 5: the website's tab, and the app's for anyone but your own account, asks `GET /v1/matches/active?account_ids=…` for the player alone. It shows each team's heroes and players (the other players linked to their profiles), the souls lead (rounds won in Street Brawl), the mode, the minutes since `start_time` (the API's `duration_s` has always been empty) and each team's objectives still standing, read from its `objectives_mask` (the game's `ECitadelObjective` bits: the Guardians, Walkers and Base Guardians of lanes 1, 3 and 4, the two Shrines and the Patron, "Weakened" once its first phase is down; Street Brawl has none); a value the API leaves out shows "—". It checks again every minute while it is on screen, past the browser's HTTP cache (which would keep an answer for up to four minutes); a check that falls due while it is hidden waits until it is back, and the API's own copy of the list can be a few minutes old. A check that fails keeps the last answer and says so, with Retry; focus stays in place through Retry and the minute's checks. Your own account in the app (the account Overwolf reports playing on this PC, or else the remembered one) shows the Live page's match overview under a section header, or "Not in a game" with whether Deadlock is running. On phones the teams stack and the five profile tabs spread over one row.
```

The spec has never been prettier-formatted: leave its existing formatting alone. Check that the edit adds no new differences (prettier's differences from the file are the ones it had before the edit):

```bash
spec=docs/superpowers/specs/2026-10-21-redesign-design.md
diff <(git show HEAD:$spec | npx prettier --stdin-filepath $spec | diff - <(git show HEAD:$spec)) <(npx prettier $spec | diff - $spec)
```

Expected: no output.

- [ ] **Step 3: Three comments**

The API's copy "can be two minutes old"; bit 9 is the Patron's first phase, as bit 0 is its last; and every path is asked for `fresh` always or never, a second rule beside the ttl's.

In `src/features/profile/services/live-api.ts`:

Replace:

```ts
 * The account's live match from the game's Watch list (about the top 200
 * matches being played), or null when it isn't on it. Fresh: the browser
 * would keep the API's answer for up to four minutes (max-age=120 and
 * stale-while-revalidate=120), when the API's own copy can be two old.
 */
export async function fetchLiveMatch(
  accountId: number,
```

with:

```ts
 * The account's live match from the game's Watch list (about the top 200
 * matches being played), or null when it isn't on it. Fresh: the browser
 * would keep the API's answer for up to four minutes (max-age=120 and
 * stale-while-revalidate=120), while the API's own copy can be two
 * minutes old.
 */
export async function fetchLiveMatch(
  accountId: number,
```

In `src/features/profile/utils/live-match.ts`:

Replace:

```ts
// A team's objectives mask has a bit per objective, set while it stands, as
// numbered in the game's ECitadelObjective: 0 the Patron's last phase
// ("Core"), 1–4 the Guardians and 5–8 the Walkers of lanes 1–4, 9 the
// Patron ("Titan"), 10–11 the Shrines and 12–15 the Base Guardians of lanes
// 1–4. The map has lanes 1, 3 and 4: lane 2's bits never clear.
const LANES = [1, 3, 4];

/** What still stands of a team's objectives. */
```

with:

```ts
// A team's objectives mask has a bit per objective, set while it stands, as
// numbered in the game's ECitadelObjective: 0 the Patron's last phase
// ("Core"), 1–4 the Guardians and 5–8 the Walkers of lanes 1–4, 9 the
// Patron's first phase ("Titan"), 10–11 the Shrines and 12–15 the Base
// Guardians of lanes 1–4. The map has lanes 1, 3 and 4: lane 2's bits
// never clear.
const LANES = [1, 3, 4];

/** What still stands of a team's objectives. */
```

In `src/shared/api/DeadlockApi.ts`:

Replace:

```ts
/**
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree; and always fresh or never.
 */
export class DeadlockApi {
  private cache = new Map<
```

with:

```ts
/**
 * Every path is always asked for with the same ttl, so the caller's ttl,
 * which decides whether an entry is fresh, and the one stored with it,
 * which the sweep uses, agree. Likewise, a path is always asked for
 * `fresh`, or never.
 */
export class DeadlockApi {
  private cache = new Map<
```

- [ ] **Step 4: Final check**

Run all of these; every one must pass:
- `npm test` (417)
- `npx tsc --noEmit`
- `npm run web:typecheck`
- `npm run test:browser` (160)
- `npm run test:web` (96)
- `npm run build`
- `npm run web:build`
- `npm run validate:manifest`

- [ ] **Step 5: Commit**

Check the README and the comments with prettier; the spec was checked in Step 2.

```bash
npx prettier --check README.md src/features/profile/services/live-api.ts src/features/profile/utils/live-match.ts src/shared/api/DeadlockApi.ts
git add README.md docs/superpowers/specs/2026-10-21-redesign-design.md src/features/profile/services/live-api.ts src/features/profile/utils/live-match.ts src/shared/api/DeadlockApi.ts
git commit -m "docs: the profile Live tab after its final review"
```
