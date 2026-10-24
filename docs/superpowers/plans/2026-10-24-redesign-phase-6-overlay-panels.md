# Redesign phase 6 — overlay panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the owner chooses that method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two build/counter overlays with five independently movable panels: Hero damage, Objective damage, Healing, You vs. average, and Spawn timers.

**Architecture:** The background remains the sole owner of `LiveStore`, GEP subscriptions, hotkeys and native window lifecycle. Five declared windows share the existing `in_game/in_game.html` entrypoint and select their panel by native window identity. Pure helpers derive meters, comparisons and schedules from the shared snapshot; only the comparison window loads a rank curve, through the existing API client.

**Tech Stack:** Existing React 19, TypeScript 7, Vite 8, Overwolf Native SDK, plain CSS, Vitest 5 and Playwright 1.64. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md`, especially “In-game overlays”, “Constraints”, “Non-goals” and delivery phase 6. Starting revision: `0447326`.

**Status:** Implemented on 2026-10-24 with the approved availability qualifications below. Automated verification passed; native Windows validation remains outstanding.

## Global Constraints

- Live gameplay comes only from Overwolf GEP. No memory reading, OCR, spectator broadcast or replay queries.
- Preserve the background-store bridge and shared app/website feature code.
- Keep builds and counters on the desktop Live page and hero pages.
- “no fake or demo data in production”; fixtures belong under `tests/`.
- “never match players by nickname”; use native `is_local`, slots and exact account identities.
- Use the existing noir tokens, real hero portraits and Rajdhani labels/numbers.
- New windows are individually movable and enabled independently; the shared show/hide hotkey and opacity preference remain.
- Positions persist between sessions. Preserve `scout.overlay.opacity` and the `scout.overlay.position.*` / `scout.overlay.*` key conventions. Old build/counter enablement does not opt a user into a new panel.
- Desktop default 1260×900, minimum 850×650; website phone layouts remain supported. Requires Node.js 22.22+.
- Analytics share 200 requests/minute per IP. Use `deadlockApi`, its cache, abort handling and shared rate budget.
- TypeScript rejects unused locals and parameters. Before each implementation commit run `npm test`, `npx tsc --noEmit`, and `npm run web:typecheck`.
- Plain conventional commits without attribution trailers. Format touched files with Prettier; preserve the existing design document's formatting.

## Evidence and proposed availability decisions

Checked on 2026-10-24 before writing this plan:

1. **GEP fields exist; parsing discards them today.** The [Overwolf Deadlock reference](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/deadlock/) lists roster damage, healing, souls and level. It documents `match_clock` strings and boolean `game_paused` events in normal Deadlock mode. Extend the parser rather than creating another live source. The reference does not establish whether `souls` is total net worth or unspent currency. A native session must settle that before dividing it by time and comparing it with net worth.
2. **Two requested averages are absent.** Context7 was consulted for the Deadlock API; its retrieved snippets did not describe this endpoint, so the [live OpenAPI schema](https://api.deadlock-api.com/openapi.json) and an actual `GET /v1/analytics/player-performance-curve?hero_ids=7&resolution=0` response were inspected. Both have net worth and separate kill/death/assist averages, but no level or team-kill/kill-participation average. The sampled response had 24 points, from 180 to 6600 seconds. Those are observations, not constants to hardcode.
3. **A fixed Soul Urn schedule is confirmed.** Valve's [2026-06-30 update](https://store.steampowered.com/news/app/1422450/view/688635449342692003), also linked by the [official forum thread](https://forums.playdeadlock.com/threads/06-30-2026-update.146261/), restores the Urn to 10:00 and every five minutes thereafter. The announcement's full content was checked through [Steam's news API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1422450&count=100&maxlength=0), including subsequent official updates returned by that feed. The same June update makes the Unstable Rift start variable by ±1 minute. Do not treat the Rift, camp deaths or Mid Boss respawns as fixed schedules. No current primary evidence for another repeating schedule was established during this pass.
4. **Native window limits and movement are documented.** Context7 supplied [window declarations](https://dev.overwolf.com/ow-native/guides/dev-tools/windows/using-overwolf-windows/), [window operations](https://dev.overwolf.com/ow-native/reference/windows/ow-windows/) and [coordinate/DPI guidance](https://dev.overwolf.com/ow-native/guides/dev-tools/windows/windows-resolution-size-and-position/). Names must fit 20 characters. `dragMove` completes through its callback; persist the coordinates returned by `getCurrentWindow`, without adding another DPI conversion.

Proposed behavior for the fourth panel:

| Row                | Live value                                                         | Comparison                                                                                                         |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Souls / min        | `—` until a native session establishes compatible souls semantics  | No delta until that evidence is recorded; explanation: “Souls / min needs verified total souls.”                   |
| K / D / A          | The three GEP counts                                               | Compare each count with its interpolated curve count. Fewer deaths is favorable. This is not an average KDA ratio. |
| Level              | GEP level, or `—`                                                  | “Average unavailable”; no arrow                                                                                    |
| Kill participation | `(kills + assists) / sum(team kills)`, or `—` when incomplete/zero | “Average unavailable”; no invented team denominator                                                                |

These limitations are proposed changes to the intended four complete comparisons. Retain all four rows so the data gaps are explicit. If the owner requires every average or Souls / min at launch, a native capture and a supported additional benchmark source are prerequisites; do not mark that requirement complete with placeholders.

For Soul Urn, show time to the next **scheduled spawn**, never a claim that it is currently present. Start with that one confirmed rule. Add another rule only after recording current primary evidence. Keep timing rules and their source/date together in code.

## Review Focus

1. **Partial telemetry and reused slots:** an absent value is not zero; a new account or hero never inherits another player's measurements. Task 1 tests both.
2. **Missing local identity, incomplete teams and sparse curves:** show unavailable values without false enemy colors, percentages or extrapolated averages. Tasks 2 and 4 test these inputs.
3. **Game exit, disabling a panel and rapid hotkeys during pending native callbacks:** no obsolete callback reopens a panel; every enabled window follows one group visibility decision. Task 3 tests delayed callbacks.
4. **Pauses, pregame/invalid clocks, late joining and Street Brawl:** no countdown advances independently of GEP or uses normal-mode schedules in Brawl. Tasks 2 and 4 test clock discontinuities and paused snapshots.
5. **Small windows, external preference changes and failed analytics:** all players and controls stay reachable, text stays opaque, retries preserve focus and the three meters keep working. Tasks 3–5 cover these cases.

## File structure

| File                                                                                                     | Responsibility                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/features/match/types.ts`, `utils/game.ts`                                                           | Nullable roster telemetry and pause state, merged from GEP             |
| `src/features/overlay/panels.ts` (new)                                                                   | Five panel IDs, titles, window names, dimensions and initial positions |
| `src/features/overlay/utils/meters.ts` (new)                                                             | Clock parsing, sorted meter rows and honest local comparisons          |
| `src/features/overlay/utils/spawn-timers.ts` (new)                                                       | Confirmed schedule definitions and pure countdowns                     |
| `src/features/overlay/hooks/useOverlayBenchmark.ts` (new)                                                | Rank readiness, one curve load per context, cancellation and retry     |
| `src/features/overlay/components/DamageMeter.tsx` (new)                                                  | Shared presentation for damage/healing meters                          |
| `src/features/overlay/components/AveragePanel.tsx` (new)                                                 | Four comparison rows and benchmark states                              |
| `src/features/overlay/components/SpawnTimers.tsx` (new)                                                  | GEP-clock-driven scheduled spawn display                               |
| `src/features/overlay/components/OverlaySettings.tsx`, `preferences.ts`, `hooks/useOverlayPreference.ts` | Five switches and existing shared opacity                              |
| `src/app/OverlayApp.tsx`, `mountApp.tsx`, `DesktopApp.tsx`                                               | Window dispatch, shared shell and desktop settings integration         |
| `src/platform/overwolf/background.ts`, `constants.ts`, `hooks/useOverlayWindow.ts`                       | Events, group visibility, native identity and position persistence     |
| `public/manifest.json`, `src/in_game/in_game.ts`, overlay CSS                                            | Five windows using the stable HTML entrypoint, compact noir styling    |

