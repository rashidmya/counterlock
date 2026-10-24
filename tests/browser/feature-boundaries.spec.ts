import { expect, test, type Page, type Route } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { item, nativeWindow } from "./helpers";

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

test("desktop retains counter state across tabs and exposes game-only settings", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await mainBuildResponses(page, { 7: [buyRow(item.id)] });
  await page.goto("/desktop/desktop.html");
  await expect(page.locator(".match-clock strong")).toHaveText("12:34");
  await expect(page.locator(".build-panel h2")).toContainText("Your build");
  const owned = page.locator(".build-panel .build-item.owned");
  await expect(owned).toContainText(item.name);
  await expect(owned.locator("small")).toHaveText("OWNED");
  const mid = page.locator(".build-panel .build-phase[data-phase=mid]");
  await expect(mid).toHaveClass(/\bnow\b/);
  await expect(mid).toContainText("Now");
  await page.getByLabel("Item budget").selectOption("1600");
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  await page.getByRole("button", { name: "Live" }).click();
  await expect(page.getByLabel("Item budget")).toHaveValue("1600");
  await page
    .getByRole("button", { name: "Overlay settings", exact: true })
    .click();
  await expect(page.locator(".settings kbd")).toHaveText("Alt + S");
  await expect(page.locator(".settings").getByRole("checkbox")).toHaveCount(5);
  for (const title of [
    "Hero damage",
    "Objective damage",
    "Healing",
    "You vs. average",
    "Spawn timers",
  ]) {
    const checkbox = page.getByLabel(`${title} overlay`, { exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
  }
  await page.getByRole("button", { name: "Live" }).click();
  await expect(page.locator(".build-panel")).toBeVisible();
});

test("Live build follows the rank chosen on a hero page", async ({ page }) => {
  await nativeWindow(page, "desktop");
  await page.route("https://api.deadlock-api.com/**", (route) =>
    route.fulfill({
      json: [],
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await mainBuildResponses(page, { 7: [buyRow(item.id)] });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/desktop/desktop.html");
  const panel = page.locator(".build-panel");
  await expect(panel.locator(".eyebrow")).toContainText("All ranks");
  await page.getByRole("button", { name: "Heroes", exact: true }).click();
  // Haze, not the local hero, so the hero page's own build requests are
  // never mistaken for the Live panel's.
  await page
    .locator(".page:not([hidden]) .hero-card")
    .filter({ hasText: "Haze" })
    .click();
  await page
    .locator(".page:not([hidden])")
    .getByLabel("Rank", { exact: true })
    .selectOption({ label: "Mystic+" });
  await page.getByRole("button", { name: "Live" }).click();
  await expect(panel.locator(".eyebrow")).toContainText("Mystic+");
  await expect(panel.locator(".build-source")).toContainText("Mystic+");
  await expect
    .poll(() =>
      requests.some((url) => {
        const params = new URL(url).searchParams;
        return (
          url.includes("/v1/analytics/item-stats?") &&
          params.get("hero_id") === "7" &&
          params.has("min_bought_at_s") &&
          params.get("min_average_badge") === "51"
        );
      }),
    )
    .toBe(true);
});

test("desktop retains its Street Brawl build message without build requests", async ({
  page,
}) => {
  await nativeWindow(page, "desktop", "street_brawl");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("min_bought_at_s")) requests.push(request.url());
  });
  await page.goto("/desktop/desktop.html");
  await expect(page.locator(".build-empty")).toContainText(
    "Build statistics for Street Brawl are unavailable.",
  );
  expect(requests).toEqual([]);
});

test("desktop build shows an error with Retry", async ({ page }) => {
  await nativeWindow(page, "desktop");
  let failed = false;
  await page.route("**/v1/analytics/item-stats?**", (route) => {
    const headers = { "access-control-allow-origin": "*" };
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 500, body: "", headers });
    }
    const url = new URL(route.request().url());
    return route.fulfill({
      json:
        url.searchParams.get("min_bought_at_s") === "0"
          ? [buyRow(item.id)]
          : [],
      headers,
    });
  });
  await page.goto("/desktop/desktop.html");
  await expect(page.locator(".build-panel .build-empty")).toContainText(
    "Build unavailable: Deadlock API unavailable (500).",
  );
  await page
    .locator(".build-panel")
    .getByRole("button", { name: "Retry" })
    .click();
  await expect(page.locator(".build-panel .build-item")).toContainText(
    item.name,
  );
});

test("changing build hero shows only the new hero's build", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  const newItem = catalog.items[1];
  const headers = { "access-control-allow-origin": "*" };
  const phase0 = (url: URL) => url.searchParams.get("min_bought_at_s") === "0";
  // The local hero's phase requests stay pending until the new hero's build
  // shows, then answer late with a build that must never appear.
  const held: Route[] = [];
  await page.route("**/v1/analytics/item-stats?**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("hero_id") === "7") {
      held.push(route);
      return;
    }
    return route.fulfill({
      json:
        url.searchParams.get("hero_id") === "13" && phase0(url)
          ? [buyRow(newItem.id)]
          : [],
      headers,
    });
  });
  await page.goto("/desktop/desktop.html");
  await expect.poll(() => held.length).toBe(3);
  await page.getByLabel("Build hero").selectOption("13");
  const panel = page.locator(".build-panel");
  await expect(panel).toContainText(newItem.name);
  await expect(panel.locator(".build-empty")).toHaveCount(0);
  await Promise.all(
    held.map((route) =>
      route.fulfill({
        json: phase0(new URL(route.request().url())) ? [buyRow(item.id)] : [],
        headers,
      }),
    ),
  );
  await page.evaluate(() => new Promise((done) => setTimeout(done, 200)));
  await expect(panel).not.toContainText(item.name);
  await expect(panel).toContainText(newItem.name);
});
