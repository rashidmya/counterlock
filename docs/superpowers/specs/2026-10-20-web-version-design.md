# Counterlock web version — design

Date: 2026-10-20
Status: draft for approval

## Intent

Counterlock's companion pages (Home profile, Heroes, Items) are useful
outside the game. The owner wants a **public website** version of the app,
**without the Live page**, that **people can find on Google and share**:
a hero or item link pasted into Discord should open the right page and show
a proper preview. The Overwolf app keeps working exactly as today.

Success: searching Google for e.g. "Haze build counters Deadlock" can land
on Counterlock's Haze page; a shared link shows the hero's name and art;
a visitor can find their own Steam account from Home and see their profile.

## Goals

- A static website built from this repo that reuses the existing React
  pages: Home (profile), Heroes (list + detail), Items (list + detail).
- Real, shareable URLs for every page.
- Search-engine friendly: every hero and item page (and the hero/item
  lists and home page) is pre-rendered to real HTML at build time with its
  own title, description and share preview.
- Home on the web lets visitors **search their own Steam account** (owner
  decision) and remembers it.
- No server: deployable as plain files to a static host.

## Non-goals

- No Live page, overlay windows, overlay settings, hotkey hint, game
  detection or anything from `src/platform/overwolf/` on the website.
- No Player lookup tab on the website (Home can open any player's profile).
  The Overwolf app keeps its Player lookup tab.
- No user accounts, "Sign in with Steam", backend, database or server-side
  API proxy. (A proxy would put every visitor behind one IP and hit the
  Deadlock API limits.)
- No pre-rendered player profiles (millions of players, stats change every
  match).
- No change to the Overwolf app's behaviour, windows, manifest or tests.

## Anti-goals

- Forking the page code into a second copy. Both apps must share one copy
  of the feature code so a fix lands in both.
- Fake or placeholder numbers in pre-rendered HTML. Pre-rendered pages
  contain only catalog facts; live statistics load in the browser.
- Breaking the Overwolf build or its HTML entry paths
  (`background/background.html`, `desktop/desktop.html`,
  `in_game/in_game.html`).
- Chips for hero tags (still an owner anti-goal).

## Decisions (how it gets made)

Owner decided:
- Public website, found on Google and shareable.
- Home: visitors search their own Steam account.

My calls (owner approved the playback):
- **Stack: React Router (current major, v8.x) in framework mode on Vite**, with
  `ssr: false` and `prerender` listing every static route. Docs:
  https://reactrouter.com/how-to/pre-rendering — "pre-renders all static
  routes for deployment to a static file server". Not Next.js: the app is
  already React + Vite; Next would mean restructuring and a second build
  system for server features we won't use.
- Same repo. The web app lives in a new top-level `web/` folder with its
  own config (`web/vite.config.ts`, `web/react-router.config.ts`,
  `web/app/…`) and imports feature code from `src/` via the existing `@/`
  alias. Builder may adjust folder names within that idea.
- Hosting target: **Cloudflare Pages** (my call). Output is a folder of
  static files. The only host-specific piece is the fallback for
  non-pre-rendered routes (`/players/:accountId`): ship a Cloudflare
  `_redirects` file that serves React Router's SPA fallback HTML (the file
  framework mode emits for non-pre-rendered paths when `ssr: false` +
  `prerender`) for `/players/*`, with status 200. README notes the
  equivalent rewrite for other hosts (Netlify uses the same `_redirects`
  format). `web:preview` and the browser tests must serve the same
  fallback so `/players/:id` is testable from the built output.
- Site name and look: same "Counterlock" brand, dark theme and styles as
  the app.

## Site map and URLs

| URL | Page | Pre-rendered |
|---|---|---|
| `/` | Home: landing + "Find your Steam account" search, or the remembered profile | yes (landing shell) |
| `/players/:accountId` | Player profile (Overview / Heroes / Performance) | no — renders in browser (SPA fallback) |
| `/heroes` | Hero list (tiers, role filter, sorts, rank filter) | yes |
| `/heroes/:slug` | Hero detail | yes, one per catalog hero |
| `/items` | Item shop browser | yes |
| `/items/:slug` | Item detail | yes, one per catalog item |
| `/about` | About, data sources and privacy | yes |
| `/sitemap.xml`, `/robots.txt` | generated at build | yes |