## Task 1: Retain live telemetry without manufacturing zeroes

**Files:** Modify `src/features/match/types.ts`, `src/features/match/utils/game.ts`, `src/platform/overwolf/background.ts`, `src/features/roster/components/PlayerRow.tsx`, `tests/match/game.test.ts`, `tests/platform/background.test.ts`, `tests/fixtures/demo.ts`, `tests/profile/storage.test.ts`, and `tests/browser/helpers.ts`.

**Interfaces:** `Player` gains required nullable numeric `heroDamage`, `objectiveDamage`, `healing`, `souls`, and `level`. Existing `kills`, `deaths`, and `assists` become `number | null`. `MatchState` gains `paused: boolean | null`, initially `null`. Existing `applyInfo(state, payload): MatchState` remains the information parser. All fixtures explicitly supply the new fields; `PlayerRow` prints `—` for missing K/D/A.

- [x] **Step 1: Add failing parser and background tests.** Assert that `hero_damage: 1200`, `object_damage: 300`, `hero_healing: 0`, `souls: 741`, `level: 3`, and `assist: 2` reach the matching camel-case fields; real zero stays zero. An omitted field retains its prior value; explicit null, an empty string, booleans, nonnumeric strings, negative values and nonfinite numbers become null. Accept nonempty numeric strings. Exercise both complete info and individual key/data messages, including existing trailing-space behavior.

  ```ts
  const state = applyInfo(initialState(), {
    match_info: {
      roster_0: { hero_id: 7, hero_damage: 1200, hero_healing: 0 },
    },
  });
  expect(state.players[0]).toMatchObject({
    heroDamage: 1200,
    healing: 0,
    objectiveDamage: null,
    kills: null,
  });
  ```

