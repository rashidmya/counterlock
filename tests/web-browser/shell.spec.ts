import { expect, test } from "@playwright/test";

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
  await expect(main).toContainText("Google Fonts");
});
