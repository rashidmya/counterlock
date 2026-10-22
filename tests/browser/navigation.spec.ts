import { expect, test } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { matchPlayers, nativeWindow, updateMatch } from "./helpers";

test("browser preview opens Home and Live shows not running", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Home" })).toHaveClass(
    /active/,
  );
  await expect(page.getByRole("button", { name: "Player lookup" })).toHaveCount(
    0,
  );
  await expect(page.locator(".tabs button")).toHaveText([
    "Home",
    "Live",
    "Tier list",
    "Heroes",
    "Items",
  ]);
  await expect(page.locator(".live-badge")).toHaveCount(0);
  await expect(page.getByText("TOGGLE OVERLAY")).toHaveCount(0);
  await page.getByRole("button", { name: "Live" }).click();
  await expect(page.getByText("Deadlock isn't running")).toBeVisible();
  await page.getByRole("button", { name: "Browse heroes" }).click();
  await expect(page.getByRole("button", { name: "Heroes" })).toHaveClass(
    /active/,
  );
});

test("game running without match shows waiting", async ({ page }) => {
  await nativeWindow(page, "desktop", "normal", {
    running: true,
    players: false,
  });
  await page.goto("/desktop/desktop.html");
  await expect(page.getByRole("button", { name: "Live" })).toHaveClass(
    /active/,
  );
  await expect(page.getByText("Waiting for a match")).toBeVisible();
  await expect(page.getByText("EVENTS CONNECTED")).toHaveCount(0);
  await page.getByRole("button", { name: "View your profile" }).click();
  await expect(page.getByRole("button", { name: "Home" })).toHaveClass(
    /active/,
  );
});

test("joining a match switches to Live once", async ({ page }) => {
  await nativeWindow(page, "desktop", "normal", {
    running: true,
    players: false,
  });
  await page.route("**/v1/analytics/item-stats?**", (route) =>
    route.fulfill({
      json: [],
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/desktop/desktop.html");
  await page.getByRole("button", { name: "Heroes" }).click();
  await expect(page.getByRole("button", { name: "Heroes" })).toHaveClass(
    /active/,
  );

  await updateMatch(page, { players: matchPlayers(), matchId: null });
  await expect(page.getByRole("button", { name: "Live" })).toHaveClass(
    /active/,
  );
  await expect(page.locator(".build-panel")).toBeVisible();
  await expect(page.locator(".live-badge")).toBeVisible();

  await page.getByRole("button", { name: "Heroes" }).click();
  await updateMatch(page, { matchId: "42" });
  await expect(page.getByRole("button", { name: "Heroes" })).toHaveClass(
    /active/,
  );
  await expect(
    page.getByRole("button", { name: "Live" }).locator(".live-dot"),
  ).toBeVisible();

  await updateMatch(page, { players: [] });
  await expect(page.locator(".live-badge")).toBeHidden();
  await updateMatch(page, { players: matchPlayers(), matchId: "43" });
  await expect(page.getByRole("button", { name: "Live" })).toHaveClass(
    /active/,
  );
});

test("View your profile opens the stored account's profile", async ({
  page,
}) => {
  await nativeWindow(page, "desktop", "normal", {
    running: true,
    players: false,
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "counterlock.profile.account",
      JSON.stringify({
        accountId: 100000000,
        seenAt: Date.now(),
        source: "manual",
      }),
    ),
  );
  await page.route("https://api.deadlock-api.com/**", (route) =>
    route.fulfill({
      json: [],
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/desktop/desktop.html");
  await page.getByRole("button", { name: "View your profile" }).click();
  await expect(
    page.locator(".page:not([hidden]) .profile-header"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).not.toHaveClass(
    /active/,
  );
});

test("Live intro ribbon names the local player's hero", async ({ page }) => {
  await nativeWindow(page, "desktop");
  await page.route("**/v1/analytics/item-stats?**", (route) =>
    route.fulfill({
      json: [],
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/desktop/desktop.html");
  const hero = catalog.heroes.find((h) => h.id === 7)!.name;
  await expect(page.locator(".intro .ribbon")).toHaveText(
    `You're playing ${hero}`,
  );
});

test("Live intro omits the ribbon when the local hero is unresolved", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await page.route("**/v1/analytics/item-stats?**", (route) =>
    route.fulfill({
      json: [],
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/desktop/desktop.html");
  await expect(page.locator(".intro .ribbon")).toBeVisible();
  const [local, enemy] = matchPlayers();
  await updateMatch(page, {
    players: [{ ...local, heroId: 0, heroName: "Hero not detected" }, enemy],
  });
  await expect(page.locator(".intro h1")).toHaveText("Know the match.");
  await expect(page.locator(".intro .ribbon")).toHaveCount(0);
  await expect(page.getByText("You're playing")).toHaveCount(0);
});
