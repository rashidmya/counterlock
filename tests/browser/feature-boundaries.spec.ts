import { expect, test, type Page } from "@playwright/test";
import { item, nativeWindow, updateMatch } from "./helpers";

async function buildResponses(page: Page) {
  await page.route("**/analytics/hero-build-stats/7?**", (route) =>
    route.fulfill({
      json: [
        {
          hero_id: 7,
          hero_build_id: 99,
          wins: 15,
          losses: 5,
          matches: 20,
          bucket: 0,
        },
      ],
    }),
  );
  await page.route("**/builds/7/99", (route) =>
    route.fulfill({
      json: {
        hero_build: {
          hero_id: 7,
          hero_build_id: 99,
          name: "Fixture build",
          details: {
            mod_categories: [
              { name: "Early game", mods: [{ ability_id: item.id }] },
              { name: "Late game", mods: [{ ability_id: item.id }] },
            ],
          },
        },
      },
    }),
  );
}

test("native build overlay shares live state, loads builds, and saves hide preferences", async ({
  page,
}) => {
  await nativeWindow(page, "in_game");
  await buildResponses(page);
  await page.goto("/in_game/in_game.html");
  await expect(page.locator(".scout-hud")).toHaveCSS("opacity", "0.75");
  await expect(page.locator(".hud-build")).toContainText("75.0% · 20 games");
  await expect(page.locator(".hud-item.owned")).toContainText(item.name);
  await page.getByLabel("Build stage").selectOption("1");
  await expect(page.getByLabel("Build stage")).toHaveValue("1");
  await page
    .getByRole("button", { name: "Hide recommended build overlay" })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("scout.overlay.recommended-build"),
    ),
  ).toBe("false");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("scout.overlay.position.in_game")!),
    ),
  ).toEqual({ x: 123, y: 45 });
});

test("counter window uses its native window identity and responds to live roster changes", async ({
  page,
}) => {
  await nativeWindow(page, "counter_overlay");
  await page.goto("/in_game/in_game.html");
  await expect(page.locator(".hud-counters")).toBeVisible();
  await expect(page.locator(".hud-build")).toHaveCount(0);
  await page.getByLabel("Counter target").selectOption("player_1");
  await expect(page.locator(".hud-items")).toContainText("Metal Skin");
  await updateMatch(page, { players: [] });
  await expect(page.locator(".hud-empty")).toHaveText(
    "Waiting for enemy heroes.",
  );
  await page
    .getByRole("button", { name: "Hide counter items overlay" })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("scout.overlay.counter-items"),
    ),
  ).toBe("false");
});

test("desktop retains counter and lookup state across tabs and exposes game-only settings", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await buildResponses(page);
  await page.goto("/desktop/desktop.html");
  await expect(page.locator("kbd")).toHaveText("Alt + S");
  await expect(page.locator(".match-clock strong")).toHaveText("12:34");
  await expect(page.locator(".build-panel")).toContainText("Fixture build");
  await page.getByLabel("Item budget").selectOption("1600");
  await page
    .getByRole("button", { name: "Player lookup", exact: true })
    .click();
  await page
    .locator(".lookup")
    .getByLabel("Steam ID", { exact: true })
    .fill("100000000");
  await page.getByRole("button", { name: "Live" }).click();
  await expect(page.getByLabel("Item budget")).toHaveValue("1600");
  await page
    .getByRole("button", { name: "Player lookup", exact: true })
    .click();
  await expect(
    page.locator(".lookup").getByLabel("Steam ID", { exact: true }),
  ).toHaveValue("100000000");
  await page
    .getByRole("button", { name: "Overlay settings", exact: true })
    .click();
  await expect(page.getByLabel("Recommended build in overlay")).toBeChecked();
  await page.getByLabel("Recommended build in overlay").uncheck();
  await page.getByRole("button", { name: "Live" }).click();
  await expect(page.locator(".build-panel")).toBeVisible();
});

for (const name of ["desktop", "in_game"]) {
  test(`${name} retains its Street Brawl build message without making build requests`, async ({
    page,
  }) => {
    await nativeWindow(page, name, "street_brawl");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("hero-build-stats"))
        requests.push(request.url());
    });
    await page.goto(
      name === "desktop" ? "/desktop/desktop.html" : "/in_game/in_game.html",
    );
    await expect(
      page.locator(name === "desktop" ? ".build-empty" : ".hud-empty"),
    ).toContainText(
      name === "desktop"
        ? "Build statistics for Street Brawl are unavailable."
        : "Build data unavailable for Street Brawl.",
    );
    expect(requests).toEqual([]);
  });
}

for (const name of ["desktop", "in_game"]) {
  test(`${name} preserves its build timeout message`, async ({ page }) => {
    await nativeWindow(page, name);
    await page.clock.install();
    await page.route("**/analytics/hero-build-stats/7?**", () => {});
    const requested = page.waitForRequest("**/analytics/hero-build-stats/7?**");
    await page.goto(
      name === "desktop" ? "/desktop/desktop.html" : "/in_game/in_game.html",
    );
    await requested;
    await page.clock.runFor(20_001);
    await expect(
      page.locator(name === "desktop" ? ".build-empty" : ".hud-empty"),
    ).toHaveText(
      name === "desktop"
        ? "Build statistics request timed out."
        : "Build unavailable. Reopen to retry.",
    );
  });
}

test("changing build hero aborts the pending request and displays only the new hero's build", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await page.route("**/analytics/hero-build-stats/7?**", () => {});
  await page.route("**/analytics/hero-build-stats/13?**", (route) =>
    route.fulfill({
      json: [
        {
          hero_id: 13,
          hero_build_id: 101,
          wins: 10,
          losses: 10,
          matches: 20,
          bucket: 0,
        },
      ],
    }),
  );
  await page.route("**/builds/13/101", (route) =>
    route.fulfill({
      json: {
        hero_build: {
          hero_id: 13,
          hero_build_id: 101,
          name: "New hero build",
          details: {
            mod_categories: [
              { name: "Items", mods: [{ ability_id: item.id }] },
            ],
          },
        },
      },
    }),
  );
  const requested = page.waitForRequest("**/analytics/hero-build-stats/7?**");
  await page.goto("/desktop/desktop.html");
  await requested;
  const aborted = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("hero-build-stats/7?"),
  );
  await page.getByLabel("Build hero").selectOption("13");
  await aborted;
  await expect(page.locator(".build-panel")).toContainText("New hero build");
  await expect(page.locator(".build-empty")).toHaveCount(0);
  await expect(page.getByLabel("Build performance")).toContainText("50.0%");
});
