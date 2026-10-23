import { expect, test, type Page } from "@playwright/test";
import { activeMatch } from "../fixtures/live-match";

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
