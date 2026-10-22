import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { heroThreats } from "../../src/features/counters/utils/recommendations";
import { nativeWindow } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const cors = { "access-control-allow-origin": "*" };

const haze = catalog.heroes.find((hero) => hero.name === "Haze")!;
const others = catalog.heroes.filter((hero) => hero.id !== haze.id);
const [strongA, strongB, weakA, weakB, flat, friendA, friendB] = others;
const abilities = haze.abilityIds!.map((id) =>
  catalog.abilities.find((ability) => ability.id === id)!,
);
const [a1, a2, a3, a4] = abilities.map((ability) => ability.id);
const order = [a1, a2, a3, a1, a2, a4, a3, a1];

const rows = (heroId: number, index: number, rate = 0.4 + index * 0.005) => {
  const matches = 20000;
  const wins = matches * rate;
  return {
    hero_id: heroId,
    wins,
    losses: matches - wins,
    matches,
    total_kills: 8 * matches,
    total_deaths: 5 * matches,
    total_assists: 10 * matches,
  };
};
// Haze leads the field: position #1, tier S, 70.0% over 50,000 matches.
const heroStats = catalog.heroes.map((hero, index) =>
  hero.id === haze.id
    ? {
        ...rows(hero.id, index, 0.7),
        wins: 35000,
        losses: 15000,
        matches: 50000,
      }
    : rows(hero.id, index),
);

const shopItems = catalog.items
  .filter((entry) => entry.image && entry.cost > 0)
  .slice(0, 12);
const [bestA, bestB, counterA, counterB, losing] = shopItems;
const itemRow = (itemId: number, rate: number, matches = 10000) => ({
  item_id: itemId,
  wins: matches * rate,
  losses: matches * (1 - rate),
  matches,
});
const heroItems = [
  itemRow(bestA.id, 0.62),
  itemRow(bestB.id, 0.58),
  itemRow(losing.id, 0.45),
  itemRow(shopItems[5].id, 0.9, 50), // rare outlier
];
const baseItems = shopItems
  .slice(0, 6)
  .map((entry) => itemRow(entry.id, 0.5, 200000));
// Average win rate vs this hero equals the baseline (shift 0), so deltas are raw.
const versusItems = [
  itemRow(counterA.id, 0.6, 3000),
  itemRow(counterB.id, 0.55, 3000),
  itemRow(losing.id, 0.35, 3000),
];

// Main build: an upgrade beats its component, the 8-item cap drops `extra`
// and the 5% noise floor drops `rare`.
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
const phaseRow = (
  itemId: number,
  matches: number,
  buyS: number,
  rate = 0.55,
) => ({
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
    ...earlyItems.map((entry, i) =>
      phaseRow(entry.id, 8000 - i * 100, 500 - i * 10),
    ),
    phaseRow(extra.id, 7000, 50),
    phaseRow(rare.id, 300, 30),
  ],
  [
    phaseRow(earlyItems[0].id, 9000, 700),
    ...midItems.map((entry, i) => phaseRow(entry.id, 5000 - i * 100, 800 + i)),
  ],
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
          {
            name: "#Citadel_HeroBuilds_EarlyGame",
            description: "Lane first",
            mods: [
              { ability_id: bestA.id, annotation: "rush it" },
              { ability_id: bestB.id },
            ],
          },
          {
            name: "",
            mods: [{ ability_id: losing.id }, { ability_id: bestA.id }],
          },
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
      last_updated_timestamp: 1_789_473_600, // 15 Sep 2026, 12:00 UTC
      name: "Fixture Popular Two",
      details: {
        mod_categories: [{ name: "Core", mods: [{ ability_id: counterA.id }] }],
      },
    },
    num_favorites: 1,
  },
];

const pairs = (
  first: string,
  second: string,
  list: [number, number, number?][],
) =>
  list.map(([other, wins, matches = 1000]) => ({
    [first]: haze.id,
    [second]: other,
    wins,
    matches_played: matches,
  }));

const counterRows = pairs("hero_id", "enemy_hero_id", [
  [strongA.id, 700],
  [strongB.id, 600],
  [weakA.id, 300],
  [weakB.id, 400],
  [flat.id, 500],
]);
const synergyRows = [
  ...pairs("hero_id1", "hero_id2", [[friendA.id, 650]]),
  {
    hero_id1: friendB.id,
    hero_id2: haze.id,
    wins: 580,
    matches_played: 1000,
  },
];

