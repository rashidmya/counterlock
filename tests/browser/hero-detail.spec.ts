import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

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
      case "/v1/analytics/item-stats":
        return json(
          url.searchParams.has("hero_id")
            ? forHero
            : url.searchParams.has("enemy_hero_ids")
              ? versus
              : base,
        );
      case `/v1/analytics/hero-build-stats/${haze.id}`:
        return json([
          {
            hero_id: haze.id,
            hero_build_id: 99,
            wins: 15,
            losses: 5,
            matches: 20,
            bucket: 0,
          },
        ]);
      case `/v1/builds/${haze.id}/99`:
        return json({
          hero_build: {
            hero_id: haze.id,
            hero_build_id: 99,
            name: "Fixture build",
            details: {
              mod_categories: [
                {
                  name: "#Citadel_HeroBuilds_EarlyGame",
                  mods: [{ ability_id: bestA.id }],
                },
                {
                  name: "#Citadel_HeroBuilds_LateGame",
                  mods: [{ ability_id: bestB.id }],
                },
              ],
            },
          },
        });
      default:
        return json([]);
    }
  });
  await page.goto("/");
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

  const counter = section(page, "Counter items");
  await expect(counter.locator(".item-tile")).toHaveText([
    new RegExp(`${counterA.name}.*\\+10\\.0%`),
    new RegExp(`${counterB.name}.*\\+5\\.0%`),
  ]);
  await expect(counter).not.toContainText("Based on hero traits");

  await expect(section(page, "Build")).toContainText("Fixture build");
  await expect(section(page, "Build").locator(".build-item")).toHaveCount(2);

  await best.locator(".item-tile").first().click();
  await expect(
    page.getByRole("button", { name: "Items", exact: true }),
  ).toHaveClass(/active/);
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
  });
  for (const title of [
    "Strong against",
    "Countered by",
    "Best with",
    "Skill order",
    "Best items",
  ])
    await expect(section(page, title)).toContainText("Not enough data");
  const counter = section(page, "Counter items");
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
