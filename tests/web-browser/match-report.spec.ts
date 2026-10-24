import { expect, test, type Page } from "@playwright/test";
import { heroes, matchMetadata } from "../fixtures/match-report";
import { FARGO, cors, historyRow, mockApi } from "./fixtures";

const viewingAs = (page: Page) =>
  page.getByRole("combobox", { name: "Viewing as" });

// Thirty matches, a page and a half of the Matches tab, each with its
// report. The history is awaited on `held` first, so a test can hold it
// back.
async function mockLongHistory(
  page: Page,
  held: () => Promise<void> = () => Promise.resolve(),
) {
  const now = Math.floor(Date.now() / 1000);
  await page.route(
    `https://api.deadlock-api.com/v1/players/${FARGO}/match-history`,
    async (route) => {
      await held();
      return route.fulfill({
        json: Array.from({ length: 30 }, (_, index) => ({
          ...historyRow(2001 + index, index % 2 === 0),
          start_time: now - 3600 * (index + 1),
        })),
        headers: cors,
      });
    },
  );
  await page.route(/\/v1\/matches\/\d+\/metadata$/, (route) => {
    const matchId = Number(/matches\/(\d+)/.exec(route.request().url())![1]);
    return route.fulfill({
      json: matchMetadata(FARGO, matchId),
      headers: cors,
    });
  });
}

// From a report, the scoreboard's link to its player: a fresh visit.
const openProfileAfresh = async (page: Page) => {
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
};

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

test("a scroll position still waiting to come back is kept", async ({
  page,
}) => {
  let hold: Promise<void> | null = null;
  let release = () => {};
  // Time is the test's to move on: the history, cached for two minutes,
  // then loads again.
  await page.clock.install();
  await page.setViewportSize({ width: 1260, height: 600 });
  await mockApi(page);
  await mockLongHistory(page, () => hold ?? Promise.resolve());
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Matches" }).click();
  const rows = page.locator(".match-row");
  await rows.nth(15).scrollIntoViewIfNeeded();
  const scrolled = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrolled();
  expect(before).toBeGreaterThan(200);
  await rows.nth(15).locator("a.match-open").click();
  await expect(page).toHaveURL(`/matches/2016?player=${FARGO}`);
  // Back while the history loads again, and Forward before it has: the
  // browser's buttons give the page no sign of the viewer scrolling.
  hold = new Promise((resolve) => (release = resolve));
  await page.clock.fastForward("03:00");
  await page.goBack();
  await expect(page.getByText("Loading match history…")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(`/matches/2016?player=${FARGO}`);
  release();
  hold = null;
  // Back again, the history loads and the position comes back.
  await page.goBack();
  await expect(rows).toHaveCount(20);
  await expect.poll(scrolled).toBe(before);
});

for (const takeover of [
  "wheel",
  "horizontal wheel",
  "history button",
  "Alt+Left",
  "Cmd+Left",
] as const) {
  test(`pending profile scroll ${takeover === "wheel" ? "yields to" : "survives"} ${takeover}`, async ({
    page,
  }) => {
    let hold: Promise<void> | null = null;
    let release = () => {};
    await page.clock.install();
    await page.setViewportSize({ width: 1260, height: 600 });
    await mockApi(page);
    await mockLongHistory(page, () => hold ?? Promise.resolve());
    await page.goto(`/players/${FARGO}`);
    await page.getByRole("tab", { name: "Matches" }).click();
    const rows = page.locator(".match-row");
    await rows.nth(15).scrollIntoViewIfNeeded();
    const scrolled = () => page.evaluate(() => Math.round(window.scrollY));
    const before = await scrolled();
    expect(before).toBeGreaterThan(200);
    await rows.nth(15).locator("a.match-open").click();
    await expect(page).toHaveURL(`/matches/2016?player=${FARGO}`);
    hold = new Promise((resolve) => (release = resolve));
    await page.clock.fastForward("03:00");
    await page.goBack();
    await expect(page.getByText("Loading match history…")).toBeVisible();
    await page.evaluate((kind) => {
      if (kind === "wheel") {
        window.scrollTo(0, 0);
        window.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
      } else if (kind === "horizontal wheel") {
        window.dispatchEvent(
          new WheelEvent("wheel", { deltaX: -100, deltaY: 5 }),
        );
      } else if (kind === "history button") {
        window.dispatchEvent(new PointerEvent("pointerdown", { button: 3 }));
      } else {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowLeft",
            altKey: kind === "Alt+Left",
            metaKey: kind === "Cmd+Left",
          }),
        );
      }
    }, takeover);
    release();
    hold = null;
    await expect(rows).toHaveCount(20);
    if (takeover === "wheel") {
      await page.clock.runFor(50);
      expect(await scrolled()).toBe(0);
    } else {
      await expect.poll(scrolled).toBe(before);
    }
  });
}