interface Fixtures {
  counter?: unknown[];
  synergy?: unknown[];
  order?: unknown[];
  heroItems?: unknown[];
  versus?: unknown[];
  base?: unknown[];
  phases?: unknown[][];
  popular?: unknown[] | ((params: URLSearchParams) => unknown[]);
  vsEnemy?: Record<number, unknown[]>;
  url?: string;
}

async function openHaze(
  page: Page,
  fixtures: Fixtures = {},
  open: { name: string } = haze,
) {
  const {
    counter = counterRows,
    synergy = synergyRows,
    order: abilityOrder = [
      { abilities: order, wins: 270, losses: 230, matches: 500 },
      { abilities: [a2, a1], wins: 10, losses: 0, matches: 10 },
    ],
    heroItems: forHero = heroItems,
    versus = versusItems,
    base = baseItems,
    phases = phaseRows,
    popular = popularRows,
    vsEnemy = {},
    url: start = "/",
  } = fixtures;
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ json: body, headers: cors });
    switch (url.pathname) {
      case "/v1/analytics/hero-stats":
        return json(heroStats);
      case "/v1/analytics/hero-counter-stats":
        return json(counter);
      case "/v1/analytics/hero-synergy-stats":
        return json(synergy);
      case "/v1/analytics/ability-order-stats":
        return json(abilityOrder);
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
        return json(
          typeof popular === "function" ? popular(url.searchParams) : popular,
        );
      case "/v1/players/steam":
        return json([{ account_id: AUTHOR, personaname: "Fixture Author" }]);
      default:
        return json([]);
    }
  });
  await page.goto(start);
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await page
    .locator(".page:not([hidden]) .hero-card", { hasText: open.name })
    .first()
    .click();
  await expect(page.locator(".hero-header h1")).toHaveText(open.name);
}

const section = (page: Page, title: string) =>
  page.locator(".detail-section", {
    has: page.getByRole("heading", { name: title, exact: true }),
  });

test("header shows art, tier letter, identity, tagline ribbon and stats", async ({
  page,
}) => {
  await openHaze(page);
  const header = page.locator(".hero-header");
  await expect(header.locator('img[src*="haze_card.webp"]')).toBeVisible();
  await expect(header.locator('img[src*="haze_bg.webp"]')).toBeVisible();
  await expect(header.locator(".hero-role")).toHaveText("ASSASSIN");
  await expect(header.locator(".hero-tags")).toHaveText("STEALTHY · LETHAL");
  await expect(header.locator('[class*="chip"], [class*="pill"]')).toHaveCount(
    0,
  );
  const tagline = header.locator(".hero-tagline");
  await expect(tagline).toHaveClass(/\bribbon\b/);
  await expect(tagline).toHaveText(haze.tagline!);
  await expect(header.locator(".hero-tier")).toHaveText("S");
  await expect(header.locator(".data-note")).toHaveText(
    "Tier and stats are for the last 30 days at the selected rank.",
  );
  const stats = header.locator(".hero-stats");
  await expect(stats).toContainText("70.0%");
  await expect(stats).toContainText("WIN RATE");
  await expect(stats).toContainText(/\d+\.\d%\s*PICK RATE/);
  await expect(stats).toContainText("50K");
  await expect(stats).toContainText("MATCHES");
  await expect(stats.getByRole("combobox", { name: "Rank" })).toBeVisible();
  await expect(header.locator(".tier-banner")).toHaveCount(0);
  await expect(header.locator(".hero-rank")).toHaveCount(0);
  await expect(header.locator(".hero-rule")).toHaveCount(0);
  await expect(stats).not.toContainText("AVG KDA");
  expect(
    await header.evaluate(
      (node) =>
        [node, ...node.querySelectorAll("*")].filter((el) =>
          el.hasAttribute("style"),
        ).length,
    ),
  ).toBe(0);
});

test("ability row shows four icons in signature order", async ({ page }) => {
  await openHaze(page);
  const icons = page.locator(".ability-icon");
  await expect(icons).toHaveCount(4);
  for (const [index, ability] of abilities.entries()) {
    const icon = icons.nth(index);
    await expect(icon.locator(".ability-key")).toHaveText(String(index + 1));
    await expect(icon.locator("img")).toHaveAttribute("src", ability.image!);
    await expect(
      page.getByRole("button", { name: ability.name, exact: true }),
    ).toHaveCount(1);
  }
  await expect(page.locator(".ability-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Abilities", exact: true }),
  ).toHaveCount(0);
});

