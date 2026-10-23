# Counterlock redesign: design

Date: 2026-10-21
Status: draft for approval

## Intent

Counterlock works, but it looks like a spreadsheet: small 13px text, muted
panels and tables, almost no game art. The owner compared it with other
Deadlock trackers (tracklock.gg, lockbuilds.com, deadlocklab.com). His
reaction: **"theirs look like they belong to the game."** This redesign
gives Counterlock character so it feels like part of Deadlock. It applies to
the **desktop app, the website and the in-game overlays**, and changes the
**look, the layout and the navigation**.

It also reshapes the app around how the owner actually uses it:

- **Before a game:** check the **tier list** for strong heroes, then open
  your hero and look at **builds**: a main build, a few popular builds to
  compare, and items to mix in against the enemy team.
- **After a game:** see **how that game went** (timeline, best and worst
  stretches, souls/min against players at your rank, impact), and whether
  you're **improving** over time.
- **During a game:** glance at your **performance** in the overlays, not at
  builds.

Success: opening Counterlock feels like opening something from Deadlock's
world. Before a game, you can get from the tier list to your hero's build in
two clicks. After a game, you can see at a glance where you were ahead of or
behind players at your rank, and why.

## Goals

1. A new visual language, **"Deadlock noir"**, applied to every page and
   window (details below).
2. New navigation: **Home · Live · Tier list · Heroes · Items** in the
   desktop app and **Home · Tier list · Heroes · Items** on the website.
   Player search moves into Home.
3. A hero page that leads with **builds**: main build, popular builds as
   their authors laid them out, then counter items.
4. A **match report** for any match, with a souls timeline against the
   average player on that hero at that rank.
5. A **Performance** profile tab showing trends across recent games against
   the average at the player's rank.
6. A **Live** profile tab, in the app and on the website, showing a
   player's current match when one can be found.
7. **Five in-game overlay panels** to replace the current build and counter
   overlays.

## Non-goals

- Reading Deadlock's process memory, or any other unofficial live data
  source. The owner decided against it: VAC ban risk, and it breaks Overwolf
  rules.
- The live **spectator-broadcast** data feed (`/v1/matches/demo/live/query`)
  for the overlays. The owner chose to ship with Overwolf's data only. It
  could come later.
- **Last hits** and **permanent buffs** in the overlays. Overwolf doesn't
  send them live. They go in the match report instead.
- A **Mid Boss respawn timer**. Overwolf has no event for when the boss
  dies, and the owner chose to drop it rather than use a manual hotkey.
- A light theme or theme switcher.
- User accounts, "Sign in with Steam", a backend or a server-side API proxy
  (same as the web-version design).

## Anti-goals

- **Copying another tracker's look.** The owner chose a look based on
  Deadlock's own art (option C) over the lockbuilds-like and tracklock-like
  options. Borrow only the specific A elements listed below.
- **Boxy three-number stat rows on hero cards.** The owner tried them
  (blend option 1) and preferred the original C card with one quiet stat
  line.
- **Trimming or regrouping popular builds** into early/mid/late or 24
  items. Show them exactly as authored.
- **Saying "Not in a game"** when the truth is "we couldn't find a live
  match" (see the profile Live tab).
- Carried over from earlier designs, still in force:
  - no chips or pills for hero tags;
  - no fake or demo data in production;
  - never match players by nickname;
  - one shared copy of the feature code for app and website, never a fork;
  - derived numbers (tiers, counter items, "vs average") are labelled with
    how they're derived, in one line.

## Constraints (from the existing project)

- React 19 + TypeScript + Vite. The Overwolf app is in `src/` (multi-page
  Vite, no router). The website is in `web/` (React Router v8 framework
  mode, `ssr: false` + `prerender`, static hosting). The website reuses
  feature components from `src/features/*` through the `@/` alias and the
  `LinkProvider` / `RouteLink` seam in `src/app/links.tsx`. Keep that seam.
- Styling is plain global CSS composed in `src/app/styles/index.css`
  (import order matters), plus `web/app/styles/web.css` and `phone.css`.
  There's no CSS-variable token system yet: hex values are hardcoded across
  files.
- Desktop window: default 1260×900, minimum 850×650 (`public/manifest.json`).
  The website supports phone widths (≤640px) and must keep doing so.
- Data comes from the Deadlock API (`https://api.deadlock-api.com`, no key).
  Analytics endpoints share **200 req/min per IP**. Reuse the shared client
  in `src/shared/api/DeadlockApi.ts` (cache, timeout, `Retry-After`).
