import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const cors = { "access-control-allow-origin": "*" };

const heroMatches = 10000;
const totalMatches = catalog.heroes.length * heroMatches;
const heroStats = catalog.heroes.map((hero) => ({
  hero_id: hero.id,
  wins: heroMatches / 2,
  losses: heroMatches / 2,
  matches: heroMatches,
  total_kills: 8 * heroMatches,
  total_deaths: 5 * heroMatches,
  total_assists: 10 * heroMatches,
}));

const leech = catalog.items.find((entry) => entry.name === "Leech")!;
const [partA, partB] = leech.components!.map((className) =>
  catalog.items.find((entry) => entry.className === className)!,
);
const parent = catalog.items.find((entry) =>
  entry.components?.includes(partA.className!),
)!;

// Win rate rises with catalog position (40.0% to 74.4%); Leech is pinned at 55.2%.
const itemRow = (itemId: number, index: number) => {
  const pinned = itemId === leech.id;
  const matches = pinned
    ? Math.round(totalMatches * 0.184)
    : 20000 - index * 50;
  const rate = pinned ? 0.552 : 0.4 + index * 0.002;
  return {
    item_id: itemId,
    wins: matches * rate,
    losses: matches * (1 - rate),
    matches,
    ...(pinned ? { avg_buy_time_s: 1450 } : {}),
  };
};
const itemStats = catalog.items.map((entry, index) => itemRow(entry.id, index));
const topWinRate = catalog.items[catalog.items.length - 1];

async function openItems(page: Page, options: { itemStatus?: number } = {}) {
  const { itemStatus = 200 } = options;
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/hero-stats")
      return route.fulfill({ json: heroStats, headers: cors });
    if (url.pathname === "/v1/analytics/item-stats")
      return route.fulfill({
        status: itemStatus,
        json: itemStats,
        headers: cors,
      });
    return route.fulfill({ json: [], headers: cors });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await expect(page.locator(".item-tile").first()).toBeVisible();
}

const tiles = (page: Page) => page.locator(".item-tile");
const sortBy = (page: Page, label: string) =>
  page.getByLabel("Sort", { exact: true }).selectOption({ label });
const costs = (category: string) =>
  [
    ...new Set(
      catalog.items
        .filter((entry) => entry.category === category)
        .map((entry) => entry.cost),
    ),
  ]
    .sort((a, b) => a - b)
    .map((cost) => cost.toLocaleString("en-US"));

test("items page has the shop title and ribbon", async ({ page }) => {
  await openItems(page);
  await expect(page.locator(".items-page h1")).toHaveText("The Shop");
  await expect(page.locator(".items-page .ribbon")).toHaveText(
    "Every item · win & pick rates",
  );
});

test("default layout is a shop with Weapon, Vitality and Spirit columns split by cost", async ({
  page,
}) => {
  await openItems(page);
  await expect(tiles(page)).toHaveCount(catalog.items.length);
  const columns = page.locator(".shop-column");
  await expect(columns.locator("h2")).toHaveText([
    "Weapon",
    "Vitality",
    "Spirit",
  ]);
  for (const [index, category] of ["weapon", "vitality", "spirit"].entries()) {
    const column = columns.nth(index);
    await expect(column.locator("h2 img")).toHaveAttribute("src", /^https?:/);
    await expect(column.locator(".cost-heading")).toHaveText(costs(category));
    await expect(column.locator(".item-tile")).toHaveCount(
      catalog.items.filter((entry) => entry.category === category).length,
    );
  }
  const all = await page.locator(".cost-heading").allTextContents();
  for (const cost of ["800", "1,600", "3,200", "6,400", "9,999"])
    expect(all).toContain(cost);
  await expect(tiles(page).first().locator("img.item-icon")).toBeVisible();
});

