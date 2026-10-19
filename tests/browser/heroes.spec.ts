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
const alphabetical = catalog.heroes
  .map((hero) => hero.name)
  .sort((a, b) => a.localeCompare(b));

async function openHeroes(
  page: Page,
  options: { stats?: unknown[]; status?: number; requests?: string[] } = {},
) {
  const { stats = heroStats, status = 200, requests } = options;
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/hero-stats") {
      requests?.push(route.request().url());
      return route.fulfill({ status, json: stats, headers: cors });
    }
    return route.fulfill({ json: [], headers: cors });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await expect(page.locator(".hero-card").first()).toBeVisible();
}

const cardNames = async (page: Page) =>
  (await page.locator(".hero-card .hero-name").allTextContents()).map((name) =>
    name.trim(),
  );

test("tier sort groups heroes under S to D headings with real stats", async ({
  page,
}) => {
  await openHeroes(page);
  await expect(page.locator(".hero-card")).toHaveCount(catalog.heroes.length);
  await expect(page.locator(".tier-heading")).toHaveText([
    "S TIER",
    "A TIER",
    "B TIER",
    "C TIER",
    "D TIER",
  ]);
  const first = page.locator(".hero-card").first();
  await expect(first.locator("img.hero-portrait")).toHaveAttribute(
    "src",
    /^https?:/,
  );
  await expect(first.locator(".hero-name")).toHaveText(byWinRate[0].name);
  await expect(first).toContainText("61.0%");
  await expect(first).toContainText(/\d+\.\d% pick/);
  await expect(first.locator(".tier-letter")).toHaveText("S");
  await expect(first.locator(".tier-letter")).toHaveCSS(
    "background-color",
    "rgb(242, 198, 109)",
  );
  await expect(
    page.getByText("Tiers are based on win rate.", { exact: true }),
  ).toBeVisible();
});

test("role filter keeps only that role", async ({ page }) => {
  await openHeroes(page);
  await page.getByRole("button", { name: "Mystic", exact: true }).click();
  const mystics = catalog.heroes.filter((hero) => hero.role === "mystic");
  await expect(page.locator(".hero-card")).toHaveCount(mystics.length);
  expect(new Set(await cardNames(page))).toEqual(
    new Set(mystics.map((hero) => hero.name)),
  );
});

test("A–Z sort drops the tier headings", async ({ page }) => {
  await openHeroes(page);
  await page.getByLabel("Sort", { exact: true }).selectOption({ label: "A–Z" });
  await expect(page.locator(".tier-heading")).toHaveCount(0);
  expect((await cardNames(page))[0]).toBe(alphabetical[0]);
  expect(await cardNames(page)).toEqual(alphabetical);
});

test("win rate and pick rate sorts are flat and descending", async ({
  page,
}) => {
  await openHeroes(page);
  const sort = page.getByLabel("Sort", { exact: true });
  await sort.selectOption({ label: "Win rate" });
  await expect(page.locator(".tier-heading")).toHaveCount(0);
  expect(await cardNames(page)).toEqual(byWinRate.map((hero) => hero.name));
  await sort.selectOption({ label: "Pick rate" });
  expect(await cardNames(page)).toEqual(
    catalog.heroes.map((hero) => hero.name),
  );
});

test("rank filter requests stats with min_average_badge", async ({ page }) => {
  const requests: string[] = [];
  await openHeroes(page, { requests });
  expect(requests[0]).not.toContain("min_average_badge");
  const next = page.waitForRequest(
    (request) =>
      request.url().includes("/v1/analytics/hero-stats") &&
      request.url().includes("min_average_badge=51"),
  );
  await page
    .getByLabel("Rank", { exact: true })
    .selectOption({ label: "Mystic+" });
  await next;
  await expect(page.locator(".hero-card").first()).toBeVisible();
});

test("heroes without analytics show dashes and trail as unranked", async ({
  page,
}) => {
  await openHeroes(page, { stats: heroStats.slice(1) });
  const missing = catalog.heroes[0];
  await expect(page.locator(".tier-heading").last()).toHaveText("UNRANKED");
  const card = page.locator(".hero-card", { hasText: missing.name });
  await expect(card).toContainText("—");
  await expect(card.locator(".tier-letter")).toHaveCount(0);
  await page.getByLabel("Sort", { exact: true }).selectOption({ label: "A–Z" });
  await expect(page.locator(".hero-card")).toHaveCount(catalog.heroes.length);
});

test("failed stats keep the heroes browsable", async ({ page }) => {
  await openHeroes(page, { status: 500 });
  await expect(page.getByRole("status")).toContainText(
    "Hero stats unavailable",
  );
  await expect(page.locator(".hero-card")).toHaveCount(catalog.heroes.length);
});

test("clicking a card opens that hero and back returns to the list", async ({
  page,
}) => {
  await openHeroes(page);
  const hero = byWinRate[3];
  await page.locator(".hero-card", { hasText: hero.name }).click();
  await expect(page.locator(".hero-detail-placeholder")).toContainText(
    hero.name,
  );
  await expect(page.locator(".hero-card")).toHaveCount(0);
  await page.getByRole("button", { name: "← All heroes" }).click();
  await expect(page.locator(".hero-card")).toHaveCount(catalog.heroes.length);
});