test("ability tooltip shows cooldown, key stats, minor stats and three upgrades", async ({
  page,
}) => {
  await openHaze(page);
  const [first] = abilities;
  const tip = page.locator(".ability-tip").first();
  await expect(tip).toBeHidden();
  await page.locator(".ability-icon").first().hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute("role", "tooltip");
  await expect(tip.locator("b").first()).toHaveText(first.name);
  await expect(tip.locator("img").first()).toHaveAttribute("src", first.image!);
  expect(first.cooldown).toBeTruthy();
  await expect(tip.locator(".ability-cooldown")).toHaveText(
    `⟳ ${first.cooldown}`,
  );
  await expect(tip.locator(".ability-key-stats > *")).toHaveCount(
    first.keyStats.length,
  );
  for (const stat of first.keyStats) {
    await expect(tip.locator(".ability-key-stats")).toContainText(stat.value);
    await expect(tip.locator(".ability-key-stats")).toContainText(stat.label);
  }
  for (const stat of first.minorStats)
    await expect(tip.locator(".ability-minor-stats")).toContainText(
      `${stat.label} ${stat.value}`,
    );
  const upgrades = tip.locator(".ability-upgrades > *");
  await expect(upgrades).toHaveCount(3);
  for (const [index, label] of ["◆ 1", "◆ 2", "◆ 5"].entries()) {
    await expect(upgrades.nth(index)).toContainText(label);
    await expect(upgrades.nth(index)).toContainText(first.upgrades[index]);
  }
  for (const highlight of first.highlights)
    await expect(
      tip.locator("p.ability-desc b.hl", { hasText: highlight }),
    ).toHaveCount(1);
  await expect(tip.locator("p.ability-desc")).toContainText(
    first.description.replace(/\s+/g, " "),
  );
  await expect(page.locator(".ability-icon").first()).toHaveAttribute(
    "aria-describedby",
    (await tip.getAttribute("id"))!,
  );

  await page.mouse.move(1, 1);
  await expect(tip).toBeHidden();
});