- [x] **Step 2: Add identity/event assertions.** A changed positive account ID, changed hero, deleted/reintroduced slot, new match ID or new lobby cannot retain old telemetry; same-player partial rows can. A newly supplied account ID on a previously anonymous slot must not erase the matching hero's already received telemetry. Boolean and stringified-boolean pause/resume events set `paused`; unrelated/malformed events do not. Invalid `match_clock` events cannot replace the last valid clock. Match start resets clock/pause; match end marks PostGame and clears pause. Starting after PostGame clears the old match's telemetry even if its ID has not arrived; a start event in an already populated current lobby preserves that lobby's roster. Game exit resets everything.
- [x] **Step 3: Verify failure.** Run `npx vitest run tests/match/game.test.ts tests/platform/background.test.ts`. New assertions must fail for missing telemetry/pause handling rather than unrelated setup.
- [x] **Step 4: Implement the nullable fields and merge rules.** Validate field presence separately from value. Do not reuse `Number(null)` or `integer(..., 0)` for telemetry. Reset only telemetry belonging to a replaced identity; preserve the existing inventory, exact Steam ID, local-account and statistics-abort behavior. Keep new-event handling in the background and call `store.patch` with validated updates; do not add foreground subscriptions to GEP.
- [x] **Step 5: Verify and commit.** Run the targeted tests and the three global checks. Commit `feat(overlay): retain live damage healing and pause telemetry`.

## Task 2: Derive meters, comparison rows and scheduled spawns

**Files:** Create `src/features/overlay/utils/meters.ts`, `src/features/overlay/utils/spawn-timers.ts`, `tests/overlay/meters.test.ts`, and `tests/overlay/spawn-timers.test.ts`.

**Interfaces:**

- `MeterMetric = "heroDamage" | "objectiveDamage" | "healing"`.
- `meterRows(players: Player[], metric: MeterMetric): MeterRow[]`, where each row has `player: Player`, `value: number | null`, `fraction: number`, and `tone: "local" | "ally" | "enemy" | "unknown"`.
- `clockSeconds(clock: string): number | null`: nonnegative `M:SS`/`MM:SS`/longer-minute clocks; `—`, malformed clocks and pregame negatives produce null.
- `localComparison(state: MatchState, curve: RankCurve | null): LiveComparison | null`; null when no unique local player exists. `LiveComparison` has `soulsPerMinute: null`, `level: number | null`, `killParticipation: number | null` (fraction from 0 to 1), and `kda: { kills: CountComparison; deaths: CountComparison; assists: CountComparison }`. `CountComparison = { value: number | null; average: number | null; delta: number | null; favorable: boolean | null }`; delta is `value - average`, and favorable is null for missing data or equality.
- `SPAWN_RULES`: readonly `{ id: "soul-urn", label: "Soul Urn", firstS: 600, intervalS: 300, source: string, checkedOn: "2026-10-24" }[]`.
- `scheduledSpawns(state: MatchState): { id: string; label: string; atS: number; remainingS: number }[]`; empty for invalid/pregame clocks, Init, lobby, PostGame, or Street Brawl. Use only `state.clock`, never elapsed wall time.

