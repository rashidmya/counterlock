import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const cors = { "access-control-allow-origin": "*" };

// Win rates rise with the hero's position in the catalog, pick rates fall.
const statsRow = (heroId: number, index: number) => {
  const matches = 20000 - index * 200;
  const wins = (matches * (400 + index * 5)) / 1000;
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

const heroStats = catalog.heroes.map((hero, index) => statsRow(hero.id, index));
const byWinRate = [...catalog.heroes].reverse();
const topWinRate = ((400 + (catalog.heroes.length - 1) * 5) / 10).toFixed(1);

async function openTierList(
  page: Page,
  options: {
    stats?: unknown[];
    status?: number;
    failFirst?: boolean;
    requests?: string[];
  } = {},
) {
  const {
    stats = heroStats,
    status = 200,
    failFirst = false,
    requests,
  } = options;
  let served = 0;
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/hero-stats") {
      requests?.push(route.request().url());
      const failing = failFirst && served++ === 0;
      return route.fulfill({
        status: failing ? 500 : status,
        json: stats,
        headers: cors,
      });
    }
    return route.fulfill({ json: [], headers: cors });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Tier list", exact: true }).click();
  await expect(page.locator(".tier-tile").first()).toBeVisible();
}

test("tier rows run S to D with win · pick under each tile", async ({
  page,
}) => {
  await openTierList(page);
  await expect(page.locator(".tier-tile")).toHaveCount(catalog.heroes.length);
  await expect(page.locator(".tier-label")).toHaveText([
    "S",
    "A",
    "B",
    "C",
    "D",
  ]);
  const first = page.locator(".tier-tile").first();
  await expect(first.locator("img")).toHaveAttribute("src", /^https?:/);
  await expect(first.locator(".hero-name")).toHaveText(byWinRate[0].name);
  await expect(first).toContainText(`${topWinRate}% ·`);
  await expect(first).toContainText(/\d+\.\d% · \d+\.\d%/);
  await expect(page.locator(".tier-label.tier-S")).toHaveCSS(
    "color",
    "rgb(242, 198, 109)",
  );
  await expect(
    page.getByText("Tiers by win rate over the last 30 days, all ranks.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("role filter keeps only that role", async ({ page }) => {
  await openTierList(page);
  await page.getByRole("button", { name: "Mystic", exact: true }).click();
  const mystics = catalog.heroes.filter((hero) => hero.role === "mystic");
  await expect(page.locator(".tier-tile")).toHaveCount(mystics.length);
});

test("there is no sort or rank selector", async ({ page }) => {
  await openTierList(page);
  const visible = page.locator(".page:not([hidden])");
  await expect(visible.getByLabel("Sort")).toHaveCount(0);
  await expect(visible.getByLabel("Rank")).toHaveCount(0);
});

test("heroes without stats trail as unranked; failure shows NO DATA and Retry", async ({
  page,
}) => {
  await openTierList(page, { stats: heroStats.slice(1) });
  const missing = catalog.heroes[0];
  await expect(page.locator(".tier-label").last()).toHaveText("UNRANKED");
  const tile = page.locator(".tier-tile", { hasText: missing.name });
  await expect(tile).toContainText("—");
  await expect(
    page.locator(".tier-row").last().locator(".tier-tile"),
  ).toHaveCount(1);
  await expect(page.locator(".tier-tile")).toHaveCount(catalog.heroes.length);
});

test("failed stats keep the heroes browsable and Retry reloads them", async ({
  page,
}) => {
  await openTierList(page, { failFirst: true });
  await expect(page.getByRole("status")).toContainText(
    "Hero stats unavailable",
  );
  await expect(page.locator(".tier-tile")).toHaveCount(catalog.heroes.length);
  await expect(page.locator(".tier-label")).toHaveText(["NO DATA"]);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".tier-label").first()).toHaveText("S");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a persistent failure shows NO DATA", async ({ page }) => {
  await openTierList(page, { status: 500 });
  await expect(page.getByRole("status")).toContainText(
    "Hero stats unavailable",
  );
  await expect(page.locator(".tier-label")).toHaveText(["NO DATA"]);
});

test("tier list stays readable when portraits fail", async ({ page }) => {
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: url.pathname === "/v1/analytics/hero-stats" ? heroStats : [],
      headers: cors,
    });
  });
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Tier list", exact: true }).click();
  const first = page.locator(".tier-tile").first();
  await expect(first).toBeVisible();
  await expect(first.locator(".hero-name")).toHaveText(byWinRate[0].name);
  await expect(first).toContainText("%");
});

test("clicking a tile opens the hero on the Heroes tab", async ({ page }) => {
  await openTierList(page);
  const hero = byWinRate[3];
  await page.locator(".tier-tile", { hasText: hero.name }).click();
  await expect(page.locator(".hero-header h1")).toHaveText(hero.name);
  await expect(
    page.getByRole("button", { name: "Heroes", exact: true }),
  ).toHaveClass(/active/);
});
