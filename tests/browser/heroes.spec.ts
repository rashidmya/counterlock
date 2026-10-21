import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const cors = { "access-control-allow-origin": "*" };

const heroStats = catalog.heroes.map((hero, index) => {
  const matches = 20000 - index * 200;
  const wins = (matches * (400 + index * 5)) / 1000;
  return {
    hero_id: hero.id,
    wins,
    losses: matches - wins,
    matches,
    total_kills: 8 * matches,
    total_deaths: 5 * matches,
    total_assists: 10 * matches,
  };
});
const alphabetical = catalog.heroes
  .map((hero) => hero.name)
  .sort((a, b) => a.localeCompare(b));
const haze = catalog.heroes.find((hero) => hero.name === "Haze")!;

async function openHeroes(page: Page) {
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: url.pathname === "/v1/analytics/hero-stats" ? heroStats : [],
      headers: cors,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await expect(
    page.locator(".page:not([hidden]) .hero-card").first(),
  ).toBeVisible();
}

const cardNames = async (page: Page) =>
  (
    await page
      .locator(".page:not([hidden]) .hero-card .hero-name")
      .allTextContents()
  ).map((name) => name.trim());

test("roster lists every hero A–Z with role and win rate", async ({ page }) => {
  await openHeroes(page);
  await expect(page.locator(".page:not([hidden]) .hero-card")).toHaveCount(
    catalog.heroes.length,
  );
  expect(await cardNames(page)).toEqual(alphabetical);
  const first = page.locator(".page:not([hidden]) .hero-card").first();
  const hero = catalog.heroes.find((entry) => entry.name === alphabetical[0])!;
  await expect(first).toContainText(hero.role!);
  await expect(first).toContainText(/\d+\.\d%/);
  await expect(page.locator(".page:not([hidden]) .tier-letter")).toHaveCount(0);
});

test("search narrows the roster", async ({ page }) => {
  await openHeroes(page);
  await page.getByLabel("Search heroes").fill("ha");
  await expect(
    page.locator(".page:not([hidden]) .hero-card", { hasText: "Haze" }),
  ).toHaveCount(1);
  const count = await page.locator(".page:not([hidden]) .hero-card").count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(catalog.heroes.length);
  expect(
    (await cardNames(page)).every((name) => name.toLowerCase().includes("ha")),
  ).toBe(true);
});

test("role filter keeps only that role", async ({ page }) => {
  await openHeroes(page);
  await page.getByRole("button", { name: "Mystic", exact: true }).click();
  const mystics = catalog.heroes.filter((hero) => hero.role === "mystic");
  await expect(page.locator(".page:not([hidden]) .hero-card")).toHaveCount(
    mystics.length,
  );
  expect(new Set(await cardNames(page))).toEqual(
    new Set(mystics.map((hero) => hero.name)),
  );
});

test("clicking a card opens that hero and back returns to the roster", async ({
  page,
}) => {
  await openHeroes(page);
  await page
    .locator(".page:not([hidden]) .hero-card", { hasText: haze.name })
    .first()
    .click();
  await expect(page.locator(".hero-header h1")).toHaveText(haze.name);
  await expect(page.locator(".page:not([hidden]) .hero-card")).toHaveCount(0);
  await page.getByRole("button", { name: "← All heroes" }).click();
  await expect(page.locator(".page:not([hidden]) .hero-card")).toHaveCount(
    catalog.heroes.length,
  );
});
