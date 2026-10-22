# Redesign phase 2 — hero page builds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead the hero page with builds: a data-driven main build (Early / Mid / Late, 8 items each), the hero's most popular community builds shown exactly as authored, and data-driven counter items against enemy heroes you pick (or, in the desktop app during a match, the live enemy team). The Live tab's build panel switches to the same main-build logic.

**Architecture:** Three small pure modules do the deciding: `mainBuild()` (per-phase item picks), `parsePopularBuilds()` (author's categories as-is) and `counterItemsVs()` (per-enemy win-rate lift). Thin services fetch through the shared `DeadlockApi` client, so repeated paths are cached and de-duplicated. React components render them on the hero page (under a **Build · Popular builds** tab bar, then a **Counter items** section) and, for the main build, in the Live tab's `BuildPanel`. The desktop shell passes the live enemy hero ids down to the hero page; the website never has them.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router 8 (web), plain global CSS with the noir tokens, Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-21-redesign-design.md`, "Hero page" items 2–5 and phase 2 of "Delivery phases". Visual reference: `docs/superpowers/specs/2026-10-21-redesign-prototype.html` (hero page: `.htabs`, `.mainbuild`/`.phase`/`.prow`/`.item`, `.pbtabs`/`.pbuild`/`.pcat`, `.picker`/`.ccards`; tick "Show as website" for web sizes). Where this plan and the prototype differ, this plan wins.

## Decisions made while planning (verified against the live API on 2026-10-22)

- **Main build data works as the spec says.** `GET /v1/analytics/item-stats?hero_id=13&min_bought_at_s=0&max_bought_at_s=600` (and 600–1200, 1200+) returns rows with `item_id, wins, losses, matches, players, avg_buy_time_s, …`. For Haze, the early phase's top items are Rapid Rounds (1.02M) and Swift Striker (0.97M), which is Rapid Rounds' upgrade. **Upgrade rule:** when an item and its upgrade (direct or through a chain) both qualify in one phase, keep the **upgrade**; a component of an upgrade listed in an earlier phase is not listed again later (upgrades of earlier items still can be).
- **Noise floor:** an item must be bought in at least **5% as many matches as the phase's most-bought item**. This keeps rare heroes at high ranks from filling slots with 20-match items. This floor is what produces "fewer than 8" phases.
- **Popular builds sort:** `sort_by=weekly_favorites` is stale. Unfiltered, it returns a 2024 build with 1,803 weekly favourites. With a date filter, every count is `null` and the order is arbitrary. Use **`sort_by=favorites&sort_direction=desc&only_latest=true`** with **`min_unix_timestamp` = 60 days ago** (UTC day-rounded so the URL is cacheable) and **`limit=5`**. Prefer English (`build_language=English`), and fall back automatically to all languages when the hero has no English builds (no toggle; YAGNI). **Newer heroes have no favourite counts** (`num_favorites: null` on every build for Violet, Nurse Harrow and Baba), so when no returned build has a count above 0 the list is re-fetched with `sort_by=updated_at` (`ranked: false`) and the note no longer claims a popularity order. Author notes are shown as visible text under each category (`ul.build-notes`) as well as in the tile tooltip, so touch users can read them.
- **Build contents as authored:** about 12% of categories have an empty name, and many use the game's localisation keys (`#Citadel_HeroBuilds_EarlyGame` …). Some categories have no items, only a description (e.g. "Notes"). Items often carry an author **annotation**. All of these are kept: mapped key names (existing rule), "Items" for an empty name, description shown, annotation in the tile's tooltip.
- **Build authors:** builds give only `author_account_id`. Names come from one batched `GET /v1/players/steam?account_ids=…` (existing `fetchSteamProfiles`). The author is left out when the lookup fails.
- **Counter items rank by win-rate *lift*, not raw win rate (deviation from the spec's wording).** Ranking by raw win rate returns only 6,400-soul late items, because players who are ahead can afford them; the prototype's cards (Frenzy, Glass Cannon, Spellslinger… all 6,400) show this. For each picked enemy E, `lift_E = winRate(item | hero, vs E) − winRate(item | hero) − shift_E`, where `shift_E` corrects for the matchup itself. This is the same method today's "Counter items" section uses (`counterItems()`). An item's lift is the average over the picked enemies that have data (at least one item row with 200+ matches), with missing data counted as 0. **Items are ranked by a lower confidence bound** (`lift − 3·SE`, binomial SE per enemy; with ~140 candidate items per enemy, 2·SE still let 2–3 noise items through in a null simulation) and kept only when that bound is above 0: on live data a plain average with a 200-match floor mostly picked lucky small samples (Refresher at 419 games vs Abrams), while the bound surfaces believable counters (Inhibitor, Silencer, Crippling Headshot vs Seven). This also lets the rules-based fallback fire when data is thin. The card says which enemies it clearly does better against (that enemy's own bound above 0) and shows the lift and "{N}+ games" (the largest single-enemy sample, a lower bound, since a game against several picked enemies would otherwise be counted more than once), not a raw win rate (a positive-lift item can sit below 50%). The one-line label says exactly this.
- **Live tab counter panel is unchanged** (spec: Live keeps today's content). Data-driven counter items live on the hero page only.
- **In a desktop match the counter enemies are read-only:** they come from the GEP roster, as the spec says. The picker only appears outside a match, and always on the website.
- `CompactBuild` / `useMeasuredBuild` / `loadBuild` (overlay) stay untouched; phase 6 deletes them. `recommendedBuild()` (unused; the spec says the new main build replaces it) is deleted now.

## Global Constraints

- Every colour comes from `src/app/styles/tokens.css` (`var(--token)`, `rgb(from var(--token) r g b / a)` or `color-mix(…)`). `tests/app/theme.test.ts` fails on any hex literal in `src/**/*.css`, `web/app/**/*.css` or `src/**/*.tsx`.
- Fonts and components are as in phase 1: Rajdhani uppercase for tab labels, phase labels and category names; Playfair Display SC for the popular build's title; DM Sans for body; `SectionHeader` for section titles.
- **Constants (export them; tests import them):** `PHASE_SIZE = 8`, `MIN_SHARE_OF_TOP = 0.05`, `POPULAR_BUILDS = 5`, `BUILD_WINDOW_DAYS = 60`, `MIN_VERSUS_MATCHES = 200`, `CONFIDENCE_Z = 3`, `COUNTER_ITEMS = 6`, `MAX_ENEMIES = 6`.
- **Copy strings fixed by this plan (tests assert them):**
  - tabs "Build" and "Popular builds" (count badge `small.tab-count`);
  - phase labels "Early" / "0–10 min", "Mid" / "10–20 min", "Late" / "20+ min", and the live-phase tag "Now";
  - tile sub-line `55% win` (rounded whole percent) or `OWNED`;
  - short-phase lines "Only 3 items were bought often enough in this phase." and "Not enough data for this phase.";
  - main build note "Most-bought items in each phase · {rank} · last 30 days · win rate under each item", where `{rank}` is "All ranks" or e.g. "Emissary+";
  - popular builds notes "Most-favourited builds updated in the last 60 days, shown exactly as their authors set them up." or, when `ranked` is false, "Community builds updated in the last 60 days, shown exactly as their authors set them up. This hero has no favourite counts yet."; when not English, either gets the prefix "No English builds yet, so these are in other languages. ";
  - popular builds empty line "No community builds for this hero were updated in the last 60 days.";
  - build meta "by {author} · Updated {10 Oct 2026} · {42} items in {6} categories · {199} favourites", with "by …" omitted when unknown and "· {n} favourites" omitted when `favorites` is `null`;
  - counter section title "Counter items"; its note "Items that gain the most win rate for {Hero} against these heroes, compared with all {Hero} games and allowing for the matchup itself. Only clear gains are shown · {rank} · last 30 days.";
  - picker label "Enemy team"; buttons "Add enemy hero", "Remove {Hero}", "Clear", "Done"; chooser group "Choose enemy heroes";
  - picker empty line "Pick up to 6 enemy heroes to see items that do well against them.";
  - live line "Enemy team from your live match.";
  - card body "+5.0% vs these heroes · 3,000+ games"; first card label "CONSIDER FIRST", others the category in upper case;
  - fallback note "Based on hero traits — match data shows no clear counter items against these heroes yet." and the error form "Match data unavailable: {error}. Based on hero traits instead.";
  - fallback empty line "No suggestions for these heroes yet.";
  - renamed section "Items that beat {Hero}";
  - Live panel h2 "Your build".
- No fake data in production. Every derived list carries its one-line "how it's derived" note.
- One shared copy of feature code for the app and the website.
- Run before every commit: `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`. Browser suites: `npm run test:browser` (desktop) and `npm run test:web` (website). Format touched files with `npx prettier --write`.
- Commit messages are plain conventional commits (`feat(builds): …`) with **no AI attribution lines or trailers** (owner rule).

## Review Focus

1. **Request budget (200 analytics req/min per IP).** A hero page now fires up to about 15 analytics requests: 7 existing, 3 phases and up to 6 enemies, where the baseline `hero_id=` request is shared with "Best items". Picking and un-picking enemies must not refetch an enemy already fetched. Test in Task 5: `re-picking an enemy reuses its cached request`.
2. **Fast switching shows only the latest data.** Live tab hero select: the old hero's phase requests are still pending. Test in Task 6: `changing build hero shows only the new hero's build`. Hero-to-hero navigation is safe because `HeroDetail` is keyed by `heroId` and `useAsync` ignores stale results.
3. **Widths.**
   - Desktop at 850px: eight tiles per phase row must fit, with no horizontal scroll.
   - Phone at 375px: build rows wrap to 4 per line; the build tabs, popular build tabs (long names) and the open enemy chooser must not cause horizontal page scroll.
   - Tests: Task 4 `main build rows fit at the minimum window width`; Task 7 phone loop with Popular builds open and the enemy chooser open.
4. **Popular build fidelity.** Category order, item order, duplicates, unnamed categories, zero-item categories and unknown item ids are all kept as authored. Unit tests in Task 2; browser test in Task 4.
5. **Counter correctness.** The current hero can't be picked as its own enemy; main-build items are excluded; the live roster is read-only and replaces picks. Tests in Tasks 3 and 5.

---

### Task 1: Main build — phase picks and fetch

> Revised after code review: `mainBuild` also marks the parts of each pick as listed, so a later phase never lists a component of an earlier upgrade; `PHASES` is `readonly`. The committed code is the reference.

**Files:**
- Create: `src/features/builds/utils/main-build.ts`
- Create: `src/features/builds/services/main-build.ts`
- Modify: `src/features/heroes/utils/analytics.ts` (export `shopItems` and `overallRate`; add `rankLabel`)
- Delete: `src/features/builds/utils/recommendations.ts`
- Create: `tests/builds/main-build.test.ts`
- Modify: `tests/builds/recommendations.test.ts` → move the `"bundles actual shop artwork for every available item"` test verbatim into `tests/catalog/catalog.test.ts` (with any imports it needs), then delete `tests/builds/recommendations.test.ts`
- Modify: `tests/heroes/analytics.test.ts` (add `rankLabel` cases)

**Interfaces:**
- Produces in `analytics.ts`:
  - `export function shopItems(rows: unknown[]): Map<number, ItemPerf>`: unchanged body, now exported.
  - `export const overallRate`: unchanged body, now exported.
  - `export function rankLabel(minBadge: number, ranks: Rank[] = catalog.ranks): string` returns `rankFilterOptions(ranks).find((o) => o.value === minBadge)?.label ?? "All ranks"`. Add `catalog` to the existing `@/shared/catalog` import.
- Produces `main-build.ts`:

```ts
import { itemById } from "@/shared/catalog";
import {
  buildsFrom,
  shopItems,
  type ItemPerf,
  type ItemStatsRow,
} from "@/features/heroes/utils/analytics";

export type PhaseKey = "early" | "mid" | "late";
export interface Phase {
  key: PhaseKey;
  label: string;
  range: string;
  fromS: number;
  toS?: number;
}
export interface MainBuildPhase extends Phase {
  items: ItemPerf[];
}

export const PHASE_SIZE = 8;
export const MIN_SHARE_OF_TOP = 0.05;
export const PHASES: Phase[] = [
  { key: "early", label: "Early", range: "0–10 min", fromS: 0, toS: 600 },
  { key: "mid", label: "Mid", range: "10–20 min", fromS: 600, toS: 1200 },
  { key: "late", label: "Late", range: "20+ min", fromS: 1200 },
];

export const phaseParams = ({ fromS, toS }: Phase) =>
  `min_bought_at_s=${fromS}${toS === undefined ? "" : `&max_bought_at_s=${toS}`}`;

// Every item that goes into building this one, through any depth of upgrades.
const partsOf = (itemId: number): number[] => {
  const item = itemById.get(itemId);
  return item
    ? buildsFrom(item).flatMap((part) => [part.id, ...partsOf(part.id)])
    : [];
};

function pickPhase(rows: ItemStatsRow[], listed: Set<number>): ItemPerf[] {
  const ranked = [...shopItems(rows).values()].sort(
    (a, b) => b.matches - a.matches || a.itemId - b.itemId,
  );
  const floor = (ranked[0]?.matches ?? 0) * MIN_SHARE_OF_TOP;
  let picked: ItemPerf[] = [];
  for (const row of ranked) {
    if (picked.length === PHASE_SIZE || row.matches < floor) break;
    if (listed.has(row.itemId)) continue;
    // Keep the upgrade, never the item next to the upgrade it builds into.
    if (picked.some((other) => partsOf(other.itemId).includes(row.itemId)))
      continue;
    const parts = partsOf(row.itemId);
    picked = [...picked.filter((other) => !parts.includes(other.itemId)), row];
  }
  return picked.sort(
    (a, b) =>
      (a.avgBuyS ?? Infinity) - (b.avgBuyS ?? Infinity) || a.itemId - b.itemId,
  );
}

export function mainBuild(rowsByPhase: ItemStatsRow[][]): MainBuildPhase[] {
  const listed = new Set<number>();
  return PHASES.map((phase, index) => {
    const items = pickPhase(rowsByPhase[index] ?? [], listed);
    items.forEach((item) => listed.add(item.itemId));
    return { ...phase, items };
  });
}

export function buildPhase(clock: string): PhaseKey | null {
  const match = /^(\d+):([0-5]\d)$/.exec(clock);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isSafeInteger(seconds)) return null;
  return seconds < 600 ? "early" : seconds < 1200 ? "mid" : "late";
}
```

- Produces `services/main-build.ts`:

```ts
import { deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchItemStats } from "@/features/heroes/services/hero-analytics";
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";
import {
  PHASES,
  mainBuild,
  phaseParams,
  type MainBuildPhase,
} from "../utils/main-build";

export async function fetchMainBuild(
  heroId: number,
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<MainBuildPhase[]> {
  const rows = await Promise.all(
    PHASES.map((phase) =>
      fetchItemStats(q, `hero_id=${heroId}&${phaseParams(phase)}`, api),
    ),
  );
  return mainBuild(rows);
}
```

- [ ] **Step 1: Write the failing tests** — `tests/builds/main-build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog, itemByClass } from "@/shared/catalog";
import { analyticsParams } from "@/features/heroes/utils/analytics";
import {
  PHASES,
  buildPhase,
  mainBuild,
  phaseParams,
} from "@/features/builds/utils/main-build";
import { fetchMainBuild } from "@/features/builds/services/main-build";

const row = (itemId: number, matches: number, buyS: number, rate = 0.55) => ({
  item_id: itemId,
  wins: matches * rate,
  losses: matches * (1 - rate),
  matches,
  avg_buy_time_s: buyS,
});
const plain = catalog.items.filter(
  (item) => item.cost > 0 && !item.components?.length,
);
const upgrade = catalog.items.find(
  (item) =>
    item.components?.length === 1 && itemByClass.has(item.components[0]),
)!;
const component = itemByClass.get(upgrade.components![0])!;
const others = plain.filter((item) => item.id !== component.id);
const chain = catalog.items.find((item) =>
  item.components?.some((name) =>
    itemByClass.get(name)?.components?.some((inner) => itemByClass.has(inner)),
  ),
)!;
const middle = chain.components!.map((name) => itemByClass.get(name)!)
  .find((part) => part.components?.some((inner) => itemByClass.has(inner)))!;
const root = itemByClass.get(
  middle.components!.find((inner) => itemByClass.has(inner))!,
)!;
const ids = (phase: { items: { itemId: number }[] }) =>
  phase.items.map((item) => item.itemId);

describe("mainBuild", () => {
  it("takes the eight most-bought items per phase, ordered by average buy time", () => {
    const rows = others
      .slice(0, 10)
      .map((item, i) => row(item.id, 1000 - i * 10, 500 - i * 20));
    const [early] = mainBuild([rows, [], []]);
    expect(ids(early)).toEqual(
      others.slice(0, 8).map((item) => item.id).reverse(),
    );
  });
  it("keeps an upgrade and drops its component in the same phase", () => {
    const [early] = mainBuild([
      [
        row(component.id, 1000, 100),
        row(upgrade.id, 900, 300),
        row(others[0].id, 800, 200),
      ],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([others[0].id, upgrade.id]);
  });
  it("drops a component bought less often than its upgrade", () => {
    const [early] = mainBuild([
      [row(upgrade.id, 1000, 300), row(component.id, 900, 100)],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([upgrade.id]);
  });
  it("drops components through a chain of upgrades", () => {
    const [early] = mainBuild([
      [row(root.id, 1000, 100), row(middle.id, 950, 200), row(chain.id, 900, 300)],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([chain.id]);
  });
  it("drops items listed in an earlier phase", () => {
    const [early, mid] = mainBuild([
      [row(others[0].id, 1000, 100)],
      [row(others[0].id, 2000, 700), row(others[1].id, 900, 800)],
      [],
    ]);
    expect(ids(early)).toEqual([others[0].id]);
    expect(ids(mid)).toEqual([others[1].id]);
  });
  it("ignores items bought in under 5% as many matches as the phase's top item", () => {
    const [early] = mainBuild([
      [
        row(others[0].id, 1000, 100),
        row(others[1].id, 49, 50),
        row(others[2].id, 50, 60),
      ],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([others[2].id, others[0].id]);
  });
  it("skips unknown items and labels the three phases", () => {
    const phases = mainBuild([
      [row(4_000_000_001, 5000, 10), row(others[0].id, 1000, 100, 0.6)],
      [],
      [],
    ]);
    expect(phases.map((p) => [p.key, p.label, p.range])).toEqual([
      ["early", "Early", "0–10 min"],
      ["mid", "Mid", "10–20 min"],
      ["late", "Late", "20+ min"],
    ]);
    expect(phases[0].items).toEqual([
      { itemId: others[0].id, winRate: 0.6, matches: 1000, avgBuyS: 100 },
    ]);
    expect(phases[1].items).toEqual([]);
  });
  it("asks for each phase's purchase window", () => {
    expect(PHASES.map(phaseParams)).toEqual([
      "min_bought_at_s=0&max_bought_at_s=600",
      "min_bought_at_s=600&max_bought_at_s=1200",
      "min_bought_at_s=1200",
    ]);
  });
  it("fetches one item-stats request per phase with the rank filter", async () => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return [];
      },
    } as unknown as DeadlockApi;
    const q = { minBadge: 71 };
    await fetchMainBuild(13, q, api);
    expect(calls).toEqual(
      PHASES.map(
        (phase) =>
          `/v1/analytics/item-stats?${analyticsParams(q)}&hero_id=13&${phaseParams(phase)}`,
      ),
    );
    expect(calls[0]).toContain("min_average_badge=71");
  });
});

describe("build phase timing", () => {
  it.each([
    ["00:00", "early"],
    ["09:59", "early"],
    ["10:00", "mid"],
    ["19:59", "mid"],
    ["20:00", "late"],
    ["75:30", "late"],
    ["", null],
    ["-1:00", null],
    ["10:60", null],
    ["unknown", null],
  ])("maps %s to %s", (clock, phase) => expect(buildPhase(clock)).toBe(phase));
});
```

`tests/heroes/analytics.test.ts`, add:

```ts
it("rankLabel names the rank filter", () => {
  expect(rankLabel(0)).toBe("All ranks");
  const [, first] = rankFilterOptions(catalog.ranks);
  expect(rankLabel(first.value)).toBe(first.label);
  expect(rankLabel(-5)).toBe("All ranks");
});
```

- [ ] **Step 2: Run** `npx vitest run tests/builds/main-build.test.ts tests/heroes/analytics.test.ts` → FAIL (modules or exports missing).
- [ ] **Step 3: Implement** the two modules and the `analytics.ts` exports exactly as above. Delete `src/features/builds/utils/recommendations.ts`. Move the artwork test into `tests/catalog/catalog.test.ts` and delete `tests/builds/recommendations.test.ts`. Run `grep -rn "recommendedBuild\|BuildStage\|builds/utils/recommendations" src tests web/app` and expect no hits.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**

```bash
git add -A src/features/builds src/features/heroes/utils/analytics.ts tests/builds tests/catalog/catalog.test.ts tests/heroes/analytics.test.ts
git commit -m "feat(builds): main build picks per phase from item stats"
```

---

### Task 2: Popular builds — parse as authored and fetch

> Revised after code review: `favorites` is `number | null`, `PopularBuildsResult` has `ranked`, unranked lists reload with `sort_by=updated_at` (failure keeps the first list) and have their counts cleared, the parser has no `any`, and descriptions cap at 4000 characters. The committed code is the reference.

**Files:**
- Create: `src/features/builds/utils/popular-builds.ts`
- Create: `src/features/builds/services/popular-builds.ts`
- Modify: `src/features/builds/services/build-analytics.ts` (use the shared `categoryName`, delete its private `groupName` and `names`/`PREFIX` constants)
- Create: `tests/builds/popular-builds.test.ts`

**Interfaces:**
- Produces `utils/popular-builds.ts`:

```ts
const PREFIX = "#Citadel_HeroBuilds_";
const NAMES: Record<string, string> = {
  "#Citadel_HeroBuilds_EarlyGame": "Early game",
  "#Citadel_HeroBuilds_MidGame": "Mid game",
  "#Citadel_HeroBuilds_LateGame": "Late game",
};

export interface BuildEntry {
  itemId: number;
  note?: string;
}
export interface BuildCategory {
  name: string;
  description: string;
  items: BuildEntry[];
}
export interface PopularBuild {
  id: number;
  name: string;
  authorId: number; // 0 when missing
  updatedAt: number; // unix seconds, 0 when missing
  favorites: number;
  categories: BuildCategory[];
}

// Moved unchanged from build-analytics.ts `groupName`.
export function categoryName(key: unknown): string {
  const raw = String(key ?? "Items");
  const mapped = NAMES[raw];
  if (mapped) return mapped;
  const readable = raw.startsWith(PREFIX)
    ? raw
        .slice(PREFIX.length)
        .replace(/_+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .trim()
        .toLowerCase()
    : raw;
  const text = readable.charAt(0).toUpperCase() + readable.slice(1);
  return (text || "Items").slice(0, 150);
}

const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function parsePopularBuilds(
  rows: unknown,
  heroId: number,
): PopularBuild[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: any) => {
    const build = row?.hero_build;
    const raw = build?.details?.mod_categories;
    if (
      build?.hero_id !== heroId ||
      !positive(build.hero_build_id) ||
      !Array.isArray(raw)
    )
      return [];
    const categories: BuildCategory[] = raw.slice(0, 64).map((group: any) => ({
      name: categoryName(group?.name),
      description: text(group?.description, 1000),
      items: (Array.isArray(group?.mods) ? group.mods : [])
        .slice(0, 128)
        .flatMap((mod: any) => {
          if (!positive(mod?.ability_id)) return [];
          const note = text(mod.annotation, 300);
          return [{ itemId: mod.ability_id, ...(note ? { note } : {}) }];
        }),
    }));
    if (!categories.some((group) => group.items.length)) return [];
    return [
      {
        id: build.hero_build_id,
        name: text(build.name, 200) || `Build #${build.hero_build_id}`,
        authorId: positive(build.author_account_id)
          ? build.author_account_id
          : 0,
        updatedAt: positive(build.last_updated_timestamp)
          ? build.last_updated_timestamp
          : 0,
        favorites: positive(row.num_favorites) ? row.num_favorites : 0,
        categories,
      },
    ];
  });
}
```

- Produces `services/popular-builds.ts`:

```ts
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parsePopularBuilds, type PopularBuild } from "../utils/popular-builds";

export const POPULAR_BUILDS = 5;
export const BUILD_WINDOW_DAYS = 60;
const DAY_S = 86_400;

export interface PopularBuildsResult {
  builds: PopularBuild[];
  english: boolean;
  authors: Map<number, string>;
}

export function popularBuildsPath(
  heroId: number,
  english: boolean,
  now: number = Date.now(),
): string {
  const since = (Math.floor(now / 1000 / DAY_S) - BUILD_WINDOW_DAYS) * DAY_S;
  return (
    `/v1/builds?hero_id=${heroId}&only_latest=true&sort_by=favorites` +
    `&sort_direction=desc&min_unix_timestamp=${since}&limit=${POPULAR_BUILDS}` +
    (english ? "&build_language=English" : "")
  );
}

export async function fetchPopularBuilds(
  heroId: number,
  api: DeadlockApi = deadlockApi,
  now: number = Date.now(),
): Promise<PopularBuildsResult> {
  const load = async (english: boolean) =>
    parsePopularBuilds(
      await api.get<unknown>(popularBuildsPath(heroId, english, now), TTL.analytics),
      heroId,
    );
  let english = true;
  let builds = await load(true);
  if (!builds.length) {
    english = false;
    builds = await load(false);
  }
  const ids = [...new Set(builds.map((build) => build.authorId).filter(Boolean))];
  const profiles = await fetchSteamProfiles(ids, api).catch(() => []);
  return {
    builds,
    english,
    authors: new Map(profiles.map((profile) => [profile.accountId, profile.name])),
  };
}
```

- [ ] **Step 1: Write the failing tests** — `tests/builds/popular-builds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog } from "@/shared/catalog";
import {
  categoryName,
  parsePopularBuilds,
} from "@/features/builds/utils/popular-builds";
import {
  fetchPopularBuilds,
  popularBuildsPath,
} from "@/features/builds/services/popular-builds";

const [a, b, c] = catalog.items.map((item) => item.id);
const NOW = Date.UTC(2026, 9, 22, 15);
const build = (id: number, extra: object = {}, hero = 13) => ({
  hero_build: {
    hero_id: hero,
    hero_build_id: id,
    author_account_id: 42,
    last_updated_timestamp: 1_790_000_000,
    name: `Build ${id}`,
    details: {
      mod_categories: [
        {
          name: "#Citadel_HeroBuilds_EarlyGame",
          description: "lane",
          mods: [{ ability_id: a, annotation: "buy first" }, { ability_id: b, annotation: null }],
        },
        { name: "", mods: [{ ability_id: c }, { ability_id: a }] },
        { name: "Notes", description: "read me", mods: null },
        { name: "Mystery", mods: [{ ability_id: 123 }, { ability_id: -1 }] },
      ],
    },
    ...extra,
  },
  num_favorites: 199,
});
function fakeApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const api = {
    get: async (path: string) => {
      calls.push(path);
      if (!(path in routes)) throw new Error(`unexpected ${path}`);
      const value = routes[path];
      if (value instanceof Error) throw value;
      return value;
    },
  } as unknown as DeadlockApi;
  return { api, calls };
}

describe("parsePopularBuilds", () => {
  it("keeps every category and item in the author's order", () => {
    const [parsed] = parsePopularBuilds([build(1)], 13);
    expect(parsed).toEqual({
      id: 1,
      name: "Build 1",
      authorId: 42,
      updatedAt: 1_790_000_000,
      favorites: 199,
      categories: [
        { name: "Early game", description: "lane", items: [{ itemId: a, note: "buy first" }, { itemId: b }] },
        { name: "Items", description: "", items: [{ itemId: c }, { itemId: a }] },
        { name: "Notes", description: "read me", items: [] },
        { name: "Mystery", description: "", items: [{ itemId: 123 }] },
      ],
    });
  });
  it("drops other heroes, empty builds and malformed rows", () => {
    const empty = build(2, { details: { mod_categories: [{ name: "x", mods: [] }] } });
    expect(parsePopularBuilds([build(1, {}, 7), empty, null, { hero_build: {} }], 13)).toEqual([]);
    expect(parsePopularBuilds({ not: "an array" }, 13)).toEqual([]);
  });
  it("names unnamed builds by id and tolerates missing author and date", () => {
    const [parsed] = parsePopularBuilds(
      [build(9, { name: "  ", author_account_id: null, last_updated_timestamp: "x" })],
      13,
    );
    expect([parsed.name, parsed.authorId, parsed.updatedAt]).toEqual(["Build #9", 0, 0]);
  });
  it("maps game category keys to readable names", () => {
    expect(categoryName("#Citadel_HeroBuilds_MidGame")).toBe("Mid game");
    expect(categoryName("#Citadel_HeroBuilds_SituationalPicks")).toBe("Situational picks");
    expect(categoryName("")).toBe("Items");
    expect(categoryName("Core")).toBe("Core");
  });
});

describe("fetchPopularBuilds", () => {
  const english = popularBuildsPath(13, true, NOW);
  const any = popularBuildsPath(13, false, NOW);
  it("asks for recent, most-favourited English builds", () => {
    expect(english).toBe(
      "/v1/builds?hero_id=13&only_latest=true&sort_by=favorites&sort_direction=desc&min_unix_timestamp=1787443200&limit=5&build_language=English",
    );
    expect(any).not.toContain("build_language");
  });
  it("names authors from one Steam lookup", async () => {
    const { api, calls } = fakeApi({
      [english]: [build(1), build(2, { author_account_id: 7 })],
      "/v1/players/steam?account_ids=42,7": [{ account_id: 42, personaname: "Ann" }],
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(result.builds.map((x) => x.id)).toEqual([1, 2]);
    expect(result.english).toBe(true);
    expect(result.authors.get(42)).toBe("Ann");
    expect(result.authors.has(7)).toBe(false);
    expect(calls).toHaveLength(2);
  });
  it("falls back to every language when there are no English builds", async () => {
    const { api } = fakeApi({
      [english]: [],
      [any]: [build(3)],
      "/v1/players/steam?account_ids=42": [],
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(result.builds.map((x) => x.id)).toEqual([3]);
    expect(result.english).toBe(false);
  });
  it("still returns builds when the author lookup fails", async () => {
    const { api } = fakeApi({
      [english]: [build(1)],
      "/v1/players/steam?account_ids=42": new Error("down"),
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(result.builds).toHaveLength(1);
    expect(result.authors.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/builds` → FAIL.
- [ ] **Step 3: Implement** both modules as above. In `build-analytics.ts`, import `categoryName` and replace `name: groupName(g.name)` with `name: categoryName(g.name)`; delete `PREFIX`, `names` and `groupName`. The existing `tests/builds/build-analytics.test.ts` must still pass unchanged.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(builds): popular community builds as authored`

---

### Task 3: Counter items — per-enemy lift and fetch

> Revised after code review: `counterItemsVs` ranks by a lower confidence bound and `CounterPick` has no `winRate` (see Decisions). The code below is the first version; the committed code is the reference.

**Files:**
- Create: `src/features/counters/utils/matchup-items.ts`
- Create: `src/features/counters/services/matchup-items.ts`
- Modify: `src/features/counters/utils/recommendations.ts` (`recommend` accepts hero references, not full players)
- Modify: `src/features/heroes/services/hero-analytics.ts` (`heuristicCounterItems` uses the narrower type)
- Create: `tests/counters/matchup-items.test.ts`
- Modify: `tests/counters/recommendations.test.ts` (one new case)

**Interfaces:**
- `recommend(enemies: Pick<Player, "heroId" | "heroName">[], items, budget, owned, manual?)`: only the parameter type changes; existing callers pass `Player[]` and still compile.
- `heuristicCounterItems(heroId)` becomes `recommend([{ heroId, heroName: heroById.get(heroId)?.name ?? "" }], catalog.items, 99999, []).map((r) => r.item)`, and the `Player` import goes away.
- Produces `utils/matchup-items.ts`:

```ts
import {
  overallRate,
  shopItems,
  type ItemStatsRow,
} from "@/features/heroes/utils/analytics";

export const MIN_VERSUS_MATCHES = 200;
export const COUNTER_ITEMS = 6;
export const MAX_ENEMIES = 6;

export interface VersusRows {
  heroId: number;
  rows: ItemStatsRow[];
}
export interface CounterPick {
  itemId: number;
  lift: number; // average over enemies with data; missing counts as 0
  winRate: number; // pooled across the picked enemies
  matches: number;
  against: number[]; // enemy hero ids with lift > 0, strongest first
}

export function counterItemsVs(
  baseline: ItemStatsRow[],
  versus: VersusRows[],
  exclude: ReadonlySet<number> = new Set(),
  n = COUNTER_ITEMS,
  minMatches = MIN_VERSUS_MATCHES,
): CounterPick[] {
  const base = shopItems(baseline);
  const totals = new Map<
    number,
    { deltas: { heroId: number; delta: number }[]; wins: number; matches: number }
  >();
  let enemies = 0;
  for (const { heroId, rows } of versus) {
    const vs = shopItems(rows);
    if (vs.size === 0) continue;
    enemies += 1;
    // Correct for the matchup itself: some enemies are simply easier to beat.
    const shift = overallRate(vs) - overallRate(base);
    for (const item of vs.values()) {
      const reference = base.get(item.itemId);
      if (!reference || item.matches < minMatches || exclude.has(item.itemId))
        continue;
      const total = totals.get(item.itemId) ?? { deltas: [], wins: 0, matches: 0 };
      total.deltas.push({
        heroId,
        delta: item.winRate - reference.winRate - shift,
      });
      total.wins += item.winRate * item.matches;
      total.matches += item.matches;
      totals.set(item.itemId, total);
    }
  }
  return [...totals]
    .map(([itemId, total]) => ({
      itemId,
      lift: total.deltas.reduce((sum, d) => sum + d.delta, 0) / enemies,
      winRate: total.wins / total.matches,
      matches: total.matches,
      against: total.deltas
        .filter((d) => d.delta > 0)
        .sort((x, y) => y.delta - x.delta || x.heroId - y.heroId)
        .map((d) => d.heroId),
    }))
    .filter((pick) => pick.lift > 0)
    .sort((x, y) => y.lift - x.lift || x.itemId - y.itemId)
    .slice(0, n);
}
```

- Produces `services/matchup-items.ts`:

```ts
import { deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchItemStats } from "@/features/heroes/services/hero-analytics";
import type { AnalyticsQuery, ItemStatsRow } from "@/features/heroes/utils/analytics";
import type { VersusRows } from "../utils/matchup-items";

// The baseline path is the same one HeroDetail's "Best items" uses, so the
// shared client serves it from cache; each enemy has its own cacheable path.
export async function fetchCounterData(
  heroId: number,
  enemies: number[],
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<{ baseline: ItemStatsRow[]; versus: VersusRows[] }> {
  const [baseline, versus] = await Promise.all([
    fetchItemStats(q, `hero_id=${heroId}`, api),
    Promise.all(
      enemies.map(async (enemy) => ({
        heroId: enemy,
        rows: await fetchItemStats(q, `hero_id=${heroId}&enemy_hero_ids=${enemy}`, api),
      })),
    ),
  ]);
  return { baseline, versus };
}
```

- [ ] **Step 1: Write the failing tests** — `tests/counters/matchup-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog } from "@/shared/catalog";
import { analyticsParams } from "@/features/heroes/utils/analytics";
import { counterItemsVs } from "@/features/counters/utils/matchup-items";
import { fetchCounterData } from "@/features/counters/services/matchup-items";

const [A, B, L] = catalog.items.filter((item) => item.cost > 0).map((item) => item.id);
const row = (itemId: number, rate: number, matches = 3000) => ({
  item_id: itemId,
  wins: matches * rate,
  losses: matches * (1 - rate),
  matches,
});
const baseline = [row(A, 0.5, 10000), row(B, 0.5, 10000), row(L, 0.5, 10000)];
const X = 101;
const Y = 102;
// Both enemies average 50%, so the matchup shift is 0 and lifts are raw.
const vsX = { heroId: X, rows: [row(A, 0.6), row(B, 0.5), row(L, 0.4)] };
const vsY = { heroId: Y, rows: [row(A, 0.5), row(B, 0.56), row(L, 0.44)] };

describe("counterItemsVs", () => {
  it("ranks by average lift and names the enemies each item beats", () => {
    const picks = counterItemsVs(baseline, [vsX, vsY]);
    expect(picks.map((p) => p.itemId)).toEqual([A, B]);
    expect(picks[0].lift).toBeCloseTo(0.05);
    expect(picks[0].winRate).toBeCloseTo(0.55);
    expect(picks[0].matches).toBe(6000);
    expect(picks[0].against).toEqual([X]);
    expect(picks[1].lift).toBeCloseTo(0.03);
    expect(picks[1].against).toEqual([Y]);
  });
  it("corrects for an enemy that is easy to beat overall", () => {
    const easy = { heroId: X, rows: [row(A, 0.7), row(B, 0.6), row(L, 0.5)] };
    const [top, ...rest] = counterItemsVs(baseline, [easy]);
    expect(top.itemId).toBe(A);
    expect(top.lift).toBeCloseTo(0.1);
    expect(rest).toEqual([]);
  });
  it("counts a missing item as no lift against that enemy", () => {
    const withoutA = { heroId: Y, rows: [row(B, 0.56), row(L, 0.44)] };
    const [top] = counterItemsVs(baseline, [vsX, withoutA]);
    expect(top.itemId).toBe(A);
    expect(top.lift).toBeCloseTo(0.05);
  });
  it("needs enough matches and leaves out excluded items", () => {
    const thin = { heroId: X, rows: [row(A, 0.9, 199), row(B, 0.6), row(L, 0.4)] };
    expect(counterItemsVs(baseline, [thin]).map((p) => p.itemId)).toEqual([B]);
    expect(counterItemsVs(baseline, [vsX, vsY], new Set([A])).map((p) => p.itemId)).toEqual([B]);
  });
  it("returns at most n items and nothing without data", () => {
    expect(counterItemsVs(baseline, [vsX, vsY], new Set(), 1)).toHaveLength(1);
    expect(counterItemsVs(baseline, [])).toEqual([]);
    expect(counterItemsVs([], [vsX])).toEqual([]);
  });
});

describe("fetchCounterData", () => {
  it("fetches the hero baseline and one request per enemy", async () => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return [];
      },
    } as unknown as DeadlockApi;
    const q = { minBadge: 0 };
    const data = await fetchCounterData(13, [7, 8], q, api);
    const base = `/v1/analytics/item-stats?${analyticsParams(q)}&hero_id=13`;
    expect(calls).toEqual([base, `${base}&enemy_hero_ids=7`, `${base}&enemy_hero_ids=8`]);
    expect(data.versus.map((v) => v.heroId)).toEqual([7, 8]);
  });
});
```

`tests/counters/recommendations.test.ts`, add:

```ts
it("accepts hero references without full player rows", () => {
  const hero = catalog.heroes.find((h) => heroThreats[h.id])!;
  const list = recommend([{ heroId: hero.id, heroName: hero.name }], catalog.items, 6400, []);
  expect(list.length).toBeGreaterThan(0);
  expect(list[0].targets).toContain(hero.name);
});
```

(Import `heroThreats` / `catalog` there if not already imported.)

- [ ] **Step 2: Run** `npx vitest run tests/counters` → FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(counters): data-driven counter items by per-enemy win-rate lift`

---

### Task 4: Hero page — Build and Popular builds tabs

**Files:**
- Create: `src/features/builds/components/BuildItem.tsx`
- Create: `src/features/builds/components/MainBuild.tsx`
- Create: `src/features/builds/components/PopularBuilds.tsx`
- Modify: `src/features/heroes/components/HeroDetail.tsx`
- Delete: `src/features/heroes/components/HeroBuild.tsx`
- Modify: `src/features/builds/styles/builds.css`, `src/features/heroes/styles/hero-detail.css`
- Delete: `src/features/builds/styles/measured-build.css` and its `@import` in `src/app/styles/index.css`
- Test: `tests/browser/hero-detail.spec.ts`

**Interfaces:**
- `BuildItem({ itemId, sub, note, owned }: { itemId: number; sub?: string; note?: string; owned?: boolean })`
  - Known item: `RouteLink` to `{ page: "items", itemId }` with className `build-item {category}` (+ ` owned`, + ` has-note`) and title `"{name} · {cost} souls"` (+ `"\n{note}"`). Inside: `span.build-art` holding `ItemIcon` (+ `span.owned-mark` "✓" when owned), then `strong` name, then `small` sub (only when given).
  - Unknown id: `span.build-item.unknown[title="Unknown item #{id}"]` with `strong` "Item #{id}".
- `MainBuild({ state, owned = [], now = null }: { state: AsyncState<MainBuildPhase[]>; owned?: number[]; now?: PhaseKey | null })`
  - Loading: `p.build-empty[role=status]` "Loading build…".
  - Error: `p.build-empty[role=status]` "Build unavailable: {error} " plus `button.retry` "Retry" (calls `state.retry`).
  - Data: `div.main-build` with one `div.build-phase` per phase (`data-phase={key}`, plus class `now` when `key === now`).
    - `div.phase-label`: `b` label, `span` range, and `em` "Now" when current.
    - `div.phase-items`: a `BuildItem` per item, with sub `OWNED` when `owned.includes(id)`, otherwise `${Math.round(winRate * 100)}% win`.
    - When there are fewer than `PHASE_SIZE` items: `p.phase-short` with "Not enough data for this phase." (0 items) or "Only {n} items were bought often enough in this phase." (1 item reads "Only 1 item was bought often enough in this phase.").
- `PopularBuilds({ state }: { state: AsyncState<PopularBuildsResult> })`
  - Loading: `p.build-empty[role=status]` "Loading popular builds…".
  - Error: `p.build-empty[role=status]` "Popular builds unavailable: {error} " plus Retry.
  - Empty: `p.build-empty` "No community builds for this hero were updated in the last 60 days."
  - Data:
    - `p.data-note` (ranked or most-recent wording, with the non-English prefix when `english` is false; see Global Constraints);
    - `div.popular-build-tabs[role=group][aria-label="Popular builds"]`: a `button.build-tab` per build (`aria-pressed`, text = build name, `title` = build name);
    - `article.popular-build` for the selected build (local `useState(0)`):
      - `div.popular-build-meta`: `h3` name, then `p` meta line ("by …" only when `authors.get(authorId)` is known; date formatted with `toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })` and omitted when `updatedAt` is 0; item count = sum of category item lengths; "1 favourite" / "N favourites", omitted when `favorites` is `null`);
      - one `section.build-category` per category, keyed by index (several categories can share the name "Items"): `h4.build-category-name`, `p.build-category-desc` (only when non-empty), and `div.build-category-items` of `BuildItem itemId note` (omitted when the category has no items).
- `HeroDetail` structure, top to bottom:
  1. `HeroHeader` (unchanged), then the summaries error notice (unchanged).
  2. `div.hero-detail-body` containing:
     - `div.build-tabs[role=tablist][aria-label="Builds"]` with two `button[role=tab]`s:
       - "Build";
       - "Popular builds", followed by `small.tab-count` with the build count when popular builds have loaded and there is at least one.
       - Ids come from `useId()`. Each tab has `aria-selected` and `aria-controls`, and `tabIndex` is 0 for the selected tab and −1 for the other. ArrowLeft / ArrowRight / Home / End move the selection and focus.
     - `div[role=tabpanel]` for Build (hidden unless selected): `p.data-note` "Most-bought items in each phase · {rankLabel(query.minBadge)} · last 30 days · win rate under each item", then `MainBuild`.
     - `div[role=tabpanel]` for Popular builds: `PopularBuilds`.
     - Then the existing sections in this order: Skill order, then `.detail-grid` with Strong against, Countered by, Best with, Best items, and **"Items that beat {hero.name}"** (today's "Counter items" section, renamed only). Task 5 inserts "Counter items" between the tab panels and Skill order.
  3. Data: `const build = useAsync(() => fetchMainBuild(heroId, query), deps)`; `const popular = useAsync(() => fetchPopularBuilds(heroId), [heroId])`. Remove the `HeroBuild` import and its "Build" `Section`.

**CSS** (tokens only; look from the prototype's `.htabs`, `.mainbuild`, `.phase`, `.plabel`, `.item`, `.pbtabs`, `.btn`, `.pbuild`, `.pbmeta`, `.pcat`, `.pcname`):
- `hero-detail.css`: `.build-tabs` (flex, gap 28px, bottom border `--line`; tabs Rajdhani 700 18px uppercase, `--muted`; selected tab `--cream` with a 3px `--gold` bottom border; `.tab-count` Rajdhani 12px on `--line`). Delete the `.hero-build*` and `.hero-detail .build-empty` rules.
- `builds.css`:
  - Delete the now-unused `.build-history*`, `.build-stages`, `.build-stage*`, `.stage-time`, `.stage-now`, `.current-stage`, `.flex-label` and `.build-empty-stage` rules. Grep each selector in `src` first, and keep any that `CompactBuild` or `panels.css` still use.
  - `.main-build`: surface panel with `--line` border.
  - `.build-phase`: flex, 18px gap, 14px 18px padding, `--line-soft` dividers. `.build-phase.now` gets a gold-tinted gradient.
  - `.phase-label`: 96px wide; `b` in Rajdhani 20px uppercase; `em` as a gold tag.
  - `.phase-items`: `display: grid; grid-template-columns: repeat(8, minmax(0, 96px)); gap: 10px`.
  - `.build-item`: column; 54px category-tinted icon square from the prototype's `.item .icon` with `--weapon`/`--vitality`/`--spirit`; 11.5px name; `small` in `--muted`. `.owned` gets a gold border. `.has-note .build-art::after` is a 6px `--gold` dot in the top-right corner.
  - `.popular-build-tabs .build-tab`: the prototype's `.btn`, with `[aria-pressed=true]` styled like `.btn.on`, `max-width: 22ch` and ellipsis.
  - `.popular-build`: surface panel, 16px 18px padding. `h3` in Playfair Display SC 22px.
  - `.build-category`: top border `--line-soft`; `.build-category-name` Rajdhani 14px uppercase `--gold`; `.build-category-items` as a wrapping flex of tiles 84px wide.
  - `@media (max-width: 640px)`: `.build-phase` stacks vertically and `.phase-items` uses `repeat(4, minmax(0, 1fr))`.

- [ ] **Step 1: Write the failing tests** (`tests/browser/hero-detail.spec.ts`)
  - **Fixtures.** Add at the top:

```ts
const pool = catalog.items.filter(
  (entry) =>
    entry.image &&
    entry.cost > 0 &&
    !entry.components?.length &&
    !shopItems.includes(entry),
);
const upgrade = catalog.items.find(
  (entry) =>
    entry.image &&
    entry.components?.length === 1 &&
    pool.some((p) => p.className === entry.components![0]),
)!;
const component = pool.find((p) => p.className === upgrade.components![0])!;
const plain = pool.filter((p) => p.id !== component.id);
const earlyItems = plain.slice(0, 7);
const [extra, rare] = plain.slice(7, 9);
const midItems = plain.slice(9, 12);
const phaseRow = (itemId: number, matches: number, buyS: number, rate = 0.55) => ({
  item_id: itemId,
  wins: matches * rate,
  losses: matches * (1 - rate),
  matches,
  avg_buy_time_s: buyS,
});
const phaseRows = [
  [
    phaseRow(component.id, 9000, 100),
    phaseRow(upgrade.id, 8800, 400),
    ...earlyItems.map((entry, i) => phaseRow(entry.id, 8000 - i * 100, 500 - i * 10)),
    phaseRow(extra.id, 7000, 50),
    phaseRow(rare.id, 300, 30),
  ],
  [phaseRow(earlyItems[0].id, 9000, 700), ...midItems.map((entry, i) => phaseRow(entry.id, 5000 - i * 100, 800 + i))],
  [],
];
const AUTHOR = 424242;
const popularRows = [
  {
    hero_build: {
      hero_id: haze.id,
      hero_build_id: 501,
      author_account_id: AUTHOR,
      last_updated_timestamp: 1_791_000_000,
      name: "Fixture Popular One",
      details: {
        mod_categories: [
          { name: "#Citadel_HeroBuilds_EarlyGame", description: "Lane first", mods: [{ ability_id: bestA.id, annotation: "rush it" }, { ability_id: bestB.id }] },
          { name: "", mods: [{ ability_id: losing.id }, { ability_id: bestA.id }] },
          { name: "Notes", description: "Only words here", mods: [] },
        ],
      },
    },
    num_favorites: 199,
  },
  {
    hero_build: {
      hero_id: haze.id,
      hero_build_id: 502,
      author_account_id: AUTHOR,
      last_updated_timestamp: 1_791_000_000,
      name: "Fixture Popular Two",
      details: { mod_categories: [{ name: "Core", mods: [{ ability_id: counterA.id }] }] },
    },
    num_favorites: 1,
  },
];
```

  - **Fixtures interface.** Add `phases?: unknown[][]`, `popular?: unknown`, `vsEnemy?: Record<number, unknown[]>` (default `{}`) and `url?: string` (default `"/"`).
  - **Route handler.** The `item-stats` case becomes:

```ts
case "/v1/analytics/item-stats": {
  const p = url.searchParams;
  if (p.has("min_bought_at_s"))
    return json(phases[Number(p.get("min_bought_at_s")) / 600] ?? []);
  if (p.has("hero_id") && p.has("enemy_hero_ids"))
    return json(vsEnemy[Number(p.get("enemy_hero_ids"))] ?? []);
  if (p.has("hero_id")) return json(forHero);
  if (p.has("enemy_hero_ids")) return json(versus);
  return json(base);
}
case "/v1/builds":
  return json(popular);
case "/v1/players/steam":
  return json([{ account_id: AUTHOR, personaname: "Fixture Author" }]);
```

    Delete the `hero-build-stats` / `builds/{id}/99` cases. `openHaze` does `page.goto(url)`.
  - In "detail sections render…": replace the `Counter items` block with `section(page, "Items that beat Haze")` (same expectations), and delete the two `section(page, "Build")` lines.
  - Add the new tests:
    - `Build tab is selected and lists the main build per phase`:
      - tab "Build" has `aria-selected="true"`;
      - the note contains "Most-bought items in each phase · All ranks · last 30 days";
      - `.build-phase[data-phase=early] .build-item strong` texts equal `[upgrade, ...[...earlyItems].reverse()].map((e) => e.name)`, so `component`, `extra` and `rare` are absent;
      - the first early tile's `small` is "55% win";
      - mid tiles equal `midItems` names, and `.build-phase[data-phase=mid] .phase-short` reads "Only 3 items were bought often enough in this phase.";
      - late `.phase-short` reads "Not enough data for this phase.";
      - `.phase-label` texts contain "Early", "0–10 min", "Mid", "10–20 min", "Late" and "20+ min";
      - clicking the first early tile switches to the Items tab (`button` "Items" gets class `active`).
    - `Popular builds tab shows each build exactly as authored`:
      - the tab shows `small.tab-count` "2";
      - pressing ArrowRight on the focused Build tab selects "Popular builds";
      - the note contains "Most-favourited builds updated in the last 60 days";
      - two `.build-tab` buttons, the first `aria-pressed="true"`;
      - `.popular-build h3` is "Fixture Popular One"; the meta contains "by Fixture Author", "Updated", "4 items in 3 categories" and "199 favourites";
      - `.build-category-name` texts are `["Early game", "Items", "Notes"]`;
      - the first category's items are `[bestA, bestB]` names, with `title` of the first containing "rush it" and class `has-note`;
      - the second category's items are `[losing, bestA]` (duplicate kept);
      - "Notes" shows "Only words here" and has no `.build-item`;
      - clicking the second `.build-tab` shows "Fixture Popular Two" and "1 favourite".
    - `popular builds empty state`: `openHaze(page, { popular: [] })` → tab without `.tab-count`; the panel says "No community builds for this hero were updated in the last 60 days."
    - `popular builds without favourite counts say they are recent`: `openHaze(page, { popular: popularRows.map((row) => ({ ...row, num_favorites: null })) })`, open the tab → the note contains "Community builds updated in the last 60 days" and "This hero has no favourite counts yet.", and `.popular-build-meta` does not contain "favourite".
    - `main build rows fit at the minimum window width`: `page.setViewportSize({ width: 850, height: 650 })` then `openHaze`. `.main-build` has `scrollWidth <= clientWidth`, `document.documentElement.scrollWidth <= 850`, and all 8 early tiles share the same `top`.
  - Update "thin data shows Not enough data…": also pass `phases: [[], [], []]`. Each `.phase-short` reads "Not enough data for this phase." The rest stays, but uses `section(page, "Items that beat Haze")` for the heuristic assertions.
- [ ] **Step 2: Run** `npx playwright test tests/browser/hero-detail.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the components, `HeroDetail` changes and CSS. Delete `HeroBuild.tsx` and `measured-build.css`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`, `npm run test:browser`, `npm run test:web` → PASS. Web tests that fail only because `/v1/builds` or phase rows are missing from `tests/web-browser/fixtures.ts` are fixed in Task 7. If any fail now, add the minimal fixture rows from Task 7 here.
- [ ] **Step 5: Commit** `feat(heroes): build and popular builds tabs on the hero page`

---

### Task 5: Hero page — Counter items with enemy picker and live roster

> Revised after code review: live mode is decided after filtering (no displayable live enemy → manual picker); `exclude` is `null` until the main build settles and the section shows Loading meanwhile; chooser names wrap to two lines and the chooser uses ~5 columns with a sticky Done row on phones. The committed code is the reference.

**Files:**
- Create: `src/features/counters/components/CounterCard.tsx`
- Modify: `src/features/counters/components/CounterPanel.tsx` (render cards through `CounterCard`; no visual change)
- Create: `src/features/counters/components/CounterItems.tsx`
- Modify: `src/features/heroes/components/HeroDetail.tsx`, `src/features/heroes/components/HeroesPage.tsx`
- Modify: `src/app/DesktopApp.tsx`
- Modify: `src/features/counters/styles/counters.css`
- Test: `tests/browser/hero-detail.spec.ts`

**Interfaces:**
- `CounterCard({ item, label, targets, children }: { item: Item; label: string; targets: string[]; children: ReactNode })` renders today's `article.item-card` markup from `CounterPanel`:
  - `div.item-top`, holding `ItemIcon`, then a `div` with `span.item-label` {label} and `h3` {item.name}, then `span.price` {cost}`<small>SOULS</small>`;
  - `<p>{children}</p>`;
  - `div.targets` with one `span` per target.
  - `CounterPanel` maps its recommendations to `<CounterCard key item label={i === 0 ? "CONSIDER FIRST" : category.toUpperCase()} targets={entry.targets}>{entry.reasons.join(" ")}</CounterCard>`.
- `CounterItems(props: { hero: Hero; query: AnalyticsQuery; picks: number[]; setPicks(picks: number[]): void; liveEnemies: number[]; exclude: ReadonlySet<number> })`
  - `enemies = (liveEnemies.length ? liveEnemies : picks).filter((id) => id !== hero.id && heroById.has(id)).slice(0, MAX_ENEMIES)`.
  - `data = useAsync(enemies.length ? () => fetchCounterData(hero.id, enemies, query) : null, [hero.id, query.minBadge, enemies.join(",")])`.
  - `picksVs = data.data ? counterItemsVs(data.data.baseline, data.data.versus, exclude) : []`.
  - `fallback = recommend(enemies.map((id) => ({ heroId: id, heroName: heroById.get(id)!.name })), catalog.items, 6400, [])`, used only when the data list is empty after loading, or on error.
- `HeroDetail` gains props `liveEnemies: number[]`, `enemyPicks: number[]`, `setEnemyPicks(picks: number[]): void`. It renders `Section title="Counter items"` → `CounterItems` between the tab panels and Skill order. It passes `exclude = new Set(build.data?.flatMap((phase) => phase.items.map((item) => item.itemId)) ?? [])`.
- `HeroesPage` gains optional prop `liveEnemies?: number[]` (default `[]`) and state `const [enemyPicks, setEnemyPicks] = useState<number[]>([])`, passing both to `HeroDetail`. Picks survive moving between heroes (same enemy team, different hero), and the current hero is filtered out at display time.
- `DesktopApp` passes `liveEnemies={status === "in-match" ? counters.teams.enemies.map((p) => p.heroId) : []}` to `HeroesPage`. The website passes nothing.

**Behaviour** (markup in `div.counter-items`):
1. `p.data-note`: "Items that gain the most win rate for {Hero} against these heroes, compared with all {Hero} games and allowing for the matchup itself. Only clear gains are shown · {rankLabel} · last 30 days."
2. `div.enemy-picker`:
   - `span.picker-label` "Enemy team".
   - **Live** (`liveEnemies.length > 0`): a `span.enemy-slot.filled` per enemy (`Picture` with the hero's `cardImage ?? image`, `title` = name), then `p.picker-note` "Enemy team from your live match.". No buttons.
   - **Manual:**
     - a `button.enemy-slot.filled[aria-label="Remove {name}"]` per pick (click removes it);
     - then, if fewer than 6 picks, one `button.enemy-slot.add[aria-label="Add enemy hero"][aria-expanded]` "+" that toggles the chooser, followed by decorative `span.enemy-slot[aria-hidden=true]` to make 6 slots;
     - then `button.text-button` "Clear" when there are picks.
3. Chooser (manual mode, when open): `div.enemy-choices[role=group][aria-label="Choose enemy heroes"]` holds A–Z `button.enemy-choice[aria-pressed][aria-label={name}]` for every catalog hero except this one. Each has a `Picture` and a `span` name. A button is disabled when 6 are picked and it isn't pressed. Clicking toggles the pick. After the grid comes `button.text-button` "Done", which closes the chooser. Escape also closes it and returns focus to "Add enemy hero".
4. Results:
   - No enemies: `p.muted` "Pick up to 6 enemy heroes to see items that do well against them."
   - Loading: `p.muted` "Loading…".
   - Data (`picksVs.length`): `div.counter-cards` of `CounterCard`. Label "CONSIDER FIRST" for the first, the category upper-cased for the rest. Body `+{(lift*100).toFixed(1)}% vs these heroes · {matches.toLocaleString()}+ games`. Targets are the `against` hero names (may be empty).
   - Fallback: `p.data-note` with "Based on hero traits — match data shows no clear counter items against these heroes yet.", or "Match data unavailable: {error}. Based on hero traits instead." followed by a Retry `button.retry`. Then `div.counter-cards` of `CounterCard` with `reasons.join(" ")` and `targets`. If the fallback is empty too: `p.muted` "No suggestions for these heroes yet."

**CSS** (`counters.css`, tokens only; look from the prototype's `.picker`, `.slot`, `.ccards`):
- `.enemy-picker`: flex, 8px gap, wrapping.
- `.enemy-slot`: 46px square with a dashed `--line` border; `.filled` gets a solid `--bad` border with the portrait `object-fit: cover; object-position: center 15%`; `.add` uses `--dim` "+" at 20px.
- `.enemy-choices`: `grid-template-columns: repeat(auto-fill, minmax(64px, 1fr))`, 6px gap, surface panel. A pressed `.enemy-choice` gets a `--gold` border; disabled choices get opacity .4.
- `.counter-cards`: `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px`.
- At ≤640px `.counter-cards` becomes one column.

- [ ] **Step 1: Write the failing tests** (`hero-detail.spec.ts`; reuse Task 4's fixtures). Counter fixtures:

```ts
const counterBase = [
  itemRow(bestA.id, 0.5),
  itemRow(bestB.id, 0.5),
  itemRow(losing.id, 0.5),
];
const vsRows = (a: number, b: number, l: number) => [
  itemRow(bestA.id, a, 3000),
  itemRow(bestB.id, b, 3000),
  itemRow(losing.id, l, 3000),
];
const counterVs = {
  [strongA.id]: vsRows(0.6, 0.5, 0.4),
  [strongB.id]: vsRows(0.5, 0.56, 0.44),
};
```

  - `counter items: pick enemies and see what does well against them`:
    - `openHaze(page, { heroItems: counterBase, vsEnemy: counterVs })`;
    - section "Counter items" shows "Pick up to 6 enemy heroes…";
    - click "Add enemy hero", then the choice named `strongA.name`; the `.item-card` list is `[bestA]` with text "+10.0% vs these heroes · 3,000+ games" and target `strongA.name`;
    - the label is "CONSIDER FIRST";
    - pick `strongB`: cards are `[bestA, bestB]`, the first body has "+5.0% vs these heroes · 3,000+ games", the second's targets are `[strongB.name]`;
    - there is no "Haze" choice in the chooser (`getByRole("button", { name: "Haze", exact: true })` inside `.enemy-choices` has count 0);
    - "Done" hides `.enemy-choices`;
    - `getByRole("button", { name: \`Remove ${strongB.name}\` })` → cards are `[bestA]`;
    - the note contains "Items that gain the most win rate for Haze against these heroes".
  - `re-picking an enemy reuses its cached request`:
    - record item-stats requests, reading parameters with `new URL(request.url()).searchParams` (substring checks would confuse `hero_id` with `enemy_hero_ids`);
    - pick strongA, pick strongB, remove strongB, pick strongB again;
    - requests with both `hero_id` and `enemy_hero_ids` number exactly 2 (one per enemy);
    - requests with `hero_id` and neither `enemy_hero_ids` nor `min_bought_at_s` number exactly 1.
  - `counter items fall back to hero traits without match data`: `openHaze(page, { vsEnemy: {} })` and pick a hero that has a `heroThreats` profile (import it from `src/features/counters/utils/recommendations`). The section contains "Based on hero traits", at least one `.item-card`, and no "Not enough data".
  - `six picks disable the rest of the chooser`: pick 6 heroes; "Add enemy hero" is gone; 6 `.enemy-slot.filled`.
  - `in a live match the enemy team fills counter items`:
    - `nativeWindow(page, "desktop")` (import from `./helpers`; its roster has enemy hero 13 = Haze);
    - `openHaze(page, { heroItems: counterBase, vsEnemy: { [haze.id]: vsRows(0.6, 0.5, 0.4) } }, strongA, "/desktop/desktop.html")`;
    - the section shows "Enemy team from your live match.", 1 `.enemy-slot.filled`, and no "Add enemy hero" button;
    - the first card's targets contain "Haze".
    - `openHaze` must click the Heroes tab after the auto-switch to Live, which the existing code already does via the "Heroes" button.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`, `npm run test:browser` → PASS (CounterPanel's Live tests unchanged).
- [ ] **Step 5: Commit** `feat(heroes): counter items with enemy picker and live enemy team`

---

### Task 6: Live tab build panel uses the main build

**Files:**
- Modify: `src/features/builds/components/BuildPanel.tsx`
- Modify: `src/features/match/components/MatchOverview.tsx`, `src/features/live/components/LivePage.tsx`, `src/app/DesktopApp.tsx` (pass `query`)
- Modify: `src/features/builds/styles/builds.css` (header tweaks only)
- Test: `tests/browser/feature-boundaries.spec.ts`

**Interfaces:**
- `BuildPanel({ catalog, state, query }: { catalog: Catalog; state: MatchState; query: AnalyticsQuery })`. `MatchOverview` and `LivePage` gain `query: AnalyticsQuery` and pass it through; `DesktopApp` passes its existing `query`.

**Behaviour:**
- Keep the hero `select[aria-label="Build hero"]` (local hero by default) and the collapse button.
- Heading: eyebrow "MOST-BOUGHT ITEMS · {rankLabel(query.minBadge)}", `h2` "Your build" with `span` hero name ("Choose a hero" when none), and the portrait.
- Remove the "Build performance" group and the community-build name line.
- Content:
  - Street Brawl: `p.build-empty[role=status]` "Build statistics for Street Brawl are unavailable." with **no request**: `useAsync(null, …)`.
  - No hero: "Select a hero to see its build."
  - Otherwise: `MainBuild state={build} owned={owned} now={buildPhase(state.clock)}`, where `build = useAsync(id && state.gameMode !== "street_brawl" ? () => fetchMainBuild(id, query) : null, [id, query.minBadge, state.gameMode])`. Then `p.build-source` "Most-bought items in each phase · {rank} · last 30 days · win rate under each item. Same build as the hero page."
- Owned items are marked as today (local player's items, only when the selected hero is the local hero).

- [ ] **Step 1: Write the failing tests** (`feature-boundaries.spec.ts`)
  - Add helper:

```ts
async function mainBuildResponses(page: Page, rows: Record<number, unknown[]>) {
  await page.route("**/v1/analytics/item-stats?**", (route) => {
    const url = new URL(route.request().url());
    const hero = Number(url.searchParams.get("hero_id"));
    const from = url.searchParams.get("min_bought_at_s");
    return route.fulfill({
      json: from === "0" ? (rows[hero] ?? []) : [],
      headers: { "access-control-allow-origin": "*" },
    });
  });
}
const buyRow = (itemId: number) => ({
  item_id: itemId,
  wins: 6,
  losses: 4,
  matches: 10,
  avg_buy_time_s: 120,
});
```

  - `desktop retains counter state across tabs…`: also call `mainBuildResponses(page, { 7: [buyRow(item.id)] })` and replace `toContainText("Fixture build")` with: `.build-panel h2` contains "Your build"; `.build-panel .build-item.owned` contains `item.name` with `small` "OWNED"; `.build-phase[data-phase=mid]` has class `now` and contains "Now" (clock 12:34).
  - Rewrite "changing build hero aborts…" as `changing build hero shows only the new hero's build`:
    - route item-stats for `hero_id=7` to never respond;
    - `hero_id=13` returns `[buyRow(catalog.items[1].id)]` at phase 0 and `[]` otherwise (import `catalog` from the JSON as in other specs);
    - go to `/desktop/desktop.html`, wait for a `hero_id=7` item-stats request, then select "13";
    - `.build-panel` contains `catalog.items[1].name`, has no `.build-empty`, and does not contain `item.name`.
  - Street Brawl loop: for `desktop`, collect requests whose URL contains `min_bought_at_s`; for `in_game`, keep `hero-build-stats`. Both lists must be `[]`, and the messages stay as today.
  - Timeout loop: keep the `in_game` case only. Add a separate `desktop build shows an error with Retry`:
    - route item-stats to `status: 500` for the first request only (track a flag), then `buyRow(item.id)` rows at phase 0. Every response, the 500 included, carries `access-control-allow-origin: *`; without it the browser reports a network error instead of the 500;
    - `.build-empty` contains "Build unavailable: Deadlock API unavailable (500)."
    - click "Retry" → `.build-item` contains `item.name`.
- [ ] **Step 2: Run** `npx playwright test tests/browser/feature-boundaries.spec.ts` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run test:browser` → PASS.
- [ ] **Step 5: Commit** `feat(live): Live build panel shows the main build`

---

### Task 7: Website, phone widths, docs and final check

**Files:**
- Modify: `tests/web-browser/fixtures.ts`, `tests/web-browser/heroes-items.spec.ts`, `tests/web-browser/mobile.spec.ts`
- Modify (only if a test shows overflow): `src/features/builds/styles/builds.css`, `src/features/counters/styles/counters.css`, `web/app/styles/phone.css`
- Modify: `README.md` (hero page: main build, popular builds, counter items; data sources), `docs/superpowers/specs/2026-10-21-redesign-design.md` (mark phase 2 done in "Delivery phases", as phase 1 is)

- [ ] **Step 1: Write the failing tests**
  - `fixtures.ts` `mockApi`:
    - The item-stats case becomes, checked in this order:
      - `min_bought_at_s=0`: `catalog.items.filter((e) => e.image && e.cost > 0 && !e.components?.length).slice(12, 20)` as rows at 0.55 with `avg_buy_time_s: 100 + i * 10`;
      - `600`: the next 4 of that list;
      - `1200`: `[]`;
      - `hero_id` + `enemy_hero_ids`: `[itemRow(shopItems[0].id, 0.7), ...shopItems.slice(1, 6).map((e) => itemRow(e.id, 0.58))]`;
      - `hero_id` alone and no-hero: as today.
    - Add `case "/v1/builds"`: one Haze build (`hero_build_id: 900`, name "Web Fixture Build", author `FARGO`, two categories "#Citadel_HeroBuilds_EarlyGame" with `shopItems[0..2]` and "Late" with `shopItems[3..5]`, `num_favorites: 12`).
    - `/v1/players/steam` already answers with the FARGO persona.
  - `heroes-items.spec.ts` `hero page builds tabs and counter picks work on the website` (`/heroes/haze`):
    - exactly 3 `.build-phase` rows; early holds 8 `a.build-item` whose `href` starts with `/items/`;
    - the "Popular builds" tab shows count "1"; selecting it shows "Web Fixture Build" and "by A Rather Long Persona Name Fixture";
    - "Add enemy hero", then pick `catalog.heroes.find((h) => h.name !== "Haze")!.name`: `.item-card` count 1 with `shopItems[0].name`.
  - `mobile.spec.ts`:
    - `/heroes/haze` ready also waits for `.build-phase .build-item` visible;
    - in the `/heroes/haze` block, after the tooltip check:
      - click the "Popular builds" tab and re-run the scroll and clipping checks;
      - click "Build", then "Add enemy hero", pick two heroes, and re-run the checks;
      - assert `.enemy-choices` box right edge ≤ 375;
      - assert each early `.phase-items` row holds at most 4 tiles per line (`new Set(tops).size >= 2` for 8 tiles).
    - Add `main build tiles never squeeze below their art on the website`: for widths 640, 680, 720, 760 and 800, open `/heroes/haze` and assert every `.build-phase[data-phase=early] .build-item` is at least as wide as its `.build-art` and the page has no horizontal scroll.
- [ ] **Step 2: Run** `npm run test:web` → FAIL.
- [ ] **Step 3: Implement** fixture rows, then any CSS fixes the phone checks need. Update README and the spec's "Delivery phases" ("2. **Hero page builds (done):** …").
- [ ] **Step 4: Run everything:**
  1. Run `npm test`, `npx tsc --noEmit`, `npm run web:typecheck`, `npm run build`, `npm run web:build`, `npm run test:browser`, `npm run test:web` → all PASS.
  2. Check `npm run validate:manifest` still passes (no manifest change expected).
  3. Then compare against the prototype's hero page (desktop and "Show as website") in the real app:
     - Desktop preview: `npm run dev`, open Heroes → Haze.
     - Web preview: `npm run web:build && npm run web:preview`, open `/heroes/haze`.
     - Check the Build tab, the Popular builds tab (switch builds, hover a tile with a note), Counter items (pick 3 enemies), and a phone width of 375px.
  4. Fix visible mismatches before committing.
- [ ] **Step 5: Commit** `feat(web): hero page builds on the website; docs`