- [x] **Step 1: Write failing helper tests.** Meter rows sort descending, unknowns last, stable ties by numeric slot; all 12 players remain present. For values 100/50/0/null, fractions are 1/0.5/0/0. An all-zero meter has no NaN widths. Only teams 2 and 3 with a unique local player establish ally/enemy; otherwise use neutral tones. Local is gold regardless of rank/account availability.
- [x] **Step 2: Write comparison/schedule assertions.** No unique local player returns null. At a time halfway between curve points, each K/D/A average is independently interpolated using existing `averageAt` and `metricById`; fewer deaths is favorable. No arrows for missing fields, no extrapolation past the last usable point, no percentage division by zero, and no level/KP average. Compute KP only with six known same-team kill counts in normal mode, or four in Brawl, a known numerator, valid team 2/3 and a positive denominator; otherwise null. Clamp a temporarily inconsistent numerator to 100%. Souls / min stays null regardless of raw souls.

  ```ts
  expect(
    scheduledSpawns({
      ...initialState(),
      phase: "GameInProgress",
      clock: "10:01",
    }),
  ).toMatchObject([{ id: "soul-urn", atS: 900, remainingS: 299 }]);
  // Additional normal, in-progress snapshots:
  // clock       next atS   remainingS
  // 09:59       600        1
  // 10:00       600        0
  // 10:01       900        299
  // 27:00       1800       180
  // Pausing at 09:59 and advancing wall time leaves remainingS at 1.
  // Resuming with a GEP jump to 10:20 yields 280, without replaying 10:00.
  ```

- [x] **Step 3: Verify failure.** Run `npx vitest run tests/overlay/meters.test.ts tests/overlay/spawn-timers.test.ts`; missing helpers must fail.
- [x] **Step 4: Implement the pure helpers.** Reuse the shared rank interpolation and metric definitions. Keep schedule arithmetic separate from rendering. The Urn's exact boundary is “Scheduled now”; one second later select the next scheduled spawn. None of these helpers sends a request or installs a timer.
- [x] **Step 5: Verify and commit.** Run the targeted tests and global checks. Commit `feat(overlay): derive live meters comparisons and spawn schedules`.

## Task 3: Declare five panels and make their visibility act as a group

**Files:** Create `src/features/overlay/panels.ts`, `tests/overlay/panels.test.ts`, and `tests/overlay/preferences.test.ts`. Modify `public/manifest.json`, `src/platform/overwolf/constants.ts`, `src/platform/overwolf/background.ts`, `src/platform/overwolf/hooks/useOverlayWindow.ts`, `src/features/overlay/preferences.ts`, `src/features/overlay/hooks/useOverlayPreference.ts`, and `tests/platform/background.test.ts`.

**Interfaces:** `OVERLAY_PANELS` is a readonly array of `{ id, windowName, title, width, height, minWidth, minHeight, left, top }`; IDs also serve as the suffix for `overlayPreferenceKey`. Export `OverlayPanelId`, `OverlayWindowName`, and `panelForWindow(name: string)` returning the entry or undefined. `kWindowNames` exposes desktop/background plus `heroDamage`, `objectiveDamage`, `healing`, `youVsAverage`, and `spawnTimers`, mapped to the names below. Retain its old `inGame`/`counters` properties and their union members temporarily so the existing shell still typechecks between tasks; remove them in Task 5 after their consumers are replaced. The final `ForegroundWindowName` is desktop or `OverlayWindowName`.

| ID                 | Window name        | Title            | Default size | Minimum size | Left, top |
| ------------------ | ------------------ | ---------------- | ------------ | ------------ | --------- |
| `hero-damage`      | `hero_damage`      | Hero damage      | 264×400      | 240×240      | 16, 80    |
| `objective-damage` | `objective_damage` | Objective damage | 264×400      | 240×240      | 292, 80   |
| `healing`          | `healing`          | Healing          | 264×400      | 240×240      | 568, 80   |
| `you-vs-average`   | `you_vs_average`   | You vs. average  | 280×256      | 240×240      | 844, 80   |
| `spawn-timers`     | `spawn_timers`     | Spawn timers     | 280×176      | 240×136      | 844, 348  |