test("ability tooltip opens on focus and click and closes on Escape", async ({
  page,
}) => {
  await openHaze(page);
  const icons = page.locator(".ability-icon");
  const tips = page.locator(".ability-tip");
  await page.locator(".hero-back").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(icons.nth(1)).toBeFocused();
  await expect(tips.nth(1)).toBeVisible();
  await expect(page.locator(".ability-tip:visible")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(tips.nth(1)).toBeHidden();

  await page.keyboard.press("Shift+Tab");
  await expect(tips.nth(0)).toBeVisible();
  await page.locator(".hero-back").focus();
  await expect(tips.nth(0)).toBeHidden();

  await icons.nth(2).click();
  await expect(tips.nth(2)).toBeVisible();
  await expect(page.locator(".ability-tip:visible")).toHaveCount(1);
  await icons.nth(3).hover();
  await expect(tips.nth(3)).toBeVisible();
  await expect(page.locator(".ability-tip:visible")).toHaveCount(1);
  await page.locator(".hero-header h1").click();
  await expect(page.locator(".ability-tip:visible")).toHaveCount(0);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("ability tooltip toggles on tap and closes on an outside tap", async ({
    page,
  }) => {
    await openHaze(page);
    const icons = page.locator(".ability-icon");
    const tips = page.locator(".ability-tip");
    await icons.nth(2).tap();
    await expect(tips.nth(2)).toBeVisible();
    await icons.nth(3).tap();
    await expect(tips.nth(3)).toBeVisible();
    await expect(page.locator(".ability-tip:visible")).toHaveCount(1);
    await icons.nth(3).tap();
    await expect(page.locator(".ability-tip:visible")).toHaveCount(0);
    await icons.nth(0).tap();
    await expect(tips.nth(0)).toBeVisible();
    await page.locator(".hero-header h1").tap();
    await expect(page.locator(".ability-tip:visible")).toHaveCount(0);
  });
});

test("skill order grid has a row per ability and a numbered cell per step", async ({
  page,
}) => {
  await openHaze(page);
  const grid = section(page, "Skill order");
  await expect(grid.locator(".skill-row")).toHaveCount(4);
  await expect(grid.locator(".skill-row img")).toHaveCount(4);
  await expect(grid.locator(".skill-cell.chosen")).toHaveCount(order.length);
  expect(
    (await grid.locator(".skill-cell.chosen").allTextContents()).sort(),
  ).toEqual(order.map((_, index) => String(index + 1)).sort());
  await expect(
    grid.locator(".skill-row").first().locator(".skill-cell.chosen"),
  ).toHaveText(["1", "4", "8"]);
  await expect(grid).toContainText("54.0% WIN RATE");
});

test("matchups, synergy and items list fixture entries and navigate", async ({
  page,
}) => {
  await openHaze(page);
  const strong = section(page, "Strong against");
  await expect(strong.locator(".matchup")).toHaveText([
    new RegExp(`${strongA.name}.*70\\.0%`),
    new RegExp(`${strongB.name}.*60\\.0%`),
  ]);
  await expect(strong.locator("img.hero-portrait").first()).toHaveAttribute(
    "src",
    strongA.image!,
  );
  const countered = section(page, "Countered by");
  await expect(countered.locator(".matchup")).toHaveText([
    new RegExp(`${weakA.name}.*30\\.0%`),
    new RegExp(`${weakB.name}.*40\\.0%`),
  ]);
  const together = section(page, "Best with");
  await expect(together.locator(".matchup")).toHaveText([
    new RegExp(`${friendA.name}.*65\\.0%`),
    new RegExp(`${friendB.name}.*58\\.0%`),
  ]);

  const best = section(page, "Best items");
  await expect(best.locator(".item-tile")).toHaveText([
    new RegExp(`${bestA.name}.*62\\.0%`),
    new RegExp(`${bestB.name}.*58\\.0%`),
    new RegExp(`${losing.name}.*45\\.0%`),
  ]);
  await expect(best.locator(".item-tile img.item-icon").first()).toBeVisible();
  await expect(best).toContainText("players who are ahead can afford them");

  const counter = section(page, "Items that beat Haze");
  await expect(counter.locator(".item-tile")).toHaveText([
    new RegExp(`${counterA.name}.*\\+10\\.0%`),
    new RegExp(`${counterB.name}.*\\+5\\.0%`),
  ]);
  await expect(counter).not.toContainText("Based on hero traits");

  await best.locator(".item-tile").first().click();
  await expect(
    page.getByRole("button", { name: "Items", exact: true }),
  ).toHaveClass(/active/);
});

const names = (list: { name: string }[]) => list.map((entry) => entry.name);

test("Build tab is selected and lists the main build per phase", async ({
  page,
}) => {
  await openHaze(page);
  await expect(
    page.getByRole("tab", { name: "Build", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "Build", exact: true });
  await expect(panel.locator(".data-note")).toContainText(
    "Most-bought items in each phase · All ranks · last 30 days",
  );
  const early = page.locator(".build-phase[data-phase=early] .build-item");
  await expect(early.locator("strong")).toHaveText(
    names([upgrade, ...[...earlyItems].reverse()]),
  );
  await expect(early.first().locator("small")).toHaveText("55% win");
  await expect(
    page.locator(".build-phase[data-phase=mid] .build-item strong"),
  ).toHaveText(names(midItems));
  await expect(
    page.locator(".build-phase[data-phase=mid] .phase-short"),
  ).toHaveText("Only 3 items were bought often enough in this phase.");
  await expect(
    page.locator(".build-phase[data-phase=late] .phase-short"),
  ).toHaveText("Not enough data for this phase.");
  const labels = (await page.locator(".phase-label").allTextContents()).join(
    " ",
  );
  for (const text of [
    "Early",
    "0–10 min",
    "Mid",
    "10–20 min",
    "Late",
    "20+ min",
  ])
    expect(labels).toContain(text);

  await early.first().click();
  await expect(
    page.getByRole("button", { name: "Items", exact: true }),
  ).toHaveClass(/active/);
});

test("Popular builds tab shows each build exactly as authored", async ({
  page,
}) => {
  await openHaze(page);
  const build = page.getByRole("tab", { name: "Build", exact: true });
  const popularTab = page.getByRole("tab", { name: /Popular builds/ });
  await expect(popularTab.locator("small.tab-count")).toHaveText("2");
  await expect(
    page.getByRole("tab", { name: "Popular builds 2", exact: true }),
  ).toHaveCount(1);
  await build.focus();
  await page.keyboard.press("ArrowRight");
  await expect(popularTab).toHaveAttribute("aria-selected", "true");
  await expect(popularTab).toBeFocused();
  await expect(build).toHaveAttribute("aria-selected", "false");
  const panel = page.getByRole("tabpanel", { name: /Popular builds/ });
  await expect(panel.locator(".data-note")).toContainText(
    "Most-favourited builds updated in the last 60 days",
  );
  const buttons = panel.locator(".build-tab");
  await expect(buttons).toHaveText([
    "Fixture Popular One",
    "Fixture Popular Two",
  ]);
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  const article = panel.locator(".popular-build");
  await expect(article.locator("h3")).toHaveText("Fixture Popular One");
  const meta = article.locator(".popular-build-meta");
  for (const text of [
    "by Fixture Author",
    "Updated",
    "4 items in 3 categories",
    "199 favourites",
  ])
    await expect(meta).toContainText(text);
  await expect(article.locator(".build-category-name")).toHaveText([
    "Early game",
    "Items",
    "Notes",
  ]);
  const categories = article.locator(".build-category");
  const first = categories.nth(0).locator(".build-item");
  await expect(first.locator("strong")).toHaveText(names([bestA, bestB]));
  await expect(first.first()).toHaveAttribute("title", /rush it/);
  await expect(first.first()).toHaveClass(/\bhas-note\b/);
  await expect(categories.nth(0).locator(".build-notes li")).toHaveText([
    `${bestA.name} rush it`,
  ]);
  await expect(categories.nth(1).locator(".build-item strong")).toHaveText(
    names([losing, bestA]),
  );
  await expect(categories.nth(1).locator(".build-notes")).toHaveCount(0);
  await expect(categories.nth(2)).toContainText("Only words here");
  await expect(categories.nth(2).locator(".build-item")).toHaveCount(0);

  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(article.locator("h3")).toHaveText("Fixture Popular Two");
  await expect(meta).toContainText("Updated 15 Sep 2026");
  await expect(meta).toContainText("1 favourite");
  await expect(meta).not.toContainText("1 favourites");
});

test("build tabs keep one tab stop and move with arrows, Home and End", async ({
  page,
}) => {
  await openHaze(page);
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(2);
  const [build, popularTab] = [tabs.nth(0), tabs.nth(1)];
  for (const tab of [build, popularTab]) {
    const panel = await tab.getAttribute("aria-controls");
    await expect(page.locator(`[id="${panel}"]`)).toHaveAttribute(
      "role",
      "tabpanel",
    );
  }
  const selected = async (tab: typeof build) => {
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toHaveAttribute("tabindex", "0");
    await expect(tab).toBeFocused();
    const other = tab === build ? popularTab : build;
    await expect(other).toHaveAttribute("aria-selected", "false");
    await expect(other).toHaveAttribute("tabindex", "-1");
  };
  await build.focus();
  await page.keyboard.press("End");
  await selected(popularTab);
  await page.keyboard.press("ArrowRight");
  await selected(build);
  await page.keyboard.press("ArrowLeft");
  await selected(popularTab);
  await page.keyboard.press("Home");
  await selected(build);
  await page.keyboard.press("Control+ArrowRight");
  await selected(build);
  await expect(
    page.getByRole("tabpanel", { name: "Build", exact: true }),
  ).toBeVisible();
});

test("popular builds empty state", async ({ page }) => {
  await openHaze(page, { popular: [] });
  const popularTab = page.getByRole("tab", { name: /Popular builds/ });
  await popularTab.click();
  await expect(
    page.getByRole("tabpanel", { name: /Popular builds/ }),
  ).toContainText(
    "No community builds for this hero were updated in the last 60 days.",
  );
  await expect(popularTab.locator(".tab-count")).toHaveCount(0);
});

test("popular builds in other languages say so", async ({ page }) => {
  await openHaze(page, {
    popular: (params) =>
      params.get("build_language") === "English" ? [] : popularRows,
  });
  await page.getByRole("tab", { name: /Popular builds/ }).click();
  const panel = page.getByRole("tabpanel", { name: /Popular builds/ });
  await expect(panel.locator(".data-note")).toHaveText(
    /^No English builds yet, so these are in other languages\. /,
  );
  await expect(panel.locator(".popular-build h3")).toHaveText(
    "Fixture Popular One",
  );
});

test("popular builds without favourite counts say they are recent", async ({
  page,
}) => {
  await openHaze(page, {
    popular: popularRows.map((row) => ({ ...row, num_favorites: null })),
  });
  await page.getByRole("tab", { name: /Popular builds/ }).click();
  const panel = page.getByRole("tabpanel", { name: /Popular builds/ });
  await expect(panel.locator(".data-note")).toContainText(
    "Community builds updated in the last 60 days",
  );
  await expect(panel.locator(".data-note")).toContainText(
    "This hero has no favourite counts yet.",
  );
  await expect(panel.locator(".popular-build-meta")).toContainText(
    "4 items in 3 categories",
  );
  await expect(panel.locator(".popular-build-meta")).not.toContainText(
    "favourite",
  );
});

test("main build rows fit at the minimum window width", async ({ page }) => {
  await page.setViewportSize({ width: 850, height: 650 });
  await openHaze(page);
  const tiles = page.locator(".build-phase[data-phase=early] .build-item");
  await expect(tiles).toHaveCount(8);
  const mainBuild = page.locator(".main-build");
  expect(
    await mainBuild.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(850);
  const tops = await tiles.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().top),
  );
  expect(new Set(tops).size).toBe(1);
  // No tile is squeezed narrower than its art.
  const squeezed = await tiles.evaluateAll(
    (nodes) =>
      nodes.filter(
        (node) =>
          node.getBoundingClientRect().width <
          node.querySelector(".build-art")!.getBoundingClientRect().width,
      ).length,
  );
  expect(squeezed).toBe(0);
});

test("clicking a matchup hero opens that hero's detail", async ({ page }) => {
  await openHaze(page);
  await section(page, "Strong against").locator(".matchup").first().click();
  await expect(page.locator(".hero-header h1")).toHaveText(strongA.name);
});

test("thin data shows Not enough data and heuristic counter items", async ({
  page,
}) => {
  await openHaze(page, {
    counter: [],
    synergy: [],
    order: [],
    heroItems: [],
    versus: [],
    base: [],
    phases: [[], [], []],
  });
  for (const title of [
    "Strong against",
    "Countered by",
    "Best with",
    "Skill order",
    "Best items",
  ])
    await expect(section(page, title)).toContainText("Not enough data");
  await expect(page.locator(".phase-short")).toHaveText([
    "Not enough data for this phase.",
    "Not enough data for this phase.",
    "Not enough data for this phase.",
  ]);
  const counter = section(page, "Items that beat Haze");
  await expect(counter).toContainText("Based on hero traits");
  await expect(counter).not.toContainText("Not enough data");
  expect(await counter.locator(".item-tile").count()).toBeGreaterThan(0);
  await expect(page.locator(".ability-icon")).toHaveCount(4);
});

test("All heroes returns to the list with its role filter kept", async ({
  page,
}) => {
  await openHaze(page);
  await page.getByRole("button", { name: "← All heroes" }).click();
  await expect(page.locator(".page:not([hidden]) .hero-card")).toHaveCount(
    catalog.heroes.length,
  );
  await page.getByRole("button", { name: "Mystic", exact: true }).click();
  const mystics = catalog.heroes.filter((hero) => hero.role === "mystic");
  await page.locator(".page:not([hidden]) .hero-card").first().click();
  await expect(page.locator(".hero-header h1")).toBeVisible();
  await page.getByRole("button", { name: "← All heroes" }).click();
  await expect(page.locator(".page:not([hidden]) .hero-card")).toHaveCount(
    mystics.length,
  );
});

test("a hero without a tagline omits that line", async ({ page }) => {
  const mina = catalog.heroes.find((hero) => hero.name === "Mina")!;
  expect(mina.tagline).toBeUndefined();
  await openHaze(page, {}, mina);
  await expect(page.locator(".hero-tagline")).toHaveCount(0);
  await expect(page.locator(".hero-role")).toHaveText("MARKSMAN");
  await expect(page.locator(".hero-tags")).toHaveText(
    mina.tags.map((tag) => tag.toUpperCase()).join(" · "),
  );
});

// Counter items: baseline 50% for every item; against strongA, bestA gains
// 10 points; against strongB, bestB gains 6. Both matchups average 50%, so
// there is no matchup shift.
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
const choice = (page: Page, name: string) =>
  page.locator(".enemy-choices").getByRole("button", { name, exact: true });

test("counter items: pick enemies and see what does well against them", async ({
  page,
}) => {
  await openHaze(page, { heroItems: counterBase, vsEnemy: counterVs });
  const counter = section(page, "Counter items");
  await expect(counter.locator(".data-note").first()).toHaveText(
    "Items that gain the most win rate for Haze against these heroes, compared with all Haze games and allowing for the matchup itself. Only clear gains are shown · All ranks · last 30 days.",
  );
  await expect(counter.locator(".picker-label")).toHaveText("Enemy team");
  await expect(counter).toContainText(
    "Pick up to 6 enemy heroes to see items that do well against them.",
  );
  const add = counter.getByRole("button", { name: "Add enemy hero" });
  await expect(add).toHaveAttribute("aria-expanded", "false");
  await add.click();
  await expect(add).toHaveAttribute("aria-expanded", "true");
  await expect(
    counter.getByRole("group", { name: "Choose enemy heroes" }),
  ).toBeVisible();
  await expect(page.locator(".enemy-choice")).toHaveCount(
    catalog.heroes.length - 1,
  );
  await expect(
    page.locator(".enemy-choices").getByRole("button", {
      name: "Haze",
      exact: true,
    }),
  ).toHaveCount(0);

  await choice(page, strongA.name).click();
  await expect(choice(page, strongA.name)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const cards = counter.locator(".item-card");
  await expect(cards.locator("h3")).toHaveText([bestA.name]);
  await expect(cards.first().locator("p")).toHaveText(
    "+10.0% vs these heroes · 3,000+ games",
  );
  await expect(cards.first().locator(".targets span")).toHaveText([
    strongA.name,
  ]);
  await expect(cards.first().locator(".item-label")).toHaveText(
    "CONSIDER FIRST",
  );

  await choice(page, strongB.name).click();
  await expect(cards.locator("h3")).toHaveText([bestA.name, bestB.name]);
  await expect(cards.first().locator("p")).toHaveText(
    "+5.0% vs these heroes · 3,000+ games",
  );
  await expect(cards.nth(1).locator(".targets span")).toHaveText([
    strongB.name,
  ]);
  await expect(cards.nth(1).locator(".item-label")).toHaveText(
    bestB.category.toUpperCase(),
  );
  await expect(counter.locator(".enemy-slot.filled")).toHaveCount(2);

  await counter.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".enemy-choices")).toBeHidden();
  await expect(add).toBeFocused();
  await counter
    .getByRole("button", { name: `Remove ${strongB.name}`, exact: true })
    .click();
  await expect(cards.locator("h3")).toHaveText([bestA.name]);
  await counter.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(counter.locator(".enemy-slot.filled")).toHaveCount(0);
  await expect(counter).toContainText("Pick up to 6 enemy heroes");
});

