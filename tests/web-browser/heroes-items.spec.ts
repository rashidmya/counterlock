import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { PNG, cors, heroStats, itemRow } from "./fixtures";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const shopItems = catalog.items
  .filter((entry) => entry.image && entry.cost > 0)
  .slice(0, 12);
const [bestA, bestB] = shopItems;
async function mockApi(page: Page, requests: string[] = []) {
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ json: body, headers: cors });
    switch (url.pathname) {
      case "/v1/analytics/hero-stats":
        return json(heroStats);
      case "/v1/analytics/item-stats":
        return json(
          url.searchParams.has("hero_id")
            ? [itemRow(bestA.id, 0.62), itemRow(bestB.id, 0.58)]
            : shopItems.slice(0, 6).map((entry) => itemRow(entry.id, 0.5)),
        );
      default:
        return json([]);
    }
  });
}

const markNavigation = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __marker: string }).__marker = "alive";
  });
const marker = (page: Page) =>
  page.evaluate(() => (window as unknown as { __marker?: string }).__marker);

test("a pre-rendered hero page hydrates without console errors", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await mockApi(page);
  await page.goto("/heroes/haze");
  await expect(page.locator(".hero-header h1")).toHaveText("Haze");
  await expect(page.locator(".hero-header .tier-banner")).toBeVisible();
  expect(problems).toEqual([]);
});

test("hero → item → back uses client navigation and keeps history", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes/haze");
  await expect(page.locator(".hero-header h1")).toHaveText("Haze");
  await markNavigation(page);
  const best = page.locator(".detail-section", {
    has: page.getByRole("heading", { name: "Best items", exact: true }),
  });
  const tile = best.locator(".item-tile").first();
  await expect(tile).toHaveText(new RegExp(bestA.name));
  await expect(tile).toHaveAttribute("href", `/items/${slugify(bestA.name)}`);
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`/items/${slugify(bestA.name)}$`));
  await expect(page.getByRole("heading", { name: bestA.name })).toBeVisible();
  expect(await marker(page)).toBe("alive");
  await expect(page).toHaveTitle(
    `${bestA.name} — stats, builds & win rate | Counterlock`,
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/heroes\/haze$/);
  await expect(page.locator(".hero-header h1")).toHaveText("Haze");
  expect(await marker(page)).toBe("alive");
});

test("hero cards are real links and clicking one navigates in-page", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes");
  await expect(page).toHaveTitle("Deadlock hero tier list | Counterlock");
  const cards = page.locator("a.hero-card");
  await expect(cards).toHaveCount(catalog.heroes.length);
  await expect(
    page.locator(".hero-card", { hasText: "Haze" }).first(),
  ).toHaveAttribute("href", "/heroes/haze");
  for (const hero of catalog.heroes)
    await expect(
      page.locator(`a.hero-card[href="/heroes/${slugify(hero.name)}"]`),
    ).toHaveCount(1);
  await markNavigation(page);
  await page.locator('a.hero-card[href="/heroes/haze"]').click();
  await expect(page).toHaveURL(/\/heroes\/haze$/);
  await expect(page.locator(".hero-header h1")).toHaveText("Haze");
  expect(await marker(page)).toBe("alive");
  await page.getByRole("link", { name: "← All heroes" }).click();
  await expect(page).toHaveURL(/\/heroes$/);
  expect(await marker(page)).toBe("alive");
});

test("special-character heroes round-trip slug → page → link", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes");
  await page.locator('a.hero-card[href="/heroes/mo-krill"]').click();
  await expect(page).toHaveURL(/\/heroes\/mo-krill$/);
  await expect(page.locator(".hero-header h1")).toHaveText("Mo & Krill");
  await page.goto("/heroes/the-doorman");
  await expect(page.locator(".hero-header h1")).toHaveText("The Doorman");
});

test("item cards link to item pages and an item page direct-loads", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/items");
  await expect(page).toHaveTitle("Deadlock items | Counterlock");
  const tile = page.locator(`a[href="/items/${slugify(bestA.name)}"]`).first();
  await expect(tile).toBeVisible();
  await markNavigation(page);
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`/items/${slugify(bestA.name)}$`));
  await expect(page.getByRole("heading", { name: bestA.name })).toBeVisible();
  expect(await marker(page)).toBe("alive");

  await page.goto("/items/leech");
  await expect(page.getByRole("heading", { name: "Leech" })).toBeVisible();
  await expect(page).toHaveTitle(
    "Leech — stats, builds & win rate | Counterlock",
  );
});

test("the rank filter set on Heroes is kept after navigating to Items", async ({
  page,
}) => {
  const requests: string[] = [];
  await mockApi(page, requests);
  await page.goto("/heroes");
  await expect(page.locator(".hero-card").first()).toBeVisible();
  await page.getByLabel("Rank").selectOption({ index: 2 });
  const chosen = await page.getByLabel("Rank").inputValue();
  expect(Number(chosen)).toBeGreaterThan(0);
  await markNavigation(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Items" })
    .click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByLabel("Rank")).toHaveValue(chosen);
  expect(await marker(page)).toBe("alive");
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.includes("item-stats") &&
          url.includes(`min_average_badge=${chosen}`),
      ),
    )
    .toBe(true);
});

test("an unknown hero or item slug renders not-found with a link back", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes/nope");
  await expect(page.getByText("Hero not found")).toBeVisible();
  await expect(page).toHaveTitle("Not found | Counterlock");
  await expect(page.getByRole("link", { name: "All heroes" })).toHaveAttribute(
    "href",
    "/heroes",
  );

  await page.goto("/items/nope");
  await expect(page.getByText("Item not found")).toBeVisible();
  await expect(page).toHaveTitle("Not found | Counterlock");
  await expect(page.getByRole("link", { name: "All items" })).toHaveAttribute(
    "href",
    "/items",
  );
});