All five start disabled when their keys are absent. Declare exactly these five in-game windows, sharing `in_game/in_game.html`, alongside background/desktop. Preserve the existing transparent/resizable/in-game-only, taskbar, and `ReleaseOnHidden` hotkey configuration; remove the two old native declarations. Keep the HTML output path stable.

- [x] **Step 1: Add failing registry/preference tests.** Manifest and registry have the same five names, titles have unique preference IDs, sizes/positions agree, and every name is at most 20 characters. Missing or malformed stored preferences mean disabled. The old `recommended-build` and `counter-items` keys enable none of the new panels. Opacity remains clamped to 35–100, default 96.

  ```ts
  expect(OVERLAY_PANELS.map((panel) => panel.windowName)).toEqual([
    "hero_damage",
    "objective_damage",
    "healing",
    "you_vs_average",
    "spawn_timers",
  ]);
  expect(panelForWindow("counter_overlay")).toBeUndefined();
  ```

- [x] **Step 2: Extend failing background lifecycle tests.** Enable at least three panels and independently disable one. A shared hotkey hides all enabled panels together, then restores all together, even if simulated native states disagree. Rapid two-keypresses and delayed obtain callbacks converge on the latest group decision. Game exit or preference changes invalidate pending restores. Manual app launches leave group visibility alone and open desktop. Clearing storage closes all panels. Existing feature-registration and late-startup-query tests still pass.
- [x] **Step 3: Verify failure.** Run `npx vitest run tests/overlay/panels.test.ts tests/overlay/preferences.test.ts tests/platform/background.test.ts`.
- [x] **Step 4: Implement registry, declarations and group lifecycle.** Use one background `overlaysShown` flag, initially true for each game session. A hotkey flips it once, rather than individually inverting native window states. Preference sync respects that flag; disabled panels close, enabled/hidden panels stay hidden. Build revision tracking from the declared names. Storage reads must not crash lifecycle handling if unavailable. Do not reinterpret old positions as positions of unrelated panels.
- [x] **Step 5: Preserve positions and opacity.** Keep `useOverlayWindow(name)`'s `opacity`, `id`, and `save` interface. Accept finite integer saved coordinates, including negative monitor coordinates; ignore corrupt JSON. Catch storage failures. Save on drag completion and before disabling. Every panel reads the shared opacity, including cross-window updates. Browser assertions for restore/save belong in Task 4, where the shell is mounted.
- [x] **Step 6: Verify and commit.** Run targeted tests and global checks. Commit `feat(overlay): manage five independent windows with one visibility toggle`.

## Task 4: Render the five panels and comparison loading states

**Files:** Create `src/features/overlay/components/DamageMeter.tsx`, `src/features/overlay/components/AveragePanel.tsx`, `src/features/overlay/components/SpawnTimers.tsx`, `src/features/overlay/hooks/useOverlayBenchmark.ts`, and `tests/browser/overlay-panels.spec.ts`. Modify `src/app/OverlayApp.tsx`, `src/app/mountApp.tsx`, `src/in_game/in_game.ts`, `src/features/overlay/styles/panels.css`, and `tests/browser/helpers.ts`.

**Interfaces:** `DamageMeter({ state, catalog, metric })`, `AveragePanel({ state })`, and `SpawnTimers({ state })` consume the shared snapshot. `useOverlayBenchmark(state: MatchState): AsyncState<RankCurve>` loads only for an active normal match and a unique local hero. Reuse `useAsync`, `fetchRankCurve`, `RetryButton` and the stable panel heading.

The benchmark context is the match ID, local hero and resolved rank tier. Reuse the local account's `state.stats[accountId]` rank; wait until that rank lookup settles instead of racing a temporary all-ranks request. A missing account, unranked result or explicit rank error uses all ranks with an honest label; a rank error also explains that the current rank could not be read. Do not make a second rank request from the overlay. Subsequent clock, pause or damage updates do not reload the curve. Fetch with `durationS = 0`; accept existing thin-band widening. Past the curve's last supported time, show an unavailable comparison rather than extending it or repeatedly reloading. A context change or unmount aborts the old wait and prevents stale results.