- Live in-game data comes **only** from Overwolf GEP for Deadlock (checked
  2026-10-21, https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/deadlock/):
  - `roster`: per player: hero, team, level, kills, deaths, assists,
    `hero_damage`, `object_damage`, `hero_healing`, `souls`, health,
    assigned lane, `is_local`;
  - `items`;
  - `incoming_damage`: only while the in-game damage panel is open;
  - `team_score`, `match_id`;
  - events: `match_start`, `match_end`, `kill`, `death`, `assist`,
    `match_clock` (every second), `game_paused`, `tower_destroyed`.

  There is no last-hits, buff or Mid Boss data. Check the Overwolf docs
  again before building anything that touches them (existing owner rule).
- Use real game art and icons wherever possible (existing owner rule).
  Hero art comes from the asset CDN, e.g.
  `…/images/heroes/haze_card.webp` (portrait bust) and
  `…/images/heroes/backgrounds/haze_bg.webp` (painted brush-stroke banner);
  both URLs are in `catalog.json` as `cardImage` and `backgroundImage`.
- `tsc` rejects unused locals. Existing unit and Playwright tests must pass,
  updated where structure changes.

## Decisions

**Owner decided:**

- Visual direction **C, "Deadlock noir"**, plus two elements from A
  ("street poster"): the **slanted red ribbon** and the **bold uppercase
  section headers**. Hero cards stay exactly as in C.
- Scope: desktop app, website and overlays; look, layout and navigation.
- Navigation: desktop **Home · Live · Tier list · Heroes · Items**; web
  **Home · Tier list · Heroes · Items**. **Tier list and Heroes are separate
  pages.** Live keeps its own tab (app only). Items keeps its own tab.
  Player lookup moves into Home.
- Hero page: **Build** and **Popular builds** are **tabs**.
- Website: **full-screen layout**, not a centred card. Components must not
  be oversized on the website: the prototype was scaled down at the
  owner's request.
- Profile tabs: **Overview · Matches · Performance · Heroes · Live**
  ("Performance", not "Improvement").
- Profile **Live tab on the website too**, so you can check what someone is
  playing.
- Hero page: **main build** with Early 0–10 min, Mid 10–20 min and Late
  20+ min, **8 items each**. Then **popular builds shown as authored**:
  every category with its author's name and all of its items. Then
  **counter items** against the enemy heroes. In the app, the enemy heroes
  are read from the match being loaded into.
- Match report benchmark: **average player on that hero at my rank**.
- Performance tab: K/D/A, souls, impact, hero damage, objective damage and
  anything else the data offers, each against the average at the player's
  rank.
- Overlays: replace the build and counter overlays with **five separate,
  individually movable panels**: hero damage, objective damage, healing,
  you vs. average, and spawn timers.
- Overlay "you vs. average" stats: souls/min, K/D/A, level and kill
  participation, each with ▲ or ▼.
- Delivery: one design (this document), then build in six phases in the
  order below.

**My calls** (marked so the owner can check them):

- Fonts: **Playfair Display SC** (page titles, hero names, tier letters),
  **Rajdhani** (uppercase section headers, nav labels, ribbons, stat
  labels and numbers), **DM Sans** (body). Body size goes up from 13px to
  14px.
- On the website, the **counter items** section lets you pick enemy heroes
  yourself. In the desktop app it also lets you pick when you're not in a
  match.
- Profile Live tab empty state: **"No live match found"**, plus one line
  explaining that live matches for other players are only visible when the
  game lists them (top ~200 matches). For your own account in the desktop
  app, use the real GEP state: in a match, or "Not in a game".
- The rank band for "average at my rank" is the player's **rank tier**
  (all six sub-ranks), taken from the match's `ranked_display_badge` or the
  player's current rank. The builder may narrow or widen it if the sample
  is too thin.
- Popular builds prefer **English-language** builds (the API returns many
  Chinese builds). The builder can offer a language toggle.
- After a match ends in the desktop app, the newest match appears at the
  top of Home and Overview with an "Open match report" link. The app
  doesn't switch tabs automatically.

## Visual language: "Deadlock noir"

Reference mockups are local and not committed. They're in
`.superpowers/brainstorm/2237531-1792527688/content/`:

- `visual-direction.html`: option **C** is the approved look;
- `blend.html`: option 1's ribbon and section headers are the approved
  borrowings, its stat row is rejected;
- `navigation-today.html`;
- `overlay.html`: superseded by the five-panel decision.

