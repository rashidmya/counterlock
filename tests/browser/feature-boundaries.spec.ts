import { expect, test, type Page, type Route } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
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
    const buildRequest =
      name === "desktop" ? "min_bought_at_s" : "hero-build-stats";
    page.on("request", (request) => {
      if (request.url().includes(buildRequest)) requests.push(request.url());
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

test("in_game preserves its build timeout message", async ({ page }) => {
  await nativeWindow(page, "in_game");
  await page.clock.install();
  await page.route("**/analytics/hero-build-stats/7?**", () => {});
  const requested = page.waitForRequest("**/analytics/hero-build-stats/7?**");
  await page.goto("/in_game/in_game.html");
  await requested;
  await page.clock.runFor(20_001);
  await expect(page.locator(".hud-empty")).toHaveText(
    "Build unavailable. Reopen to retry.",
  );
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
