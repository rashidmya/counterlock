# Phase 4 and phase 5 follow-ups — Implementation Plan

> **For agentic workers:** Use the executing-plans and dispatching-parallel-agents skills. The owner requested implementation of the existing follow-up lists.

**Goal:** Close the actionable follow-ups left by phase 4's second pass and phase 5, preserving the existing app and website behavior.

**Architecture:** Keep the shared API client, profile view state and Live components. Separate independent work into request lifecycle, general focus/scroll behavior, and the profile Live tab. Add regressions before behavior changes. Retain intentional behavior: a request already sent completes and is cached, and unrelated hero-stat paths can proceed during a path cooldown.

**Tech Stack:** Existing React, TypeScript, Vitest and Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md`; follow-up lists in `2026-10-23-redesign-phase-4-second-follow-ups.md` and `2026-10-23-redesign-phase-5-profile-live-tab.md`.

## Global constraints

- Share feature code between desktop and website; use existing color tokens.
- Leave native Windows/Overwolf, actual game-clock/terminology and screen-reader hardware checks explicitly pending where this Linux environment cannot establish them.
- Work on `fix/phase-4-5-followups` in the current checkout; no publishing, merging or unrelated changes.
- Preserve backward-compatible service signatures where feasible and preserve abort reasons.

## Review focus

- A roster replaced while waiting for a rate slot must not delay its replacement or cache cancellation as a failure.
- Retrying one failed stats half must not extend the lifetime of the successful half.
- Hidden profiles must make no initial Watch-list request or periodic wakeup; restoring visibility must run an overdue check once.
- A reordered or incomplete roster must retain the viewed match and the identity of focused links.
- Focus recovery must have meaningful text, avoid scrolling the viewer away, and never steal focus from outside the disappearing content.

### Task 1: Request lifecycle and service regressions

- [x] Fix roster cancellation, per-half stats freshness and failed metadata batches; add API/rate-store, performance and report signal regressions called out in phase 4.
- [x] Run affected unit tests and type checks (437 unit tests; TypeScript passes).

### Task 2: General Retry, layout and scroll regressions

- [x] Keep focus and useful status text through Retry throughout the listed pages; announce repeat rank failures; fix narrow-phone Updating layout and history-navigation takeover filtering.
- [x] Cover keyboard Retry, zero impact, profile same-route reopening and scroll takeover as appropriate.
- [x] Run affected browser tests and type checks.

### Task 3: Live tab follow-ups

- [x] Add tests for missing heroes, objective values, metadata precedence and signal forwarding; retain valid matches with incomplete player rows.
- [x] Make visibility checking event-driven, stable player identities/name lookups and retryable names; preserve focus without scrolling or silent status targets, including your own match ending.
- [x] Add current ranks, region, spectators, a live tab marker and last-match report access with clear availability copy; align PC account detection.
- [x] Add the missing browser cases and correct the review's comment/test nits.
- [x] Run affected unit and browser tests.

### Task 4: Verification and documentation

- [x] Review the combined changes; run all unit tests, both browser suites, both builds, web type checking and manifest validation.
- [x] Update the spec/README and record remaining platform-only checks and intentional trade-offs.

## Execution record

- Baseline: 417 unit tests passed on 2026-10-24.
- Existing design and follow-up lists supply the requested scope; routine implementation choices are recorded here rather than requesting another approval.
- Request lifecycle: completed, including a real queued-roster replacement regression and independent stats-half timestamps.
- General focus/scroll: Retry targets a stable nearby heading or control; the live loading region is separate. History navigation buttons and Alt/Cmd shortcuts leave a pending restore intact. Updating fits 320 px.
- Performance tooltips cover the actual number area, including lines wrapped by fallback fonts. Horizontal wheel gestures leave vertical scroll restoration intact; vertical wheel/touch/key/pointer takeover still cancels it.
- Live: added signal/parser regressions, incomplete heroes/objectives, region/spectators/current ranks, stable roster keys and sorted name/rank request ids, independent names/ranks Retry, event-driven visibility, initial/result announcements and focus recovery, own-match ending, shared local-account detection, and last-report access.
- Implementation choice: the Watch list loads while a profile is visible, even on Overview, to give Live its presence marker before opening it. This adds one request per visible profile per minute, through the existing shared client. Your own account still uses Overwolf exclusively.
- Implementation choice: a match that leaves the Watch list links to its report with availability explained; disappearance from the list is not proof that it has ended or that the API has stored it.
- Independent final review found one important issue: stale names/ranks announcements could mask a newer Watch-list failure. Its regression reproduced the wrong announcement before the fix; newer Watch events now clear stale detail announcements. No other findings. The new announcement-precedence regression passed in the final full website suite.

## Deliberately retained behavior and manual checks

- Windows/Overwolf: verify Web Locks availability across its windows and document visibility in hidden/minimised native windows. Fallback request counts remain shared, with only per-window serialization where Web Locks are unavailable.
- A real match: compare the API start timestamp with the game clock and confirm Patron/Core/Weakened terminology.
- Screen readers: browser tests verify persistent live regions, meaningful targets and keyboard focus, but actual VoiceOver/NVDA announcement order needs a manual session.
- A request that has claimed its slot completes and is cached, even after its last caller leaves; different hero-stat paths can proceed during a path-specific 429. Live errors retain the shared client's wording.
- Five-column card headings may wrap; desktop scroll is still the window's shared scroll position. Website profile restoration retains its viewer-takeover policy.

## Final verification — 2026-10-24

- `npm test`: 437 passed in 39 files.
- `npm run test:browser`: 174 passed.
- `npm run test:web`: 115 passed, including the announcement-precedence regression and the 320/360/375 px layout checks; the command also built and served the production website successfully.
- `npm run build`: passed (includes `tsc --noEmit`).
- `npm run web:typecheck`: passed.
- `npm run validate:manifest`: passed.
- Touched files formatted; `git diff --check` passed. Historical plan/spec formatting was preserved.
- Independent review: one important finding fixed with a failing regression followed by the full green suites; no critical or minor findings.
- The owner requested local integration into `main` after verification.
