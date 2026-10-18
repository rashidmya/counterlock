# Counterlock

An Overwolf Native overlay for team rosters, player ranks, hero win rates and games played, with recommended hero builds and counter-item suggestions. Built with React, TypeScript and Vite.

This is a working development prototype. The browser UI, API handling and simulated Overwolf integration are tested. **A real Windows/Overwolf/Deadlock session has not been tested in this Linux workspace.**

![Counterlock demo overlay](docs/preview.png)

## Try the browser preview

Requires Node.js 22.12+ or 24+.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The browser starts in a clearly labeled demo match; all player names, ranks and history in that mode are fictional. The **Player lookup** tab makes real requests using an exact SteamID64, account ID, or `[U:1:account]` ID. No API key is required by the endpoints used here.

The root preview redirects to `/desktop/desktop.html`. Open `/in_game/in_game.html` to preview the in-game entrypoint. Both use the same React UI.

## Load in Overwolf on Windows

1. Obtain an [Overwolf developer-whitelisted account](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/setting-up-dev-environment/), install Overwolf, and log in. Overwolf currently requires whitelisting for unpacked/unreleased apps.
2. Run `npm run build`, then copy the entire `dist/` folder to the Windows PC.
3. In Overwolf, open **Settings → About → Development options → Load unpacked extension**. Select the folder containing `manifest.json`, not the project root.
4. Launch Deadlock and enable its Overwolf overlay. The app targets Overwolf game ID **24482** and starts automatically with the game.
5. Use **Ctrl+Shift+S** to show or hide Counterlock's in-game window. The binding can be changed in Overwolf. Drag the app header to move the window. The gear button exposes compact rows, opacity and demo mode.