- Slugs: lowercase name, non-alphanumerics collapsed to `-`, trimmed
  (`Mo & Krill` → `mo-krill`, `The Doorman` → `the-doorman`,
  `Leech` → `leech`). Must be unique across the catalog — build fails if
  two collide. Unknown slug → a "not found" page (with links back), not a
  crash.
- Top navigation on the web: **Home · Heroes · Items**.
- Hero/item list state (role filter, sort, search) may live in the URL
  query (e.g. `/heroes?role=mystic&sort=winrate`) — builder's call; the
  rank filter is shared between Heroes and Items as in the app.
- Browser back/forward must work for every navigation, including
  hero → item → hero cross-links.

## Home on the web

- First visit (no remembered account): a landing page with
  - the search box "Find your Steam account": typing a name calls
    `GET /v1/players/steam-search?search_query=…` (verified working; returns
    `account_id`, `personaname`, `avatarmedium`, …) and lists matches with
    avatar and name; pasting a SteamID64 / account ID / `[U:1:n]` /
    Steam profile URL with a numeric ID also works (reuse `accountId()`
    parsing; resolving vanity `/id/name` URLs is not required);
  - a short pitch of what Counterlock shows, and links into the hero tier
    list and items (my call — gives Google real content on `/`);
  - the current S-tier heroes as cards (my call), loaded in the browser.
- Choosing an account navigates to `/players/:accountId` and remembers it
  as "me" in the browser (`localStorage`), so later visits to `/` open
  that profile directly, with a "Not you? Switch account" link.
- `/players/:accountId` shows the existing profile header and the
  Overview / Heroes / Performance subtabs for that account, whether or not
  it's the remembered one. Invalid IDs show a clear error.
- Search results only include accounts the Deadlock API knows; say so in
  one line if nothing is found.
- Debounce search input; respect the shared API client's cache/cooldown.

## Pre-rendering and SEO

- Pre-rendered HTML contains catalog facts only: hero name, role, tags line,
  tagline, card/background art, the four abilities with descriptions; item
  name, category, cost, stats, description, builds from/into. Live numbers
  (win rate, tiers, matchups, builds, item stats) load after hydration with
  the existing loading states.
- Per page: `<title>`, meta description, canonical URL, Open Graph and
  Twitter card tags. Hero pages use the hero card art as the preview image;
  item pages use the item's shop art. Example title: "Haze — build,
  counters & abilities | Counterlock".
- `sitemap.xml` lists `/`, `/heroes`, `/items`, every hero and item URL;
  `robots.txt` allows all and points to the sitemap.
- The absolute site URL (for canonical/OG/sitemap) is a single build-time
  setting (env var, e.g. `SITE_URL`), because the domain isn't chosen yet.
- Pre-rendering runs page components outside a browser: code that touches
  `window`, `localStorage`, `fetch` or Overwolf at render time must be
  guarded or moved into effects. The existing pages already load data in
  effects (`useAsync`); `useProfileAccount` and similar must not read
  storage during render on the server.

## Attribution and privacy (my call)

The README already says production distribution needs a privacy notice and
asset attribution, and the website stores a remembered account and sends
player IDs/search text to a third-party API. So:
- A site footer on every page: "Data from Deadlock API (community service).
  Deadlock and its game assets belong to Valve. Counterlock is not
  affiliated with Valve." with links to Deadlock API and `/about`.
- A pre-rendered `/about` page (in the sitemap): what Counterlock is; data
  sources; that the remembered Steam account is stored only in the
  visitor's browser (`localStorage`) and can be cleared with "Switch
  account"; that searches and player IDs are sent to Deadlock API to fetch
  public stats; no analytics, cookies or accounts.
- No cookie banner (no cookies or tracking are used).

## Phone widths (my call)

- Must be properly usable at ~375px (layouts stack, no horizontal page
  scroll, readable text, tappable controls): home landing + search, hero
  list, hero detail, item list, item detail, about.
- Player profile pages at phone width: nothing breaks and there is no page
  horizontal scroll; wide tables (heroes table, scoreboard) may scroll
  horizontally inside their own container.
- Web-only responsive overrides are scoped under the web shell (e.g. a
  `.web` root class or a web-only stylesheet) so the Overwolf app's look
  doesn't change.

