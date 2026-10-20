# Counterlock Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, pre-rendered, shareable Counterlock website (Home · Heroes · Items, no Live) from the same feature code as the Overwolf app.

**Architecture:** A new `web/` React Router v8 framework-mode app (`ssr: false` + `prerender`) on Vite imports the existing feature pages from `src/` via the `@/` alias. Shared code gains three seams so both shells can drive it: a `RouteLink` context (web renders real `<a href>`, Overwolf keeps buttons), asset URLs that work at any path depth, and a `ProfileView` that takes its account from the caller. Hero/item pages are pre-rendered HTML with page metadata from React 19 `<title>`/`<meta>` elements; live stats keep loading in the browser.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8.5 (`react-router`, `@react-router/dev`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-web-version-design.md` — read it first.

## Global Constraints

- The Overwolf app must not change behaviour: `npm test`, `npm run test:browser`, `npm run build`, `npm run validate:manifest` pass after every task; Overwolf HTML entry paths unchanged; overlay windows, `scout.overlay.*` keys and `counterlockStore` untouched.
- One copy of feature code: the web imports `src/features/*`; never fork a page into `web/`.
- New dependencies only: `react-router@^8.5.0`, `@react-router/dev@^8.5.0` (devDependency). Check current React Router docs (Context7 `/websites/reactrouter`) before using an API.
- Web never imports `src/platform/overwolf/*`, `features/live`, `features/overlay`, `features/match` UI, `features/roster`, or the counters UI components (counter heuristic utils used by hero detail are fine).
- URLs: `/`, `/players/:accountId`, `/heroes`, `/heroes/:slug`, `/items`, `/items/:slug`, `/about`, `/sitemap.xml`, `/robots.txt`. Web nav: **Home · Heroes · Items**.
- Slugs: lowercase name, runs of non-alphanumerics → `-`, trimmed of `-` (`Mo & Krill` → `mo-krill`, `The Doorman` → `the-doorman`, `Leech` → `leech`); must be unique per kind.
- Pre-rendered HTML contains catalog facts only; never fake numbers. Live stats load after hydration through `src/shared/api/DeadlockApi.ts`.
- Site URL is `import.meta.env.VITE_SITE_URL` (default `https://counterlock.example`) for canonical/OG/sitemap.
- Hero page title format: `"<Hero> — build, counters & abilities | Counterlock"`; item: `"<Item> — stats, builds & win rate | Counterlock"`; list pages: `"Deadlock hero tier list | Counterlock"`, `"Deadlock items | Counterlock"`; home: `"Counterlock — Deadlock stats, builds & counters"`; about: `"About | Counterlock"`.
- Footer copy (every page): `Data from Deadlock API (community service). Deadlock and its game assets belong to Valve. Counterlock is not affiliated with Valve.` with links to `https://deadlock-api.com` and `/about`.
- Remembered web account: `localStorage` key `counterlock.web.account`, value `{ "accountId": number }`.
- Hosting: Cloudflare Pages. `_redirects` contains `/players/* /__spa-fallback.html 200`; `404.html` is a copy of `__spa-fallback.html`.
- Phone width: home, heroes, hero detail, items, item detail, about usable at 375px with no page-level horizontal scroll; profile pages may scroll wide tables inside their container only. Web-only CSS lives under `web/app/styles/` scoped to `.web`, so the Overwolf look is unchanged.
- Real game art everywhere; tags never as chips.

## Review Focus

1. **Hydration of pre-rendered pages** — opening a built `/heroes/haze` or `/items/leech` must hydrate without React hydration/console errors. (Task 4 browser test.)
2. **Deep links on a static host** — refreshing `/players/123`, opening an unknown `/heroes/nope`, and direct-loading `/items/leech` on the built site must each render the right page or the not-found page, never a blank screen. (Tasks 2, 5 browser tests via `web/scripts/serve.mjs`.)
3. **Special-character names** — heroes/items like `Mo & Krill`, `The Doorman` and items with apostrophes round-trip slug → page → link. (Task 1 unit test, Task 4 browser test.)
4. **Bad remembered account** — malformed/non-numeric `counterlock.web.account` in storage shows the landing page, not a crash or redirect loop. (Task 5 browser test.)
5. **Search edge cases** — no matches, API error, and rapid typing (stale responses must not overwrite newer results). (Task 5 unit + browser tests.)

---

### Task 1: Shared seams in `src/` (slugs, asset URLs, links, profile view, Steam search)

**Files:**
- Create: `src/shared/catalog/slugs.ts`, `src/shared/ui/assets.ts`, `src/app/links.tsx`, `src/features/profile/components/ProfileView.tsx`
- Modify: `src/shared/ui/ItemIcon.tsx`, `src/app/DesktopApp.tsx` (logo src), `src/features/profile/components/HomePage.tsx`, `src/features/profile/components/ProfileHeader.tsx`, `src/features/profile/services/profile-api.ts`, every page component that calls `navigate(...)` from a clickable element (heroes, items, profile features — see `grep -rn "navigate(" src/features`)
- Test: `tests/shared/slugs.test.ts`, `tests/shared/assets.test.ts`, extend `tests/profile/profile-api.test.ts`

**Interfaces:**
- Produces (`slugs.ts`): `slugify(name: string): string`; `heroSlug(id: number): string | undefined`; `itemSlug(id: number): string | undefined`; `heroIdBySlug(slug: string): number | undefined`; `itemIdBySlug(slug: string): number | undefined`; `duplicateSlugs(names: string[]): string[]` (slugs that appear more than once).
- Produces (`assets.ts`): `assetUrl(path: string): string` = `(import.meta.env.VITE_ASSET_BASE ?? "../") + path.replace(/^\.?\//, "")`. Overwolf keeps `"../"`; the web sets `VITE_ASSET_BASE="/"`.
- Produces (`links.tsx`):
  ```ts
  export interface LinkAdapter { navigate: Navigate; href?: (route: Route) => string }
  export const LinkProvider: React.Provider<LinkAdapter>;
  export function useLinks(): LinkAdapter;
  export function RouteLink(props: { route: Route; className?: string; title?: string; "aria-label"?: string; children: React.ReactNode }): JSX.Element;
  // With adapter.href → <a href={href(route)} onClick={e => { if plain left click: e.preventDefault(); navigate(route) }}>.
  // Without href (Overwolf) → <button type="button" onClick={() => navigate(route)}> — identical to today's markup so existing tests keep matching getByRole("button").
  ```
- Produces (`ProfileView.tsx`): `ProfileView({ accountId, header, navigate }: { accountId: number; header: React.ReactNode; navigate: Navigate })` — owns the history fetch, filter and Overview/Heroes/Performance subtabs (moved out of `HomePage`). `HomePage` (Overwolf) becomes `useProfileAccount` + `ProfileEmpty` or `ProfileView` with `<ProfileHeader …/>` as `header`.
- Produces (`ProfileHeader.tsx`): new optional props `subtitle?: string` and `actionLabel?: string` (default: existing text / `"Change"`).
- Produces (`profile-api.ts`): `searchSteamAccounts(query: string, api?): Promise<SteamProfile[]>` → `GET /v1/players/steam-search?search_query=<encoded>` with `TTL.profile`; trimmed query shorter than 2 chars returns `[]` without a request; invalid rows skipped; max 10 results.
- `DesktopApp` wraps its pages in `<LinkProvider value={{ navigate }}>` (no `href`).

- [ ] **Step 1: Failing unit tests**
  - `slugify`: `"Mo & Krill"`→`"mo-krill"`, `"The Doorman"`→`"the-doorman"`, `"Leech"`→`"leech"`, `"  Hunter's Aura "`→`"hunter-s-aura"`.
  - `duplicateSlugs(catalog.heroes.map(h=>h.name))` and the same for items → `[]`; `duplicateSlugs(["A b","a-b"])` → `["a-b"]`.
  - `heroIdBySlug(heroSlug(13)!) === 13`; every catalog hero and item round-trips; `heroIdBySlug("nope")` is `undefined`.
  - `assetUrl("./items/1.webp")` → `"../items/1.webp"` by default; with `vi.stubEnv("VITE_ASSET_BASE","/")` → `"/items/1.webp"`.
  - `searchSteamAccounts("fargareko", fakeApi)` requests `/v1/players/steam-search?search_query=fargareko` and maps `personaname`/`avatarmedium`; `"a"` makes no request; a row without `account_id` is skipped.
- [ ] **Step 2:** `npx vitest run tests/shared tests/profile` → FAIL.
- [ ] **Step 3:** Implement `slugs.ts`, `assets.ts`, `searchSteamAccounts`; switch `ItemIcon` and the Overwolf logo to `assetUrl`.
- [ ] **Step 4:** Unit tests PASS.
- [ ] **Step 5:** Add `links.tsx`; replace every clickable `navigate(...)` element in heroes/items/profile components with `RouteLink` (keeping class names and accessible names); add `LinkProvider` in `DesktopApp`; extract `ProfileView` from `HomePage`; add `ProfileHeader` props.
- [ ] **Step 6:** `npm test && npx tsc --noEmit && npm run test:browser && npm run build` → all PASS with no test edits beyond imports (the Overwolf UI is unchanged).
- [ ] **Step 7: Commit** `refactor: shared link, asset and profile seams for the website`.

---

### Task 2: Web app scaffold, shell, URL mapping and static hosting scripts

**Files:**
- Modify: `package.json` (deps + scripts), `tsconfig.json` (exclude `web`), `.gitignore` (`web/build/`, `web/.react-router/`)
- Create: `web/vite.config.ts`, `web/react-router.config.ts`, `web/tsconfig.json`, `web/app/root.tsx`, `web/app/routes.ts`, `web/app/paths.ts`, `web/app/WebShell.tsx`, `web/app/routes/{home,player,heroes,hero,items,item,about,not-found}.tsx` (stubs for now), `web/app/styles/web.css`, `web/scripts/postbuild.mjs`, `web/scripts/serve.mjs`, `playwright.web.config.ts`
- Test: `tests/web/paths.test.ts`, `tests/web-browser/shell.spec.ts`

**Interfaces:**
- Consumes: Task 1 `LinkProvider`, `Route`/`Navigate`, slugs.
- Produces (`paths.ts`): `routeToPath(route: Route): string` (home→`/`, heroes→`/heroes` or `/heroes/<slug>`, items→`/items` or `/items/<slug>`; `lookup`/`live` → `/`); `playerPath(accountId: number): string` → `/players/<id>`.
- Produces (`WebShell.tsx`): layout with brand header (logo via `assetUrl("icon.svg")`), `NavLink`s **Home · Heroes · Items** (active class `active`), `<Outlet/>`, and the footer copy from Global Constraints; wraps children in `LinkProvider` with `href: routeToPath` and `navigate: route => navigate(routeToPath(route))` from `useNavigate()`; root element `<div className="app web">`.
- `package.json` scripts: `"web:dev": "react-router dev web"`, `"web:build": "react-router build web && node web/scripts/postbuild.mjs"`, `"web:preview": "node web/scripts/serve.mjs"`, `"web:typecheck": "react-router typegen web && tsc -p web/tsconfig.json"`, `"test:web": "playwright test -c playwright.web.config.ts"`.
- `web/vite.config.ts`: `plugins: [reactRouter()]`, alias `@` → `../src`, `publicDir: "../public"`, `define: { "import.meta.env.VITE_ASSET_BASE": JSON.stringify("/") }`.
- `web/react-router.config.ts`: `{ appDirectory: "app", ssr: false, prerender: ["/", "/heroes", "/items", "/about"] }` for now (Tasks 4–6 extend it).
- `postbuild.mjs`: writes `web/build/client/_redirects` (`/players/* /__spa-fallback.html 200`) and copies `__spa-fallback.html` → `404.html`.
- `serve.mjs` (no deps, Node `http`): serves `web/build/client` on `PORT` (default 5187): exact file → `<path>/index.html` → `<path>.html` → `/players/*` serves `__spa-fallback.html` with 200 → otherwise `404.html` with 404. Correct `Content-Type` for html/js/css/svg/webp/png/xml/txt/json.
- `playwright.web.config.ts`: `testDir: "./tests/web-browser"`, baseURL `http://127.0.0.1:5187`, `webServer: { command: "npm run web:build && npm run web:preview", url: "http://127.0.0.1:5187", reuseExistingServer: false }`, viewport 1260×900, honour `PLAYWRIGHT_CHROMIUM_EXECUTABLE` like the existing config.

- [ ] **Step 1: Failing tests** — `tests/web/paths.test.ts`: `routeToPath({page:"heroes",heroId:13})` → `"/heroes/haze"`; `{page:"items",itemId:<Leech id>}` → `"/items/leech"`; `{page:"home"}` → `"/"`; `playerPath(42)` → `"/players/42"`. `tests/web-browser/shell.spec.ts`: `/` shows nav links Home/Heroes/Items and the footer text; no element with text "Live" in the nav; clicking "Heroes" goes to `/heroes`; reloading `/players/123` returns HTTP 200 and renders the app shell (not a blank page); `/does-not-exist` returns 404 and renders the not-found page with a link home.
- [ ] **Step 2:** `npx vitest run tests/web` and `npm run test:web` → FAIL.
- [ ] **Step 3:** Install deps (`npm i react-router@^8.5.0 && npm i -D @react-router/dev@^8.5.0`) and implement the files above. Root route renders `<html lang="en">` with `<Meta/>`, `<Links/>`, `<ScrollRestoration/>`, `<Scripts/>`, a `HydrateFallback`, and an `ErrorBoundary` that renders the not-found page for 404s. `web.css` imports the app's base and feature styles and adds web shell styles under `.web` (the `.app` 100vh/window rules from `window.css` must not apply on the web: normal document scrolling).
- [ ] **Step 4:** `npx vitest run tests/web`, `npm run web:typecheck`, `npm run test:web` → PASS; the Overwolf checks (`npm test`, `npx tsc --noEmit`, `npm run test:browser`, `npm run build`) still PASS.
- [ ] **Step 5: Commit** `feat(web): React Router site scaffold, shell and static hosting scripts`.

---

### Task 3: Page metadata helpers

**Files:**
- Create: `web/app/seo.tsx`
- Test: `tests/web/seo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SITE_URL: string; // import.meta.env.VITE_SITE_URL ?? "https://counterlock.example", no trailing slash
  export interface PageMetaInput { title: string; description: string; path: string; image?: string; type?: "website" | "article" }
  export function metaTags(input: PageMetaInput): { title: string; tags: Array<{ name?: string; property?: string; content: string }>; canonical: string };
  // tags: description, og:title, og:description, og:url (= canonical), og:type (default website), og:site_name "Counterlock", og:image (if image), twitter:card ("summary_large_image" with image, else "summary"), twitter:title, twitter:description, twitter:image (if image)
  export function PageMeta(props: PageMetaInput): JSX.Element; // React 19 <title>, <meta>, <link rel="canonical">
  export function heroMetaInput(heroId: number): PageMetaInput;   // title per Global Constraints; description: "<Hero> (<Role>) in Deadlock: abilities, skill order, best build, counters, best items and win rate. <tagline if any>" trimmed to ≤160 chars; image: hero cardImage ?? image
  export function itemMetaInput(itemId: number): PageMetaInput;   // description: "<Item> — <Category> item, <cost> souls. <description or first two stats>" ≤160 chars; image: item shop art (item.image)
  export function sitemapXml(paths: string[]): string;            // urlset with <loc>SITE_URL+path</loc>, XML-escaped
  export function robotsTxt(): string;                            // "User-agent: *\nAllow: /\nSitemap: <SITE_URL>/sitemap.xml\n"
  ```
- [ ] **Step 1: Failing tests**: Haze title equals `"Haze — build, counters & abilities | Counterlock"`; canonical `https://counterlock.example/heroes/haze`; `og:image` is Haze's card art URL; description ≤160 chars and contains "Haze" and "Assassin"; a hero without tagline has no trailing space; item Leech title/description/category; `twitter:card` is `summary` when no image; `sitemapXml(["/","/heroes/mo-krill"])` contains both `<loc>`s; a path with `&` is escaped as `&amp;`; `robotsTxt()` contains the sitemap line; `vi.stubEnv("VITE_SITE_URL","https://x.io/")` → canonical starts `https://x.io/` with no double slash.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS (`npx vitest run tests/web`, `npm run web:typecheck`).
- [ ] **Step 5: Commit** `feat(web): page metadata, sitemap and robots helpers`.

---

### Task 4: Heroes and Items routes, pre-rendered

**Files:**
- Modify: `web/app/routes/{heroes,hero,items,item}.tsx`, `web/app/root.tsx` (shared rank query context), `web/react-router.config.ts` (prerender every hero and item path)
- Create: `web/app/RankQuery.tsx`
- Test: `tests/web-browser/heroes-items.spec.ts`, `tests/web-browser/prerender.spec.ts`

**Interfaces:**
- Consumes: `HeroesPage`, `ItemsPage` (they take `route`, `navigate`, `query`, `setQuery`), `heroIdBySlug`/`itemIdBySlug`, `PageMeta`, `heroMetaInput`/`itemMetaInput`, `routeToPath`.
- Produces (`RankQuery.tsx`): `RankQueryProvider`, `useRankQuery(): [AnalyticsQuery, (q: AnalyticsQuery) => void]` — state lives in the root layout so it is shared by Heroes and Items across client navigation.
- Route components: `/heroes` renders `HeroesPage` with `route={{page:"heroes"}}`; `/heroes/:slug` resolves the slug (no loader) and renders `HeroesPage` with `route={{page:"heroes", heroId}}` plus `<PageMeta {...heroMetaInput(heroId)}/>`; unknown slug renders the not-found page with `<title>Not found | Counterlock</title>` (client-side 404). Items mirror this. `navigate` comes from `useLinks()`.
- `prerender`: `["/", "/heroes", "/items", "/about", ...heroPaths, ...itemPaths]` built from the catalog via `routeToPath`; the config throws if `duplicateSlugs` finds any. (Task 6 appends `/sitemap.xml` and `/robots.txt`.)

- [ ] **Step 1: Failing tests**
  - `prerender.spec.ts` (reads files under `web/build/client` after the webServer build): `heroes/haze/index.html` and `items/leech/index.html` exist; their `<head>` contains the exact title, `og:image`, `link rel="canonical"`; body contains "Sleep Dagger" (Haze) / "Bonus Health" (Leech); count of `heroes/*/index.html` equals catalog hero count and `items/*/index.html` equals item count; `heroes/mo-krill/index.html` exists.
  - `heroes-items.spec.ts` (API mocked with fixtures like `tests/browser/heroes.spec.ts`): direct-load `/heroes/haze` → hero header visible, no console errors (hydration); click a "Best items" item → URL `/items/<slug>`; browser back → `/heroes/haze`; hero cards on `/heroes` are `<a href="/heroes/<slug>">`; rank filter set on `/heroes` is still selected after clicking the Items nav link; `/heroes/nope` → not-found text with link to `/heroes`.
- [ ] **Step 2:** `npm run test:web` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:web`, `npm run web:typecheck`, Overwolf checks → PASS.
- [ ] **Step 5: Commit** `feat(web): pre-rendered hero and item pages`.

---

### Task 5: Home landing, Steam account search and player profiles

**Files:**
- Modify: `web/app/routes/home.tsx`, `web/app/routes/player.tsx`
- Create: `web/app/remembered.ts`, `web/app/SteamSearch.tsx`, `web/app/useSteamSearch.ts`
- Test: `tests/web/remembered.test.ts`, `tests/web-browser/home.spec.ts`

**Interfaces:**
- Consumes: `searchSteamAccounts`, `fetchHeroSummaries` (S tier), `ProfileView`, `ProfileHeader` (`subtitle`, `actionLabel`), `accountId()` from `@/features/match/utils/game`, `playerPath`, `PageMeta`.
- Produces (`remembered.ts`): `REMEMBERED_KEY = "counterlock.web.account"`; `readRemembered(): number | null` (null on missing/malformed/non-positive-integer or storage error; safe when `window` is undefined); `writeRemembered(id: number): void`; `clearRemembered(): void`.
- Produces (`useSteamSearch.ts`): `useSteamSearch(text: string, delayMs = 300): { results: SteamProfile[]; loading: boolean; error?: string; directId: number | null }` — `directId` = `accountId(text.trim())` or the numeric id from a `steamcommunity.com/profiles/<SteamID64>` URL; debounced; responses for older text are discarded.
- Landing (`/`, pre-rendered): `<h1>` pitch ("Deadlock stats, builds and counters" + one sentence), the search box labelled "Find your Steam account", results list (avatar, name) where each result links to `playerPath(id)` and remembers it on click, "Use this ID" when `directId` is set, empty-results line "No Deadlock players found with that name.", current S-tier hero cards (portrait, name, win rate) linking to hero pages, links to `/heroes` and `/items`. After hydration, if `readRemembered()` returns an id → `navigate(playerPath(id), { replace: true })`.
- Player (`/players/:accountId`, not pre-rendered): invalid id → message "That isn't a valid player ID." with a link home; valid → `ProfileView` with `ProfileHeader` (`subtitle` = "Deadlock profile", `actionLabel` = remembered id equals this id ? "Not you? Switch account" : "Find another player"); the action clears the remembered account if it is this id and navigates to `/`. A "This is me" button appears when the remembered id differs, and stores it. Title: `"<persona name or Player id> | Counterlock"` (client-side).

- [ ] **Step 1: Failing tests**
  - `remembered.test.ts`: write/read round trip; malformed JSON, `{accountId:"x"}`, `{accountId:-1}` → null; works when `localStorage` throws.
  - `home.spec.ts` (mock `steam-search`, `rank`, `match-history`, `steam`, analytics): typing "farg" shows a result with the fixture name after debounce; clicking it lands on `/players/400239835` and stores `{"accountId":400239835}`; revisiting `/` redirects to `/players/400239835`; "Not you? Switch account" returns to `/` and clears storage; malformed stored value `"{oops"` keeps the landing page (no redirect, no error); search API 500 shows an error line, empty result shows the no-players line; typing "fa" then "farg" where the "fa" response is delayed and arrives last → only "farg" results shown; pasting `76561198060265728` shows "Use this ID" linking to `/players/100000000`; `/players/abc` shows the invalid-ID message; reloading `/players/400239835` renders the profile (SPA fallback).
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npx vitest run tests/web`, `npm run test:web`, `npm run web:typecheck`, Overwolf checks → PASS.
- [ ] **Step 5: Commit** `feat(web): home landing, Steam search and player profiles`.

---

### Task 6: About page, sitemap, robots

**Files:**
- Modify: `web/app/routes/about.tsx`, `web/app/routes.ts`
- Create: `web/app/routes/sitemap.ts`, `web/app/routes/robots.ts` (resource routes: `loader` returns `new Response(sitemapXml(paths), { headers: { "Content-Type": "application/xml" } })` / text)
- Test: extend `tests/web-browser/prerender.spec.ts`, `tests/web-browser/shell.spec.ts`

**Interfaces:**
- Consumes: `sitemapXml`, `robotsTxt`, `routeToPath`, catalog, `PageMeta`.
- About copy covers (short paragraphs): what Counterlock is (also an Overwolf overlay app); data from Deadlock API, a community service, and game assets belonging to Valve; the remembered Steam account is stored only in this browser (`localStorage`) and cleared with "Switch account"; searches and player IDs are sent to Deadlock API to fetch public stats; no analytics, cookies or accounts; not affiliated with Valve.
- Sitemap paths: `/`, `/heroes`, `/items`, `/about`, every hero and item path (no player paths).
- If React Router cannot pre-render the resource routes, generate `sitemap.xml`/`robots.txt` in `postbuild.mjs` instead — same contents, same tests.

- [ ] **Step 1: Failing tests**: built `sitemap.xml` contains `<loc>https://counterlock.example/heroes/haze</loc>`, `/about`, and no `/players/`; its URL count = 4 + heroes + items; `robots.txt` contains `Sitemap: https://counterlock.example/sitemap.xml`; `/about` shows "not affiliated with Valve" and "localStorage" text and has title `About | Counterlock`; footer link "About" goes to `/about`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS (`npm run test:web`, `npm run web:typecheck`).
- [ ] **Step 5: Commit** `feat(web): about page, sitemap and robots`.

---

### Task 7: Phone widths

**Files:**
- Modify: `web/app/styles/web.css` (and new web-only partials under `web/app/styles/`)
- Test: `tests/web-browser/mobile.spec.ts`

**Interfaces:**
- Consumes: built site and fixtures from earlier specs.
- Rules: all overrides scoped under `.web` (never edit `src/**/*.css` for phone layout); nav collapses to a single row that fits 375px; hero detail header stacks (portrait above identity), ability cards and matchup/item sections become one column; item shop shows one category column at a time or stacks the three columns; profile tables scroll inside their own container.

- [ ] **Step 1: Failing tests** at viewport 375×812: for `/`, `/heroes`, `/heroes/haze`, `/items`, `/items/leech`, `/about` → `document.documentElement.scrollWidth <= 375`; nav links all visible; on `/players/400239835` (fixtures) page `scrollWidth <= 375` while the heroes-table container may scroll. Also assert at 1260px that `/heroes/haze` portrait and identity are side by side (no regression).
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm run test:web` PASS; `npm run test:browser` (Overwolf) unchanged PASS.
- [ ] **Step 5: Commit** `feat(web): phone layouts`.

---

### Task 8: Docs and full verification

**Files:**
- Modify: `README.md` (new "Website" section: scripts, `VITE_SITE_URL`, Cloudflare Pages settings — build command `npm run web:build`, output `web/build/client` — and the equivalent rewrite for other hosts; project map rows for `web/`), spec unchanged.

- [ ] **Step 1:** Write the README section.
- [ ] **Step 2:** Run `npm test`, `npx tsc --noEmit`, `npm run test:browser`, `npm run build`, `npm run validate:manifest`, `npm run web:typecheck`, `npm run web:build`, `npm run test:web` → all PASS.
- [ ] **Step 3:** (controller) Real-API smoke of the built site: home search, a profile, hero and item pages, a phone-width screenshot.
- [ ] **Step 4: Commit** `docs: describe the website`.
