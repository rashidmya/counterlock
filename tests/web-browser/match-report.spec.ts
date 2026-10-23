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

test("ids must be real: 0 is not a match, and ?player=0 is ignored", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/matches/0");
  await expect(page.locator("h1")).toHaveText("That isn't a valid match ID.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
  await page.goto("/matches/1001?player=0");
  await expect(page.locator(".report-result")).toHaveText("Amber won");
  await expect(page.getByRole("link", { name: "← Home" })).toBeVisible();
});

test("no sideways page scroll at tablet widths", async ({ page }) => {
  await mockApi(page);
  for (const width of [700, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/matches/1001?player=${FARGO}`);
    await expect(page.locator(".report-table tbody tr").first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("View as brings the bar into sight below the sticky header", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/matches/1001?player=${FARGO}`);
  await page.locator(".graph-ranking li").first().getByRole("button").click();
  const header = (await page.locator(".app.web > header").boundingBox())!;
  await expect
    .poll(async () => (await page.locator(".report-bar").boundingBox())!.y)
    .toBeGreaterThanOrEqual(header.y + header.height);
  await expect(viewingAs(page)).toBeFocused();
});

test("profile match rows link to the report and Back returns", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  const row = page.locator("a.match-open").first();
  await expect(row).toHaveAttribute("href", `/matches/1001?player=${FARGO}`);
  await row.click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await expect(page.locator(".report-table tbody tr")).toHaveCount(12);
  await expect(
    page.locator(".report-table").first().getByRole("link", {
      name: "A Rather Long Persona Name Fixture",
    }),
  ).toHaveAttribute("href", `/players/${FARGO}`);
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
});

test("browser Back finds the profile as it was; opened afresh, it starts at Overview", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Matches" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // A link to the same profile from the report's scoreboard is a fresh
  // visit.
  await page.goForward();
  await page
    .locator(".report-table")
    .first()
    .getByRole("link", { name: "A Rather Long Persona Name Fixture" })
    .click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("coming back from a report finds the profile scrolled as it was", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1260, height: 600 });
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Performance" }).click();
  const share = page.getByRole("region", {
    name: "Healing share",
    exact: true,
  });
  await expect(share.locator("circle")).toHaveCount(8);
  await share.scrollIntoViewIfNeeded();
  const scrolled = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrolled();
  expect(before).toBeGreaterThan(200);
  const open = async () => {
    const chart = (await share.getByRole("slider").boundingBox())!;
    await page.mouse.click(chart.x + chart.width - 2, chart.y + 40);
    await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  };
  // Browser Back: the profile loads again, then scrolls back.
  await open();
  await page.goBack();
  await expect.poll(scrolled).toBe(before);
  // So does the report's "Back to profile".
  await open();
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page).toHaveURL(`/players/${FARGO}`);
  await expect.poll(scrolled).toBe(before);
});

test("the profile keeps its tab, range and hero after a match report", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Performance" }).click();
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  const hero = page.getByRole("combobox", { name: "Hero" });
  await hero.selectOption({ index: 1 });
  const picked = await hero.inputValue();
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(page.getByRole("tab", { name: "Matches" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    page.getByRole("button", { name: "Last 50", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveValue(picked);
});