## Shared code changes (both apps)

- Navigation: pages already move via a `navigate(route)` callback
  (`src/app/navigation.ts`). The web app supplies a `navigate` that maps
  routes to URLs (and hero/item IDs to slugs); the Overwolf app keeps its
  state-based navigation. Pages should render real links (`<a href>`) on
  the web where they navigate, so crawlers can follow them — e.g. a
  `linkTo(route)` alongside `navigate`, or a small `Link` component
  supplied by each app. Builder's choice of mechanism; the Overwolf app
  must keep working without a router.
- Asset paths: `ItemIcon` uses `../${item.localImage}` and the header uses
  `../icon.svg`; these break on nested web URLs. Make asset URLs resolve
  correctly in both apps (e.g. based on `import.meta.env.BASE_URL` or an
  absolute path for the web build). Item artwork stays bundled.
- Home's account source becomes pluggable: the Overwolf app keeps "last
  account detected on this PC + manual Steam ID"; the web app uses
  "search / remembered account / account from the URL".
- Overwolf-only UI (Live, overlay settings, hotkey, window buttons) stays in
  the Overwolf shell (`src/app/DesktopApp.tsx`); the web shell is new and
  doesn't import `src/platform/overwolf/*` or `features/live`, `overlay`,
  `match`, `roster`, `counters` UI (counters' heuristic data used by hero
  detail is fine).

## Constraints

- Keep existing conventions: feature folders, `@/` imports, strict TS with
  no unused code, styles composed centrally (web may have its own
  `index.css` that reuses the app's feature styles).
- Real game art everywhere it exists (as in the app).
- Deadlock API from the browser only, through the shared client
  (`src/shared/api/DeadlockApi.ts`), with its caching and cooldowns.
- New dependencies allowed: React Router v8 (`react-router`, `@react-router/dev`)
  (and the matching Vite plugin), nothing else unless clearly needed.
  Check current React Router docs (Context7 `/websites/reactrouter`) before
  implementing.
- Existing `npm test`, `npm run test:browser`, `npm run build`,
  `npm run validate:manifest` must keep passing. Add web scripts, e.g.
  `npm run web:dev`, `npm run web:build`, `npm run web:preview`.
- Desktop and mobile widths: the web pages must be usable down to phone
  width (~375px) since shared links get opened on phones. The Overwolf app's
  850px minimum doesn't apply to the website.

## Testing expectations

- Unit: slug generation (examples above, uniqueness), route ↔ URL mapping,
  sitemap contents, meta tag builders.
- Build check: `web:build` produces an HTML file per hero and item route
  containing the hero/item name in `<title>` and body, plus OG tags.
- Browser (Playwright against the built site with mocked API): landing
  search → pick account → `/players/:id` profile; remembered account on
  revisit; hero → item → back navigation; unknown slug page; no Live tab;
  a phone-width smoke check.

## Left to the builder

- Exact folder layout inside `web/`, route module names, how list filters
  map to query strings.
- The link mechanism shared by both apps, as long as the web emits real
  `<a href>` links and the Overwolf app needs no router.
- Responsive CSS details for phone widths.
- Search debounce timing and result count.
- Copy for the landing pitch (short, in the app's tone).

## Calls I made (for the owner to check)

- React Router (framework mode, pre-rendered, no server) on Vite rather
  than Next.js.
- Web app lives in `web/` in this repo and shares feature code with the app.
- URLs `/heroes/:slug`, `/items/:slug`, `/players/:accountId`.
- Player profiles aren't pre-rendered; hero/item pages are.
- Home landing shows a pitch, the Steam search and current S-tier heroes.
- No Player lookup tab on the website; top nav is Home · Heroes · Items.
- Domain is a build setting until you pick one.
- Hosting on Cloudflare Pages, with one `_redirects` file so profile links
  work; other hosts need the equivalent one-line rewrite (documented).
- A footer with Valve/Deadlock API attribution on every page, and an
  `/about` page covering data sources and privacy. No cookie banner,
  because no cookies or tracking are used.
- Phone widths: hero, item, home and about pages fully usable at phone
  width; profile pages just must not break (wide tables scroll sideways).
  Web-only styles, so the Overwolf app's look doesn't change.
