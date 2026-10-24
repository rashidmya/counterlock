import { expect, test } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { FARGO, cors, mockApi } from "../web-browser/fixtures";

const haze = catalog.heroes.find((hero) => hero.name === "Haze")!;

for (const entry of [
  { page: "Tier list", title: "Tier List", error: "Hero stats unavailable:" },
  { page: "Heroes", title: "The Heroes", error: "Hero stats unavailable:" },
  { page: "Items", title: "The Shop", error: "Item stats unavailable:" },
  { page: "hero", title: "Haze", error: "Hero stats unavailable:" },
  { page: "hero", title: "Haze", error: "Build unavailable:" },
]) {
  test(`${entry.page} ${entry.error} Retry keeps keyboard focus nearby`, async ({
    page,
  }) => {
    let failed = true;
    await mockApi(page);
    await page.route("https://api.deadlock-api.com/v1/analytics/**", (route) =>
      failed
        ? route.fulfill({ status: 500, json: {}, headers: cors })
        : route.fallback(),
    );
    await page.goto("/");
    await page
      .getByRole("button", {
        name: entry.page === "hero" ? "Heroes" : entry.page,
        exact: true,
      })
      .click();
    if (entry.page === "hero")
      await page
        .locator(".page:not([hidden]) .hero-card", { hasText: haze.name })
        .click();
    const notice = page
      .locator(".page:not([hidden]) p")
      .filter({ hasText: entry.error });
    await expect(notice).toBeVisible();
    failed = false;
    await notice.getByRole("button", { name: "Retry" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      entry.error === "Build unavailable:"
        ? page.getByRole("tab", { name: "Build", exact: true })
        : page.getByRole("heading", { name: entry.title, exact: true }),
    ).toBeFocused();
    await expect(notice).toHaveCount(0);
  });
}

for (const tab of ["Overview", "Matches", "Heroes", "Performance"]) {
  test(`${tab} history Retry keeps focus on its active profile tab`, async ({
    page,
  }) => {
    let failed = true;
    await page.addInitScript((accountId) => {
      localStorage.setItem(
        "counterlock.profile.account",
        JSON.stringify({ accountId, seenAt: Date.now(), source: "manual" }),
      );
    }, FARGO);
    await mockApi(page);
    await page.route(
      `https://api.deadlock-api.com/v1/players/${FARGO}/match-history`,
      (route) =>
        failed
          ? route.fulfill({ status: 500, json: {}, headers: cors })
          : route.fallback(),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "My profile", exact: true }).click();
    const selected = page.getByRole("tab", { name: tab, exact: true });
    await selected.click();
    const notice = page
      .locator(".page:not([hidden]) .notice")
      .filter({ hasText: "Match history unavailable" });
    await expect(notice).toBeVisible();
    failed = false;
    await notice.getByRole("button", { name: "Retry" }).focus();
    await page.keyboard.press("Enter");
    await expect(selected).toBeFocused();
    await expect(notice).toHaveCount(0);
  });
}