test("enemy chooser closes on Escape and returns focus", async ({ page }) => {
  await openHaze(page);
  const counter = section(page, "Counter items");
  const add = counter.getByRole("button", { name: "Add enemy hero" });
  await add.click();
  await choice(page, strongA.name).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".enemy-choices")).toBeHidden();
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute("aria-expanded", "false");
});

test("enemy picks carry over to the next hero, leaving that hero out", async ({
  page,
}) => {
  await openHaze(page, { heroItems: counterBase, vsEnemy: counterVs });
  const counter = section(page, "Counter items");
  await counter.getByRole("button", { name: "Add enemy hero" }).click();
  await choice(page, strongA.name).click();
  await choice(page, strongB.name).click();
  await counter.getByRole("button", { name: "Done", exact: true }).click();
  await section(page, "Strong against").locator(".matchup").first().click();
  await expect(page.locator(".hero-header h1")).toHaveText(strongA.name);
  await expect(counter.locator(".enemy-slot.filled")).toHaveCount(1);
  await expect(
    counter.getByRole("button", { name: `Remove ${strongB.name}` }),
  ).toHaveCount(1);
  await expect(counter.locator(".data-note").first()).toContainText(
    `for ${strongA.name} against these heroes`,
  );
  await counter.getByRole("button", { name: "Add enemy hero" }).click();
  await expect(choice(page, strongA.name)).toHaveCount(0);
  await expect(choice(page, haze.name)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("re-picking an enemy reuses its cached request", async ({ page }) => {
  const itemStats: URLSearchParams[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/item-stats")
      itemStats.push(url.searchParams);
  });
  await openHaze(page, { heroItems: counterBase, vsEnemy: counterVs });
  const counter = section(page, "Counter items");
  const cards = counter.locator(".item-card h3");
  await counter.getByRole("button", { name: "Add enemy hero" }).click();
  await choice(page, strongA.name).click();
  await expect(cards).toHaveText([bestA.name]);
  await choice(page, strongB.name).click();
  await expect(cards).toHaveText([bestA.name, bestB.name]);
  await counter
    .getByRole("button", { name: `Remove ${strongB.name}`, exact: true })
    .click();
  await expect(cards).toHaveText([bestA.name]);
  await choice(page, strongB.name).click();
  await expect(cards).toHaveText([bestA.name, bestB.name]);

  const versus = itemStats.filter(
    (params) => params.has("hero_id") && params.has("enemy_hero_ids"),
  );
  expect(versus.map((params) => params.get("enemy_hero_ids")).sort()).toEqual(
    [String(strongA.id), String(strongB.id)].sort(),
  );
  expect(
    itemStats.filter(
      (params) =>
        params.has("hero_id") &&
        !params.has("enemy_hero_ids") &&
        !params.has("min_bought_at_s"),
    ),
  ).toHaveLength(1);
});

test("counter items fall back to hero traits without match data", async ({
  page,
}) => {
  const profiled = others.find((hero) => heroThreats[hero.id])!;
  await openHaze(page, { vsEnemy: {} });
  const counter = section(page, "Counter items");
  await counter.getByRole("button", { name: "Add enemy hero" }).click();
  await choice(page, profiled.name).click();
  await expect(counter).toContainText(
    "Based on hero traits — not enough match data for these heroes yet.",
  );
  await expect(counter.locator(".item-card").first()).toBeVisible();
  await expect(counter.locator(".item-card .targets").first()).toContainText(
    profiled.name,
  );
  await expect(counter).not.toContainText("Not enough data");
});

test("counter items say when match data fails", async ({ page }) => {
  const profiled = others.find((hero) => heroThreats[hero.id])!;
  await openHaze(page);
  await page.route(
    (url) =>
      url.pathname === "/v1/analytics/item-stats" &&
      url.searchParams.has("enemy_hero_ids") &&
      url.searchParams.has("hero_id"),
    (route) => route.fulfill({ status: 500, headers: cors, body: "" }),
  );
  const counter = section(page, "Counter items");
  await counter.getByRole("button", { name: "Add enemy hero" }).click();
  await choice(page, profiled.name).click();
  await expect(counter.locator(".data-note").nth(1)).toContainText(
    "Match data unavailable: Deadlock API unavailable (500). Based on hero traits instead.",
  );
  await expect(counter.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(counter.locator(".item-card").first()).toBeVisible();
});

test("six picks disable the rest of the chooser", async ({ page }) => {
  await openHaze(page);
  const counter = section(page, "Counter items");
  await counter.getByRole("button", { name: "Add enemy hero" }).click();
  const [first, ...rest] = others.slice(0, 7);
  for (const hero of [first, ...rest.slice(0, 5)])
    await choice(page, hero.name).click();
  await expect(
    counter.getByRole("button", { name: "Add enemy hero" }),
  ).toHaveCount(0);
  await expect(counter.locator(".enemy-slot.filled")).toHaveCount(6);
  await expect(choice(page, rest[5].name)).toBeDisabled();
  await expect(choice(page, first.name)).toBeEnabled();
  await choice(page, first.name).click();
  await expect(counter.locator(".enemy-slot.filled")).toHaveCount(5);
  await expect(choice(page, rest[5].name)).toBeEnabled();
});

test("in a live match the enemy team fills counter items", async ({ page }) => {
  await nativeWindow(page, "desktop");
  await openHaze(
    page,
    {
      heroItems: counterBase,
      vsEnemy: { [haze.id]: vsRows(0.6, 0.5, 0.4) },
      url: "/desktop/desktop.html",
    },
    strongA,
  );
  const counter = section(page, "Counter items");
  await expect(counter).toContainText("Enemy team from your live match.");
  await expect(counter.locator(".enemy-slot.filled")).toHaveCount(1);
  await expect(
    counter.getByRole("button", { name: "Add enemy hero" }),
  ).toHaveCount(0);
  await expect(counter.locator(".enemy-choices")).toHaveCount(0);
  await expect(
    counter.locator(".item-card").first().locator(".targets"),
  ).toContainText("Haze");
});