- [x] **Step 1: Add failing browser tests using native mocks.** Parameterize the actual native identity over all five names while visiting the same HTML entrypoint. Each gets the expected heading/content and correct hide preference. Unknown native identities show an explicit unavailable state, never an arbitrary panel. All three meters render 12 identifiable rows, update/reorder from `updateMatch`, and show `—` for unknown telemetry. Test missing portraits, ties, zero values and local/team colors. A waiting match and PostGame do not present obsolete values as live.

  ```ts
  await nativeWindow(page, "hero_damage");
  await page.goto("/in_game/in_game.html");
  await expect(
    page.getByRole("heading", { name: "Hero damage", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide hero damage overlay" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("scout.overlay.hero-damage"),
    ),
  ).toBe("false");
  ```

- [x] **Step 2: Add comparison/failure tests.** Assert exact requests with a known rank and with no account, one curve load across many clock updates, no analytics requests from meters/timers, no comparison request in Brawl, and no request while rank is pending. Test an explicit rank failure, all-ranks labeling, thin-band labeling, missing local identity, failed/empty curves, zero kills and partial teams. Hold one hero's response, switch hero or match, then release it; the stale comparison must not appear. Retry moves focus to the stable heading without scrolling; live updates never move focus themselves.
- [x] **Step 3: Add window/clock assertions.** Restore each window from its own saved position, save after drag completion, and disable through its labeled Hide button. Cross-window opacity updates change background alpha, while text/root opacity remains 1. At minimum width/height, the 12th row is reachable through the panel's internal scroll area and the Hide control remains visible. With `page.clock`, pause and advance wall time: the Urn countdown does not move until GEP sends another clock. Test late joins, resumed clock jumps, malformed clocks, Brawl and PostGame messages. Do not announce every second or every meter update in a live region.
- [x] **Step 4: Verify failure.** Run `npx playwright test tests/browser/overlay-panels.spec.ts` after updating the native fixture with nullable telemetry, pause state and tracked position calls.
- [x] **Step 5: Implement shell and panels.** The shared entrypoint calls `mountApp(kWindowNames.heroDamage)` as its overlay hint; the native `getCurrentWindow` result still selects which of the five windows actually renders. Resolve known native window names before rendering. In browser preview, the in-game HTML entrypoint continues to mount the desktop preview with desktop identity. The shell owns drag/hide controls and a stable focusable heading; panels have no native lifecycle code. Set background alpha through a CSS variable, not root opacity. Meter rows use hero portraits, player names, a “You” marker and textual values; color is not their only identity. Use Rajdhani labels/numbers and the existing noir tokens. Keep every row reachable by scrolling inside the body below the fixed handle.
- [x] **Step 6: Implement meaningful unavailable states.** Waiting: “Waiting for a match.” Ended: “Match ended.” Missing local identity: “Waiting for your hero.” Brawl comparison: “Rank averages are unavailable in Street Brawl.” Brawl timers: “Spawn schedules are unavailable in Street Brawl.” Missing clock: “Waiting for the match clock.” Show a visible paused state when `paused === true`, and a small event-provider error notice when `state.error` is set. For timers use “Scheduled spawns · availability isn't tracked.” Keep live counts visible if only the benchmark fails; explain the level/KP average and souls limitations next to those rows.
- [x] **Step 7: Verify and commit.** Run the new browser file and global checks. Commit `feat(overlay): render live meters rank comparisons and scheduled spawns`.

## Task 5: Integrate settings, remove obsolete overlay code and verify both products

**Files:** Modify `src/features/overlay/components/OverlaySettings.tsx`, `src/features/overlay/styles/settings.css`, `src/app/DesktopApp.tsx`, `src/platform/overwolf/constants.ts`, `tests/browser/overlay.spec.ts`, `tests/browser/feature-boundaries.spec.ts`, `README.md`, and the redesign design document. Delete `src/features/builds/components/CompactBuild.tsx`, `src/features/builds/hooks/useMeasuredBuild.ts`, `src/features/builds/services/build-analytics.ts`, `src/features/counters/components/CompactCounters.tsx`, and `tests/builds/build-analytics.test.ts` once all their production consumers are gone. Remove the obsolete overlay CSS selectors.

**Interfaces:** The final `OverlaySettingsProps` has only `hotkey: string`, `overlaySettings: boolean`, `opacity: number`, and `setOpacity(value: number): void`. `OverlaySettings` renders one `OverlayToggle({ panel }: { panel: (typeof OVERLAY_PANELS)[number] })` child per registry entry; each child owns its own `useOverlayPreference(panel.id)` hook. Remove the two build/counter booleans and setters from the parent props. Never call a variable number of hooks in a loop.

