# Counterlock

An Overwolf Native app for team rosters, player ranks, hero win rates and games played, with recommended hero builds and counter-item suggestions. A desktop window adds companion pages: your profile and match history, a hero tier list with matchups, and an item browser. Built with React, TypeScript and Vite.

This is a working development prototype. The browser UI, API handling and simulated Overwolf integration are tested. **A real Windows/Overwolf/Deadlock session has not been tested in this Linux workspace.**

![Counterlock demo overlay](docs/preview.png)

## Try the browser preview

Requires Node.js 22.12+ or 24+.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The browser opens on **Home** with tabs for **Home · Live · Heroes · Items · Player lookup**. Without Overwolf, **Live** shows "Deadlock isn't running"; with Overwolf it shows "Waiting for a match" until live data arrives. Demo match data is confined to test fixtures. In the browser, Home asks for a Steam ID because there are no game events to detect your account. **Home**, **Heroes**, **Items** and **Player lookup** make real requests; lookup and Home accept an exact SteamID64, account ID, or `[U:1:account]` ID. No API key is required by the endpoints used here.

The root preview redirects to `/desktop/desktop.html`. Open `/in_game/in_game.html` to preview the in-game entrypoint. Without Overwolf, the in-game entrypoint also renders the full browser preview. In Overwolf, it resolves the native window name and mounts the compact build or counter overlay.

## Load in Overwolf on Windows

1. Obtain an [Overwolf developer-whitelisted account](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/setting-up-dev-environment/), install Overwolf, and log in. Overwolf currently requires whitelisting for unpacked/unreleased apps.
2. Run `npm run build`, then copy the entire `dist/` folder to the Windows PC.
3. In Overwolf, open **Settings → About → Development options → Load unpacked extension**. Select the folder containing `manifest.json`, not the project root.
4. Launch Deadlock and enable its Overwolf overlay. The app targets Overwolf game ID **24482** and starts automatically with the game.
5. Use **Ctrl+Shift+S** to show or hide Counterlock's in-game window. The binding can be changed in Overwolf. Drag the app header to move the window. The gear button exposes overlay visibility and opacity while Deadlock is running; desktop rows remain compact.

Home's account comes from Deadlock game events: the `background` window stores the last account it detects on this PC in `localStorage` under `counterlock.profile.account`, and Home shows that profile. If none has been detected, enter a Steam ID manually; it is stored the same way, and the next account detected in-game replaces it. **Change** clears the stored account. It never leaves this PC except as a public ID in API requests.

The `background` window owns the shared live store, game-event subscriptions, feature registration, hotkeys, and overlay lifecycle. The `desktop` window stays independent of overlay visibility. The `in_game` and `counter_overlay` windows both use `in_game/in_game.html`, resolving their native window identity at mount time to render the appropriate compact panel. Each declared HTML path remains stable in `dist/` and in the manifest. Foreground windows subscribe to the background store through `getMainWindow()`; they do not create their own live stores.

