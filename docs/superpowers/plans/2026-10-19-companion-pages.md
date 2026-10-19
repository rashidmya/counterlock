# Companion Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Counterlock desktop window into a companion app with Home (profile), Live, Heroes and Items pages, auto-switching to Live when a match is joined.

**Architecture:** The desktop shell (`src/app/DesktopApp.tsx`) owns a `Route` state and renders one page per top tab. Each page is a feature folder (`features/live`, `features/profile`, `features/heroes`, `features/items`) with pure `utils/` derivations (unit-tested), `services/` that call Deadlock API through one shared cached client (`shared/api`), and React `components/`. Static hero/item/ability metadata comes from the bundled catalog, extended by `scripts/refresh-catalog.mjs`. The background window persists the last detected account to `localStorage`; the desktop reads it.

**Tech Stack:** React 19, TypeScript 7 (strict, no unused), Vite 8, Vitest 5, Playwright. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-companion-pages-design.md` — read it before any task; mockups referenced there were approved.

## Global Constraints

- No new runtime dependencies; no router; charts are hand-rolled SVG.
- Do not change the in-game overlay windows, `scout.overlay.*` keys, or the `counterlockStore` bridge contract.
- Use `@/` imports across features, relative within a feature. Overwolf calls only in `src/platform/overwolf/`.
- New feature CSS files are imported in `src/app/styles/index.css` **after** `panels.css` (keep existing order).
- Theme: gold `#dfc48c`/`#d8bd7f`, teal `#84c6ae`, loss `#e59b80`, panels `#192129` with border `#303a3f`; numbers/headings in "Barlow Condensed", body "DM Sans".
- **Real game art everywhere it exists**: hero `image` (small), `cardImage`, `backgroundImage`; ability `image`; item art via existing `ItemIcon`; rank badge via `rankImage(tier, subrank)`; souls/kill/death/category/time icons via `gameIcons`. No role icons exist — roles are text.
- Tags are **never chips**: one uppercase letter-spaced line, role gold, `─` gradient rule, secondary tags muted teal separated by ` / `; tags equal to the role are dropped.
- No "GAME DETECTED / EVENTS CONNECTED / IN MATCH" status row anywhere.
- Never invent data: missing → "Unavailable" / "Not enough data". Derived numbers carry a one-line note (tiers: "Tiers are based on win rate."; items: "Expensive items show higher win rates partly because players who are ahead can afford them.").
- Analytics query defaults: `game_mode=normal`, `match_mode=ranked,unranked`, `min_unix_timestamp` = start of the UTC day 30 days ago, optional `min_average_badge`.
- Match history mapping: `game_mode` 1 Normal, 4 Street Brawl; `match_mode` 1 Unranked, 4 Ranked; win ⇔ `match_result === player_team`.
- Before touching anything Overwolf-related (storage events across windows, game info, window behaviour, manifest), check https://dev.overwolf.com/ow-native/ and follow it. Known: Overwolf docs say the `storage` listener fires "regardless of the window that made the change" — listeners must be idempotent.
- Every task ends with `npm test` and `npx tsc --noEmit` passing; tasks touching UI also run `npm run test:browser`.

## Review Focus

1. **Protected/empty profile** — `/players/{id}/match-history` returns 403 or `[]`: Home shows profile header + "Match history unavailable" / "No recorded matches", no crash, no NaN. (Task 5 unit test, Task 6 browser test.)
2. **Zero-duration or abandoned matches** — `match_duration_s: 0`: souls/min and charts stay finite (0), not `Infinity`/`NaN`. (Task 4 unit test.)
3. **Thin hero data** — new hero / rank filter with no rows for counters, synergy, ability order or item stats: each section shows "Not enough data" (counter items fall back to heuristic, labelled). (Task 9 unit tests, Task 11 browser test.)
4. **API throttling** — 429 with `Retry-After` while browsing: pages show the busy message; identical requests are deduplicated in flight and cached so tab switching doesn't re-fetch. (Task 2 unit tests.)
5. **Auto-switch edge** — players appear before `matchId`, then `matchId` arrives; user navigates away mid-match: exactly one switch, no pull-back; a new match switches again. (Task 3 unit + browser tests.)

---

### Task 1: Extend the catalog (heroes, abilities, items) and game icon helpers

**Files:**
- Modify: `scripts/refresh-catalog.mjs` (`compact` + fetch list)
- Modify: `src/shared/catalog/types.ts`, `src/shared/catalog/index.ts`
- Regenerate: `src/shared/catalog/catalog.json`, `public/items/*` (via `npm run catalog:refresh`)
- Create: `src/shared/ui/gameIcons.ts`
- Test: `tests/catalog/catalog.test.ts`
- Possibly modify: `src/features/counters/utils/recommendations.ts` (only if refresh adds heroes/items that break `tests/counters/recommendations.test.ts`)

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type HeroRole = "assassin" | "brawler" | "marksman" | "mystic";
  // Hero gains: role?: HeroRole; cardImage?: string; backgroundImage?: string; tagline?: string; abilityIds?: number[]  (signature1..4 order)
  export interface Ability { id: number; heroId: number; name: string; image?: string; quip: string; description: string; upgrades: string[] } // upgrades = plain t1/t2/t3 descriptions
  export interface ItemStat { label: string; value: string; icon?: string } // value already formatted, e.g. "+180", "+12%"
  // Item gains: className?: string; tier?: number; active?: boolean; components?: string[]; stats?: ItemStat[]
  // Catalog gains: abilities: Ability[]
  ```
- Produces (index.ts): `abilityById: Map<number, Ability>`, `itemById: Map<number, Item>`, `itemByClass: Map<string, Item>`.
- Produces (gameIcons.ts): `gameIcons` object with keys `souls, kill, death, weapon, vitality, spirit, early, mid, late, objective` (URLs under `https://assets-bucket.deadlock-api.com/assets-api-res/icons/`: `hud/icons/icon_souls.svg`, `post_game/attributes/icon_kill.svg`, `hud/icons/skull.svg`, `shop/keystat_courage.png`, `shop/keystat_fortitude.png`, `shop/keystat_spirit.png`, `icons/icon_time_early.svg`, `icons/icon_time_mid.svg`, `icons/icon_time_late.svg`, `post_game/attributes/icon_objdmg.svg`); `categoryIcon(category: string): string | undefined`; `rankImage(tier: number, subrank: number): string` → `https://api.deadlock-api.com/v1/assets/ranks/${tier}/${subrank}/image?format=webp` (subrank 0 → catalog rank `image`).

