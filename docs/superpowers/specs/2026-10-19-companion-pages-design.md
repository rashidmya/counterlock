# Companion pages: Home, Live, Heroes, Items — design

Date: 2026-10-19
Status: draft for approval

## Intent

Counterlock today is a single "Match overview" screen plus a "Player lookup" tab.
It is only useful while a match is live. The owner mostly opens the app
**between matches just to look around**: their heroes, their performance,
their last match, their history. This work turns the desktop window into a
companion app with pages worth browsing when no match is running, while
keeping the live match view one click (or zero clicks) away.

Success: opening the app with Deadlock closed shows something personal and
useful (your profile), and the Heroes and Items pages are good enough to
replace a trip to a stats website. Joining a match takes you to the live view
without touching anything.

## Goals

- Top-level tabs across the top (approved option A, same style as today):
  **Home · Live · Heroes · Items · Player lookup**.
- **Live** tab with "game not running" and "in menus, waiting for a match"
  states; auto-switch to Live when a match is joined.
- **Home**: profile of the last account seen on this PC, with Overview,
  Heroes and Performance subtabs.
- **Heroes** page: all heroes with tier, win rate, pick rate; sort and role
  filter; a hero detail page.
- **Items** page: all shop items, shop-style layout, stats, item detail.
- Add other genuinely useful Deadlock API data where it fits (owner: "throw
  in any useful data… to make our app good").

## Non-goals

- No change to the in-game overlay windows (`in_game`, `counter_overlay`),
  their preferences, or the background store contract.
- No backend, accounts, analytics, or persistent player database. Only the
  last-seen account ID (and optional manual ID) is persisted locally.
- No new runtime dependencies (no router, no chart library). Charts are
  hand-rolled SVG.
- No Street Brawl variants of the Heroes/Items analytics pages in this
  round (Home match history does include Street Brawl — see below).
- No popping/restoring the desktop window when a match starts; only the
  tab changes (see "Auto-switch").

## Anti-goals

- **Chips/pills for hero tags.** The owner explicitly dislikes chips for tags.
  (Pill-style *filter buttons* in the mockups were not objected to.)
- The "✓ GAME DETECTED · ✓ EVENTS CONNECTED · ○ IN MATCH" status row on
  the waiting state. Explicitly removed.
- Presenting derived numbers (tiers, "counter items", item win rates) as if
  they were official or causal. Label how they're derived in one line.
- Filling gaps with fake/demo data in production, or matching players by
  name (existing project rule).

## Constraints (from the existing project)

- React 19 + TypeScript + Vite, no router. Feature folders under
  `src/features/*`, shared UI in `src/shared/ui`, Overwolf code only in
  `src/platform/overwolf`. `@/` imports across features. Styles composed in
  `src/app/styles/index.css` (order matters).
- Visual language: existing dark theme, gold accent `#dfc48c`/`#d8bd7f`,
  teal `#84c6ae`, Barlow Condensed for numbers/headings, DM Sans body.
- Desktop window min size 850×650, default 1260×900.
- Deadlock API (`https://api.deadlock-api.com`), no key. Analytics endpoints
  share **200 req/min per IP**; `/players/rank` is **20 req/min**. Reuse the
  existing timeout / `Retry-After` cooldown / in-memory cache approach from
  `StatsClient` and `build-analytics`.
- Bundled catalog (`src/shared/catalog/catalog.json`, produced by
  `scripts/refresh-catalog.mjs`) is the source for static hero/item/ability
  metadata. Portraits and other images load from the asset CDN; item icons
  stay bundled.
- `tsc` rejects unused locals/params. Existing unit and Playwright tests must
  pass (update them where the tab structure changes them).
- **Use actual game art/icons for anything possible** (owner request): hero
  portraits/cards/backgrounds, ability icons, item shop art, rank badges
  with sub-rank (`https://api.deadlock-api.com/v1/assets/ranks/{tier}/{subrank}/image?format=webp`),
  souls/kill/death icons, Weapon/Vitality/Spirit category icons
  (`shop/keystat_courage|fortitude|spirit.png`), early/mid/late icons,
  item stat property icons. Hand-drawn SVG only where the game has no
  icon (e.g. there are no role icons in the asset API; roles stay text).
- **Check the Overwolf docs** (https://dev.overwolf.com/ow-native/) for
  anything that touches Overwolf before implementing it (owner request).
  In particular: sharing `localStorage` and `storage` events between the
  background and desktop windows, `getMainWindow()` store access, game
  running/info events (`overwolf.games`), GEP match events for Deadlock,
  window behaviour (desktop-only window while the game runs), and any
  manifest changes (e.g. new permissions or CSP/external domains for the
  Steam avatar CDN). Use what the docs say over assumptions in this
  document; note any conflict in the plan.

## Navigation and app shell

- Tabs: Home, Live, Heroes, Items, Player lookup (Player lookup unchanged).
- Initial tab: **Live** if Deadlock is running, otherwise **Home**.
- While in a match, the Live tab label shows a small green dot.
- The header status text keeps its role (STANDBY / LIVE MATCH; may show
  GAME NOT RUNNING / IN MENUS).
- The app shell owns per-page state so switching tabs preserves it (already
  a project rule for lookup and counters). Hero/item detail is in-page state
  with a "← All heroes" / "← All items" back link.
- Cross-links (builder may add more): clicking a hero in Home (top heroes,
  heroes table, match rows) opens that hero on the Heroes page; items in
  hero detail open the item on the Items page; heroes in matchup lists open
  that hero.

## Live tab

Content when in a match = today's `MatchOverview` (rosters, ranks, hero win
rates, build panel, counter panel), unchanged.

States:
1. **Deadlock isn't running** — icon, "Deadlock isn't running", one line
   ("Launch Deadlock and this tab will fill in as soon as you join a match."),
   and a link button to browse heroes. Use `useDeadlockRunning()`. In the
   plain browser preview (no Overwolf) this state is shown.
2. **Game running, not in a match** — "Waiting for a match", one line
   ("Queue up. We'll switch to this tab when the lobby loads."), link to the
   profile (Home). No status-step row.
3. **In a match** — full live view. "In a match" means the live store has
   roster players (`state.players.length > 0`); PostGame keeps showing the
   last match until the store resets.

### Auto-switch

When a new match is joined (store gets players for a new `matchId`, or
players appear after being empty), the desktop switches to Live **once per
match**. If the user then navigates elsewhere during the match, the app
does not pull them back. Implemented in the desktop shell by watching the
bridge snapshot.

## Home

### Which account

- The **background** window records the local account whenever the live
  store learns it (`localAccountId`, or the local roster player's
  `accountId`) and persists `{ accountId, seenAt }` to `localStorage`
  under a new key (e.g. `counterlock.profile.last-account`). The desktop
  reads it and listens to the `storage` event so Home updates when a new
  account is seen.
- **Empty state** (no account ever seen): message "Play a match with
  Counterlock open and your profile appears here", plus an optional
  Steam ID input (same parsing as Player lookup: SteamID64, account ID,
  `[U:1:n]`). A manually entered ID is persisted too; *builder's call
  (mine)*: a later detected account replaces it; Home shows a small
  "Change" link to re-enter an ID.

### Which games feed the summary numbers (my call)

The Overview headline cards (Avg KDA, Souls/min), top heroes, and the whole
Performance subtab use **Normal-mode games only (ranked + unranked)**:
`game_mode = 1` and `match_mode ∈ {1, 4}` from match history, and
`/v1/players/hero-stats?game_mode=normal&match_mode=ranked,unranked` for
accuracy/damage. Street Brawl, bots and private lobbies are excluded
because they distort KDA and souls/min. Label this subtly
("Normal & ranked games"). The All / Normal / Ranked / Street Brawl filter
applies only to Match history and the Heroes subtab. For Performance
accuracy/damage, hero-stats has no "last N" option: use the whole-period
aggregate, or bound by `min_match_id` from the oldest match in the range —
builder's choice, labelled accordingly.

### Profile header

Steam avatar + persona name (`GET /v1/players/steam?account_ids=`),
"Seen on this PC · <relative time>". Rank badge image next to rank.

### Overview subtab

- Headline cards: **Rank** (badge image + name + subrank, from
  `/v1/players/rank` — "latest recorded ranked match", same caveat as
  today), **Ranked games** with ranked win rate, **Avg KDA**,
  **Souls/min**.
- **Top heroes**: top 3 by games, with win rate and games.
- **Frequent teammates** (added at owner's request for "useful data"):
  `GET /v1/players/{id}/mate-stats?same_party=true`, top ~5 by games, with
  win rate together; names/avatars via `/v1/players/steam`.
- **Match history**: from `GET /v1/players/{id}/match-history`. Filter
  buttons **All / Normal / Ranked / Street Brawl**. Row: hero portrait,
  hero name, K/D/A, mode label, souls (net worth), duration, WIN/LOSS,
  relative date. Paginate or "Show more" (histories can be 700+ rows).
- **Match detail**: clicking a match expands/opens the full scoreboard for
  both teams with each player's hero, K/D/A, souls and final items, via
  `GET /v1/matches/{match_id}/metadata`. *Builder:* inspect the metadata
  response shape before building; degrade gracefully if unavailable.

Match-history field mapping (verified against live data):
- `game_mode`: 1 = Normal, 4 = Street Brawl.
- `match_mode`: 1 = Unranked, 4 = Ranked (enum order: Invalid, Unranked,
  PrivateLobby, CoopBot, Ranked, …).
- Win: `match_result === player_team` (both 0/1). Verify on a known match;
  `player_match_outcome` was always 0 in samples and is not reliable.
- Filter meanings: **Normal** = game_mode 1 & match_mode 1;
  **Ranked** = game_mode 1 & match_mode 4; **Street Brawl** = game_mode 4.
  Other match modes (bots, private lobbies) appear only under **All**.

### Heroes subtab

Table of every hero the account has played, same mode filter as match
history. Columns: hero, games, W–L, win rate, KDA, avg K/D/A, souls/min,
damage/min, accuracy, last hits/min, denies, last played. Click a column
header to sort; default sort games desc. Source: `/v1/players/hero-stats`
(`game_mode`, `match_mode` params) which returns kills/deaths/assists,
`networth_per_min`, `damage_per_min`, `accuracy`, etc. If a filter can't
be expressed through hero-stats params, compute from match history.

### Performance subtab

Owner left the content to me ("idk"); approved as mocked:
- Range switch: Last 20 / Last 50 / All.
- SVG line charts per match: **KDA**, **Souls per minute** (net worth /
  duration), with the period average as a dashed line.
- **Form**: last 20 results as win/loss squares.
- Average cards: accuracy, damage/min, last hits, deaths per game (accuracy
  and damage come from hero-stats aggregates weighted by matches; the rest
  from match history).

## Heroes page

### List

- Grid of hero cards: portrait, name, win rate, pick rate, tier letter.
- Role filter: **All / Assassin / Brawler / Marksman / Mystic** — from the
  hero asset's `hero_type` (values: assassin, brawler, marksman, mystic).
- Sort: **Tier** (grouped under S/A/B/C/D headings), **A–Z** (flat grid),
  **Win rate**, **Pick rate**.
- **Rank filter** (my addition): All ranks / bracket thresholds, mapped to
  `min_average_badge` (badge = tier×10 + subrank). Applies to the whole
  Heroes and Items pages.
- Source: `GET /v1/analytics/hero-stats` with an explicit time window
  (last 30 days via `min_unix_timestamp`), `game_mode=normal`,
  `match_mode=ranked,unranked`.
- **Pick rate** = hero matches / total matches, where total matches = sum
  of hero matches / 12 (6v6).
- **Tier** (derived, not official): percentile of win rate among heroes
  (top ~10% S, next ~20% A, ~30% B, ~25% C, rest D). Show "Tiers are based
  on win rate" note. Each tier has its own color: S gold, A green, B blue,
  C purple, D red.

### Hero detail

Header (approved v3 mockup):
- Large hero card image (`images.icon_hero_card_webp`) with the hero
  background art (`images.background_image_webp`) faded behind the header.
- **Tier banner** hanging off the top-right corner of the portrait: small
  "TIER" label over the letter, tier color, drop shadow. Under the portrait:
  "#N OF 43" (rank by win rate).
- Above the name, one uppercase letter-spaced line, **no chips**:
  `ASSASSIN ─ STEALTHY / LETHAL` — role in gold, a short gold→teal
  gradient rule, secondary tags in muted teal separated by "/". Tags equal
  to the role (case-insensitive) are dropped.
- Hero name (large), tagline from `description.role`.
- Stats row with thin dividers: win rate, pick rate, matches, avg KDA.

Body sections, in order:
1. **Abilities** — four cards numbered 1–4 (`items.signature1..4` resolved
   to ability assets): icon, name, short plain-text description.
2. **Skill order** — most common order from
   `GET /v1/analytics/ability-order-stats?hero_id=` (pick the row with
   most matches; show its win rate). Grid: one row per ability (icon),
   columns = upgrade step, numbered cells where that ability is chosen.
3. **Build** — most-played community build, same source and caveats as the
   existing `BuildPanel` (`build-analytics.ts`), grouped early/mid/late.
4. **Strong against / Countered by** — `GET /v1/analytics/hero-counter-stats`
   rows for this hero: highest and lowest win rate vs each enemy, top ~5,
   only pairs above a minimum match count. *My call:*
   `same_lane_filter=false` (whole-match matchups).
5. **Best with** — `GET /v1/analytics/hero-synergy-stats` pairs including
   this hero, top ~5 by win rate above a minimum match count.
6. **Best items** — `GET /v1/analytics/item-stats?hero_id=`, items by win
   rate with a minimum pick share so rare outliers don't dominate.
7. **Counter items** — **its own section, separate from best items**
   (owner request). Items that perform best *against* this hero:
   `item-stats?enemy_hero_ids=<id>` compared with the overall baseline
   item win rate (largest positive difference, min matches). Where data is
   thin, fall back to the existing heuristic engine in
   `features/counters/utils/recommendations.ts`, labelled as such.

## Items page

### List

- All shop items from the catalog (~173), real bundled artwork.
- Default layout like the in-game shop: three columns **Weapon / Vitality /
  Spirit**, each split by cost tier (800, 1,600, 3,200, 6,400, 9,999).
- Search box; category filter **All / Weapon / Vitality / Spirit**.
- Sort: **Cost** (shop layout), **Win rate**, **Pick rate** (flat ranked
  grid with numbers under each item).
- Stats from `GET /v1/analytics/item-stats` (same window and rank filter as
  Heroes). Pick rate = item `players` or `matches` / total player-matches —
  builder to choose and label consistently.
- One-line note: expensive items show higher win rates partly because
  players who are ahead can afford them.

### Item detail

Name, cost, category, active/passive, description, stat bonuses, win rate,
pick rate, average buy time (`avg_buy_time_s`), **Builds from** (from
`component_items`) and **Builds into** (reverse lookup), each clickable.

## Data and catalog changes

Extend `scripts/refresh-catalog.mjs` / catalog types so the bundle carries:
- Heroes: `hero_type` (role), card image, background image, tagline
  (`description.role`), the four signature ability IDs.
- Abilities (new list): id, name, icon (`image_webp`), plain-text
  description (strip the inline SVG/HTML, as `plainText` already does).
- Items: `class_name`, `item_tier`, `activation`/`is_active_item`,
  `component_items`, stat bonuses suitable for display.

Then run `npm run catalog:refresh`. *My call:* replacing the whole snapshot
is fine (it updates `fetchedAt` too). If the refresh brings in new heroes or
changed items that break the counter-coverage tests, add the missing hero
profiles / review `features/counters/utils/recommendations.ts` as part of
this work, as the README's patch procedure describes. Live analytics stay fetched at runtime
with in-memory caching (suggest 10 min for analytics; match history and
profile 2–5 min) and the existing cooldown handling on 429/503.

## Left to the builder

- Component/file structure within the feature-folder conventions (e.g.
  `features/profile`, `features/heroes`, `features/items`, `features/live`).
- Exact minimum-match thresholds, list lengths, pagination size, cache TTLs.
- Exact rank-bracket options in the rank filter.
- Loading skeletons, error and empty states (follow existing tone: say
  "unavailable", never invent data).
- Responsive behaviour within the 850px minimum width.
- Test coverage: unit tests for derivations (tier percentiles, pick rate,
  win mapping, mode filters, counter-item delta, builds-into), Playwright
  for tab switching, auto-switch, Live empty states, Home empty state, and
  hero/item detail with mocked API responses. Update existing tests that
  assume "Match overview" is the default tab.

## Calls I made (for the owner to check)

- Initial tab is Live when Deadlock is running, otherwise Home.
- Auto-switch happens once per match and only changes the tab.
- Tiers are win-rate percentiles; a rank filter was added.
- Heroes/Items analytics: last 30 days, ranked + unranked, normal mode only.
- Matchups use whole-match data, not lane-only.
- Counter items = best win-rate lift against the hero, heuristic fallback.
- Frequent teammates and match detail were added to Home as "useful data".
- A detected account replaces a manually entered Steam ID.
- Overview headline numbers and Performance use normal + ranked games only.
- The catalog refresh may replace the whole snapshot; any fallout in the
  counter rules is fixed as part of this work.
