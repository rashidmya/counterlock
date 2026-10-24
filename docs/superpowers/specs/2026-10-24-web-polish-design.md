# Web usability and responsive layout polish

Status: owner approved; implementation in progress.

## Intent and constraints

Polish the existing Counterlock website so it is comfortable to navigate and read on phones, tablets and desktops. The owner selected a site-wide audit and polish pass over a narrower profile/report pass. Keep the noir visual style, existing routes, information hierarchy and data behavior. Work and validation are Linux-only; Windows/Overwolf validation remains deferred and does not block this phase.

This is a bounded usability pass, not a redesign or a new data feature. Do not change metric meanings, API requests/caching, profile/history restoration, chart selection gestures, the overlay windows, or the two deferred overlay findings. No dependencies or deployment are needed. Shared semantic improvements may benefit the desktop app, but responsive sizing changes should be scoped to `.app.web`.

## Approaches

1. **Site-wide audit and polish (selected):** examine representative routes and states at phone, tablet and desktop widths, fix demonstrated friction and add targeted regression checks. Covers shared controls and navigation without changing the visual direction.
2. **Profiles and reports first:** concentrates on the densest screens but leaves navigation and discovery issues elsewhere. The owner chose the first approach.

## Evidence and audit limits

On 2026-10-24, an exploratory Playwright run inspected 14 route/tab states at each of 320, 375, 640, 641, 768, 900, 1024 and 1440 CSS pixels (112 observations). Routes: Home, Tier list, Heroes, hero detail, Items, item detail, all five profile tabs, match report, About and an unknown route. Data was supplied by the repository's deterministic fixtures. Remote portraits were placeholders; screenshots support geometry and typography judgments, not evaluation of final artwork. This is Chromium emulation on Linux, not physical-device testing.

Confirmed observations:

- Profile Overview at 320 px has 39 px of horizontal page overflow: the Recent matches header's **All matches** action extends beyond the viewport. The shared heading/action layout does not wrap. Other measured base route/tab states did not overflow; preserve that behavior.
- At 375 px, Search heroes is 35 px high and All matches is 18 px high. At 768 px, filter buttons shrink to 23 px, search fields to 31 px, and profile actions to 32 px. Existing phone sizing rules stop at 640 px. Several report metric buttons remain 30 px high even on phones.
- Profile Heroes and report scoreboards correctly retain their wide data in local horizontal scrollers, but their wrappers have no explicit focus contract, accessible region names or visible scrolling instructions. A direct `.focus()` probe _does_ focus the Heroes wrapper in the installed Chromium; do not describe it as currently inaccessible. Make behavior explicit and understandable rather than relying on browser defaults.
- A Heroes search that matches nothing leaves an empty grid without explanation. Items already says “No items match.” Neither provides a dedicated reset action in that state.
- The web shell has no skip link. The first keyboard stop is the brand, followed by navigation before the page content.

Existing tests already cover 375 px overflow, touch chart selection, profile/history restoration and substantial Retry focus behavior. Preserve those contracts. No general claim of accessibility compliance is made by this pass.

## Proposed changes

### 1. Responsive section headings

Allow heading/action groups to wrap when they cannot fit. At narrow widths the action may move to a second line; retain the visual section rule where it fits. Headings can wrap instead of forcing the document wider. Keep the All matches action associated with Recent matches and fully usable. Do not fix this by hiding overflow, truncating the action or reducing text to fit.

### 2. Comfortable controls on phones and touch devices

Use at least 44 px-high hit areas for primary interactive controls at widths up to 900 px, and on coarse-pointer devices at wider widths. Cover search fields, selects, filter/range buttons, profile actions, section actions, report metric/segmented controls, Retry and show-more actions. Keep control text legible: search inputs and selects use at least 16 px in these modes. Small inline text links and data marks are exempt; avoid blanket padding on every link or chart element.

Wrap control groups where necessary, preserving labels and the association between each filter and its content. Profile navigation remains one row where it fits at normal text size; permit wrapping under increased text size instead of clipping or squeezing text. Desktop fine-pointer layouts above 900 px retain their existing density. This 44 px target and breakpoint policy are the builder's proposed design choices, not reported user requirements.