- [ ] **Step 1: Write failing invariants test** `tests/catalog/catalog.test.ts`:
  - `every active hero has a role and four resolvable abilities`: for each `catalog.heroes` → `["assassin","brawler","marksman","mystic"]` contains `role`; `abilityIds.length === 4`; each id in `abilityById` with non-empty `name` and `image`.
  - `Haze has the expected identity`: hero id 13 → `role === "assassin"`, `tagline === "Sneaks in and sprays bullets"`, ability names `["Sleep Dagger","Smoke Bomb","Fixation","Bullet Dance"]`, `cardImage` ends with `haze_card.webp`.
  - `ability text is plain`: no ability `description`/`quip`/`upgrades[i]` contains `<`.
  - `items carry tier, class and formatted stats`: Leech (name) → `tier === 4`, `components` equal `["upgrade_vampire","upgrade_health_stealing_magic"]`, `stats` contains `{ label: "Bonus Health", value: "+180" }` (match label/value; icon is a URL). Every item `tier` ∈ 1..5 and every component resolves via `itemByClass` or is skipped knowingly (assert ≥ 90% resolve).
  - `rankImage`: `rankImage(5,3)` equals the subrank URL above.
- [ ] **Step 2:** `npx vitest run tests/catalog` → FAIL (missing fields).
- [ ] **Step 3: Extend `compact(heroes, items, ranks)`**: hero `role: h.hero_type`, `cardImage: images.icon_hero_card_webp ?? icon_hero_card`, `backgroundImage: images.background_image_webp ?? background_image`, `tagline: description.role`, `abilityIds` = `items.signature1..4` class names resolved to ability `id` from the items list. New top-level `abilities` from `items.filter(type==="ability" && hero in active heroes && referenced by a signature)`: `quip`, `description` = `plainText(description.desc)`, `upgrades` = `[t1_desc,t2_desc,t3_desc].map(plainText).filter(Boolean)` (`plainText` must also turn `<br>` into a space). Items add `className`, `tier: item_tier`, `active: is_active_item`, `components: component_items ?? []`, `stats`: property names listed in `tooltip_sections[].section_attributes[].properties|elevated_properties`, keep those with `label` and numeric non-zero `value`; value = (`prefix` includes `{s:sign}` and value>0 ? "+" : "") + value + (postfix ?? ""); `icon`. Update `types.ts`, add maps to `index.ts`, write `gameIcons.ts`.
- [ ] **Step 4:** `npm run catalog:refresh`, then `npx vitest run tests/catalog` → PASS.
- [ ] **Step 5:** `npm test`. If counter-coverage tests fail because of new heroes/items, add `heroThreats` profiles for new hero ids (follow existing pattern, with a reason from the hero's abilities) and re-run → all PASS. `npx tsc --noEmit` clean (fix `tests/fixtures/demo.ts` if a `Catalog` literal needs `abilities`).
- [ ] **Step 6: Commit** `feat(catalog): add roles, abilities, item tiers/stats and game icon helpers`.

---

### Task 2: Shared Deadlock API client and `useAsync` hook

**Files:**
- Create: `src/shared/api/DeadlockApi.ts`, `src/shared/api/useAsync.ts`
- Test: `tests/shared/DeadlockApi.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class DeadlockApi {
    constructor(request?: typeof fetch, now?: () => number);
    get<T>(path: string, ttlMs: number): Promise<T>; // path starts with "/v1/..."; base https://api.deadlock-api.com
  }
  export const deadlockApi: DeadlockApi;
  export const TTL = { analytics: 10 * 60_000, profile: 5 * 60_000, history: 2 * 60_000 };
  export function useAsync<T>(load: (() => Promise<T>) | null, deps: unknown[]): { data?: T; error?: string; loading: boolean };
  ```
  Behaviour: cache by full path for `ttlMs`; concurrent identical calls share one in-flight promise; failed calls are not cached; 15 s timeout; on 429/503 set cooldown `max(now+30s, Retry-After)` and subsequent calls reject with `"API busy. Retry after the cooldown."` until it passes; 403 → `"Data unavailable or profile protected."`; other non-OK → `` `Deadlock API unavailable (${status}).` ``. `useAsync` re-runs when `deps` change, ignores stale results from earlier runs, returns `{loading:false}` for `null`, and exposes `error.message`. All pages load data through services + `useAsync`.

- [ ] **Step 1: Failing tests** (inject `request` mock + `now`):
  - `caches by path until ttl`: two `get("/v1/x", 1000)` → 1 request; `now += 1001` → 2 requests.
  - `deduplicates in-flight requests`: `Promise.all([get(p), get(p)])` with deferred response → request called once, both resolve to same data.
  - `cools down after 429 with Retry-After`: response 429 header `Retry-After: 60` → rejects; immediate `get("/v1/other")` rejects with "API busy. Retry after the cooldown." and request count unchanged; after `now += 60_001` request is made.
  - `maps 403 and other errors`: 403 → "Data unavailable or profile protected."; 500 → "Deadlock API unavailable (500)."; failed call not cached (next call requests again).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement both files (mirror `StatsClient`'s timeout/cooldown logic; do not refactor `StatsClient`).
- [ ] **Step 4:** `npx vitest run tests/shared` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(api): shared cached Deadlock API client`.

---

### Task 3: App shell navigation, Live tab states, auto-switch

**Files:**
- Create: `src/app/navigation.ts`, `src/features/live/utils/live-status.ts`, `src/features/live/components/LivePage.tsx`, `src/features/live/styles/live.css`
- Modify: `src/app/DesktopApp.tsx`, `src/app/styles/index.css`
- Test: `tests/live/live-status.test.ts`, `tests/browser/navigation.spec.ts`; update `tests/browser/overlay.spec.ts`, `tests/browser/feature-boundaries.spec.ts`

**Interfaces:**
- Produces (`navigation.ts`):
  ```ts
  export type Page = "home" | "live" | "heroes" | "items" | "lookup";
  export interface Route { page: Page; heroId?: number; itemId?: number }
  export type Navigate = (route: Route) => void;
  ```
- Produces (`live-status.ts`):
  ```ts
  export type LiveStatus = "not-running" | "waiting" | "in-match";
  export function liveStatus(running: boolean, state: MatchState): LiveStatus; // players.length>0 → in-match; else running → waiting; else not-running
  export function matchKey(state: MatchState): string | null;                // players.length ? (matchId ?? "pending") : null
  export function shouldAutoSwitch(prevKey: string | null, nextKey: string | null): boolean;
  // true iff nextKey !== null && (prevKey === null || (prevKey !== "pending" && nextKey !== "pending" && nextKey !== prevKey))
  ```
- Produces: `LivePage({ state, status, showBuild, showCounters, counters, refresh, navigate })` — renders existing `MatchOverview` when `in-match`, else the empty states.
- Consumes: `useDeadlockRunning`, `bridge`, existing `MatchOverview`.

- [ ] **Step 1: Failing unit tests** `tests/live/live-status.test.ts`:
  - `liveStatus` returns each of the three values for (false, no players), (true, no players), (false|true, players).
  - `shouldAutoSwitch`: `(null,"pending")` true; `("pending","123")` false; `("123","123")` false; `("123",null)` false; `("123","456")` true; `(null,"123")` true.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `live-status.ts`. **Step 4:** run → PASS.
- [ ] **Step 5: Failing browser tests** `tests/browser/navigation.spec.ts` (reuse the `nativeWindow` stub pattern from `feature-boundaries.spec.ts`; extract it to `tests/browser/helpers.ts` exporting `nativeWindow(page, name, gameMode?, options?: { running?: boolean; players?: boolean })` and `updateMatch` usage):
  - `browser preview opens Home and Live shows not running`: goto `/` → tab "Home" has class `active`; click "Live" → text "Deadlock isn't running" and a "Browse heroes" button that opens Heroes.
  - `game running without match shows waiting`: running true, players `[]` → app opens on Live; text "Waiting for a match"; page has no text "EVENTS CONNECTED".
  - `joining a match switches to Live once`: running true, no players, open Heroes tab; `updateMatch({players:[…], matchId:null})` → Live active and `.build-panel` visible; click Heroes; `updateMatch({matchId:"42"})` → Heroes stays active; Live tab shows `.live-dot`; `updateMatch({players:[]})` then `updateMatch({players:[…], matchId:"43"})` → Live active again.
- [ ] **Step 6:** run → FAIL. **Step 7:** implement shell: tabs `Home · Live · Heroes · Items · Player lookup` (same `.tabs` markup); `route` state; initial page `home`, and the first time `running` becomes true before the user clicks a tab → `live`; a `prevKey` ref + `shouldAutoSwitch` on each bridge snapshot sets page `live`; `.live-dot` (green `#84c6ae`) on the Live tab when status is `in-match`; header connection text: `LIVE MATCH` / `IN MENUS` / `GAME NOT RUNNING` (browser preview: `STANDBY`). Pages mount on first visit and stay mounted, hidden with the `hidden` attribute when inactive (Live/lookup state preserved as today). Home/Heroes/Items render placeholders `<section className="page-placeholder">` until later tasks. Empty states per spec copy: "Deadlock isn't running" + "Launch Deadlock and this tab will fill in as soon as you join a match." + button "Browse heroes"; "Waiting for a match" + "Queue up. We'll switch to this tab when the lobby loads." + button "View your profile". Overlay settings, hotkey and lookup state behave as before.
- [ ] **Step 8: Update existing browser tests**: in `overlay.spec.ts` production test expect `STANDBY`, Home active, then click "Live" and expect "Deadlock isn't running" (replace `.build-panel`/`.counters` expectations); keep the settings assertions. In `feature-boundaries.spec.ts` replace button name "Match overview" with "Live".
- [ ] **Step 9:** `npm test && npx tsc --noEmit && npm run test:browser` → PASS.
- [ ] **Step 10: Commit** `feat(app): top-level pages, Live states and auto-switch`.

---

### Task 4: Profile account persistence and match-history derivations

**Files:**
- Create: `src/features/profile/storage.ts`, `src/features/profile/hooks/useProfileAccount.ts`, `src/features/profile/types.ts`, `src/features/profile/utils/match-history.ts`
- Modify: `src/platform/overwolf/background.ts` (subscribe store → `recordDetectedAccount`)
- Test: `tests/profile/storage.test.ts`, `tests/profile/match-history.test.ts`, extend `tests/platform/background.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export interface ProfileAccount { accountId: number; seenAt: number; source: "detected" | "manual" }
  export type HistoryFilter = "all" | "normal" | "ranked" | "street_brawl";
  export interface HistoryMatch { matchId: number; heroId: number; startTime: number; gameMode: number; matchMode: number; team: number; result: number; kills: number; deaths: number; assists: number; netWorth: number; lastHits: number; denies: number; durationS: number; heroLevel: number }
  export interface Summary { games: number; wins: number; winRate: number | null; kda: number; soulsPerMin: number; avgKills: number; avgDeaths: number; avgAssists: number; avgLastHits: number }
  export interface HeroRow { heroId: number; games: number; wins: number; losses: number; winRate: number; kills: number; deaths: number; assists: number; kda: number; soulsPerMin: number; lastHits: number; denies: number; lastPlayed: number } // kills/deaths/assists/lastHits/denies are per-game averages
  ```
- Produces (`storage.ts`): `PROFILE_KEY = "counterlock.profile.account"`; `readProfileAccount(): ProfileAccount | null` (validates shape, else null); `writeProfileAccount(a): void` (swallows storage errors); `recordDetectedAccount(state: MatchState, now?: number): void` — id = `state.localAccountId ?? local player's accountId`; writes `{source:"detected"}` only when id exists and (stored id differs, or stored source is manual, or `now - seenAt > 5 min`); `subscribeProfileAccount(cb: () => void): () => void` (window `storage` event filtered to `PROFILE_KEY` or `null`).
- Produces (`useProfileAccount.ts`): `useProfileAccount(): { account: ProfileAccount | null; setManual(id: number): void; clear(): void }`.
- Produces (`match-history.ts`): `parseHistory(rows: unknown): HistoryMatch[]` (drops invalid rows, maps API snake_case, sorted newest first); `isWin(m)`; `modeLabel(m): "Ranked" | "Normal" | "Street Brawl" | "Other"`; `matchesFilter(m, f)`; `isSummaryMatch(m)` (gameMode 1 && matchMode ∈ {1,4}); `kda(k,d,a)` = `(k+a)/max(1,d)`; `soulsPerMin(netWorth, durationS)` = 0 when `durationS<=0`; `summarize(ms): Summary` (KDA and souls/min from totals); `rankedSummary(ms): { games: number; winRate: number | null }`; `heroBreakdown(ms): HeroRow[]` (sorted games desc); `topHeroes(ms, n=3)`; `form(ms, n=20): boolean[]` newest first.

- [ ] **Step 1: Failing tests** `tests/profile/storage.test.ts` (stub `localStorage` with a Map):
  - writes detected account from `localAccountId`; falls back to local player's `accountId`; no write when neither exists.
  - does not rewrite same account within 5 min; rewrites after 5 min; detected replaces manual immediately.
  - `readProfileAccount` returns null for malformed JSON / missing fields.
- [ ] **Step 2: Failing tests** `tests/profile/match-history.test.ts` with rows copied from the live sample shape (`match_result`, `player_team`, etc.):
  - `isWin` true when `match_result === player_team` (0/0 and 1/1), false otherwise.
  - filters: ranked row (1,4) only in all/ranked; normal (1,1) only in all/normal; street brawl (4,1) only in all/street_brawl; bot row (1,3) only in all.
  - `soulsPerMin(27375, 0) === 0`; `summarize` over a list containing a 0-duration match gives finite numbers.
  - `summarize` of 2 matches (10/2/5 win, 2/6/3 loss) → games 2, wins 1, winRate 0.5, kda `(12+8)/8 = 2.5`.
  - `heroBreakdown` groups by hero, averages, `lastPlayed` = max startTime; `form` newest first.
- [ ] **Step 3:** run → FAIL. **Step 4:** implement. **Step 5:** run → PASS.
- [ ] **Step 6: Background** — extend `tests/platform/background.test.ts`: after `info.emit({ info: { game_info: { steam_id: "76561198060265728" } } })` (game running), `localStorage.setItem` was called with `PROFILE_KEY` and accountId `100000000` (adjust the test's `localStorage` stub to record `setItem`). Implement: in `background.ts` `store.subscribe(() => recordDetectedAccount(store.getSnapshot()))`. Run → PASS.
- [ ] **Step 7:** `npm test && npx tsc --noEmit`. **Commit** `feat(profile): persist last account and derive match history stats`.

---

### Task 5: Profile API services

**Files:**
- Create: `src/features/profile/services/profile-api.ts`
- Test: `tests/profile/profile-api.test.ts`

**Interfaces:**
- Consumes: `DeadlockApi` (constructor-injected for tests: every function takes `api = deadlockApi` as last param), `parseHistory`, `PlayerRank` from `@/features/player-stats/types`.
- Produces:
  ```ts
  export interface SteamProfile { accountId: number; name: string; avatar?: string }
  export interface MateStat { accountId: number; games: number; wins: number }
  export interface ScoreboardPlayer { accountId: number; team: number; heroId: number; kills: number; deaths: number; assists: number; netWorth: number; lastHits: number; denies: number; level: number; items: number[] }
  export interface Scoreboard { matchId: number; durationS: number; winningTeam: number; players: ScoreboardPlayer[] }
  export interface PlayerHeroStat { heroId: number; matches: number; accuracy: number; damagePerMin: number }
  export function fetchSteamProfiles(ids: number[], api?): Promise<SteamProfile[]>;       // /v1/players/steam?account_ids=…  TTL.profile; uses personaname, avatarmedium
  export function fetchRank(id: number, api?): Promise<PlayerRank | null>;                 // /v1/players/rank?account_ids=id  TTL.profile
  export function fetchMatchHistory(id: number, api?): Promise<HistoryMatch[]>;            // /v1/players/{id}/match-history  TTL.history
  export function fetchMates(id: number, api?): Promise<MateStat[]>;                      // /v1/players/{id}/mate-stats?same_party=true → top 5 by games, games>=3
  export function heroStatsQueries(f: HistoryFilter): string[];                           // see below
  export function fetchPlayerHeroStats(id: number, f: HistoryFilter, api?): Promise<PlayerHeroStat[]>; // merges queries, weighted by matches
  export function fetchScoreboard(matchId: number, api?): Promise<Scoreboard>;            // /v1/matches/{id}/metadata  TTL.analytics
  ```
  `heroStatsQueries`: normal → `game_mode=normal&match_mode=unranked`; ranked → `game_mode=normal&match_mode=ranked`; street_brawl → `game_mode=street_brawl`; all → `[normal ranked,unranked, street_brawl]` (two queries). Summary (Overview/Performance) uses `game_mode=normal&match_mode=ranked,unranked` — export `SUMMARY_HERO_STATS = "game_mode=normal&match_mode=ranked,unranked"`.
  Scoreboard `items`: from `match_info.players[].items`, keep entries with `sold_time_s === 0` whose `item_id` is in `itemById`, dedupe, keep purchase order.

- [ ] **Step 1: Failing tests** (fake `DeadlockApi` whose `get` returns fixtures by path):
  - `heroStatsQueries("all")` has 2 entries; `("ranked")` contains `match_mode=ranked`.
  - `fetchPlayerHeroStats` weights accuracy by matches across two queries (10 @0.5 + 30 @0.7 → 0.65).
  - `fetchScoreboard` drops sold items and ability ids not in catalog items, keeps order; maps `winning_team`.
  - `fetchMatchHistory` rejects with the API message on 403 (`get` throws `Error("Data unavailable or profile protected.")`) — caller-facing message preserved; returns `[]` for `[]`.
  - `fetchMates` filters games<3, sorts desc, max 5.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(profile): Deadlock API profile services`.

---

### Task 6: Home page — empty state, header, Overview subtab, match detail

**Files:**
- Create: `src/features/profile/components/HomePage.tsx`, `ProfileHeader.tsx`, `ProfileEmpty.tsx`, `OverviewTab.tsx`, `MatchHistory.tsx`, `MatchDetail.tsx`, `src/features/profile/styles/profile.css`
- Modify: `src/app/DesktopApp.tsx` (render `HomePage` for `home`), `src/app/styles/index.css`
- Test: `tests/browser/home.spec.ts`

**Interfaces:**
- Consumes: Task 4 hook/utils, Task 5 services, `useAsync`, `Navigate`, `gameIcons`, `rankImage`, `ItemIcon`, `Picture`.
- Produces: `HomePage({ navigate }: { navigate: Navigate })` with internal subtab state `"overview" | "heroes" | "performance"` (Heroes/Performance render placeholders until Tasks 7–8). Subtab/filter state lives inside each page; the shell (Task 3) mounts a page on its first visit and then keeps it mounted, hiding inactive pages with the `hidden` attribute, so state survives tab switches without fetching for unvisited pages.

- [ ] **Step 1: Failing browser tests** `tests/browser/home.spec.ts` (route all `api.deadlock-api.com` calls with fixtures; set `counterlock.profile.account` in `addInitScript` where needed):
  - `empty state accepts a Steam ID`: no stored account → text "Play a match with Counterlock open and your profile appears here"; fill "Steam ID" with `76561198060265728`, submit → profile header shows the fixture persona name; `localStorage["counterlock.profile.account"]` has `accountId: 100000000, source: "manual"`.
  - `overview shows rank, summary, top heroes, teammates and filtered history`: stored account; fixtures: rank `{rank:5, subrank:3}`, 4 history rows (ranked win, normal loss, street brawl win, bot match) → rank text "Mystic 3" and an `img` with src containing `/ranks/5/3/image`; "Ranked" card shows `1`; click filter "Street Brawl" → exactly 1 `.match-row`; click "All" → 4 rows; a teammate name from steam fixture visible.
  - `protected history degrades`: match-history route 403 → header still renders, text "Match history unavailable".
  - `match detail shows both teams with items`: click first `.match-row` → `.scoreboard` lists 12 players (fixture) and item art `img.item-icon`.
  - `hero cross-link`: clicking a top-hero card opens Heroes tab (placeholder ok) with that hero id in route (assert Heroes tab active).
- [ ] **Step 2:** FAIL → **Step 3: Implement** per spec "Home": header (avatar, name, "Seen on this PC · <relative>" or "Entered manually", "Change" link → clears to empty state), headline cards (Rank with badge via `rankImage`; Ranked games + ranked WR; Avg KDA; Souls/min with `gameIcons.souls`), label "Normal & ranked games" under summary cards; Top heroes (3 cards with portrait); Frequent teammates (avatar, name, games, WR together; hidden if none); Match history: filter buttons `All / Normal / Ranked / Street Brawl`, rows (portrait, hero name, K/D/A with kill/death icons, mode label, souls with souls icon, duration `mm:ss`, WIN/LOSS colored, relative date), "Show more" adds 20 (initial 20); clicking a row toggles `MatchDetail` under it (loading/“Match details unavailable” states; two team tables, winner highlighted, local account row marked "YOU"). Hero names/portraits clickable → `navigate({page:"heroes", heroId})`.
- [ ] **Step 4:** `npm run test:browser` → PASS; `npm test && npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(home): profile overview, history and match detail`.

---

### Task 7: Home — Heroes subtab table

**Files:**
- Create: `src/features/profile/components/HeroesTab.tsx`, `src/features/profile/utils/sort.ts`
- Test: `tests/profile/sort.test.ts`, extend `tests/browser/home.spec.ts`

**Interfaces:**
- Produces: `type SortDir = "asc" | "desc"; sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[]` (stable, nulls last) — reused by Heroes/Items pages.
- Consumes: `heroBreakdown`, `matchesFilter`, `fetchPlayerHeroStats`.

- [ ] **Step 1: Failing tests**: `sortRows` sorts numbers desc/asc, strings by `localeCompare`, nulls last both ways, stable for ties. Browser: Heroes subtab shows one row per played hero from fixtures; clicking header "WR" sorts descending then ascending (assert first row hero name each time); filter "Ranked" reduces rows; accuracy/damage columns show "—" when hero-stats has no row.
- [ ] **Step 2:** FAIL → **Step 3:** implement table columns: Hero (portrait + name, link), Games, W–L, WR, KDA, K/D/A, Souls/min, Dmg/min, Accuracy, Last hits, Denies, Last played. Default sort games desc. Same filter buttons as history (shared component from Task 6).
- [ ] **Step 4:** PASS all suites. **Step 5: Commit** `feat(home): played heroes table`.

---

### Task 8: Home — Performance subtab with SVG charts

**Files:**
- Create: `src/features/profile/components/PerformanceTab.tsx`, `src/shared/ui/LineChart.tsx`, `src/features/profile/utils/performance.ts`
- Test: `tests/profile/performance.test.ts`, extend `tests/browser/home.spec.ts`

**Interfaces:**
- Produces: `performanceSeries(ms: HistoryMatch[], range: 20 | 50 | "all"): { kda: number[]; soulsPerMin: number[]; form: boolean[]; averages: Summary }` — uses only `isSummaryMatch` matches, oldest→newest for series, newest-first for form (max 20).
- Produces: `LineChart({ values, average?, label, color }: { values: number[]; average?: number; label: string; color: string })` — `<svg viewBox="0 0 100 30" preserveAspectRatio="none">` polyline normalized to min/max (flat line at mid when all equal; renders "Not enough matches" when `values.length < 2`), dashed average line, `aria-label={label}`.

- [ ] **Step 1: Failing tests**: `performanceSeries(…, 20)` excludes street brawl/bots, returns ≤20 points in chronological order, all finite with a 0-duration match present; browser: Performance subtab shows two `svg[aria-label]` charts ("KDA per match", "Souls per minute"), 20 `.form i` squares with fixture of ≥20 matches, range "Last 50" changes point count (assert polyline point count).
- [ ] **Step 2:** FAIL → **Step 3:** implement; average cards: Accuracy, Damage/min (from `fetchPlayerHeroStats` with summary query, weighted), Last hits per game, Deaths per game; note "Accuracy and damage cover all normal & ranked games in the period." when range ≠ all.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(home): performance trends`.

---

### Task 9: Hero and item analytics derivations and services

**Files:**
- Create: `src/features/heroes/utils/analytics.ts`, `src/features/heroes/services/hero-analytics.ts`
- Test: `tests/heroes/analytics.test.ts`

**Interfaces:**
- Produces (`utils/analytics.ts`, pure):
  ```ts
  export type Tier = "S" | "A" | "B" | "C" | "D";
  export interface AnalyticsQuery { minBadge: number } // 0 = all ranks
  export function analyticsParams(q: AnalyticsQuery, now?: number): string; // "game_mode=normal&match_mode=ranked,unranked&min_unix_timestamp=<UTC day start − 30d>[&min_average_badge=n]"
  export function rankFilterOptions(ranks: Rank[]): { value: number; label: string }[]; // [{0,"All ranks"}, …tiers ≥1 → {tier*10+1, `${name}+`}]
  export interface HeroSummary { heroId: number; matches: number; wins: number; winRate: number; pickRate: number; kda: number; tier: Tier; position: number } // position = 1-based by winRate
  export function assignTiers(winRates: { heroId: number; winRate: number }[]): Map<number, Tier>; // sorted desc; index/n < .10 S, < .30 A, < .60 B, < .85 C, else D
  export function summarizeHeroes(rows: AnalyticsHeroStatsRow[]): HeroSummary[]; // pickRate = matches / (Σmatches / 12); kda = (kills+assists)/max(1,deaths) from totals
  export interface Matchup { heroId: number; winRate: number; matches: number }
  export function matchups(rows: CounterRow[], heroId: number, minMatches?: number, n?: number): { strong: Matchup[]; weak: Matchup[] }; // defaults 200, 5
  export function bestWith(rows: SynergyRow[], heroId: number, minMatches?: number, n?: number): Matchup[];
  export function mostCommonOrder(rows: AbilityOrderRow[]): { abilities: number[]; winRate: number; matches: number } | null;
  export interface ItemPerf { itemId: number; winRate: number; matches: number; pickRate?: number; delta?: number; avgBuyS?: number }
  export function bestItems(rows: ItemStatsRow[], heroMatches: number, n?: number, minShare?: number): ItemPerf[]; // defaults 6, 0.05; shop items only
  export function counterItems(vsRows: ItemStatsRow[], baseRows: ItemStatsRow[], n?: number, minMatches?: number): ItemPerf[]; // delta = wr(vs) − wr(base) > 0, desc; defaults 6, 500
  export function itemTable(rows: ItemStatsRow[], totalPlayerMatches: number): Map<number, ItemPerf>; // pickRate = matches / totalPlayerMatches
  export function buildsFrom(item: Item): Item[]; export function buildsInto(item: Item): Item[];
  ```
  Row types mirror API fields used (`hero_id, wins, losses, matches, total_kills, total_deaths, total_assists`; counter `hero_id, enemy_hero_id, wins, matches_played`; synergy `hero_id1, hero_id2, wins, matches_played`; ability order `abilities, wins, losses, matches`; item `item_id, wins, losses, matches, avg_buy_time_s`).
- Produces (`services/hero-analytics.ts`, all via `deadlockApi.get(…, TTL.analytics)`): `fetchHeroSummaries(q)`, `fetchMatchups(q)` (`/v1/analytics/hero-counter-stats?…&same_lane_filter=false`), `fetchSynergy(q)` (`/v1/analytics/hero-synergy-stats?…&same_lane_filter=false`), `fetchAbilityOrder(heroId,q)`, `fetchItemStats(q, extra?: string)` (extra = `hero_id=n` or `enemy_hero_ids=n`), `heuristicCounterItems(heroId): Item[]` (wraps `recommend([syntheticPlayer], catalog.items, 99999, [])`).

- [ ] **Step 1: Failing tests**:
  - `assignTiers` with 20 heroes → counts S2 A4 B6 C5 D3; highest WR is S.
  - `summarizeHeroes`: two heroes 600/400 matches → pickRate `600/(1000/12)=7.2`; position 1 = higher WR.
  - `matchups` drops rows under `minMatches`, strong sorted desc, weak asc, only `hero_id === heroId`; empty input → `{strong:[],weak:[]}`.
  - `bestWith` resolves the partner from either side of the pair.
  - `mostCommonOrder` picks max `matches`; `[]` → null.
  - `bestItems` excludes items below 5% share and non-shop ids; `counterItems` computes positive deltas only and returns `[]` when nothing qualifies.
  - `buildsInto(Healing Rite-like component)` includes Leech-like parent using catalog `components`.
  - `analyticsParams({minBadge:0}, Date.UTC(2026,9,19,15))` contains `min_unix_timestamp=${Date.UTC(2026,8,19)/1000}` and no `min_average_badge`; with 51 contains `min_average_badge=51`.
  - `heuristicCounterItems(13)` returns ≥1 item.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS, tsc clean.
- [ ] **Step 5: Commit** `feat(heroes): analytics derivations and services`.

---

### Task 10: Heroes list page

**Files:**
- Create: `src/features/heroes/components/HeroesPage.tsx`, `HeroGrid.tsx`, `RankFilter.tsx`, `src/features/heroes/styles/heroes.css`
- Modify: `src/app/DesktopApp.tsx`, `src/app/styles/index.css`
- Test: `tests/browser/heroes.spec.ts`

**Interfaces:**
- Consumes: Task 9; `Route.heroId` (when set, render `HeroDetail` from Task 11; until then a placeholder).
- Produces: `HeroesPage({ route, navigate, query, setQuery })` — `query: AnalyticsQuery` lives in `DesktopApp` (shared with Items). `RankFilter({ value, onChange })` reused by Items.

- [ ] **Step 1: Failing browser tests** (fixture hero-stats for all catalog heroes with distinct WRs):
  - default sort Tier: headings `S TIER`…`D TIER` in order; each `.hero-card` shows portrait `img`, name, `%` win rate and pick rate, tier letter.
  - role filter "Mystic" → every card's hero has role mystic (count equals catalog mystic count).
  - sort "A–Z" → no tier headings; first card is alphabetically first hero.
  - rank filter "Mystic+" → next hero-stats request URL contains `min_average_badge=51`.
  - note "Tiers are based on win rate." visible; clicking a card sets the hero detail route (placeholder shows hero name).
- [ ] **Step 2:** FAIL → **Step 3:** implement per spec "Heroes page → List" (role buttons `All / Assassin / Brawler / Marksman / Mystic`; sort select `Tier / A–Z / Win rate / Pick rate`; tier colors S `#f2c66d`, A `#9fd4a8`, B `#8fb7d9`, C `#b9a3d9`, D `#d99a8f`; loading and error states).
- [ ] **Step 4:** PASS all. **Step 5: Commit** `feat(heroes): hero list with tiers, roles and sorting`.

---

### Task 11: Hero detail page

**Files:**
- Create: `src/features/heroes/components/HeroDetail.tsx`, `HeroHeader.tsx`, `AbilityCards.tsx`, `SkillOrder.tsx`, `MatchupList.tsx`, `ItemList.tsx`
- Modify: `src/features/builds/components/BuildPanel.tsx` only if needed to reuse the build view (prefer a new `HeroBuild` component that uses `useMeasuredBuild(heroId, "normal", "desktop")` and shares markup/CSS classes with `BuildPanel`)
- Test: `tests/browser/hero-detail.spec.ts`

**Interfaces:**
- Consumes: Task 1 catalog (`abilityById`, hero `cardImage/backgroundImage/tagline/tags/role`), Task 9 services/utils, `useMeasuredBuild`, `ItemIcon`, `Navigate`.
- Produces: `HeroDetail({ heroId, query, navigate })`.

- [ ] **Step 1: Failing browser tests** (Haze fixtures for every analytics endpoint + build endpoints as in `feature-boundaries.spec.ts`):
  - header: `img` with src containing `haze_card.webp`; `.hero-identity` text equals `ASSASSIN` + `STEALTHY / LETHAL` (assert role element text "ASSASSIN", tags element text "STEALTHY / LETHAL", and no element with class matching `chip|pill` inside `.hero-identity`); tagline text; `.tier-banner` text contains the fixture tier letter; "#N OF 43"-style position text (use catalog hero count).
  - abilities: 4 `.ability-card` with numbers 1–4, names in signature order, `img` per card from ability `image`.
  - skill order grid: rows = 4 ability icons; numbered cells count equals fixture order length; win rate text.
  - "Strong against", "Countered by", "Best with", "Best items", and a **separate** "Counter items" section each render fixture entries (hero portraits / item art); clicking a matchup hero navigates to that hero; clicking an item navigates to Items with `itemId`.
  - thin data: counter/synergy/ability-order/item routes return `[]` → each section shows "Not enough data", and Counter items shows heuristic items with label "Based on hero traits".
  - "← All heroes" returns to the list.
- [ ] **Step 2:** FAIL → **Step 3: Implement** per spec "Hero detail" and approved v3 mockup: background art faded behind header (`linear-gradient(90deg,#0f151bf2 35%,#0f151b99 70%,#0f151bcc)` over `backgroundImage`); portrait frame 156×208 with tier banner top-right (`clip-path: polygon(0 0,100% 0,100% 82%,50% 100%,0 82%)`, small "TIER" label, tier color gradient, drop shadow) and "#N OF {heroes}" caption; identity line (role gold `#e4c27f`, 22px gold→teal gradient rule, tags `#7fb8ad`, letter-spacing 2.4px); name 46px Barlow Condensed; stats row with thin dividers (win rate, pick rate, matches, avg KDA). Ability cards show `quip`; full `description` and `upgrades` (T1/T2/T3) in the card's `title` tooltip or an expandable area. Section order: Abilities, Skill order, Build, Strong against / Countered by, Best with, Best items, Counter items. Item tiles use `ItemIcon` and category icon.
- [ ] **Step 4:** PASS all. **Step 5: Commit** `feat(heroes): hero detail page`.

---

### Task 12: Items page and item detail

**Files:**
- Create: `src/features/items/components/ItemsPage.tsx`, `ItemShopGrid.tsx`, `ItemDetail.tsx`, `src/features/items/styles/items.css`
- Modify: `src/app/DesktopApp.tsx`, `src/app/styles/index.css`
- Test: `tests/browser/items.spec.ts`

**Interfaces:**
- Consumes: catalog items (Task 1), `itemTable`, `buildsFrom`, `buildsInto`, `fetchItemStats`, `fetchHeroSummaries` (total player matches = Σ hero matches), `RankFilter`, `sortRows`, `gameIcons.categoryIcon`.
- Produces: `ItemsPage({ route, navigate, query, setQuery })`.

- [ ] **Step 1: Failing browser tests**:
  - default shop layout: three columns headed Weapon/Vitality/Spirit, each with category icon `img`; cost rows `800`, `1,600`, `3,200`, `6,400`, `9,999` (only those present); total `.item-tile` count equals catalog item count.
  - search "leech" → 1 tile; category "Spirit" → only spirit tiles.
  - sort "Win rate" → flat grid, first tile has highest fixture WR, numbers shown under tiles.
  - item detail (click Leech): name, cost, "Vitality", "Passive", stat lines with property icons (`img` from stat icon) e.g. "+180 Bonus Health"; win rate, pick rate, avg buy time `mm:ss`; "Builds from" shows its two components; clicking a component opens that item; "← All items" returns.
  - win-rate note "Expensive items show higher win rates partly because players who are ahead can afford them." visible.
- [ ] **Step 2:** FAIL → **Step 3:** implement per spec "Items page".
- [ ] **Step 4:** PASS all. **Step 5: Commit** `feat(items): shop-style item browser and item detail`.

---

### Task 13: Docs and full verification

**Files:**
- Modify: `README.md` (What it does, project map rows for `features/live`, `features/profile`, `features/heroes`, `features/items`, `shared/api`; mention persisted `counterlock.profile.account` key and new API endpoints used), `.gitignore` (add `.superpowers/`)

- [ ] **Step 1:** Update README sections listed above; keep existing caveats; add the Overwolf note that Home's account comes from Deadlock game events and is stored locally.
- [ ] **Step 2:** Run `npm test`, `npx playwright install chromium` (if needed), `npm run test:browser`, `npm run build`, `npm run validate:manifest` → all PASS.
- [ ] **Step 3:** Manual smoke in `npm run dev`: each tab renders against the real API (Home via manual Steam ID), no console errors.
- [ ] **Step 4: Commit** `docs: describe companion pages`.
