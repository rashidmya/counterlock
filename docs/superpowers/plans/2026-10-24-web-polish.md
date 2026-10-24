# Web polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the existing website easier to use at phone, tablet and desktop sizes.

**Architecture:** Keep existing pages and data behavior. Web-only responsive rules improve hit areas and wrapping; a shared horizontal-scroll wrapper gives dense data explicit keyboard access. Web shell navigation and local catalog empty-state handling remain small independent changes.

**Tech Stack:** React, TypeScript, CSS, React Router, existing Playwright/Vitest tools.

**Spec:** `docs/superpowers/specs/2026-10-24-web-polish-design.md` (owner approved).

## Global Constraints

- Linux-only validation; no Windows, deployment, dependencies or API changes.
- Preserve the visual style, metrics, report perspective, chart gestures and navigation restoration.
- At widths up to 900 px and on coarse-pointer devices: targeted controls at least 44 px high; search inputs/selects at least 16 px. Preserve desktop fine-pointer density.
- No document-wide overflow at 320 px or wider. Wide data stays locally scrollable.
- Native execution in the current checkout follows the owner's existing preference. Design approval authorizes this implementation; no repeated permission gate.

## Review Focus

- Enlarged text or fallback fonts must not push navigation, headings or actions outside the viewport (task 1).
- Sticky header height changes must not hide skip destinations or focused controls (task 2).
- Data arriving or resizing while a scroller has focus must update hints without stealing focus (task 3).
- Resetting an empty local catalog must preserve unrelated rank/sort selections and distinguish network failures (task 4).
- Shared components must remain usable in the desktop app and keyboard arrow behavior must remain native (tasks 3 and 5).

## Task 1: Responsive headings and controls

**Files:** create `web/app/styles/polish.css`; import in `web/app/root.tsx`; create `tests/web-browser/polish.spec.ts`.
**Interfaces:** CSS scoped to `.app.web`; existing component class names, no new component interfaces.

- [x] Write browser regressions: Overview at 320 px has scrollWidth <= clientWidth and All matches fits; targeted controls >=44 px at 375/768/900 px, search/select fonts >=16 px, and 1440 px fine-pointer controls retain density. Include a coarse-pointer 1024 px context and doubled text stress.
- [x] Run `npm run test:web -- polish.spec.ts --reporter=line`; expect failures from current overflow/control sizing.
- [x] Add narrowly scoped wrapping, sizing and readable control rules. Keep text labels and native input behavior.
- [x] Rerun the command; expect all task tests passing. Commit `fix(web): improve responsive headings and control targets`.

## Task 2: Skip navigation and sticky-header clearance

**Files:** modify `web/app/WebShell.tsx`, `web/app/styles/polish.css`, `tests/web-browser/polish.spec.ts`.
**Interfaces:** main target `#web-content`; measured header height exposed as CSS `--web-header-height` on `.app.web` using a cleaned-up ResizeObserver.

- [ ] Add tests: first Tab reveals Skip to content; Enter focuses main and next Tab reaches its content; skip/focused controls stay below the header at 375/768/1440 and enlarged text. Report/profile history restoration remains covered by existing tests.
- [ ] Run targeted tests; expect missing skip link/clearance failures.
- [ ] Implement native anchor with explicit focus and scroll, main tabIndex=-1, dynamic header clearance and focus-visible styling. No route-change autofocus.
- [ ] Run task tests; expect PASS. Commit `feat(web): add skip navigation and sticky header clearance`.

## Task 3: Discoverable wide data

**Files:** create `src/shared/ui/HorizontalScroll.tsx`; modify `src/app/styles/shared.css`, `src/features/profile/components/HeroesTab.tsx`, `src/features/match-report/components/Scoreboard.tsx`, `src/features/heroes/components/SkillOrder.tsx`; create `tests/web-browser/scroll-regions.spec.ts`.
**Interfaces:** `HorizontalScroll({label, className, style?, children}: {label:string; className:string; style?:CSSProperties; children:ReactNode})`. Preserve current scroll-container class names on the actual scroller; wrap children inside a measurable content element. Only overflowing regions get role=region, aria-label, tabIndex=0, aria-describedby and a hint.

- [ ] Add regressions for named profile/report/skill-order regions, native arrow-key horizontal scrolling, visible hints only on overflow, resize-to-fit removing extra tab stop while preserving current focus, and data/content resize updates.
- [ ] Run `npm run test:web -- scroll-regions.spec.ts --reporter=line`; expect missing named regions/hints.
- [ ] Implement one component observing viewport and content sizes, measuring scrollWidth > clientWidth + 1. Clean up observations on unmount; preserve tables, native arrow behavior and component contents. Use distinct team names and unique IDs for hint relationships.
- [ ] Run task tests; expect PASS. Commit `feat(ui): make wide data scrolling discoverable`.

## Task 4: Recoverable empty catalog results

**Files:** modify `src/features/heroes/components/HeroesPage.tsx`, `src/features/items/components/ItemsPage.tsx`, `src/app/styles/shared.css`, `web/app/styles/polish.css`; create `tests/web-browser/catalog-empty.spec.ts`.
**Interfaces:** existing local state setters and search input refs; no global filter changes.

- [ ] Write regressions: empty Heroes displays status/reset; reset clears search and role, restores cards and focuses search. Items reset clears search/category but preserves sort and rank. Network stats failure alone does not create an empty state/reset.
- [ ] Run `npm run test:web -- catalog-empty.spec.ts --reporter=line`; expect missing reset controls and Heroes empty feedback.
- [ ] Implement empty-state copy and reset handlers. Return focus to the search input. Announce empty results only, not every populated result update.
- [ ] Run tests; expect PASS. Commit `feat(catalog): add recovery for empty searches`.

## Task 5: Cross-site verification and delivery

**Files:** extend `tests/web-browser/polish.spec.ts`; update spec and this plan with verification results.
**Interfaces:** consumes all preceding tasks; no additional product features.

- [ ] Add a representative route/tab viewport matrix at 320/375/640/641/768/900/901/1024/1440, including long labels and fallback fonts. Keep existing loading, error/retry, touch chart and Back restoration tests. Inspect changed surfaces at 375/768/1440, including populated skill orders and empty states. Fix reproduced regressions under TDD.
- [ ] Run `npm test`, `npm run build`, `npm run web:typecheck`, `npm run test:web -- --workers=4 --reporter=line`, `npm run test:browser -- --workers=4 --reporter=line`, `npm run validate:manifest`, formatting and `git diff --check`. Web tests build the web app. Expect all pass.
- [ ] Perform one independent whole-change review, fix Important/Critical findings with failing regression tests then green suites; record deferred minor findings and limitations. Commit remaining verification/docs.
