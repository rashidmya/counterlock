import { expect, test } from "@playwright/test";
import { heroes } from "../fixtures/match-report";
import { FARGO, mockApi } from "./fixtures";

const viewingAs = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: "Viewing as" });

test("a match URL opens as the linked player", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/matches/1001?player=${FARGO}`);
  await expect(page).toHaveTitle("Match 1001 | Counterlock");
  await expect(viewingAs(page)).toHaveValue("1");
  await expect(page.locator(".report-note")).toHaveText(
    "You're viewing A Rather Long Persona Name Fixture's match. Labels and verdicts are from their point of view.",
  );
  await expect(page.locator(".report-result")).toHaveText("Victory");
  await expect(page.locator(".graph-ranking li")).toHaveCount(12);
});

test("without a player the match opens whole, unless you played in it", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/matches/1001");
  await expect(viewingAs(page)).toHaveValue("all");
  await expect(page.locator(".report-result")).toHaveText("Amber won");
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "counterlock.web.account",
        JSON.stringify({ accountId: id }),
      ),
    FARGO,
  );
  await page.goto("/matches/1001?player=5001");
  await expect(viewingAs(page)).toHaveValue("1");
  await expect(page.locator(".report-note")).toHaveText("This is your match.");
});

test("reloading a match URL serves the app shell with 200", async ({
  page,
}) => {
  await mockApi(page);
  const response = await page.goto("/matches/1001");
  expect(response?.status()).toBe(200);
  await expect(page.locator(".report-result")).toBeVisible();
});

test("an invalid match id says so", async ({ page }) => {
  await page.goto("/matches/abc");
  await expect(page.locator("h1")).toHaveText("That isn't a valid match ID.");
});

test("the report banner runs edge to edge; its text keeps the gutter", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/matches/1001?player=${FARGO}`);
  const banner = (await page.locator(".report-banner").boundingBox())!;
  expect(banner.x).toBe(0);
  expect(banner.width).toBe(1260);
  const portrait = (await page
    .locator(".report-banner-portrait")
    .boundingBox())!;
  expect(portrait.x).toBe(64);
  await expect(
    page.locator(".report-banner .report-stats dd").nth(1),
  ).toHaveText(heroes[0].name);
});