- [x] **Step 1: Write failing settings/regression tests.** While Deadlock runs, settings expose exactly the five panel switches, the current hotkey and opacity. Changing each switch writes only its own key; refreshing retains it. In a plain browser, native controls remain absent. Disabling all overlays leaves desktop Live's build/counter content and selections intact across page changes. Replace old build/counter overlay tests with the new suite; retain desktop build timeout/Retry, stale hero requests, Street Brawl behavior and cross-tab state tests.

  ```ts
  await nativeWindow(page, "desktop");
  await page.goto("/desktop/desktop.html");
  await page
    .getByRole("button", { name: "Overlay settings", exact: true })
    .click();
  await expect(page.locator(".settings").getByRole("checkbox")).toHaveCount(5);
  await expect(
    page.getByLabel("Hero damage overlay", { exact: true }),
  ).toBeVisible();
  ```

- [x] **Step 2: Verify failure.** Run `npx playwright test tests/browser/overlay.spec.ts tests/browser/feature-boundaries.spec.ts tests/browser/overlay-panels.spec.ts` and verify the new settings assertions fail before changing the UI.
- [x] **Step 3: Implement settings and remove unreachable code.** Render the five `OverlayToggle` rows with labels `${panel.title} overlay`, using the exact props above; drop build/counter preference hooks from `DesktopApp`. The desktop always renders its existing build/counter panels. Delete its old in-game shell branch, remove the temporary legacy window constants/union members, and delete the now-unused compact-build service/hook/components and their dedicated tests. Keep community/popular-build services used on hero pages. Retain inert old stored keys without migrating or deleting user data.
- [x] **Step 4: Update documentation.** Describe five windows, shared hotkey/opacity, independent switches, positions and the confirmed Urn timer. Replace outdated compact-overlay references in README, feature tables and data-source notes. Record exactly which comparisons ship and which still need native evidence. Mark phase 6 implemented only after its accepted requirements and checks pass; explicitly retain outstanding Windows validation. Do not claim Windows testing from mocks.
- [x] **Step 5: Run final verification once.**

  ```sh
  npm test
  npx tsc --noEmit
  npm run web:typecheck
  npm run test:browser
  npm run test:web
  npm run build
  npm run web:build
  npm run validate:manifest
  git diff --check
  ```

  Expected: all unit/browser assertions pass; both type checks/builds succeed; the official manifest schema accepts exactly five new overlay windows and each declared HTML/icon path exists. Inspect screenshots of every panel at default/minimum sizes. Review production references to `CompactBuild`, `CompactCounters`, `useMeasuredBuild`, `recommended-build`, `counter-items`, `counter_overlay` and the old native `in_game` identity; only intentional legacy-key assertions or historical documentation may remain. The `src/in_game/` HTML/build paths remain intentionally.

- [x] **Step 6: Final review and commit.** Review the full diff against the five Review Focus cases and the accepted spec qualifications. Correct failures and rerun only the affected checks, broadening where a fix affects shared code. Commit `feat(overlay): replace build overlays with five performance panels` and report verified results plus remaining manual checks. Integration/publishing follows the owner's existing preferences; do not publish or push as a side effect of writing this plan.

## Native validation that this Linux workspace cannot perform

- Capture a real normal match: verify damage/healing refresh for all players and compare GEP `souls` with the in-game total before and after an item purchase. Record payloads, observed meaning and provider version. Only then enable Souls / min if it matches net worth; a different meaning needs an explicit supported source, not reconstruction from purchased items.
- Check initial snapshot behavior after joining mid-match and resuming a paused match, including whether pause state is available before an event is received.
- Verify the Urn's current in-game schedule, the shared hotkey's input release, five simultaneous native windows, drag completion, persisted positions, resize limits and multiple-monitor/DPI behavior.
- Check readability over bright gameplay at 35% background opacity and confirm fonts/icons load in Overwolf CEF.

These are release evidence still to collect, not failing automated checks and not permission to label unverified data as verified.

## Execution recommendation

Native implementation in the current checkout is the proposed default: the tasks share the live-state, panel-registry and window interfaces closely. Establish a clean test baseline before product edits. If the owner selects subagent-driven execution, follow that skill's independent task reviews instead. The owner selected native execution in this checkout. Five task commits implement the phase; no dependencies or worktrees were added.