test("My profile reopens the current profile at Overview and remembers that unchanged fresh visit", async ({
  page,
}) => {
  await page.addInitScript((accountId) => {
    localStorage.setItem(
      "counterlock.web.account",
      JSON.stringify({ accountId }),
    );
  }, FARGO);
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  const overview = page.getByRole("tab", { name: "Overview" });
  await expect(overview).toHaveAttribute("aria-selected", "true");
  // No tab change on this fresh visit: its mount must record Overview.
  await page.locator("a.match-open").first().click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(overview).toHaveAttribute("aria-selected", "true");
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

test("coming back keeps the matches shown, and the scroll past the first page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1260, height: 600 });
  await mockApi(page);
  await mockLongHistory(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Matches" }).click();
  const rows = page.locator(".match-row");
  await expect(rows).toHaveCount(20);
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(rows).toHaveCount(30);
  // Past the first page: its rows alone leave the page too short for it.
  await rows.nth(27).scrollIntoViewIfNeeded();
  await expect(rows.nth(19)).not.toBeInViewport();
  const scrolled = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrolled();
  const open = async () => {
    await rows.nth(27).locator("a.match-open").click();
    await expect(page).toHaveURL(`/matches/2028?player=${FARGO}`);
  };
  // Browser Back.
  await open();
  await page.goBack();
  await expect(rows).toHaveCount(30);
  await expect.poll(scrolled).toBe(before);
  // The report's "Back to profile".
  await open();
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await expect(rows).toHaveCount(30);
  await expect.poll(scrolled).toBe(before);
  // Opened afresh, it shows the first page.
  await open();
  await openProfileAfresh(page);
  await page.getByRole("tab", { name: "Matches" }).click();
  await expect(rows).toHaveCount(20);
  // So does another filter.
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(rows).toHaveCount(30);
  await page.getByRole("button", { name: "Street Brawl", exact: true }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(rows).toHaveCount(20);
});

test("coming back keeps the Heroes tab's sort; opened afresh, it sorts by games", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Heroes" }).click();
  const wr = page.getByRole("button", { name: "WR", exact: true });
  await wr.click();
  await wr.click();
  const sorted = (name: RegExp, order: string) =>
    expect(page.getByRole("columnheader", { name })).toHaveAttribute(
      "aria-sort",
      order,
    );
  await sorted(/WR/, "ascending");
  // Browser Back from a hero's page.
  await page.locator(".hero-row .hero-link").first().click();
  await expect(page).toHaveURL(/\/heroes\/[a-z-]+$/);
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Heroes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await sorted(/WR/, "ascending");
  // The report's "Back to profile".
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await expect(page).toHaveURL(`/matches/1001?player=${FARGO}`);
  await page.getByRole("link", { name: "← Back to profile" }).click();
  await page.getByRole("tab", { name: "Heroes" }).click();
  await sorted(/WR/, "ascending");
  // Opened afresh, by games.
  await page.getByRole("tab", { name: "Matches" }).click();
  await page.locator("a.match-open").first().click();
  await openProfileAfresh(page);
  await page.getByRole("tab", { name: "Heroes" }).click();
  await sorted(/Games/, "descending");
});