**Tokens.** Introduce CSS custom properties in one file (e.g.
`src/app/styles/tokens.css`, imported first) and replace hardcoded hexes as
each page is restyled. Starting palette (builder may tune):

| Token | Value | Use |
|---|---|---|
| ink | `#0c0b0a` | page background |
| surface / surface-2 | `#12100e` / `#171512` | header, cards, panels |
| line / line-soft | `#3a3226` / `#2a241c` | borders, dividers |
| cream | `#ece0c4` | primary text |
| muted / dim | `#a89d86` / `#7d7462` | secondary text |
| gold | `#d9a441` | accent, active nav, section bars, links |
| tier-gold | `#f2c66d` | tier letters |
| poster-red | `#c8432f` | ribbon, LIVE badge |
| good / bad | `#7fd39a` / `#e07a5f` | win rate, ▲ / ▼ |
| ally / enemy | `#5a8f9c` / `#9c5a4a` | team colours in meters and scoreboards |

**Texture.** A very faint horizontal scan-line overlay on page backgrounds,
about 1.5% white, every 4px.

**Components**

- **Hero card** (as mockup C):
  - a tall card, with the hero's `backgroundImage` brush stroke behind the
    `cardImage` portrait;
  - a large serif gold tier letter top-left;
  - the name in serif small caps over a dark gradient at the bottom;
  - one quiet stat line: win rate (green) · pick rate.
- **Page title:** large Playfair Display SC, with an optional **slanted red
  ribbon** under it (Rajdhani, uppercase, rotated about −2°, hard black
  shadow), e.g. "Tier list · last 30 days".
- **Section header** (from A): a gold left bar, uppercase Rajdhani title, a
  thin cream-to-transparent rule, and an optional gold "ALL HEROES →" link
  on the right.
- **Stat label/value:** Rajdhani uppercase label in muted, Rajdhani bold
  value in cream; green or red only for good or bad.
- **Panels and tables:** surface background, `line` borders, square or
  barely rounded corners (≤4px). Tables keep their data density but use the
  new type and colours.
- **Rank badges, item icons and ability icons:** real game art, as today.

Small surfaces (phone layouts, overlays, compact rows) may drop the
background brush art and keep the portrait. The builder decides where.

## Navigation and shell

- **Header:** the "Counterlock" wordmark in Playfair Display SC (with
  "lock" in gold), then the nav links in uppercase Rajdhani (active link
  cream with a gold underline), then **My profile** on the right: avatar
  plus name once the app knows the user, otherwise a prompt to find your
  account.
  - Desktop app only: the header keeps the window drag handle, settings and
    close buttons. While in a match, a red **LIVE** badge appears next to
    the Live tab.
- **Desktop tabs:** Home · Live · Tier list · Heroes · Items. Player lookup is removed
  as a tab; its job moves to Home's search. Live behaviour is unchanged:
  auto-switch when a match loads, green or red dot while in a match, and
  the not-running / waiting states (restyled).
- **Web tabs:** Home · Tier list · Heroes · Items. The website gains a
  `/tier-list` route; `/heroes` becomes the roster.
- **Website layout is full-screen, not a centred card** (owner decision).
  - The header is full width and sticky.
  - Page banners (hero, profile, match report) and art run edge to edge.
  - **Content is capped and centred** (owner feedback: full-width content
    was too wide).
    - Header, page content and footer use a side gutter of
      `max(64px, (100vw - 1320px) / 2)`, so content never exceeds about
      1320px and always has at least 64px either side.
    - Page banners (hero, profile, match report) keep their background
      running edge to edge, but their text and art align to the same
      gutter.
    - There is no framed box around the page.
  - Grids grow with the window by **adding columns, not by enlarging
    components**. Hero cards stay about 140–160px wide.
  - Keep sizes moderate. The owner found the first full-screen version's
    components too large. In the prototype, page titles are about 40px,
    hero banners about 250px tall, and main-build item tiles keep a fixed
    size (≤96px columns) instead of stretching.
  - Phone layouts keep their existing breakpoints.
  - The desktop app is unaffected; it fills its own window.
- **Footer:** restyled. Keep the attribution, catalog date and data-source
  link.
- Remove the "TOGGLE OVERLAY" hotkey hint from the nav. Show it in overlay
  settings instead (my call).

## Pages

### Home