### 3. Keyboard navigation and wide data

Add a **Skip to content** link as the first keyboard stop in the web shell. It becomes visible on focus, moves focus to the main content, and positions it below the sticky header. Give main a stable target and programmatic focus without adding an ordinary tab stop. Use web-scoped scroll clearance for focused controls so the sticky header does not conceal them. Preserve existing report/profile scroll restoration; do not introduce blanket route-change autofocus.

For profile Heroes, each team's report scoreboard, and populated popular-build skill orders, provide a named, explicitly focusable horizontal scrolling region **when it overflows**, with a concise visible instruction such as “Scroll horizontally for more columns.” Fitting regions should not add an extra tab stop or an unnecessary hint. Recompute after resizing and content changes. Keep native scrolling and keyboard behavior; do not intercept arrow keys on buttons, selects or chart sliders. The focused region gets a visible outline. Table semantics and all data columns stay intact; do not replace tables with cards or hide columns.

### 4. Recoverable empty catalog searches

Heroes and Items show a concise empty state with a **Reset filters** action when the local search/category/role combination produces no results. The Heroes reset clears its search and restores All roles. The Items reset clears its search and restores All categories, preserving sort and rank because they do not determine which items match. Return focus to the relevant search input when the reset action disappears. Announce the empty result without announcing every populated keystroke. Do not show a reset for a network error or confuse unavailable analytics with an empty catalog.

### 5. Verify the whole site, keep changes evidence-based

Recheck the routes above at the audit widths and the breakpoints immediately around any changed rules. Include loading, empty, error/retry and long-label cases for the affected surfaces. Exercise keyboard-only entry and reset flows, table scrolling, touch chart selection, and fallback fonts. Add a 200% text-size stress check on the shell, headings and filter groups; label this an approximation rather than a substitute for physical-browser zoom testing. Keep horizontal scrolling inside wide data regions; no document-wide horizontal scrolling at 320 px or wider.

Review screenshots at 375, 768 and 1440 px for changed surfaces, including header/action wrapping and dense report controls. The baseline screenshots show the existing arrangement; optional comparison mockups depend on the owner's preference. Avoid speculative restyling of pages that already work.

## Implementation boundaries

Likely files are `web/app/WebShell.tsx`, web styles, shared `SectionHeader` styles, catalog page components, and the three wide-data components (`HeroesTab`, `Scoreboard`, `SkillOrder`). A small reusable overflow-region component is reasonable if it avoids three copies of measurement/focus behavior; the exact factoring is left to the builder. Keep styling scoped appropriately and verify desktop consumers of shared markup.

Do not add a new menu, mobile navigation drawer, sticky filter bars, filter URL persistence, new chart gestures, or a whole-site focus manager. Those changes are not needed to resolve the findings.

## Acceptance and validation

- Recent matches and its action fit at 320 px, including long text/fallback fonts, with no page overflow.
- Targeted controls meet the stated hit-area/text sizing policy without clipping labels, overlapping neighbors, breaking chart controls or enlarging fine-pointer desktop layouts unnecessarily.
- Keyboard users can skip navigation; the destination and subsequent focused controls remain visible below the sticky header.
- Overflowing data regions have distinct accessible names, visible hints, keyboard scrolling and focus styling. Resizing to a fitting layout removes the hint and extra tab stop without moving existing focus unexpectedly.
- Empty Heroes/Items searches explain the result; reset restores results and useful focus while preserving unrelated selections.
- Existing data, Retry behavior, report perspective, browser Back restoration and touch chart behavior remain unchanged.
- Run targeted regressions, the full web browser suite, desktop browser tests for shared components, unit tests, both type checks and builds. No Windows checks are required for this phase. Use existing fixtures and tooling; check console/runtime errors on inspected routes.

The implementation plan will name exact test cases and files. A fresh builder check on 2026-10-24 reported “nothing important left.” The design is ready for owner review before product changes.
