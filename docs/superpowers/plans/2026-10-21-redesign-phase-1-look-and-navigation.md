# Redesign phase 1 — new look and navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole desktop app and website in the approved "Deadlock noir" look and switch both to the new navigation (Home · Live · Tier list · Heroes · Items, profile as its own page, search on Home), with no new data features beyond the ability tooltips.

**Architecture:** One CSS token file feeds every existing stylesheet; a hex-colour guard test enforces it. A few shared React building blocks (page title, ribbon, section header, hero cards) are used by both shells. Navigation gains `tierlist` and `profile` routes in the shared `Route` type; the desktop shell maps them to tabs/pages and the website maps them to URLs through the existing `LinkProvider` seam. Player search and the profile page move from `web/` into `src/features/` so both shells share one copy.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8 (web, framework mode, pre-rendered), plain global CSS, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md` (phase 1 of "Delivery phases"). Visual reference: `docs/superpowers/specs/2026-10-21-redesign-prototype.html` — open it in a browser; tick "Show as website" for the web layout. Its `<style>` block is the reference for every component's look. Where this plan and the prototype differ, this plan wins.

## Global Constraints

- Palette tokens, exactly (in `src/app/styles/tokens.css`): `--ink #0c0b0a`, `--surface #12100e`, `--surface-2 #171512`, `--line #3a3226`, `--line-soft #2a241c`, `--cream #ece0c4`, `--muted #a89d86`, `--dim #7d7462`, `--gold #d9a441`, `--tier-gold #f2c66d`, `--poster-red #c8432f`, `--good #7fd39a`, `--bad #e07a5f`, `--ally #5a8f9c`, `--enemy #9c5a4a`. Category colours (for item tiles): `--weapon #c97a2c`, `--vitality #5e9b4a`, `--spirit #8e6fc9`. Tier letter colours: `--tier-s #f2c66d`, `--tier-a #e9d9a8`, `--tier-b #cdbf9f`, `--tier-c #a99c82`, `--tier-d #8d8271`.
- No hex colour literal anywhere in `src/**/*.css`, `web/app/**/*.css` or `src/**/*.tsx` except `tokens.css`. Use `var(--token)` or `rgb(from var(--token) r g b / a)` / `color-mix(in srgb, var(--token) N%, transparent)` for transparency (both work in Chrome 110+; Overwolf CEF and the web target are Chromium).
- Fonts via the existing Google Fonts `@import` in `base.css` (About page copy says fonts load from Google Fonts — keep it true): **Playfair Display SC** 700/900 (page titles, hero names, tier letters, wordmark), **Rajdhani** 500/600/700 (uppercase section headers, nav labels, ribbons, stat labels and numbers), **DM Sans** 400–700 (body). Root font size **14px** (was 13px).
- Page texture: `repeating-linear-gradient(0deg, rgb(255 255 255 / 0.015) 0 2px, transparent 2px 4px)` on the page background.
- Ribbon: Rajdhani 700 uppercase, letter-spacing .16em, `--poster-red` background, `--cream` text, `transform: rotate(-2deg)`, `box-shadow: 3px 3px 0 #000` (write `black`).
- Section header: 5px `--gold` left bar, uppercase Rajdhani title, a 2px cream→transparent rule filling the row, optional gold uppercase link on the right ending in "→".
- Website layout: full width, no framed box; side gutter `--gut: max(64px, calc((100vw - 1320px) / 2))`, phone (≤640px) gutter 16px; header sticky and full width; banners full-bleed with text aligned to the gutter. Web page titles ≈40px, hero banner ≈250px tall, hero cards 140–160px wide (grids add columns, components don't grow).
- Desktop window stays default 1260×900, minimum 850×650; the header + nav must fit one row at 850px.
- No chips/pills for hero tags; tags render as uppercase text separated by " · ".
- No fake data in production; derived numbers carry a one-line "how it's derived" note.
- One shared copy of feature code for app and web (no forks).
- Website nav order: **Home · Tier list · Heroes · Items**. Desktop: **Home · Live · Tier list · Heroes · Items**.
- Profile tabs in this phase: **Overview · Matches · Performance · Heroes** (Live comes in phase 5).
- Copy strings fixed by this plan (tests assert them): page titles "Tier List", "The Heroes", "The Shop"; ribbons "Last 30 days · by win rate", "Every hero in the city", "Every item · win & pick rates"; Home h1 "Know the match." with eyebrow "Deadlock stats & builds" and ribbon "Make your move"; search label "Find a player"; Home sections "You" and "Top of the city"; profile actions "This is me", "Not you? Switch account", "Find another player"; header button accessible name "My profile".
- Run before every commit: `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`. Browser suites: `npm run test:browser` (desktop) and `npm run test:web` (website). Format with `npx prettier --write` on touched files.

## Review Focus

1. **Website hydration with a remembered account** — the header "My profile" and Home "You" section read `localStorage`; reading it during render causes hydration mismatch warnings. Expected: no console errors or warnings on `/` with a remembered account. Test added in Task 7 (`home revisit with a remembered account hydrates cleanly`).
2. **Desktop app at its minimum width (850px)** — five tabs + LIVE badge + My profile + settings/close must stay one row and nothing overflows. Test added in Task 8 (`shell fits one row at the minimum window width`).
3. **Ability tooltip by keyboard and touch, and at phone width** — the tooltip must open on focus and on tap/click, close on Escape and on outside click, and never cause horizontal page scroll at 375px. Tests added in Task 5 (`ability tooltip opens on focus and click and closes on Escape`) and Task 9 (phone loop includes `/heroes/haze` with a tooltip open).
4. **Game-art CDN failing** — hero cards, tier tiles and the hero banner must still show the hero name and stat line when images 404 (Picture placeholder). Test added in Task 2 (`HeroGrid renders name and stat without images` — vitest, image-less hero) and Task 4 (`tier list stays readable when portraits fail`).
5. **"Me" changing while the page is open** — after "This is me" or "Not you? Switch account", the header "My profile" and Home "You" section update without reload, on desktop and web. Tests: web in Task 6 (`This is me updates the header immediately`), desktop in Task 7 (`search opens a profile and This is me remembers it`).

---

### Task 1: Tokens, typography, texture and the hex-colour guard

**Files:**
- Create: `src/app/styles/tokens.css`
- Modify: `src/app/styles/index.css` (import `tokens.css` first, before `base.css`)
- Modify: `src/app/styles/base.css`
- Create: `tests/app/theme.test.ts`
- Create: `tests/browser/theme.spec.ts`
- Add (already copied, commit it): `docs/superpowers/specs/2026-10-21-redesign-prototype.html`

**Interfaces:**
- Produces: CSS custom properties listed in Global Constraints, plus `--font-title: "Playfair Display SC", serif`, `--font-label: "Rajdhani", sans-serif`, `--font-body: "DM Sans", sans-serif`, `--texture` (the gradient above). Every later task uses only these.
- Produces: `LEGACY` set in `tests/app/theme.test.ts` — the CSS/TSX files still allowed to contain hex. Each later task deletes its files from `LEGACY`; Task 10 asserts it is empty.

- [ ] **Step 1: Write the failing tests**

`tests/app/theme.test.ts` (vitest, Node `fs`):
```ts
it("tokens.css defines the palette exactly", () => {
  // parse `--name: value;` pairs from src/app/styles/tokens.css
  expect(tokens["--ink"]).toBe("#0c0b0a"); // …every token in Global Constraints
});
it("no hex colours outside tokens.css except legacy files", () => {
  // walk src/**/*.css, web/app/**/*.css (skip web/build), src/**/*.tsx
  // CSS: /#[0-9a-f]{3,8}\b/i ; TSX: /#[0-9a-f]{6}\b/i
  expect(offenders.filter((f) => !LEGACY.has(f))).toEqual([]);
});
it("legacy list only names files that still exist", () => { /* every LEGACY path exists */ });
```
`LEGACY` starts as every file that has hex today **except** `src/app/styles/base.css`: shell.css, layout.css, shared.css, builds.css, counters.css, panels.css, settings.css, roster.css, inventory.css, lookup.css, hero-detail.css, heroes.css, items.css, live.css, profile.css, web.css, plus `src/features/heroes/components/HeroHeader.tsx`, `src/features/profile/components/PerformanceTab.tsx`, `src/shared/ui/LineChart.tsx` (repo-relative paths).

`tests/browser/theme.spec.ts`:
```ts
test("noir base theme applies", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(12, 11, 10)");
  await expect(page.locator(":root")).toHaveCSS("font-size", "14px");
  await expect(page.locator("h1").first()).toHaveCSS("font-family", /Playfair Display SC/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/app/theme.test.ts` → FAIL (no tokens.css). `npx playwright test tests/browser/theme.spec.ts` → FAIL (background rgb(13, 19, 24)).

- [ ] **Step 3: Implement tokens and base**

`tokens.css`: `:root { … }` with every token. `base.css`: Google Fonts import for the three families/weights; `:root` uses `--font-body`, 14px, `--cream`; `body` background `var(--ink) var(--texture)` (texture as `background-image` over `background-color`); `h1` uses `--font-title` 900, `letter-spacing: .01em`; `button:hover` colour `--gold`; remove every hex from base.css.

- [ ] **Step 4: Run tests** — both pass; `npm test` and `npm run test:browser` still green (other files are legacy).

- [ ] **Step 5: Commit**
```bash
git add src/app/styles tests/app/theme.test.ts tests/browser/theme.spec.ts docs/superpowers/specs/2026-10-21-redesign-prototype.html
git commit -m "feat(theme): noir tokens, fonts and hex-colour guard"
```

---

### Task 2: Shared building blocks — page title, ribbon, section header, hero cards

**Files:**
- Create: `src/shared/ui/PageTitle.tsx` (exports `PageTitle`, `Ribbon`)
- Create: `src/shared/ui/SectionHeader.tsx`
- Modify: `src/features/heroes/components/HeroGrid.tsx`
- Create: `src/app/styles/components.css` (imported in `index.css` right after `base.css`)
- Test: `tests/shared/noir-ui.test.ts`

**Interfaces:**
- Produces:
  - `Ribbon({ children, className? }: { children: ReactNode; className?: string })` → `<span class="ribbon {className}">`.
  - `PageTitle({ title, eyebrow?, ribbon? }: { title: string; eyebrow?: string; ribbon?: ReactNode })` → `<div class="page-title">{eyebrow && <p class="eyebrow">}<h1>{title}</h1>{ribbon && <Ribbon>}</div>`. Uses a `div`, never `<header>` (the shell styles the `header` element).
  - `SectionHeader({ title, action? }: { title: string; action?: ReactNode })` → `<div class="section-header"><h2>{title}</h2><span class="section-rule" aria-hidden="true"></span>{action}</div>`.
  - `HeroGrid({ cards, variant? }: { cards: HeroCard[]; variant?: "tier" | "roster" })` — `HeroCard` interface unchanged. Each card stays a `RouteLink` with class `hero-card` to `{ page: "heroes", heroId }`. Looks up `heroById.get(heroId)` for `cardImage` (fallback `image`), `backgroundImage` and `role`. Markup inside: `img.hero-card-bg` (only if `backgroundImage`), `Picture.hero-card-portrait`, `span.tier-letter.tier-{T}` (variant `tier` and a tier only), `span.hero-name`, `small.hero-card-stat`. Stat line: variant `tier` → `<b class="win">53.3%</b> win · 63.5% pick` (`—` for null); variant `roster` → `assassin · <b class="win">53.3%</b> win`.

- [ ] **Step 1: Write the failing tests** (`renderToStaticMarkup`, same style as `tests/app/links.test.ts`)
  - `PageTitle renders eyebrow, h1 and ribbon` — markup contains `<p class="eyebrow">Deadlock stats &amp; builds</p>`, `<h1>Know the match.</h1>`, `class="ribbon"` with "Make your move"; no `<header`.
  - `SectionHeader renders the rule and the action` — contains `class="section-rule"` and the action text.
  - `HeroGrid tier variant shows tier letter and win · pick` — for Haze `{winRate: .533, pickRate: .635, tier: "A"}`: contains `tier-letter tier-A`, `53.3%`, `63.5% pick`, `haze_card.webp`, `haze_bg.webp`.
  - `HeroGrid roster variant shows role and win, no tier letter` — contains `assassin`, `53.3%`, not `tier-letter`.
  - `HeroGrid renders name and stat without images` — a card whose hero has no images (construct with a heroId missing from the catalog, name "Ghost"): contains `Ghost` and `—`.

- [ ] **Step 2: Run** `npx vitest run tests/shared/noir-ui.test.ts` → FAIL.

- [ ] **Step 3: Implement** the components; `components.css` styles `.page-title`, `.ribbon`, `.section-header`, `.hero-grid` (`grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))`, gap 12px) and `.hero-card` (≈214px tall, brush art behind the portrait, serif tier letter top-left in the tier colour, name in serif over a bottom gradient to `--ink`, hover lifts 2px with a `--gold` border) — copy the look from the prototype's `.hcard`, `.ribbon`, `.sec`, `h1.t`.

- [ ] **Step 4: Run** vitest → PASS; `npm run test:browser` and `npm run test:web` — update only selectors this changes: `heroes.spec` "tier sort groups…" asserts `.tier-letter` background colour `rgb(242, 198, 109)` → change to text colour `rgb(242, 198, 109)` (`toHaveCSS("color", …)`). (That test is rewritten in Task 4 anyway.)

- [ ] **Step 5: Commit** `feat(ui): page title, ribbon, section header and noir hero cards`

---

### Task 3: Ability tooltip data in the catalog

**Files:**
- Modify: `scripts/refresh-catalog.mjs`
- Modify: `src/shared/catalog/types.ts`
- Regenerate: `src/shared/catalog/catalog.json` (and synced item icons) via `npm run catalog:refresh`
- Test: `tests/catalog/catalog.test.ts`

**Interfaces:**
- Produces in `types.ts`:
```ts
export interface AbilityStat { label: string; value: string; icon?: string }
export interface Ability {
  /* existing fields */
  cooldown?: string;          // "30s"; absent when 0/missing
  keyStats: AbilityStat[];    // ≤3, from tooltip_details.info_sections[0].properties_block[*].properties[*].important_property
  minorStats: AbilityStat[];  // from info_sections[0].basic_properties, zero values dropped
  highlights: string[];       // text of <span class="highlight">…</span> in the description, in order, de-duplicated
}
```
- Script rules (in `compact()` abilities map):
  - Number formatting (also applies to existing item stats): round to 2 decimals, drop trailing zeros (`13.3333` → `13.33`, `2.75` → `2.75`, `65` → `65`). Sign "+" only where the property prefix contains `{s:sign}` and value > 0 (unchanged rule). Append `postfix` unless the value string already ends with it.
  - `keyStats[].icon` = `important_property_icon` ?? the property's `icon`.
  - Empty upgrade text: build it from `upgrades[i].property_upgrades`, skipping entries with `upgrade_type === "EAddToScale"`; each part is `${sign}${bonus}${postfix} ${label}` where sign is "+" when bonus is positive and not already signed; parts joined with a space. Keep positional length 3; if still nothing, "".

- [ ] **Step 1: Write the failing tests** (add to `catalog.test.ts`, replacing the Powder Keg expectations of "")
```ts
it("abilities carry tooltip data", () => {
  const dagger = byName("Sleep Dagger");
  expect(dagger.cooldown).toBe("30s");
  expect(dagger.keyStats.map((s) => [s.label, s.value])).toEqual([["Damage", "65"], ["Sleep Duration", "2.75s"]]);
  expect(dagger.keyStats[0].icon).toMatch(/^https:/);
  expect(dagger.highlights).toEqual(["damages", "sleeps"]);
  for (const a of catalog.abilities) {
    expect(a.keyStats.length).toBeLessThanOrEqual(3);
    for (const s of a.minorStats) expect(Number.parseFloat(s.value)).not.toBe(0);
  }
});
it("empty upgrade text is built from property upgrades", () => {
  expect(byName("Powder Keg").upgrades.slice(0, 2)).toEqual(["-10s Cooldown", "+1 Charges"]);
  expect(byName("Powder Keg").upgrades[2]).toContain("Impact Damage");
  expect(byName("Bullet Dance").upgrades[0]).toBe("+7 Bullet Damage");
  expect(byName("Smoke Bomb").upgrades[0]).toBe("+7m Invis Sprint Speed");
});
```
- [ ] **Step 2: Run** `npx vitest run tests/catalog` → FAIL.
- [ ] **Step 3: Implement** the script changes and types; run `npm run catalog:refresh`. If the refresh changes unrelated values (new hero, patched numbers) and an existing test breaks, update that test's expectation to the new data — never hand-edit `catalog.json`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(catalog): ability cooldown, key stats and built upgrade text`

---

### Task 4: Navigation model, Tier list page and Heroes roster

**Files:**
- Modify: `src/app/navigation.ts`
- Modify: `web/app/paths.ts`, `web/app/sitePaths.ts`, `web/app/routes.ts`, `web/app/routes/heroes.tsx`
- Create: `web/app/routes/tier-list.tsx`
- Create: `src/features/heroes/components/TierListPage.tsx`, `src/features/heroes/components/TierList.tsx`
- Modify: `src/features/heroes/components/HeroesPage.tsx`, `src/features/heroes/styles/heroes.css`
- Modify: `src/app/DesktopApp.tsx` (tabs only), `web/app/WebShell.tsx` (tabs only)
- Tests: `tests/web/paths.test.ts`, `tests/web/site-paths.test.ts`, `tests/browser/heroes.spec.ts` (rewrite), create `tests/browser/tier-list.spec.ts`, `tests/browser/items.spec.ts` (rank-sharing test), `tests/web-browser/heroes-items.spec.ts`, `tests/web-browser/prerender.spec.ts`, `tests/web-browser/shell.spec.ts`, `tests/web-browser/mobile.spec.ts`

**Interfaces:**
- Produces `navigation.ts`:
```ts
export type Page = "home" | "live" | "tierlist" | "heroes" | "items" | "profile" | "lookup";
export interface Route { page: Page; heroId?: number; itemId?: number; accountId?: number }
```
  (`"lookup"` is removed in Task 7.)
- Produces `routeToPath`: `tierlist` → `/tier-list`; `profile` with `accountId` → `/players/{id}`, without → `/`; others unchanged.
- Produces `sitePaths()` order: `["/", "/tier-list", "/heroes", "/items", "/about", …heroes, …items]`.
- Produces `TierListPage({ navigate, catalogWhileLoading? }: { navigate: Navigate; catalogWhileLoading?: boolean })` — fetches `fetchHeroSummaries({ minBadge: 0 })` itself (no rank selector on this page).
- Produces `TierList({ summaries, role }: { summaries: HeroSummary[]; role: RoleFilter })` and `export type RoleFilter = "all" | "assassin" | "brawler" | "marksman" | "mystic"` (move the type + `roles` options list into `TierList.tsx` and import it in `HeroesPage`).
- `HeroesPage` props unchanged (`route, navigate, query, setQuery, catalogWhileLoading`); hero detail branch unchanged in this task.

**Behaviour:**
- Tier list: `PageTitle` "Tier List", ribbon "Last 30 days · by win rate", lede "Who's strong right now. Win rate · pick rate under each hero."; role filter buttons only (group `aria-label="Role"`); rows S→D (`.tier-row` with `.tier-label.tier-{T}` showing the letter, and `.tier-tiles`), then an "UNRANKED" row (heroes without stats; "NO DATA" when the request failed). Tiles: `RouteLink.tier-tile` to the hero, `Picture` of `cardImage ?? image` (~92px square), `b.hero-name`, `span` "57.5% · 54.5%". Within a tier, sort by win rate desc. Loading: "Loading hero stats…"; with `catalogWhileLoading` show all heroes A–Z as tiles in one untitled row. Error: notice "Hero stats unavailable: …" with Retry. Footnote: "Tiers by win rate over the last 30 days, all ranks."
- Heroes roster: `PageTitle` "The Heroes", ribbon "Every hero in the city", lede "Browse the full roster. Click a hero for their builds, counters and matchups."; search input (`aria-label="Search heroes"`, matches name case-insensitively) + role filter; `HeroGrid variant="roster"`, A–Z. Stats from `fetchHeroSummaries({ minBadge: 0 })`. No sort, no rank filter on this page (rank filter lives on hero detail and Items).
- Desktop tabs: Home · Live · Tier list · Heroes · Items · Player lookup (lookup removed in Task 7). `route.page === "heroes"` with a `heroId` keeps the Heroes tab active.
- Web: route `tier-list` → `routes/tier-list.tsx` with `PageMeta` title "Deadlock hero tier list | Counterlock", description "Deadlock hero tier list: every hero ranked by win rate, filterable by role.", path `/tier-list`, renders `TierListPage catalogWhileLoading`. `/heroes` meta: title "Deadlock heroes | Counterlock", description "Every Deadlock hero with role and win rate. Open a hero for builds, counters and matchups." Nav: Home · Tier list · Heroes · Items.

- [ ] **Step 1: Write the failing tests**
  - `paths.test.ts`: `routeToPath({ page: "tierlist" })` → `/tier-list`; `{ page: "profile", accountId: 42 }` → `/players/42`; `{ page: "profile" }` → `/`.
  - `site-paths.test.ts`: first five are `["/", "/tier-list", "/heroes", "/items", "/about"]`; `paths.slice(5)` equals the hero+item paths.
  - `tests/browser/tier-list.spec.ts` (move the stats fixture and `openHeroes` routing from today's `heroes.spec.ts`, opening the **Tier list** tab):
    - `tier rows run S to D with win · pick under each tile` — `.tier-label` texts `["S","A","B","C","D"]`; first S tile `.hero-name` is the top-win-rate fixture hero and contains `61.0% ·`; `.tier-label.tier-S` colour `rgb(242, 198, 109)`; footnote visible.
    - `role filter keeps only that role` — tile count equals mystic count.
    - `there is no sort or rank selector` — `getByLabel("Sort")` and `getByLabel("Rank")` have count 0 inside the visible page.
    - `heroes without stats trail as unranked; failure shows NO DATA and Retry` (merge today's three cases).
    - `tier list stays readable when portraits fail` — route `assets-bucket.deadlock-api.com/**` to 404; first tile still shows its name and a `%`.
    - `clicking a tile opens the hero on the Heroes tab` — `.hero-header h1` shows the name; Heroes tab has class `active`.
  - `tests/browser/heroes.spec.ts` (rewrite): `roster lists every hero A–Z with role and win rate` (names equal the alphabetical list; first card contains its role and a `%`; no `.tier-letter`); `search narrows the roster` ("ha" → Haze present, count < all); `role filter keeps only that role`; `clicking a card opens that hero and back returns to the roster`.
  - `items.spec.ts` "the rank filter selection is shared between Heroes and Items": choose the rank on a **hero detail page** (open Heroes → first card) instead of the Heroes list.
  - `web heroes-items.spec.ts`: "hero cards are real links…" expects title "Deadlock heroes | Counterlock"; "rank filter set on Heroes is kept…" starts at `/heroes/haze`; add `tier list page lists tiles that link to heroes` (`/tier-list` title "Deadlock hero tier list | Counterlock", `a.tier-tile[href="/heroes/haze"]` count 1).
  - `prerender.spec.ts`: titles for `tier-list/index.html` and `heroes/index.html` as above; sitemap `<loc>` count `5 + heroes + items` and contains `/tier-list`; `tier-list/index.html` body has `href="/heroes/haze"` and no `\d+\.\d%`.
  - `shell.spec.ts` and `mobile.spec.ts`: nav has links Home, Tier list, Heroes, Items (mobile: `toHaveCount(4)`, still one row ≥40px tall at 375px — shrink nav type/gaps in `phone.css` if needed); mobile loop adds `/tier-list` (ready when `a.tier-tile` visible).
- [ ] **Step 2: Run** `npm test` and the two browser suites → the new/changed tests FAIL.
- [ ] **Step 3: Implement** the navigation types, paths, routes, both pages, tabs and `heroes.css` (convert to tokens; remove it and nothing else from `LEGACY`).
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`, `npm run test:browser`, `npm run test:web` → PASS.
- [ ] **Step 5: Commit** `feat(nav): tier list page, hero roster and tierlist/profile routes`

---

### Task 5: Hero page header with abilities, and hero detail restyle

**Files:**
- Modify: `src/features/heroes/components/HeroHeader.tsx`
- Create: `src/features/heroes/components/AbilityRow.tsx`
- Delete: `src/features/heroes/components/AbilityCards.tsx`
- Modify: `src/features/heroes/components/HeroDetail.tsx`, `HeroesPage.tsx` (pass `setQuery` through), `src/features/heroes/styles/hero-detail.css`
- Tests: `tests/browser/hero-detail.spec.ts`, `tests/web-browser/mobile.spec.ts`

**Interfaces:**
- Consumes: `Ability.cooldown/keyStats/minorStats/highlights/upgrades` (Task 3); `PageTitle`/`Ribbon`/`SectionHeader` (Task 2).
- Produces: `HeroDetail({ heroId, query, setQuery }: { heroId: number; query: AnalyticsQuery; setQuery(q: AnalyticsQuery): void })`.
- Produces: `HeroHeader({ hero, summary, query, setQuery }: { hero: Hero; summary?: HeroSummary; query: AnalyticsQuery; setQuery(q: AnalyticsQuery): void })`.
- Produces: `AbilityRow({ abilityIds }: { abilityIds: number[] })`.

**Behaviour:**
- Banner (`.hero-header`, full-bleed): right side `div.hero-art` (`overflow: hidden`, `pointer-events: none`) holding `img.hero-art-bg` (`backgroundImage`) and the `cardImage` portrait; no inline styles. Left column, top to bottom: `RouteLink.hero-back` "← All heroes" → `{ page: "heroes" }`; `div.hero-identity` eyebrow with `span.hero-role` (uppercase role) and `span.hero-tags` (other tags uppercase, joined " · ", omitted when empty); a row with `span.hero-tier.tier-{T}` (big serif letter, only with a summary) and `h1` name; `Ribbon className="hero-tagline"` with the tagline (omitted when none); `AbilityRow`; `div.hero-stats` with WIN RATE (good colour), PICK RATE, MATCHES (compact) and the `RankFilter` (moved here from nowhere — it is the page's rank control). The old tier banner, `#n OF 43`, AVG KDA and `.hero-rule` are gone.
- `AbilityRow`: `div.ability-row` of 4 `button.ability-icon` (round, ~52px, `aria-describedby` → tooltip id, accessible name = ability name) each with `img` and `span.ability-key` "1".."4", followed by `div.ability-tip[role=tooltip]` (hidden unless open). Opens on hover, focus and click (click toggles, for touch); closes on Escape, blur, mouse leave and outside click; only one open at a time. Tooltip content: `img` + `b` name + `em.ability-cooldown` "⟳ 30s" (omitted without cooldown); `p.ability-desc` (description with each `highlights` string wrapped once in `b.hl`); `div.ability-key-stats` boxes (icon, value, label); `div.ability-minor-stats` "Label **value**" line (omitted when empty); `div.ability-upgrades` three boxes labelled "◆ 1", "◆ 2", "◆ 5" with the upgrade text (box present even when text is ""). Tooltip positioned under the icon, `max-width: min(400px, calc(100vw - 32px))`, and clamped so it never extends past the viewport (shift left when needed).
- Remove the "Abilities" section from `HeroDetail`. Other sections keep their headings and data, restyled with `SectionHeader` and tokens (matchup rows, item tiles, skill order grid per the prototype's `.mu`, `.item`, `.mulist` look). Today's "Build" section stays (phase 2 replaces it).

- [ ] **Step 1: Write the failing tests** (`hero-detail.spec.ts`)
  - Replace "header shows card art, tier banner…" with `header shows art, tier letter, identity, tagline ribbon and stats`: `img[src*="haze_card.webp"]` and `img[src*="haze_bg.webp"]` visible in `.hero-header`; `.hero-role` "ASSASSIN"; `.hero-tags` "STEALTHY · LETHAL"; no `[class*="chip"],[class*="pill"]`; `.hero-tagline` has class `ribbon` and the tagline; `.hero-tier` "S"; `.hero-stats` contains "70.0%", "WIN RATE", "PICK RATE", "50K", "MATCHES" and a `Rank` select; `.tier-banner`, `.hero-rank` counts 0.
  - Replace "abilities render four numbered cards…" with `ability row shows four icons in signature order`: 4 `.ability-icon`, keys "1".."4", accessible names equal the four ability names, `img` src equals each ability image; `.ability-card` count 0; no section headed "Abilities".
  - `ability tooltip shows cooldown, key stats, minor stats and three upgrades`: hover the first icon → tooltip visible with the name, "⟳ " + catalog cooldown, `.ability-key-stats > *` count = `keyStats.length`, `.ability-upgrades > *` count 3 with "◆ 1", "◆ 2", "◆ 5"; each `highlights` entry appears inside `b.hl`.
  - `ability tooltip opens on focus and click and closes on Escape`: focus icon 2 (keyboard Tab) → its tooltip visible; Escape → hidden; click icon 3 → visible; click page body → hidden.
  - Update "thin data…" (drop the `.ability-card` assertion; assert 4 `.ability-icon`) and "a hero without a tagline…" (`.hero-tags` joined with " · ").
  - `mobile.spec.ts` `/heroes/haze` ready check: `.hero-header .hero-tier` instead of `.tier-banner`; "hero detail stacks…" checks the identity column sits above the art at 375px. Add in the phone loop for `/heroes/haze`: after ready, click the 4th `.ability-icon` and re-run the no-horizontal-scroll checks with the tooltip open.
- [ ] **Step 2: Run** `npm run test:browser` / `npm run test:web` → FAIL.
- [ ] **Step 3: Implement**; convert `hero-detail.css` and remove `HeroHeader.tsx` + `hero-detail.css` from `LEGACY`.
- [ ] **Step 4: Run** all suites → PASS.
- [ ] **Step 5: Commit** `feat(heroes): noir hero banner with ability row and tooltips`

---

### Task 6: Shared player search, profile page and "My profile" (both shells)

**Files:**
- Create: `src/features/player-search/hooks/usePlayerSearch.ts` (moved from `web/app/useSteamSearch.ts`, same behaviour, renamed export `usePlayerSearch`)
- Create: `src/features/player-search/components/PlayerSearch.tsx` (from `web/app/SteamSearch.tsx`)
- Delete: `web/app/SteamSearch.tsx`, `web/app/useSteamSearch.ts`
- Create: `src/features/profile/me.ts`
- Create: `src/features/profile/components/ProfilePage.tsx`
- Modify: `ProfileHeader.tsx`, `ProfileView.tsx`, `OverviewTab.tsx`, `MatchHistory.tsx`, `PerformanceTab.tsx`, `src/shared/ui/LineChart.tsx`, `src/features/profile/styles/profile.css`
- Modify: `web/app/remembered.ts`, `web/app/routes/player.tsx`, `web/app/WebShell.tsx`
- Modify: `src/app/DesktopApp.tsx`
- Tests: `tests/web/remembered.test.ts`, `tests/browser/home.spec.ts`, `tests/web-browser/home.spec.ts`

**Interfaces:**
- Produces `me.ts`:
```ts
export interface MeAdapter { meId: number | null; setMe(accountId: number): void; clearMe(): void }
export function useDesktopMe(): MeAdapter & { account: ProfileAccount | null } // wraps useProfileAccount: setMe = setManual, clearMe = clear
```
- Produces `remembered.ts` additions: `subscribeRemembered(callback: () => void): () => void` (fires on `storage` events for `REMEMBERED_KEY` and on a same-tab `"counterlock:remembered"` window event that `writeRemembered`/`clearRemembered` now dispatch); `useRememberedMe(): MeAdapter` (state starts `null`, reads in `useEffect`, subscribes). `BROWSE_STATE` stays until Task 7.
- Produces `PlayerSearch({ label?, onPick? }: { label?: string; onPick?(accountId: number): void })` — `label` default "Find a player"; results and the "Use this ID" row are `RouteLink`s to `{ page: "profile", accountId }` (anchors on web, buttons on desktop) calling `onPick(id)` before navigating; keeps classes `web-search*` renamed to `player-search*`; same debounce, minimum 2 characters, error/empty lines ("No Deadlock players found with that name.").
- Produces `ProfilePage({ accountId, me, navigate, subtitle? }: { accountId: number; me: MeAdapter; navigate: Navigate; subtitle?: string })` → wraps `ProfileView`; header via `ProfileHeader`; `topHeroId` = most-played hero from the loaded history (`topHeroes(history, 1)`).
- Produces `ProfileHeader({ accountId, subtitle, topHeroId, actions }: { accountId: number; subtitle?: string; topHeroId?: number; actions: ReactNode })` — full-bleed banner (`.profile-header`), most-played hero `backgroundImage` on the right (`.hero-art` pattern from Task 5), avatar (gold frame), eyebrow "Player profile", `h1` name, meta line (rank badge, "Most played: <Hero>", subtitle), then `actions`.
- `ProfileView` tabs: `overview | matches | performance | heroes` labelled Overview · Matches · Performance · Heroes (`role="tab"`). `MatchHistory` gains `preview?: boolean` — preview shows the 3 newest matches under `SectionHeader` "Recent matches" with action "All matches →" (switches to the Matches tab via an `onShowAll` callback prop), no filter buttons, no "Show more". Overview no longer renders the full history.
- Actions logic (both shells): when `me.meId === accountId` → "Not you? Switch account" (`me.clearMe()` then navigate `{ page: "home" }`); otherwise "This is me" (`me.setMe(accountId)`) and "Find another player" (navigate `{ page: "home" }`). Subtitle: desktop me → today's "Seen on this PC · 2h ago" / "Entered manually" text; otherwise "Deadlock profile".
- Desktop: `route.page === "profile"` renders `<ProfilePage key={accountId} …>` (not a tab; the shell remembers it like other pages). Header gets `button[aria-label="My profile"]`: avatar + name when `me.meId` (navigates to that profile), otherwise text "Find your account" (navigates Home).
- Web: `player.tsx` renders `ProfilePage` with `useRememberedMe()` (keeps `PageMeta` and invalid-id message). `WebShell` header gets `RouteLink`/`Link` `aria-label="My profile"` to `/players/{id}` (avatar + name) or "Find your account" to `/`, rendered from `useRememberedMe()` so the server/pre-render output is the logged-out state.
- `LineChart` takes colours as CSS variables (`stroke="var(--line)"`); `PerformanceTab` passes `var(--gold)` / `var(--good)`. Remove `PerformanceTab.tsx`, `LineChart.tsx` and `profile.css` from `LEGACY`.

- [ ] **Step 1: Write the failing tests**
  - `remembered.test.ts`: `writeRemembered notifies subscribers in the same tab`; `clearRemembered notifies subscribers`; unsubscribe stops notifications.
  - Desktop `home.spec.ts`: add helper `openMyProfile(page)` = `goto("/")` then click `getByRole("button", { name: "My profile" })`; switch every test that read the profile on Home to it. Tests that count/filter `.match-row` first click `getByRole("tab", { name: "Matches" })`. New: `overview shows the three newest matches and All matches opens the Matches tab`; `My profile opens the stored account with its actions` (subtitle "Seen on this PC · 2h ago", button "Not you? Switch account"; clicking it clears storage, lands on Home and the header button reads "Find your account"). The desktop "This is me" flow needs Home search and is tested in Task 7.
  - Web `home.spec.ts`: profile tests keep their names; `.profile-header h1` still holds the name; add `This is me updates the header immediately` — on `/players/OTHER` click "This is me" → header `getByRole("link", { name: "My profile" })` contains "Other Persona" without reload; and `the header shows Find your account with nothing remembered`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** all suites → PASS.
- [ ] **Step 5: Commit** `feat(profile): shared profile page, player search and My profile entry`

---

### Task 7: Home (both shells) and retiring Player lookup

**Files:**
- Create: `src/features/home/components/HomeView.tsx`, `src/features/home/components/YouCard.tsx`, `src/features/home/styles/home.css` (import in `index.css`)
- Modify: `src/features/profile/components/HomePage.tsx` (thin desktop wrapper; move to `src/features/home/components/HomePage.tsx`)
- Delete: `src/features/profile/components/ProfileEmpty.tsx`, `src/features/player-lookup/` (component, hook, styles), its `@import` in `index.css`
- Modify: `src/app/navigation.ts` (remove `"lookup"`), `src/app/DesktopApp.tsx` (remove lookup tab/state), `web/app/routes/home.tsx`, `web/app/remembered.ts` (remove `BROWSE_STATE`), `src/features/live/components/LivePage.tsx` ("View your profile" target)
- Tests: `tests/browser/home.spec.ts`, `tests/browser/overlay.spec.ts`, `tests/browser/feature-boundaries.spec.ts`, `tests/browser/navigation.spec.ts`, `tests/web/paths.test.ts`, `tests/web-browser/home.spec.ts`, `tests/web-browser/mobile.spec.ts`

**Interfaces:**
- Consumes: `PlayerSearch`, `MeAdapter`, `useDesktopMe`, `useRememberedMe` (Task 6); `HeroGrid` (Task 2).
- Produces: `HomeView({ me, onPick }: { me: MeAdapter; onPick?(accountId: number): void })`.
- Produces: `YouCard({ accountId }: { accountId: number })` — avatar, name (serif), rank badge (or "Unranked"), W/L strip of the last 10 normal/ranked games (green/red bars, newest right) with "4W 6L · last 10 games"; and a latest-match card: hero portrait over its brush art, "Victory · Haze"/"Defeat · Haze" (good/bad colour), K / D / A, Souls / min, Duration, link "View profile →" to the profile (phase 3 turns it into the match report). Data: `fetchSteamProfiles`, `fetchRank`, `fetchMatchHistory` (+ `isSummaryMatch`, `isWin`, `soulsPerMin`).
- `LivePage` gains `meId: number | null`; "View your profile" navigates `{ page: "profile", accountId: meId }` when set, else `{ page: "home" }`.

**Behaviour:**
- `HomeView` top: `PageTitle` eyebrow "Deadlock stats & builds", title "Know the match.", ribbon "Make your move"; `PlayerSearch` (label "Find a player"); faint hero brush art behind the top area (decorative, `aria-hidden`).
- "You" section (`SectionHeader` "You", action "My profile →" when known): `YouCard` when `me.meId`; otherwise a line "Search for your Steam account above, open it and press This is me."
- "Top of the city" section (`SectionHeader` "Top of the city", action "Tier list →" to `{ page: "tierlist" }`): `HeroGrid variant="tier"` of the 6 best heroes by `position` from `fetchHeroSummaries({ minBadge: 0 })`; loading/error lines as today ("Loading…", "Hero stats are unavailable right now.").
- Desktop Home = `HomeView` with `useDesktopMe()`; no `onPick`. Web Home = `HomeView` with `useRememberedMe()` and `onPick = (id) => { if (readRemembered() === null) writeRemembered(id) }`; **no redirect** to the remembered player; `PageMeta` unchanged.
- Desktop tabs: Home · Live · Tier list · Heroes · Items.

- [ ] **Step 1: Write the failing tests**
  - Desktop `home.spec.ts`: replace "empty state accepts a Steam ID" with `search opens a profile and This is me remembers it`: Home shows "Know the match." and the "You" prompt; header "My profile" says "Find your account"; fill "Find a player" with `76561198060265728` → click "Use this ID" → profile header shows "Fixture Persona" → click "This is me" → storage `{ accountId: ACCOUNT, source: "manual" }` and header "My profile" shows "Fixture Persona" immediately → back to Home shows the YouCard name. Add `Home shows the You card and latest match for a stored account` (name, "Mystic 3", W/L strip of the fixture's normal/ranked games, latest match "Victory"/"Defeat" per fixture). Add `top of the city lists six heroes linking to the Heroes tab`.
  - `overlay.spec.ts`: delete "player lookup renders API data…". `feature-boundaries.spec.ts`: drop the Player-lookup steps from "desktop retains counter and lookup state…", rename to "desktop retains counter state across tabs and exposes game-only settings".
  - `navigation.spec.ts`: no "Player lookup" button exists (`getByRole("button", { name: "Player lookup" })` count 0).
  - `paths.test.ts`: remove the `"lookup"` assertion.
  - Web `home.spec.ts`: `hydrated` waits for `.home-top a.hero-card`; heading "Know the match."; search label "Find a player"; pre-render test expects "Know the match.", "Find a player", "Top of the city", no `%`, no `hero-card`; main links `getByRole("link", { name: "Tier list →" })` → `/tier-list`. Replace "a remembered account opens on revisit and can be switched" with `home revisit with a remembered account shows You and hydrates cleanly` (no console errors/warnings; URL stays `/`; YouCard shows "Fargo Fixture"; "My profile →" goes to `/players/FARGO`; there "Not you? Switch account" → `/`, storage null, You prompt shown). "a malformed remembered value…" unchanged in spirit (no You card). Keep the "picking a result while browsing keeps the remembered account" behaviour (start at `/` with FARGO remembered).
  - `mobile.spec.ts` `/` ready selector: `a.hero-card` inside `.home-top`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; remove `lookup.css` from `LEGACY` (file deleted).
- [ ] **Step 4: Run** all suites → PASS.
- [ ] **Step 5: Commit** `feat(home): search-first Home with You card; retire Player lookup`

---

### Task 8: Desktop shell and Live restyle

**Files:**
- Modify: `src/app/DesktopApp.tsx`, `src/app/styles/shell.css`, `src/app/styles/layout.css`, `src/app/styles/shared.css`
- Modify: `src/features/overlay/components/OverlaySettings.tsx` (+ `settings.css`)
- Modify: `src/features/live/components/LivePage.tsx`, `src/features/live/styles/live.css`, `src/features/match/components/MatchOverview.tsx`
- Modify (tokens + look): `src/features/roster/styles/roster.css`, `inventory.css`, `src/features/builds/styles/builds.css`, `src/features/counters/styles/counters.css`
- Tests: `tests/browser/navigation.spec.ts`, `tests/browser/feature-boundaries.spec.ts`, `tests/browser/theme.spec.ts`

**Interfaces:**
- Produces: `OverlaySettings` gains `hotkey: string` prop and renders "Show / hide overlay" with `<kbd>{hotkey}</kbd>` at the top of the panel.

**Behaviour:**
- Header (single 64px row, drag handle as today): wordmark "Counter**lock**" (`.brand`, Playfair Display SC 900, "lock" in `--gold`, no tagline); nav tabs as uppercase Rajdhani labels with a 3px `--gold` underline on the active one; a red `.live-badge` "LIVE MATCH" (white dot) shown only when `status === "in-match"`, plus the Live tab's `.live-dot` in `--poster-red`; then "My profile", ⚙ settings and close. The separate 57px nav row and "TOGGLE OVERLAY" hint are removed (hint lives in `OverlaySettings`). The connection pill is replaced by the LIVE badge (STANDBY / IN MENUS / GAME NOT RUNNING text goes away).
- Footer restyled (uppercase Rajdhani, `--dim`), same content.
- Live empty states use `PageTitle` (title "Deadlock isn't running" / "Waiting for a match", existing lines as lede) and gold text buttons. `MatchOverview` intro: `PageTitle` eyebrow "Live match", title "Know the match.", ribbon "You're playing <Hero>" (local player's hero; omit ribbon when unknown); match clock in Rajdhani 46px. Rosters: team header with a 5px `--ally`/`--enemy` left bar; the local player's row gets a gold gradient and a "YOU" tag; build and counter panels use the noir panel, section header and item-tile looks from the prototype's Live page.
- Remove `shell.css`, `layout.css`, `shared.css`, `settings.css`, `live.css`, `roster.css`, `inventory.css`, `builds.css`, `counters.css` from `LEGACY`.

- [ ] **Step 1: Write the failing tests**
  - `navigation.spec.ts`: "joining a match switches to Live once" also asserts `.live-badge` visible in a match and hidden after `updateMatch(page, { players: [] })`; "browser preview opens Home…" asserts `.live-badge` count 0 and `getByText("TOGGLE OVERLAY")` count 0.
  - `feature-boundaries.spec.ts`: `kbd` "Alt + S" is asserted **after** opening Overlay settings, inside `.settings`.
  - `theme.spec.ts`: `shell fits one row at the minimum window width` — viewport 850×650 with `nativeWindow(page, "desktop")` in a match: header height ≤ 70px, every nav button's `top` equal, `document.documentElement.scrollWidth <= 850`; `active tab underline is gold` — active tab `border-bottom-color` `rgb(217, 164, 65)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run test:browser`, `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(shell): noir desktop header, LIVE badge and Live page`

---

### Task 9: Website shell — full-screen layout, gutters, footer, phone

**Files:**
- Modify: `web/app/WebShell.tsx`, `web/app/styles/web.css`, `web/app/styles/phone.css`, `web/app/routes/about.tsx` (markup only if needed for `PageTitle`), `web/app/NotFound.tsx`
- Tests: `tests/web-browser/shell.spec.ts`, `tests/web-browser/mobile.spec.ts`

**Behaviour:**
- `.app.web`: no border/radius/max-width, `min-height: 100vh`, column flex; `--gut` as in Global Constraints (16px at ≤640px).
- Header: sticky top, full width, `rgb(from var(--surface) r g b / .94)` + blur, 60px tall, padding `0 var(--gut)`; wordmark left; nav links (Home · Tier list · Heroes · Items) inline in the header row; "My profile" right. The separate `<nav>` row is merged into the header (keep a `<nav>` element around the links for the tests and landmarks).
- `main.page` padding `28px var(--gut) 48px`; full-bleed banners (`.hero-header`, `.profile-header`, Home top art) use negative margins of `var(--gut)` and inner padding `var(--gut)` so text aligns with content.
- Footer: full width, padding `14px var(--gut)`, same text and links.
- Web sizes: `h1` in `.page-title` 40px; `.hero-header` min-height ≈250px; `.hero-grid` columns `minmax(140px, 1fr)` and card height ≈180px; About/NotFound use `PageTitle`.
- Phone (≤640px): one header row may wrap into wordmark + "My profile" on the first line and the 4 nav links on the second; nav links ≥40px tall in one row; no horizontal scroll anywhere (existing clipped-element checker).
- Remove `web.css` from `LEGACY`.

- [ ] **Step 1: Write the failing tests**
  - `shell.spec.ts`: `content is capped and centred with side gutters` — at viewport 1920 on `/heroes`, `main.page` children's left edge ≈ `(1920 − 1320) / 2` ± 2px and right edge ≈ `1920 − 300` ± 2px; at 1280 the left edge is 64 ± 2px; header `position` is `sticky`; `.app` has no `border-radius`. `header and footer span the full width` — header and footer width equal the viewport.
  - `mobile.spec.ts`: keep all loops green with 4 nav links; add `/players/{FARGO}` to the phone loop (ready: `.profile-header h1`).
- [ ] **Step 2: Run** `npm run test:web` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run test:web` → PASS.
- [ ] **Step 5: Commit** `feat(web): full-screen noir layout with capped content and gutters`

---

### Task 10: Items, overlay windows, guard completion and docs

**Files:**
- Modify: `src/features/items/components/ItemsPage.tsx`, `ItemDetail.tsx`, `ItemShopGrid.tsx` (markup only for `PageTitle`/`SectionHeader`), `src/features/items/styles/items.css`
- Modify: `src/features/overlay/styles/panels.css`, `src/app/styles/window.css` (tokens only — phase 6 replaces the overlays)
- Modify: `tests/app/theme.test.ts` (`LEGACY` must be empty; add `it("legacy list is empty")`)
- Modify: `README.md` (pages, navigation, look), `docs/superpowers/specs/2026-10-21-redesign-design.md` (mark phase 1 done in "Delivery phases")
- Tests: `tests/browser/items.spec.ts`, `tests/web-browser/heroes-items.spec.ts`

**Behaviour:**
- Items list: `PageTitle` "The Shop", ribbon "Every item · win & pick rates"; toolbar unchanged functionally; shop columns headed by the category icon + uppercase Rajdhani label with a 2px category-colour underline; tiles with category-tinted icon squares (prototype `.item`, `.icolh`, `.igrid`). Item detail restyled as a noir panel (serif name, stat rows with green values, Builds from / Builds into rows).
- Overlay `panels.css` and `window.css` use tokens only; no layout change.

- [ ] **Step 1: Write the failing tests**
  - `theme.test.ts`: `legacy list is empty` (`expect([...LEGACY]).toEqual([])`).
  - `items.spec.ts`: `items page has the shop title and ribbon` — `h1` "The Shop", `.ribbon` "Every item · win & pick rates"; existing shop/sort/detail tests keep passing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; empty `LEGACY`.
- [ ] **Step 4: Run** everything: `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`, `npm run build`, `npm run web:build`, `npm run test:browser`, `npm run test:web` → all PASS. Then open the desktop preview (`npm run dev`) and the web preview (`npm run web:build && npm run web:preview`) next to the prototype and compare Home, Tier list, Heroes, a hero page (hover each ability), Items, Live (with `nativeWindow`-style fixture not available in dev — compare the empty states), a profile and the phone width; fix visible mismatches before committing.
- [ ] **Step 5: Commit** `feat(items): noir shop; finish token migration; docs`