- **Search at the top:** one large box to find any player by Steam name,
  SteamID64, account ID, `[U:1:n]` or profile URL. Reuse
  `web/app/SteamSearch.tsx` / `useSteamSearch.ts` in both the app and the
  website; this replaces `PlayerLookup`.
- **Below it:**
  - when the app knows who you are: your profile summary and your **latest
    match**, with a link to its match report;
  - always: the "top heroes right now" strip of hero cards.

  Exact composition is left to the builder (my guess at the layout, not
  owner-approved detail).
- **Profile is its own page, not Home** (my call, in both the app and the
  website). Home is the search page plus the summary above. The full
  five-tab profile opens from **My profile** in the header, from a search
  result, or from any player link.
  - Website: the profile stays at `/players/:accountId`. `/` **no longer
    redirects** to the remembered player; it shows the remembered player's
    summary instead. "Remember me" and "Switch account" stay, on the
    profile header and on the Home summary.
  - Desktop app: the profile is a page reached through those links (no
    tab of its own), with an "← Back" link, the same way hero and item
    detail work today. Today's Home-is-profile behaviour and the auto-detect
    account flow move to "My profile".
  - Update the web Playwright tests that expect the redirect.

### Tier list

- A separate page and tab from Heroes (owner decision).
- Title "Tier List", with the ribbon "Last 30 days · by win rate".
- **Only a role filter** (All · Assassin · Brawler · Marksman · Mystic),
  per the owner. No sort or rank selector on this page: tiers are by win
  rate over the last 30 days across all ranks (the builder may pick a
  sensible default rank band and say so in one line).
- One row per tier, S to D: a large serif tier letter on the left, then a
  panel of **compact portrait tiles**. Each tile is about 92px square,
  with the name in serif small caps and "win rate · pick rate" under it.
  The rows are denser than the Heroes cards on purpose.
- Clicking a hero opens the hero page.
- Home's "Top of the city" links here.

### Heroes

- The full roster, A to Z, as the C-style hero cards with no tier letter.
  The stat line reads "role · win rate".
- A search box and a role filter.
- Clicking a hero opens the hero page.

### Hero page

Top to bottom:

1. **Header:** large hero art (portrait over brush background), name, tier,
   win rate and pick rate, with the rank filter. "← All heroes" goes back
   to the Heroes page.
   - **The four abilities sit as a row of round icons under the hero's
     name** (owner request, modelled on lockbuilds.com/heroes/bebop). The
     order is: name, then the red tagline ribbon, then the ability row,
     then win rate, pick rate, matches and rank. Each icon has a small 1–4
     key badge.
   - Hovering or focusing an icon (tap on touch screens) opens a tooltip
     card showing:
     - the ability icon, name and cooldown;
     - the description, with highlighted terms in gold;
     - up to three key-number boxes with property icons (from
       `tooltip_details.info_sections[].properties_block` →
       `important_property`);
     - a line of other properties (`basic_properties`), with zero values
       hidden;
     - the three upgrade boxes, labelled ◆1, ◆2 and ◆5.
   - Data: `GET /v1/assets/items/by-hero-id/{id}` (abilities have
     `properties`, `tooltip_details` and `upgrades[].property_upgrades`).
     Extend `scripts/refresh-catalog.mjs` to bundle what the tooltip needs,
     or fetch it at runtime (builder's call). When the catalog's upgrade
     text is empty (it is for some abilities), build it from
     `property_upgrades` with the property's label and postfix.
   - This replaces the separate "Abilities" section further down the
     page.

Items 2 and 3 sit under one **tab bar: Build · Popular builds** (owner
decision). Build is selected by default. The Popular builds tab shows a
count badge and has its own row of build tabs inside it, one per build.

2. **Main build** (the **Build** tab): three rows labelled **Early (0–10 min)**, **Mid (10–20
   min)** and **Late (20+ min)**, with **8 items each**. This is a **new
   data source** (my call). Today's `BuildPanel` / `useMeasuredBuild` shows
   one community build as authored, which is what popular builds now do,
   and the unused `recommendedBuild()` splits by item cost from the static
   catalog.
   - Call `GET /v1/analytics/item-stats?hero_id=…&min_bought_at_s=…&max_bought_at_s=…`
     with the page's rank filter (`min_average_badge` / `max_average_badge`)
     once per phase: 0–600s, 600–1200s and 1200s onwards (verified: the
     endpoint supports these filters).
   - Take the **8 most-bought items** per phase, ordered by
     `avg_buy_time_s`.
   - Drop items already listed in an earlier phase, and don't list an item
     next to its own upgrade in the same phase.
   - Label it in one line, e.g. "Most-bought items in each phase · your
     rank filter · last 30 days".
   - When a phase has fewer than 8 items, show what exists and say why.
   - The **Live tab's build panel uses the same logic**, so the two never
     disagree.
3. **Popular builds** (the **Popular builds** tab): a short list of the
   hero's most popular community builds, one at a time, picked from a row
   of build-name tabs.
   - Source: `GET /v1/builds?hero_id=…&only_latest=true&sort_by=…`. Each
     build's `hero_build.details.mod_categories` is an array of
     author-named categories, each with any number of items.
   - Render **every category with its author's name and every item, in the
     author's order.** Show the build name, author and last-updated date.
   - Pick a popularity sort the API supports, e.g. favourites or weekly
     favourites (builder checks the `sort_by` options).
4. **Counter items:** items to mix in against the enemy team, for the hero
   you're playing. This is **data-driven** (my call), using
   `GET /v1/analytics/item-stats?hero_id=<this hero>&enemy_hero_ids=<picked>`
   with the rank filter (the API describes this as "what items beat
   hero(es) X").
   - Rank items by win-rate *lift*, not raw win rate, and leave out items
     already in the main build. (Built in phase 2: raw win rate only ever
     surfaced 6,400-soul items, because players who are ahead can afford
     them.) Lift against each enemy is the item's win rate in that
     matchup minus its win rate in all of the hero's games, minus the
     matchup's own shift. Items are ranked by a lower confidence bound on
     the average lift (3 standard errors), so a big lift on a small sample
     doesn't beat a solid one, and only clear gains are shown. After them
     come items that clear the same bound against one picked enemy but not
     on average (their average lift must still be above zero), so a full
     team doesn't leave the list nearly empty.
   - Show them as cards (reuse the "Consider first" card style). Each card
     shows the lift and the largest single-enemy sample, and says which
     picked enemies it clearly does better against; a card for one enemy
     shows the lift and sample against that enemy.
   - Label it in one line saying exactly this.
   - Where data is thin, fall back to the existing rules-based reasons in
     `src/features/counters/`, labelled as such.
   - Desktop app in a match: the enemy heroes come from the GEP roster.
   - Otherwise: pick up to 6 enemy heroes from a portrait picker.
5. **The rest of today's hero detail,** restyled: skill order, strong
   against, countered by, best with and best items. Abilities moved into
   the header.
   - Today's `HeroBuild` section is removed; the main build and popular
     builds replace it.
   - Today's data-driven "Counter items" section answers a different
     question ("what beats *this* hero?"). It stays, renamed to "Items
     that beat <Hero>" so it isn't confused with section 4 (my call).

### Items

The same browser as today (search, Weapon/Vitality/Spirit filter, sort,
rank filter, item detail), restyled in the noir language. No functional
change.

### Profile

Header: avatar, name, rank badge, the existing "This is me / Switch account"
control on the web, with a hero-art banner from the most-played hero (my
call). Tabs: **Overview · Matches · Performance · Heroes · Live**.

- **Overview:** today's overview, restyled, plus the latest-match card.
- **Matches:** today's match history list, restyled. Each row opens the
  **match report**.
- **Performance:** see below. It replaces today's Performance tab content
  and may keep any of today's charts that still fit.
- **Heroes:** today's per-hero table, restyled.
- **Live:** see below.

### Match report

Opened from any match row, for any player. Data comes from
`GET /v1/matches/{id}/metadata` (cached/S3 limits are generous; it's
already used by `MatchDetail`). The metadata includes:

- per-player `stats` snapshots: souls (`net_worth`), damage, healing,
  kills, creep kills and more, recorded every 180s up to 15 min, then
  every 300s;
- `death_details` (time, killer, position);
- `items` with purchase times;
- `objectives` and `mid_boss` with times;
- `accolades`, `mvp_rank`, `last_hits`, `power_up_buffs`.

The benchmark is
`GET /v1/analytics/player-performance-curve?hero_ids=…&min_average_badge=…&max_average_badge=…&resolution=0`.
`resolution=0` is required. It gives absolute game time in seconds (180s
steps, then 300s), while the default buckets by percent of match length.
This was verified while building the prototype.
It returns the average and standard deviation per time step for net worth,
K/D/A, damage, healing and more.

Built in phase 3: the rank band is the selected player's tier at match start, read from the metadata (`player_rank_data.initial_display_rank`), and widened one tier each way when it has fewer than 100 games or its games stop before the match ends.

**Whose match it is ("Viewing as").** The report works for any match, not
only the viewer's own (owner requirement). The viewer may be looking at
a friend's game or a stranger's.

- A **"Viewing as"** selector at the top lists all 12 players ("Amber ·
  Haze · moealali777 (you)") plus **"Whole match (no player)"**.
- Every perspective-dependent part follows it: the banner (win or loss
  from that player's side), the verdicts, best and worst stretches,
  impact, permanent buffs, the gold highlight in the graph and the
  scoreboard row.
- Wording follows it too: "You" only when the selected player is the
  remembered "me" account; otherwise the player's name ("somdr's share of
  the team's total").
- A one-line note says whose match is shown, e.g. "You're viewing
  somdr's match. Labels and verdicts are from their point of view."
- **Default perspective:**
  - the remembered "me" account if it played in the match;
  - otherwise the profile the viewer came from;
  - otherwise the `?player=` URL parameter;
  - otherwise "Whole match".
- **Teams are named Amber and Sapphire,** never "your team" or "enemy",
  except in labels tied to the selected perspective.
- Every scoreboard row and every graph ranking row has a **"View as"**
  shortcut.
- **Sharing:**
  - A **"Copy link"** button copies a website URL:
    `/matches/:matchId?player=<account_id>`, or no parameter for the whole
    match. Friends from the same game can open it and switch to themselves.
  - The website gains a `/matches/:matchId` route. It is not pre-rendered:
    the SPA fallback is used, as for players.
  - The desktop app copies the same website URL.

Sections, top to bottom:

1. **Banner:**
   - for the selected player: win or loss, hero art, player name, K/D/A,
     souls, souls/min, last hits and duration;
   - for "Whole match": the winning team, duration, team souls and the
     kill score.
2. **Verdicts:** souls/min, hero damage and last hits as "+12% vs average
   <hero> at <rank>". Shown only when a player is selected.
3. **Graph** (renamed from "Souls timeline"; owner request). It has stat
   tabs, filters, hover detail and a ranking. Details are in the next
   section.
4. **Best and worst stretches:** two or three short sentences generated
   from where the player's souls curve crosses or leaves the band, plus
   clusters of deaths. For example: "Strongest 10–20 min. Fell behind
   after 25 min. 3 deaths between 27:00 and 31:00." Rule-based, never
   invented.
5. **Impact:** the selected player's share of the team's hero damage,
   objective damage, healing and kill participation.
6. **Permanent buffs** (`power_up_buffs`), against the rank average.
7. **Scoreboard:** both teams, adding a **damage taken** column and the
   "View as" link. The selected player's row is highlighted.

### The Graph

The prototype implements all of this. Use it as the reference.

- **Stat tabs** (the most important stats, one click each): Souls, Hero
  damage, Damage taken, Objective damage, Healing, Last hits (built as **Creep kills**: the snapshots and the rank average have creep kills over time, not the game's last hits), Kills,
  Deaths and Hero hits.
- **"More stats…" dropdown** for everything else the snapshots record:
  Accuracy %, Headshots, Assists, Damage mitigated, Creep damage, Jungle
  (neutral) damage, Denies, Level, Spirit power, Weapon power, Max health,
  Melee kills, Healing prevented, Healing to teammates and Power-ups
  picked up (built as **Permanent buffs**, counted from `power_up_buffs`, with a rank average).
- **Data sources,** all from the per-player `stats` snapshots in match
  metadata (verified on a real match):
  - `net_worth`, `player_damage`, `player_damage_taken`, `boss_damage`,
    `player_healing`, `creep_kills`, `kills`, `deaths`, `assists`,
    `hero_bullets_hit`;
  - `shots_hit` / `shots_missed`, `damage_mitigated`, `creep_damage`,
    `neutral_damage`, `denies`, `level`, `tech_power`, `weapon_power`,
    `max_health`, `melee_kills`, `heal_prevented`, `teammate_healing`;
  - `custom_user_stats`: id 3 is enemy-hero headshots, ids 33 and 46 are
    power-ups. Names come from the match-level `custom_user_stats` id →
    name table; look ids up by name, not by fixed number.
- **Filters:**
  - **Show:**
    - Player vs avg: the selected player's line against the rank-average
      curve with a ±1 standard deviation band. Only for stats the
      benchmark curve has; otherwise it says "no rank average for this
      stat".
    - Team totals: Amber vs Sapphire.
    - Team lead: Amber's advantage around a zero line (Amber minus Sapphire, flipped for deaths so above the line is always Amber ahead).
    - Everyone: all 12 players.
  - **Values:** Total / Per minute. Rate stats like accuracy and level
    ignore per-minute.
  - **Time:** Whole match / 0–10 / 10–20 / 20+ (zooms the x-axis).
  - **Markers:** Deaths, Items (3,200+ souls purchases) and Objectives
    (towers, walkers and Mid Boss, coloured by team). Each can be toggled.
- **Everyone mode:**
  - Team colours: blues for Amber, reds for Sapphire, gold for the
    selected player.
  - A legend of hero chips toggles each line, with "Show all", "Amber
    only" and "Sapphire only".
- **Hover:** a crosshair with a tooltip listing every visible line's value
  at that minute, sorted, plus the rank average when shown.
- **Ranking panel** beside the chart: all 12 players ranked for the current
  stat at the end of the selected time range. The title adapts: "Most
  souls", "Most damage taken", "Fewest deaths", "Highest accuracy %".
  Clicking a row switches "Viewing as".
- **Size:** the graph must not take over the screen (owner feedback on
  the website).
  - Draw it at its real pixel width with a fixed, modest plot height:
    about 190–260px, roughly 24% of its width, plus about 66px of marker
    lanes. Don't scale a fixed viewBox up to the window width, because text
    and lines grow with it.
  - The ranking panel sits beside it at about 230px.
  - Redraw on resize. On a 1600px-wide browser, the whole Graph block
    (tabs, filters, chart, markers, footnote) fits in about 480px of
    height.
- Data resolution: snapshots are every 3 min to 15:00, then every 5 min.
  Lines connect the snapshots, and the footnote says so.

**Not available in v1: parries and melee hits.**
- These aren't in match metadata. They exist only in a match's **replay
  (demo) file**, through the async `POST /v1/matches/demo/query`
  (`CCitadel_Ability_MeleeParry`, `MeleeHitEvent`).
- That path takes about 55s per query and is limited to 200 per hour per
  IP. Not every match has a replay: a test returned "No demo available"
  for a 4-day-old match. My test queries were also rejected on table
  naming, so it's unverified.
- **Melee kills** (from snapshots) are included instead. Parries and melee
  hits are left for a later phase once the demo query is proven.

### Performance tab

- Covers recent games over a selectable range (keep today's range filter
  idea). Metrics include K/D/A, souls/min, hero damage per minute,
  objective damage per minute, healing per minute, kill participation, last
  hits and impact share. Add anything else the metadata supports; that
  choice is left to the builder.
- Each metric gets a trend line across games against the average at the
  player's rank for that hero. A summary marks it as improving, flat or
  slipping (▲ / – / ▼).
- **Data:** `/v1/players/{id}/match-history` provides K/D/A, `net_worth`,
  `last_hits`, duration and `ranked_display_badge` per match. Damage and
  healing need per-match metadata, so fetch metadata for the games in range
  and cache it. The builder decides the default range and how to batch
  requests within limits.

Built in phase 4: eight metrics (souls / min, K/D/A ratio, hero damage, objective damage, healing and creep kills per minute, kill participation and hero damage share) over the last 20 (the default), 50 or 100 normal and ranked games, for all heroes or one. "All" is dropped: thousands of games of metadata is too much. The tab replaces the old one entirely: K/D/A and souls / min become cards like the rest, win or loss dots on every card replace the form strip, the damage-per-minute card becomes Hero damage / min from each game's totals, and the accuracy, last-hits and deaths cards are gone. Damage, healing, creep kills and shares come from bulk metadata (`GET /v1/matches/metadata`, 50 games per request) rather than one metadata request per game. The rank average is the match report's curve at each game's length, using the game's rank, the player's current rank for games without one (such as unranked games), or all ranks when neither is known. As in the match report, creep kills stand in for last hits, which the curve doesn't have. Impact share is built as kill participation and hero damage share; objective damage and healing are shown per minute rather than as shares. The two shares have no rank average, as the curve has no team totals. Improving or slipping needs Welch's t-test to find the recent half of the games different from the earlier half at the 95% level, each game against its own rank average (the two shares on their own values).

Changed after phase 4 (follow-up pass): objective damage and healing shares join kill participation and hero damage share, so the tab has all four of the match report's Impact shares (ten cards). Picking a game on a chart (pointer, tap or arrow keys) shows it; a click, Enter or the tip's link opens its match report, and on a touch screen a tap only picks it. Dots keep at least a 2 px radius. The profile keeps its tab, filter, range and hero for the session, and the cards stay, dimmed, while a new range or hero loads. Rank averages load per hero and rank tier, four groups at a time, and a failed one leaves only its own games without an average. The match report now compares a player whose rank the match didn't record at their current rank, as the tab does, instead of the lobby's rank. The API client keeps to the per-IP rate limits of analytics, bulk metadata and rank lookups, cools down only what a 429 refused (a 503 still pauses everything), and drops expired responses.

### Profile Live tab (app and website)

- **Your own account, in the desktop app:** use GEP. In a match, show the
  live match: today's `MatchOverview` content, restyled. Otherwise show
  "Not in a game".
- **Any other case** (other players, or the website): use
  `GET /v1/matches/active`. It returns about the top 150–200 matches from
  the in-game Watch list, each with players (account, hero, team), team
  net worth, duration, objectives and spectator count. If the account is in
  one, show both teams' heroes, the net-worth lead, duration and the
  objectives state. If not, show **"No live match found"** and the one-line
  explanation.
- Refresh while the tab is open (e.g. every 30–60s; builder's call).

### Live tab (desktop app)

Same behaviour and content as today (states, rosters, ranks, build panel,
counter panel), restyled. Builds and counters stay here and on the hero
page; they are only removed from the overlays.

## In-game overlays

Replace `CompactBuild` / `CompactCounters` and the `in_game` /
`counter_overlay` windows with **five separate overlay windows**. Each one
can be **moved independently** and **turned on or off** in overlay
settings. They share the existing show/hide hotkey and opacity setting.
Positions persist between sessions.

1. **Hero damage:** bars for all 12 players, from the GEP roster's
   `hero_damage`.
2. **Objective damage:** the same, from `object_damage`.
3. **Healing:** the same, from `hero_healing`.

   In all three meters: your team in `ally`, enemies in `enemy`, you in
   `gold`, a hero portrait per bar, sorted by value.
4. **You vs. average:** souls/min, K/D/A, level and kill participation,
   each with ▲ or ▼ against the rank-average curve for your hero at the
   current match minute.
   - Souls/min = roster `souls` ÷ match clock. Check whether roster `souls`
     is current unspent souls or total net worth; the benchmark must
     compare like with like.
   - Kill participation = (your kills + assists) ÷ team kills, summed from
     the roster.
   - Fetch the benchmark once per match (hero + rank band) and interpolate
     between time steps.
5. **Spawn timers:** countdowns for things that spawn on a **fixed
   schedule**, computed from GEP `match_clock` and paused on
   `game_paused`. Which timers, and their times, must be confirmed against
   the current Deadlock patch during the build. No Mid Boss respawn timer.

Style: compact noir panels, ink background at the user's opacity setting,
Rajdhani numbers and labels, small serif wordmark or none. They must stay
readable over gameplay. The builder decides the default positions and
sizes. Manifest changes (new windows) must follow the Overwolf docs.

## Delivery phases

Build and ship in this order. Each phase gets its own plan.

1. **New look + navigation (done):** tokens, fonts, texture, components, shell,
   new tabs, Home search (replacing Player lookup), and restyling of every
   existing page and state, in the app and on the website (including phone
   layouts). No new data features.
2. **Hero page builds (done):** main build moved and restyled, popular
   builds as authored, counter items with enemy picker / live roster.
3. **Match report (done).**
4. **Performance tab (done).**
5. **Profile Live tab** (app + web).
6. **Overlay panels** (five windows, settings, removal of the old
   overlays).

## Left to the builder

- Exact sizes, spacing and breakpoints, and token tuning, as long as the
  approved look holds.
- Home composition below the search box.
- How many popular builds to show,
  sort, and language handling.
- The default Performance range, metric order, and how metadata requests
  are batched.
- Default overlay positions and sizes.
- Where small surfaces drop the brush-stroke art.

## Risks and things to verify during the build

- **Overwolf data is untested on Windows** (README). In particular, check
  whether GEP `roster` updates every player's damage/healing often enough
  for live meters, and what `souls` means.
- **The spawn-timer schedule** depends on the patch.
- **`/v1/matches/active` covers only top matches,** so most profiles will
  show "No live match found".
- **The rank-average curve** may be thin for rare heroes at extreme ranks.
  Widen the badge range and say so when that happens.
- **New fonts** must load in Overwolf's CEF (bundle them locally rather
  than rely on Google Fonts if needed).
