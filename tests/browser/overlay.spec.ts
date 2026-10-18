import { expect, test } from "@playwright/test";

for (const windowName of ["desktop", "in_game"]) {
  test(`${windowName} entrypoint renders the shared UI with local artwork`, async ({
    page,
  }) => {
    await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
      route.abort(),
    );
    await page.goto(`/${windowName}/${windowName}.html`);
    await expect(page.locator("body")).toHaveAttribute(
      "data-window",
      windowName,
    );
    await expect(
      page.getByRole("heading", { name: "Recommended build Wraith" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".build-item img")
          .evaluateAll(
            (images) =>
              images.length === 24 &&
              images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
          ),
      )
      .toBe(true);
  });
}

test("preview shows both teams, focuses counter advice, and respects the budget", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await page.getByRole("button", { name: "Counter Haze", exact: true }).click();
  await expect(page.locator(".focus")).toContainText("Haze");
  await expect(
    page.locator(".item-card").filter({ hasText: "Metal Skin" }),
  ).toBeVisible();
  await page.getByLabel("Item budget").selectOption("1600");
  await expect(
    page.getByText("No suggestions yet", { exact: true }),
  ).toBeVisible();
  await page.locator("summary").click();
  await page.getByRole("button", { name: "Healing", exact: true }).click();
  await expect(
    page.locator(".item-card").filter({ hasText: "Healbane" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear hero selection" }).click();
  await expect(page.locator(".focus")).toContainText("Entire enemy team");
  expect(errors).toEqual([]);
});

test("switching to live never leaves demo stats on screen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to live" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByText("STANDBY", { exact: true })).toBeVisible();
  await expect(page.locator(".notice")).toContainText("Overwolf on Windows");
  await page.getByRole("button", { name: "Show demo", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(12);
});

test("enemy portraits focus counter items and clear threats from the previous target", async ({
  page,
}) => {
  await page.goto("/");
  const counters = page.locator(".counters");
  const filters = counters.getByRole("group", { name: "Enemy hero filters" });
  await counters.locator("summary").click();
  await counters.getByRole("button", { name: "Healing", exact: true }).click();
  const haze = filters.getByRole("button", {
    name: "Counter items for Haze",
    exact: true,
  });
  await haze.click();
  await expect(haze).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Counter Haze", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    counters.locator(".item-card").filter({ hasText: "Metal Skin" }),
  ).toBeVisible();
  await expect(
    counters.locator(".item-card").filter({ hasText: "Healbane" }),
  ).toHaveCount(0);
  const targets = await counters.locator(".targets span").allTextContents();
  expect(targets.length).toBeGreaterThan(0);
  expect(targets.every((target) => target === "Haze")).toBe(true);
  await page
    .getByRole("button", { name: "Counter Seven", exact: true })
    .click();
  await expect(
    filters.getByRole("button", {
      name: "Counter items for Seven",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(haze).toHaveAttribute("aria-pressed", "false");
  await filters
    .getByRole("button", { name: "All enemies", exact: true })
    .click();
  await expect(counters.locator(".focus")).toContainText("Entire enemy team");
  await expect(
    counters.locator(".targets").filter({ hasText: "Haze" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to live" }).click();
  await expect(filters).toHaveCount(0);
});

test("player lookup renders API data and reports partial failure", async ({
  page,
}) => {
  await page.route(
    "https://api.deadlock-api.com/v1/players/hero-stats?**",
    (route) =>
      route.fulfill({
        json: [
          {
            account_id: 100000000,
            hero_id: 7,
            wins: 6,
            matches_played: 10,
            last_played: 0,
          },
        ],
      }),
  );
  await page.route("https://api.deadlock-api.com/v1/players/rank?**", (route) =>
    route.fulfill({ status: 403, body: "Protected" }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Player lookup", exact: true })
    .click();
  await page.getByLabel("Steam ID", { exact: true }).fill("76561198060265728");
  await page
    .getByRole("button", { name: "Look up player", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("protected");
  await expect(page.locator("tbody")).toContainText("60.0%");
  await expect(page.locator("tbody")).toContainText("Unavailable");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("build header shows the local player's selected hero history without borrowing enemy stats", async ({
  page,
}) => {
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Recommended hero build" });
  const history = panel.getByRole("group", { name: "Your hero history" });
  await expect(history).toContainText("57.0%");
  await expect(history).toContainText("128");
  await page.getByLabel("Build hero", { exact: true }).selectOption("13");
  await expect(history).not.toContainText("57.0%");
  await expect(history).not.toContainText("60.2%");
  await expect(history.locator("strong")).toHaveText(["—", "—"]);
  await page.getByLabel("Build hero", { exact: true }).selectOption("local");
  await expect(history).toContainText("57.0%");
  await page.getByRole("button", { name: "Switch to live" }).click();
  await expect(history).toHaveCount(0);
});

test("small screens remain usable without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Overlay settings" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Overlay settings" }).click();
  await expect(page.getByLabel("Compact rows")).toBeChecked();
  await page.getByLabel("Compact rows").uncheck();
  await expect(page.getByLabel("Compact rows")).not.toBeChecked();
});

test("an Overwolf window attaches to the live background store and follows updates", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let state = {
      mode: "live",
      status: "Connected",
      phase: "GameInProgress",
      matchId: "123",
      localAccountId: null,
      gameMode: "normal",
      clock: "02:30",
      players: [],
      stats: {},
      error: null,
      loading: false,
    };
    const listeners = new Set<() => void>();
    Object.assign(window, {
      overwolf: {
        windows: {
          getMainWindow: () => ({
            counterlockStore: {
              getSnapshot: () => state,
              subscribe: (fn: () => void) => {
                listeners.add(fn);
                return () => listeners.delete(fn);
              },
              refresh: () => {},
            },
          }),
        },
        settings: {
          hotkeys: {
            get: (fn: (value: unknown) => void) =>
              fn({
                success: true,
                globals: [{ name: "toggle_counterlock", binding: "Ctrl+Shift+S" }],
              }),
          },
        },
      },
      emitCounterlockState: (next: typeof state) => {
        state = { ...state, ...next };
        listeners.forEach((fn) => fn());
      },
    });
  });
  await page.goto("/in_game/in_game.html");
  await expect(page.getByText("STANDBY", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { emitCounterlockState: (state: unknown) => void }
    ).emitCounterlockState({
      players: [
        {
          slot: "roster_0",
          name: "Local",
          heroId: 7,
          heroName: "Wraith",
          local: true,
          team: 2,
          accountId: 100,
          kills: 1,
          deaths: 0,
          assists: 2,
          items: [],
        },
        {
          slot: "roster_1",
          name: "Enemy",
          heroId: 13,
          heroName: "Haze",
          local: false,
          team: 3,
          accountId: null,
          kills: 0,
          deaths: 1,
          assists: 0,
          items: [],
        },
      ],
    });
  });
  await expect(page.getByText("LIVE MATCH", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Counter Haze", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".notice")).toHaveCount(0);
  const build = page.getByRole("region", { name: "Recommended hero build" });
  const history = build.getByRole("group", { name: "Your hero history" });
  await expect(build.locator(".eyebrow")).toContainText("IN GAME");
  await expect(history.locator("strong")).toHaveText(["—", "—"]);
  await page.evaluate(() => {
    (
      window as unknown as { emitCounterlockState: (state: unknown) => void }
    ).emitCounterlockState({
      stats: {
        100: {
          fetchedAt: Date.now(),
          heroes: [
            {
              account_id: 100,
              hero_id: 7,
              matches_played: 4,
              wins: 3,
              last_played: 0,
            },
            {
              account_id: 100,
              hero_id: 13,
              matches_played: 0,
              wins: 0,
              last_played: 0,
            },
          ],
        },
      },
    });
  });
  await expect(history.locator("strong")).toHaveText(["75.0%", "4"]);
  await page.getByLabel("Build hero", { exact: true }).selectOption("13");
  await expect(history.locator("strong")).toHaveText(["—", "0"]);
  await expect(build.locator(".eyebrow")).not.toContainText("IN GAME");
  await page.getByLabel("Build hero", { exact: true }).selectOption("local");
  await expect(page.locator(".current-stage")).toContainText("Early game");
  for (const [clock, phase] of [
    ["10:00", "Mid game"],
    ["20:00", "Late game"],
  ]) {
    await page.evaluate((clock) => {
      (
        window as unknown as { emitCounterlockState: (state: unknown) => void }
      ).emitCounterlockState({ clock });
    }, clock);
    await expect(page.locator(".current-stage")).toContainText(phase);
    await expect(page.locator(".stage-now")).toHaveCount(1);
  }
});

test("recommended build is above the roster, switches heroes, and uses bundled artwork offline", async ({
  page,
}) => {
  // Item artwork must remain available without the external asset service.
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Recommended hero build" });
  await expect(
    panel.getByRole("heading", { name: "Recommended build Wraith" }),
  ).toBeVisible();
  await expect(panel.locator(".build-item")).toHaveCount(24);
  for (const stage of await panel.locator(".build-stage").all())
    await expect(stage.locator(".build-item")).toHaveCount(8);
  await expect(panel.locator(".stage-time")).toHaveText([
    "0–10 min",
    "10–20 min",
    "20+ min",
  ]);
  await expect(panel.locator(".current-stage")).toContainText("Mid game");
  const panelBox = await panel.boundingBox();
  const rosterBox = await page.locator(".rosters").boundingBox();
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(rosterBox!.y);
  const before = await panel.locator(".build-item strong").allTextContents();
  await page.getByLabel("Build hero", { exact: true }).selectOption("13");
  await expect(
    panel.getByRole("heading", { name: "Recommended build Haze" }),
  ).toBeVisible();
  expect(
    await panel.locator(".build-item strong").allTextContents(),
  ).not.toEqual(before);
  const icons = page.locator("img.item-icon");
  await expect
    .poll(() =>
      icons.evaluateAll(
        (images) =>
          images.length > 0 &&
          images.every((img) => {
            const image = img as HTMLImageElement;
            return (
              image.complete &&
              image.naturalWidth > 0 &&
              new URL(image.src).pathname.startsWith("/items/")
            );
          }),
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Collapse recommended build" })
    .click();
  await expect(panel.locator(".build-stages")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand recommended build" }).click();
  await expect(panel.locator(".build-item")).toHaveCount(24);
  await page.getByRole("button", { name: "Switch to live" }).click();
  await expect(page.getByLabel("Build hero", { exact: true })).toHaveValue(
    "local",
  );
  await expect(panel.locator(".build-empty")).toContainText("Select a hero");
});