For developer packaging and installation, see [Overwolf's unpacked app instructions](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/basic-sample-app/) and [OPK packaging reference](https://dev.overwolf.com/ow-native/reference/ow-sdk-introduction/).

For Overwolf development, load the built files. Avoid `debug_url` with this background-store bridge: Overwolf documents that `getMainWindow()` behaves differently in that mode.

## What it does

**Companion pages** (desktop window):

- **Live** shows the current match roster, builds and counters, or a "Deadlock isn't running" / "Waiting for a match" state. The app opens on Live when Deadlock is detected running (unless you have already picked a tab); otherwise it opens on Home. It also switches to Live once per match when live data first arrives.
- **Home** shows the profile of the last account detected on this PC: rank badge, ranked games, KDA, souls per minute, top heroes, frequent teammates and a filterable match history. Click a match for its scoreboard. Further tabs list played heroes and show performance charts.
- **Heroes** lists heroes with tiers derived from win-rate percentiles, a role filter, sorting and a rank filter. A hero page shows abilities, skill order, a build, matchups, best partners and best items, with counter items listed separately. Counter items use measured data (an item's win rate against the hero compared with its overall win rate, adjusted for the hero's overall win rate) and fall back to hero-trait heuristics, labelled "Based on hero traits", when there is not enough data.
- **Items** is a shop-style browser with search, filtering and sorting. An item page shows its stats and what it builds from and into.

**Live match overlays and roster:**

- Shows a community build for the selected hero, with recorded win rate and match count. The hero selector follows your hero by default; owned items are marked and the desktop build can be collapsed. Compact build overlays follow the local hero and provide a group selector. Build statistics are unavailable in Street Brawl.
- Uses the full in-game shop artwork for both builds and counter cards. All **173 item icons** are bundled locally, so item artwork works without the asset CDN.
- Identifies your team using the local roster entry; enemy detection waits until that identity is available. Team sizes are dynamic, including Street Brawl.
- Shows the latest recorded rank, **hero-specific** win rate and recorded games, plus live K/D/A. The API's hero history is filtered to the active game mode and ranked/unranked matches.
- Keeps missing IDs, unavailable stats, protected profiles and zero recorded games distinct. It never matches players by nickname or fills live gaps with demo data.
- Uses batched hero-stat and rank requests, a five-minute memory cache, timeouts and `Retry-After` cooldowns. Hero statistics can succeed while rank fails, and vice versa. Refresh respects the cache; it is not a cache-bypass button.
- Suggests counter items for a selected enemy or the whole opposing team. Profiles cover all **43 active heroes** in the catalog fetched on **2026-10-18**. Suggestions include reasons and affected heroes, respect an item-price budget, deduplicate items, and exclude your reported inventory.
- Offers manual threat adjustments for unusual enemy builds. Suggestions use hero profiles and those adjustments; enemy inventory does **not** automatically infer a build.

Rank comes from the latest recorded ranked match, not a live rank feed or a historical MMR estimate. API coverage can be incomplete; no row returned does not prove the player has never played that hero. Protected profiles are left unavailable. Overwolf may supply blank Steam IDs, and numeric SteamID64 values already rounded by an upstream parser cannot be recovered. Stringified numeric Steam IDs are preserved before parsing.

The counter engine is a transparent set of strategic heuristics, not a learned optimal build or a statistical claim that an item causes more wins. It does not calculate your build's damage, automatically buy items, or modify Deadlock's files. The budget is a **per-item price limit**, not a shopping-list total or your remaining souls.

The displayed community build is selected by recorded match count among builds with at least 20 matches in the API's aggregate bucket. Its win rate is measured over the last 30 days of ranked and unranked matches and can span multiple build versions. Item groups come from the selected community build. These are adaptable suggestions, not a mandatory purchase order or a claim that the build causes more wins.

The separate catalog phase-recommendation utility remains available under `features/builds/utils/recommendations.ts`, with coverage for eight distinct picks per phase and match-clock boundaries. It is not the source of the current community-build UI.

Home and the hero and item pages use Deadlock API aggregates, so figures reflect community data for the filters shown, not a complete record. Hero tiers are relative to the current win-rate distribution, not an official ranking. Each hero detail view makes several analytics requests and the Deadlock API limits analytics to 200 requests per minute per IP, so very rapid browsing can hit the cooldown.

## Maintain the catalog and rules

```sh
npm run catalog:refresh
```

This fetches active heroes (with roles and abilities), popular items, shop items (with tiers and stats) and ranks from the current Deadlock API asset endpoints into `src/shared/catalog/catalog.json`, then downloads the shop artwork into `public/items/`. Run `npm run assets:sync` to retry only the artwork download. Review `src/features/counters/utils/recommendations.ts` when a patch changes heroes or item effects. Coverage tests validate eight build picks per phase for the current catalog and counter advice for every active hero. Removed items are excluded automatically because recommendations resolve IDs against the current snapshot. Future heroes without profiles have a manual threat fallback in the UI.

Catalog metadata and item icons are bundled, while portraits, rank images and fonts load from their providers. Item icons use the local file first, then the source URL if it fails, then text. No backend, analytics or persistent player database is included. Public player IDs are sent to Deadlock API to retrieve statistics. API responses are cached only in memory. Home also remembers the last account ID on this PC in `localStorage` under `counterlock.profile.account`, alongside the existing overlay preferences. Production distribution should include the appropriate privacy notice and asset attribution.

## Validation

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run validate:manifest
```

The manifest validator downloads Overwolf's official JSON schema and checks the built entrypoints and icons. Browser tests use controlled API responses and a simulated Overwolf bridge; they do not establish in-game compatibility. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an already installed Chromium binary.

Before a public release, test in Windows with a live match: game startup and shutdown, joining an existing match, both team assignments, Street Brawl, blank IDs, hero changes, consecutive matches, window drag/resize/hide, changed hotkey bindings, a provider outage, and API throttling. Follow Overwolf's developer review and distribution process before publishing.

## Project map

| Directory                                         | Responsibility                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app/`                                        | React window composition and mounting; global, shell, and responsive layout styles                 |
| `src/features/live/`                              | Live tab states (not running, waiting, in match) and once-per-match auto-switch                    |
| `src/features/profile/`                           | Home profile: account storage, Deadlock API services, overview, history, heroes, charts            |
| `src/features/heroes/`                            | Hero tier list, analytics derivations and services, hero detail                                    |
| `src/features/items/`                             | Item shop browser and item detail                                                                  |
| `src/features/match/`                             | Live match types, event parsing, identity, shared store, match overview                            |
| `src/features/roster/`                            | Team tables, player rows, roster and inventory styles                                              |
| `src/features/player-stats/`                      | Batched statistics client, cache/cooldowns, response types, win-rate utility                       |
| `src/features/player-lookup/`                     | Lookup form and request state                                                                      |
| `src/features/builds/`                            | Desktop/compact builds, shared request hook, build analytics, phase recommendations, styles        |
| `src/features/counters/`                          | Counter rules, threat types, selection state, desktop/compact panels, styles                       |
| `src/features/overlay/`                           | Visibility preferences, persisted keys, settings UI, overlay styles                                |
| `src/platform/overwolf/`                          | Background lifecycle, store bridge, game detection, window controls and native window hooks        |
| `src/shared/api/`                                 | Shared cached Deadlock API client and async request hook                                           |
| `src/shared/catalog/`                             | Typed catalog access (heroes, roles, abilities, items), metadata types and the dated JSON snapshot |
| `src/shared/ui/`                                  | Reusable icons, images, item artwork and overlay item tiles                                        |
| `src/background/`, `src/desktop/`, `src/in_game/` | Stable HTML and minimal TypeScript entrypoints used by the manifest                                |
| `tests/`                                          | Unit suites grouped by feature, browser integration tests, and demo fixtures                       |
| `public/`                                         | Manifest, app icons and bundled item artwork                                                       |

Use `@/` imports across feature boundaries and relative imports within a feature. The alias is configured consistently in TypeScript, Vite and Vitest. Types belong to the feature that owns them; shared code must not depend on app composition. Keep Overwolf lifecycle operations in the platform layer and leave game parsing and recommendation calculations independent of React.

The app shell owns lookup and counter hook lifetimes so switching tabs preserves their state. Build requests share timeout, abort and stale-response handling while retaining each presentation's error messages. The background remains the only live-store owner. Existing `scout.overlay.*` keys and native window names are compatibility contracts.

Feature styles are composed centrally by `src/app/styles/index.css`. Its import order preserves the original cascade, including responsive and compact overrides; keep that order deliberate when adding styles. There are no new runtime dependencies. Type checking rejects unused imports and parameters.

## API endpoints

Live player statistics and community builds use `/v1/players/hero-stats`, `/v1/players/rank`, `/v1/analytics/hero-build-stats` and `/v1/builds`, and the catalog uses `/v1/assets/*`. The companion pages add these routes, all fetched through the shared client in `src/shared/api`:

- `/v1/players/steam`, `/v1/players/rank`, `/v1/players/hero-stats`
- `/v1/players/{id}/match-history` and `/v1/players/{id}/mate-stats`
- `/v1/matches/{id}/metadata`
- `/v1/analytics/hero-stats`, `hero-counter-stats`, `hero-synergy-stats`, `ability-order-stats` and `item-stats`

The client caches in memory (two to ten minutes depending on the data), times out after 15 seconds, shares in-flight requests and honours `Retry-After` cooldowns.

## Sources

- [Overwolf Deadlock events](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/deadlock/)
- [Overwolf events API](https://dev.overwolf.com/ow-native/reference/games/events/)
- [Overwolf manifest reference](https://dev.overwolf.com/ow-native/reference/manifest/manifest-json/)
- [Overwolf provider status and game IDs](https://game-events-status.overwolf.com/all_prod.json)
- [Deadlock API documentation](https://api.deadlock-api.com/docs) and [machine-readable schema](https://api.deadlock-api.com/openapi.json)
- [Active heroes](https://api.deadlock-api.com/v1/assets/heroes?only_active=true), [items](https://api.deadlock-api.com/v1/assets/items) and [rank metadata](https://api.deadlock-api.com/v1/assets/ranks)

Deadlock and its game assets belong to Valve. Deadlock API is a community service, not an official Valve API. This project is not affiliated with Valve or Overwolf.

## Product source and Underwolf packaging

The source now owns the features previously injected by Underwolf's Scout adapter:
independent compact build/counter overlays, game-only overlay preferences and
opacity, purchased-item rows, hero/team identity, live match-clock display, and
community-build statistics. The desktop remains independent of overlay visibility;
production has no demo-match or compact-layout switches. Existing `scout.overlay.*`
preference keys are retained so saved choices and positions remain compatible.

`npm run build` builds these features directly for native Overwolf using the shared
background store. `npm test` covers game state, overlay lifecycle, hero identity,
and build analytics; `npm run test:browser` covers production browser rendering.
The Underwolf integration test remains in the host repository and accepts
`SCOUT_OPK` to select a package.

For Linux packaging, the source adapter in the Underwolf/Underlock host repository must use the new module paths. An adapter that patches `src/App.tsx` is incompatible with this layout. Update its targets as follows before running it:

- Replace the native-store expression in `src/platform/overwolf/store-bridge.ts` rather than `src/App.tsx`.
- Import the generated message bridge with `@/underwolf-bridge`.
- In that generated bridge, import `initialState` from `@/features/match/utils/game` and the store/state types from `@/features/match/types`.
- Append the background publisher to `src/platform/overwolf/background.ts`, where `store` and `kWindowNames` are in scope, rather than the thin HTML entrypoint module.

The host adapter and its integration test live in a separate repository and are not modified here. The old hash-pinned binary patcher remains archived under `scripts/legacy-underwolf/`; it is not used by the native build.
