import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";

const footer =
  "Data from Deadlock API (community service). Deadlock and its game assets belong to Valve. Counterlock is not affiliated with Valve.";

test("shell shows web navigation and footer", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Home" })).toHaveClass(/active/);
  await expect(nav.getByRole("link", { name: "Tier list" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Heroes" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Items" })).toBeVisible();
  await expect(nav.getByText("Live")).toHaveCount(0);
  await expect(page.locator("footer")).toContainText(footer);
  await expect(
    page.locator("footer").getByRole("link", { name: "Deadlock API" }),
  ).toHaveAttribute("href", "https://deadlock-api.com");
  await expect(
    page.locator("footer").getByRole("link", { name: "About" }),
  ).toHaveAttribute("href", "/about");
});

test("wordmark keeps its website size between phone and desktop widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/");
  await expect(page.locator("header .brand")).toHaveCSS("font-size", "21px");
});

test("navigation links change the URL", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Heroes" })
    .click();
  await expect(page).toHaveURL(/\/heroes$/);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Tier list" })
    .click();
  await expect(page).toHaveURL(/\/tier-list$/);
});

test("reloading a player URL serves the app shell with 200", async ({
  page,
}) => {
  const response = await page.goto("/players/123");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Home" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Items" }),
  ).toBeVisible();
});

test("unknown URLs return 404 and render the not-found page", async ({
  page,
}) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to Counterlock" }),
  ).toHaveAttribute("href", "/");
});

test("about page covers attribution and privacy", async ({ page }) => {
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page).toHaveTitle("About | Counterlock");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { name: "About" })).toBeVisible();
  await expect(main).toContainText("not affiliated with Valve");
  await expect(main).toContainText("localStorage");
  await expect(main).toContainText("Switch account");
  await expect(main).toContainText("keep to the API's rate limits");
  await expect(main).toContainText("Google Fonts");
});

test("content is capped and centred with side gutters", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("/heroes");
  const edges = () =>
    page.locator("main.page > *").evaluateAll((nodes) =>
      nodes.map((node) => {
        const { left, right } = node.getBoundingClientRect();
        return { left, right };
      }),
    );
  const wide = await edges();
  expect(wide.length).toBeGreaterThan(0);
  for (const { left, right } of wide) {
    expect(Math.abs(left - (1920 - 1320) / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(right - (1920 - 300))).toBeLessThanOrEqual(2);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  for (const { left } of await edges())
    expect(Math.abs(left - 64)).toBeLessThanOrEqual(2);

  expect(
    await page
      .locator("header")
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("sticky");
  expect(
    await page
      .locator(".app")
      .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
  ).toBe("0px");
});

test("header and footer span the full width", async ({ page }) => {
  for (const width of [1920, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/about");
    for (const tag of ["header", "footer"]) {
      const box = await page.locator(tag).boundingBox();
      expect(box!.x).toBe(0);
      expect(box!.width).toBe(width);
    }
  }
});

test("header is one 60px row with the nav inline", async ({ page }) => {
  await page.goto("/");
  const header = (await page.locator("header").boundingBox())!;
  expect(header.height).toBe(60);
  const nav = (await page.locator("header nav").boundingBox())!;
  const brand = (await page.locator("header .brand").boundingBox())!;
  const mine = (await page.locator("header .my-profile").boundingBox())!;
  expect(nav.x).toBeGreaterThanOrEqual(brand.x + brand.width);
  expect(mine.x).toBeGreaterThanOrEqual(nav.x + nav.width);
});

test("the brand is the wordmark only, with no logo image or tagline", async ({
  page,
}) => {
  for (const width of [1280, 800, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const brand = page.locator("header .brand");
    await expect(brand).toHaveText("Counterlock");
    await expect(brand.locator("img, small")).toHaveCount(0);
    await expect(page.getByText("Know the match. Make your move.")).toHaveCount(
      0,
    );
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - window.innerWidth,
      header:
        document.querySelector("header")!.scrollWidth -
        document.querySelector("header")!.clientWidth,
    }));
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.header).toBeLessThanOrEqual(0);
  }
});

test("page titles are 40px and hero cards ~180px on the web", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/about");
  expect(
    await page
      .locator(".page-title h1")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("40px");
  await page.goto("/heroes");
  const card = page.locator("a.hero-card").first();
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(176);
  expect(box.height).toBeLessThanOrEqual(184);
  expect(box.width).toBeGreaterThanOrEqual(140);
  expect(box.width).toBeLessThanOrEqual(160);
});