test("tiles show the item name and stay inside their column", async ({
  page,
}) => {
  await openItems(page);
  const first = tiles(page).first();
  const name = (await first.locator("strong").textContent())!;
  expect(name.length).toBeGreaterThan(0);
  await expect(first).toHaveAttribute(
    "title",
    new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · `),
  );
  for (const width of [1260, 850]) {
    await page.setViewportSize({ width, height: 900 });
    const overflowing = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>(".item-tile")].filter(
          (tile) =>
            tile.scrollWidth > tile.clientWidth + 1 ||
            tile.parentElement!.scrollWidth >
              tile.parentElement!.clientWidth + 1,
        ).length,
    );
    expect(overflowing).toBe(0);
    await expect(page.locator(".shop-column")).toHaveCount(3);
  }
});

test("search narrows to matching items", async ({ page }) => {
  await openItems(page);
  await page.getByRole("searchbox", { name: "Search items" }).fill("leech");
  await expect(tiles(page)).toHaveCount(1);
  await expect(tiles(page).first()).toHaveAttribute("title", /^Leech/);
  await page.getByRole("searchbox", { name: "Search items" }).fill("zzzz");
  await expect(tiles(page)).toHaveCount(0);
  await expect(page.getByText("No items match.")).toBeVisible();
});

test("category filter keeps only that category", async ({ page }) => {
  await openItems(page);
  await page.getByRole("button", { name: "Spirit", exact: true }).click();
  const spirit = catalog.items.filter((entry) => entry.category === "spirit");
  await expect(tiles(page)).toHaveCount(spirit.length);
  await expect(page.locator(".shop-column h2")).toHaveText(["Spirit"]);
  await expect(page.locator(".item-icon.weapon")).toHaveCount(0);
  await expect(page.locator(".item-icon.vitality")).toHaveCount(0);
});

test("win rate sort is a flat grid with numbers under the tiles", async ({
  page,
}) => {
  await openItems(page);
  await sortBy(page, "Win rate");
  await expect(page.locator(".shop-column")).toHaveCount(0);
  await expect(page.locator(".cost-heading")).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(catalog.items.length);
  const first = tiles(page).first();
  await expect(first).toHaveAttribute(
    "title",
    new RegExp(`^${topWinRate.name}`),
  );
  await expect(first).toContainText("74.4%");
  const rates = (await tiles(page).locator("small").allTextContents()).map(
    (text) => parseFloat(text),
  );
  expect(rates).toEqual([...rates].sort((a, b) => b - a));

  await sortBy(page, "Pick rate");
  await expect(tiles(page).first()).toHaveAttribute(
    "title",
    new RegExp(`^${leech.name}`),
  );
  await expect(tiles(page).first()).toContainText("18.4%");
});

test("item detail shows stats, performance and clickable components", async ({
  page,
}) => {
  await openItems(page);
  await tiles(page)
    .filter({ has: page.getByAltText("Leech") })
    .click();
  const detail = page.locator(".item-detail");
  await expect(detail.locator("h1")).toHaveText("Leech");
  await expect(detail.locator(".item-meta")).toContainText("Vitality");
  await expect(detail.locator(".item-meta")).toContainText("6,400 souls");
  await expect(detail.locator(".item-meta")).toContainText("Passive");
  const bonus = detail.locator(".item-stat", { hasText: "+180 Bonus Health" });
  await expect(bonus).toHaveCount(1);
  await expect(bonus.locator("img")).toHaveAttribute(
    "src",
    leech.stats![0].icon!,
  );
  await expect(detail.locator(".item-stat")).toHaveCount(leech.stats!.length);
  const boxes = detail.locator(".stat-box");
  await expect(boxes.nth(0)).toContainText("Win rate");
  await expect(boxes.nth(0)).toContainText("55.2%");
  await expect(boxes.nth(1)).toContainText("Pick rate");
  await expect(boxes.nth(1)).toContainText("18.4%");
  await expect(boxes.nth(2)).toContainText("Avg buy time");
  await expect(boxes.nth(2)).toContainText("24:10");

  const from = detail.locator(".item-links", {
    has: page.getByRole("heading", { name: "Builds from" }),
  });
  await expect(from.locator(".item-link")).toHaveText([
    new RegExp(partA.name),
    new RegExp(partB.name),
  ]);
  await expect(
    detail.getByText(
      "Expensive items show higher win rates partly because players who are ahead can afford them.",
    ),
  ).toBeVisible();

  await from.locator(".item-link").first().click();
  await expect(detail.locator("h1")).toHaveText(partA.name);
  const into = detail.locator(".item-links", {
    has: page.getByRole("heading", { name: "Builds into" }),
  });
  await expect(
    into.locator(".item-link", { hasText: parent.name }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "← All items" }).click();
  await expect(detail).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(catalog.items.length);
});

test("the win-rate caveat sits under the shop grid", async ({ page }) => {
  await openItems(page);
  await expect(
    page.getByText(
      "Expensive items show higher win rates partly because players who are ahead can afford them.",
    ),
  ).toBeVisible();
});

test("list search, category and sort survive a visit to an item", async ({
  page,
}) => {
  await openItems(page);
  await page.getByRole("button", { name: "Vitality", exact: true }).click();
  await sortBy(page, "Win rate");
  await page.getByRole("searchbox", { name: "Search items" }).fill("leech");
  await tiles(page).first().click();
  await expect(page.locator(".item-detail h1")).toHaveText("Leech");
  await page.getByRole("button", { name: "← All items" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search items" }),
  ).toHaveValue("leech");
  await expect(page.getByLabel("Sort", { exact: true })).toHaveValue("winRate");
  await expect(
    page.getByRole("button", { name: "Vitality", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(tiles(page)).toHaveCount(1);
});

test("failed item stats show a notice and keep the shop and dashes", async ({
  page,
}) => {
  await openItems(page, { itemStatus: 500 });
  await expect(page.getByRole("status")).toContainText(
    "Item stats unavailable",
  );
  await expect(tiles(page)).toHaveCount(catalog.items.length);
  await tiles(page)
    .filter({ has: page.getByAltText("Leech") })
    .click();
  const boxes = page.locator(".stat-box");
  await expect(boxes.nth(0)).toContainText("—");
  await expect(boxes.nth(1)).toContainText("—");
  await expect(boxes.nth(2)).toContainText("—");
});

test("the rank filter selection is shared between Heroes and Items", async ({
  page,
}) => {
  const rank = (page: Page) =>
    page.locator(".page:not([hidden])").getByLabel("Rank", { exact: true });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await openItems(page);
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await page.locator(".page:not([hidden]) .hero-card").first().click();
  await expect(page.locator(".hero-header h1")).toBeVisible();
  await rank(page).selectOption({ label: "Mystic+" });
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await expect(rank(page)).toHaveValue("51");
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.includes("/v1/analytics/item-stats") &&
          url.includes("min_average_badge=51"),
      ),
    )
    .toBe(true);
  await rank(page).selectOption({ label: "All ranks" });
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await page.locator(".page:not([hidden]) .hero-card").first().click();
  await expect(rank(page)).toHaveValue("0");
});

test("stat lines with a repeated label all render without key warnings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const express = catalog.items.find((entry) => entry.name === "Express Shot")!;
  await openItems(page);
  await tiles(page)
    .filter({ has: page.getByAltText("Express Shot") })
    .click();
  const lines = page.locator(".item-detail .item-stat");
  await expect(lines).toHaveCount(express.stats!.length);
  await expect(lines.filter({ hasText: "Bullet Velocity" })).toHaveText([
    "+60% Bullet Velocity",
    "+100% Bullet Velocity",
  ]);
  expect(errors.filter((text) => /same key|unique "key"/.test(text))).toEqual(
    [],
  );
});