The window structure follows the [Overwolf TypeScript sample](https://github.com/overwolf/sample-app/tree/master/ts/src): `background` owns the shared live store and game-event subscription, `desktop` opens outside Deadlock, and `in_game` opens while Deadlock runs. The background closes the previous foreground window when switching. Each window has its own HTML and TypeScript entrypoint under `src/`; Vite preserves those window folders in `dist/`, and the manifest points to them.

For developer packaging and installation, see [Overwolf's unpacked app instructions](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/basic-sample-app/) and [OPK packaging reference](https://dev.overwolf.com/ow-native/reference/ow-sdk-introduction/).

For Overwolf development, load the built files. Avoid `debug_url` with this background-store bridge: Overwolf documents that `getMainWindow()` behaves differently in that mode.

## What it does

- Shows a recommended build above the roster, with **eight items per phase**: **early game 0–10 minutes**, **mid game 10–20 minutes**, and **late game 20+ minutes**. The current phase is highlighted from the match clock; exactly 10:00 switches to mid game and 20:00 switches to late game. The hero selector follows your hero by default and supports every catalog hero. Owned items are marked when viewing your hero, and the build can be collapsed.
- Uses the full in-game shop artwork for both builds and counter cards. All **173 item icons** are bundled locally, so item artwork works without the asset CDN.
- Identifies your team using the local roster entry; enemy detection waits until that identity is available. Team sizes are dynamic, including Street Brawl.
- Shows the latest recorded rank, **hero-specific** win rate and recorded games, plus live K/D/A. The API's hero history is filtered to the active game mode and ranked/unranked matches.
- Keeps missing IDs, unavailable stats, protected profiles and zero recorded games distinct. It never matches players by nickname or fills live gaps with demo data.
- Uses batched hero-stat and rank requests, a five-minute memory cache, timeouts and `Retry-After` cooldowns. Hero statistics can succeed while rank fails, and vice versa. Refresh respects the cache; it is not a cache-bypass button.
- Suggests counter items for a selected enemy or the whole opposing team. Profiles cover all **43 active heroes** in the catalog fetched on **2026-10-18**. Suggestions include reasons and affected heroes, respect an item-price budget, deduplicate items, and exclude your reported inventory.
- Offers manual threat adjustments for unusual enemy builds. Suggestions use hero profiles and those adjustments; enemy inventory does **not** automatically infer a build.

Rank comes from the latest recorded ranked match, not a live rank feed or a historical MMR estimate. API coverage can be incomplete; no row returned does not prove the player has never played that hero. Protected profiles are left unavailable. Overwolf may supply blank Steam IDs, and numeric SteamID64 values already rounded by an upstream parser cannot be recovered. Stringified numeric Steam IDs are preserved before parsing.

The counter engine is a transparent set of strategic heuristics, not a learned optimal build or a statistical claim that an item causes more wins. It does not calculate your build's damage, automatically buy items, or modify Deadlock's files. The budget is a **per-item price limit**, not a shopping-list total or your remaining souls.

The recommended build selects the most popular available items in each hero's Valve-generated phase data served by Deadlock API. It prioritizes affordable early items (up to 1,600 souls), mid-game items (1,600–3,200), and late items (3,200+), without duplicates across the path. Where a phase has fewer than eight picks, an affordable pick from another phase for the same hero fills the gap and is labeled **FLEX**; its tooltip retains the actual source phase. These are adaptable item suggestions, not a jointly optimized build or a mandatory purchase order. The requested minute bands control the display and active-phase highlighting; the upstream popularity groups do not expose exact purchase-time cutoffs. The source generation date is shown because it may precede the catalog refresh date.

## Maintain the catalog and rules

```sh
npm run catalog:refresh
```

This fetches active heroes, popular items, shop items and ranks from the current Deadlock API asset endpoints into `src/data/catalog.json`, then downloads the shop artwork into `public/items/`. Run `npm run assets:sync` to retry only the artwork download. Review `src/counters.ts` when a patch changes heroes or item effects. Coverage tests validate eight build picks per phase for the current catalog and counter advice for every active hero. Removed items are excluded automatically because recommendations resolve IDs against the current snapshot. Future heroes without profiles have a manual threat fallback in the UI.

Catalog metadata and item icons are bundled, while portraits, rank images and fonts load from their providers. Item icons use the local file first, then the source URL if it fails, then text. No backend, analytics or persistent player database is included. Public player IDs are sent to Deadlock API to retrieve statistics; lookups are cached only in memory. Production distribution should include the appropriate privacy notice and asset attribution.

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

| File                                  | Responsibility                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/background/`                     | Shared live store, game detection, feature registration, hotkeys and window lifecycle |
| `src/desktop/`, `src/in_game/`        | Separate foreground HTML and TypeScript entrypoints                                   |
| `src/consts.ts`                       | Shared game IDs, game features, window names and hotkey names                         |
| `src/store.ts`                        | Live state, subscriptions, debounced lookups and stale-result protection              |
| `src/game.ts`                         | Event parsing, Steam ID conversion, roster merging and team identity                  |
| `src/api.ts`                          | Batched player statistics, validation, caching and cooldowns                          |
| `src/counters.ts`                     | Hero threat profiles and explainable item rules                                       |
| `src/builds.ts`, `src/BuildPanel.tsx` | Phase recommendations, time windows, hero selection and owned-item indicators         |
| `src/ItemIcon.tsx`, `public/items/`   | Shared in-game shop artwork and image fallback                                        |
| `src/App.tsx`, `src/style.css`        | Shared React UI for desktop and in-game windows                                       |
| `src/data/catalog.json`               | Dated hero/item/rank metadata snapshot                                                |
| `public/manifest.json`                | Overwolf application configuration                                                    |

## Sources

- [Overwolf Deadlock events](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/deadlock/)
- [Overwolf events API](https://dev.overwolf.com/ow-native/reference/games/events/)
- [Overwolf manifest reference](https://dev.overwolf.com/ow-native/reference/manifest/manifest-json/)
- [Overwolf provider status and game IDs](https://game-events-status.overwolf.com/all_prod.json)
- [Deadlock API documentation](https://api.deadlock-api.com/docs) and [machine-readable schema](https://api.deadlock-api.com/openapi.json)
- [Active heroes](https://api.deadlock-api.com/v1/assets/heroes?only_active=true), [items](https://api.deadlock-api.com/v1/assets/items) and [rank metadata](https://api.deadlock-api.com/v1/assets/ranks)

Deadlock and its game assets belong to Valve. Deadlock API is a community service, not an official Valve API. This project is not affiliated with Valve or Overwolf.
