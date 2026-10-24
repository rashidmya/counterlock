import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { activeMatch } from "../fixtures/live-match";
import { nativeWindow, updateMatch } from "./helpers";

const ACCOUNT = 100000000;
const STEAM_ID = "76561198060265728";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const cors = { "access-control-allow-origin": "*" };

// Every account is in a live match, as its first hero; `asked` collects the
// accounts the Watch list was asked about.
async function routeApi(page: Page) {
  const asked: string[] = [];
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ json: body, headers: cors });
    if (url.pathname.startsWith("/v1/assets/"))
      return route.fulfill({
        body: PNG,
        contentType: "image/png",
        headers: cors,
      });
    if (url.pathname === "/v1/players/steam")
      return json(
        (url.searchParams.get("account_ids") ?? "")
          .split(",")
          .map(Number)
          .filter((id) => id === ACCOUNT)
          .map((id) => ({ account_id: id, personaname: "Fixture Persona" })),
      );
    if (url.pathname === "/v1/matches/active") {
      const id = url.searchParams.get("account_ids") ?? "";
      asked.push(id);
      return json([activeMatch(Number(id))]);
    }
    return json([]);
  });
  return asked;
}

// Pages stay mounted (hidden) once visited, so scope locators to the visible one.
const view = (page: Page) => page.locator(".page:not([hidden])");

async function openProfile(page: Page) {
  await page.goto("/");
  await page.getByLabel("Find a player").fill(STEAM_ID);
  await page.getByRole("button", { name: /Use this ID/ }).click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Fixture Persona",
  );
}

test("another player's Live tab in the app shows their match; a name opens that profile", async ({
  page,
}) => {
  const asked = await routeApi(page);
  await openProfile(page);
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match" }),
  ).toBeVisible();
  expect(asked).toEqual([String(ACCOUNT)]);
  await expect(view(page).locator('li[aria-current="true"]')).toContainText(
    "Fixture Persona",
  );
  await view(page)
    .locator(".live-team.team-1")
    .getByRole("button", { name: "Player 7006" })
    .click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Player 7006",
  );
});

test("a profile hidden behind another page of the app checks nothing", async ({
  page,
}) => {
  await page.clock.install();
  const asked = await routeApi(page);
  await openProfile(page);
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match" }),
  ).toBeVisible();
  await page.clock.runFor(60_000);
  await expect.poll(() => asked.length).toBe(2);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Heroes" })
    .click();
  await page.clock.runFor(180_000);
  // Time for a request the page made to reach the route.
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(2);
});

async function storeMe(page: Page, accountId = ACCOUNT) {
  await page.addInitScript(
    (accountId) =>
      localStorage.setItem(
        "counterlock.profile.account",
        JSON.stringify({ accountId, seenAt: Date.now(), source: "detected" }),
      ),
    accountId,
  );
}

async function openMyLive(page: Page) {
  await page.goto("/desktop/desktop.html");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Live" }).click();
}

test("your own Live tab in the app shows the match from Overwolf, not the Watch list", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await storeMe(page);
  const asked = await routeApi(page);
  await openMyLive(page);
  const tab = view(page).locator(".live-tab");
  // The local player's hero (id 7), from the catalog.
  const hero = catalog.heroes.find((entry) => entry.id === 7)!.name;
  await expect(
    tab.getByRole("heading", { name: `Live match · ${hero}` }),
  ).toBeVisible();
  await expect(tab.locator(".match-clock strong")).toHaveText("12:34");
  await expect(tab.getByRole("heading", { name: "Your team" })).toBeVisible();
  await expect(tab.getByRole("heading", { name: "Enemy team" })).toBeVisible();
  // The profile keeps its own title.
  await expect(view(page).getByRole("heading", { level: 1 })).toHaveText(
    "Fixture Persona",
  );

  await updateMatch(page, { players: [] });
  await expect(
    tab.getByRole("heading", { name: "Not in a game" }),
  ).toBeVisible();
  await expect(tab).toContainText(
    "Deadlock is running: your match shows here as soon as it loads.",
  );
  expect(asked).toEqual([]);
});

test("your own Live tab says Deadlock isn't running", async ({ page }) => {
  await nativeWindow(page, "desktop", "normal", {
    running: false,
    players: false,
  });
  await storeMe(page);
  const asked = await routeApi(page);
  await openMyLive(page);
  const tab = view(page).locator(".live-tab");
  await expect(
    tab.getByRole("heading", { name: "Not in a game" }),
  ).toBeVisible();
  await expect(tab).toContainText(
    "Deadlock isn't running. Your match shows here once you're in one.",
  );
  expect(asked).toEqual([]);
});

test("the account Overwolf reports on this PC gets the Overwolf tab, whichever account is remembered", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await storeMe(page, 200);
  const asked = await routeApi(page);
  await page.goto("/desktop/desktop.html");
  await updateMatch(page, { localAccountId: ACCOUNT });
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Home" })
    .click();
  await view(page).getByLabel("Find a player").fill(STEAM_ID);
  await view(page)
    .getByRole("button", { name: /Use this ID/ })
    .click();
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(view(page).locator(".live-tab .match-clock")).toBeVisible();
  // The remembered account, another one, gets the Watch list's.
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Live" }).click();
  await expect(
    view(page).getByRole("heading", { name: "Live match", exact: true }),
  ).toBeVisible();
  expect(asked).toEqual(["200"]);
});
