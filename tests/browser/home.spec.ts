import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

const ACCOUNT = 100000000;
const STORAGE_KEY = "counterlock.profile.account";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const heroes = catalog.heroes.slice(0, 4).map((hero) => hero.id);
const items = catalog.items.slice(0, 4).map((item) => item.id);
const names: Record<number, string> = {
  [ACCOUNT]: "Fixture Persona",
  200: "Teammate Tess",
  201: "Teammate Tom",
};

const historyRow = (
  matchId: number,
  heroId: number,
  gameMode: number,
  matchMode: number,
  won: boolean,
  startTime: number,
) => ({
  account_id: ACCOUNT,
  match_id: matchId,
  hero_id: heroId,
  hero_level: 20,
  start_time: startTime,
  game_mode: gameMode,
  match_mode: matchMode,
  player_team: 0,
  player_kills: 10,
  player_deaths: 5,
  player_assists: 7,
  denies: 3,
  last_hits: 120,
  net_worth: 30000,
  match_duration_s: 1800,
  match_result: won ? 0 : 1,
});

const now = Math.floor(Date.now() / 1000);
const history = [
  historyRow(1001, heroes[0], 1, 4, true, now - 3600),
  historyRow(1002, heroes[1], 1, 1, false, now - 7200),
  historyRow(1003, heroes[2], 4, 1, true, now - 10800),
  historyRow(1004, heroes[3], 2, 3, false, now - 14400),
];

const scoreboard = {
  match_info: {
    match_id: 1001,
    duration_s: 1800,
    winning_team: 0,
    players: Array.from({ length: 12 }, (_, index) => ({
      account_id: index === 0 ? ACCOUNT : 5000 + index,
      team: index < 6 ? 0 : 1,
      hero_id: heroes[index % heroes.length],
      kills: index,
      deaths: 2,
      assists: 3,
      net_worth: 20000 + index * 1000,
      last_hits: 100,
      denies: 4,
      level: 20,
      items: items.map((item_id, slot) => ({
        item_id,
        game_time_s: 100 * slot,
        sold_time_s: 0,
      })),
    })),
  },
};

const heroSummaryRows = catalog.heroes.map((hero, index) => {
  const matches = 20000;
  const wins = matches * (0.4 + index * 0.005);
  return {
    hero_id: hero.id,
    wins,
    losses: matches - wins,
    matches,
    total_kills: 8 * matches,
    total_deaths: 5 * matches,
    total_assists: 10 * matches,
  };
});

interface Fixtures {
  history?: number | unknown[];
  failFirstHistory?: boolean;
  rank?: unknown;
  heroStats?: unknown[];
}

async function routeApi(page: Page, fixtures: Fixtures = {}) {
  let historyRequests = 0;
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        json: body,
        headers: { "access-control-allow-origin": "*" },
      });
    if (url.pathname.startsWith("/v1/assets/"))
      return route.fulfill({
        body: PNG,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
      });
    if (url.pathname === "/v1/players/steam") {
      const ids = (url.searchParams.get("account_ids") ?? "")
        .split(",")
        .map(Number);
      return json(
        ids
          .filter((id) => names[id])
          .map((id) => ({
            account_id: id,
            personaname: names[id],
            avatarmedium: "https://api.deadlock-api.com/v1/assets/avatar.png",
          })),
      );
    }
    if (url.pathname === "/v1/players/rank")
      return json(
        fixtures.rank ?? [
          { account_id: ACCOUNT, badge: 53, rank: 5, subrank: 3 },
        ],
      );
    if (url.pathname.endsWith("/match-history")) {
      if (fixtures.failFirstHistory && historyRequests++ === 0)
        return json({}, 500);
      const value = fixtures.history ?? history;
      return typeof value === "number" ? json({}, value) : json(value);
    }
    if (url.pathname === "/v1/players/hero-stats")
      return json(fixtures.heroStats ?? []);
    if (url.pathname === "/v1/analytics/hero-stats")
      return json(heroSummaryRows);
    if (url.pathname.endsWith("/mate-stats"))
      return json([
        { mate_id: 200, matches_played: 12, wins: 9 },
        { mate_id: 201, matches_played: 5, wins: 2 },
      ]);
    if (url.pathname.endsWith("/metadata")) return json(scoreboard);
    return json([]);
  });
}

async function storeAccount(page: Page) {
  await page.addInitScript(
    ({ key, accountId }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          accountId,
          seenAt: Date.now() - 2 * 3600_000,
          source: "detected",
        }),
      ),
    { key: STORAGE_KEY, accountId: ACCOUNT },
  );
}

// Pages stay mounted (hidden) once visited, so scope locators to the visible one.
const view = (page: Page) => page.locator(".page:not([hidden])");
const myProfile = (page: Page) =>
  page.getByRole("button", { name: "My profile", exact: true });
const prompt =
  "Search for your Steam account above, open it and press This is me.";

async function openMyProfile(page: Page) {
  await page.goto("/");
  await myProfile(page).click();
}

const openMatches = (page: Page) =>
  page.getByRole("tab", { name: "Matches" }).click();

test("search opens a profile and This is me remembers it", async ({ page }) => {
  await routeApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Know the match." }),
  ).toBeVisible();
  await expect(view(page).getByText(prompt)).toBeVisible();
  await expect(myProfile(page)).toHaveText("Find your account");
  await page.getByLabel("Find a player").fill("76561198060265728");
  await page.getByRole("button", { name: /Use this ID/ }).click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Fixture Persona",
  );
  await expect(myProfile(page)).toHaveText("Find your account");
  await page.getByRole("button", { name: "This is me" }).click();
  await expect(myProfile(page)).toContainText("Fixture Persona");
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    STORAGE_KEY,
  );
  expect(stored).toMatchObject({ accountId: ACCOUNT, source: "manual" });
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(view(page).locator(".you-card")).toContainText(
    "Fixture Persona",
  );
  await expect(view(page).getByText(prompt)).toHaveCount(0);
  await expect(view(page).locator(".profile-header")).toHaveCount(0);
});

test("Home shows the You card and latest match for a stored account", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await page.goto("/");
  const you = view(page).locator(".you-card");
  await expect(you.locator(".you-name")).toHaveText("Fixture Persona");
  await expect(you).toContainText("Mystic 3");
  // Only the normal and ranked games (1001 won, 1002 lost) count toward the strip.
  await expect(you.locator(".wl-strip span")).toHaveCount(2);
  await expect(you.locator(".wl-strip span.w")).toHaveCount(1);
  await expect(you.locator(".wl-strip span.l")).toHaveCount(1);
  await expect(you).toContainText("1W 1L · last 2 games");
  const latest = view(page).locator(".latest-match");
  await expect(latest.locator(".latest-result")).toHaveText(
    `Victory · ${heroName(heroes[0])}`,
  );
  await expect(latest.locator(".latest-result")).toHaveClass(/good/);
  await expect(latest).toContainText("10 / 5 / 7");
  await expect(latest).toContainText("1,000");
  await expect(latest).toContainText("30:00");
  await expect(view(page).locator(".you-derived")).toHaveText(
    "Recent form counts normal & ranked games only. Souls / min is the match's net worth divided by its minutes.",
  );
  await expect(view(page).getByText(prompt)).toHaveCount(0);
  await expect(view(page).locator(".profile-header")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "← Back" })).toHaveCount(0);
  await latest.getByRole("button", { name: "View profile →" }).click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Fixture Persona",
  );
});

test("the latest match can be any mode while the strip counts normal and ranked only", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, {
    history: [
      // Newest: a Street Brawl win that the strip must ignore.
      historyRow(1, heroes[2], 4, 1, true, now - 600),
      historyRow(2, heroes[0], 1, 4, false, now - 3600),
      historyRow(3, heroes[1], 1, 1, false, now - 7200),
    ],
  });
  await page.goto("/");
  const latest = view(page).locator(".latest-match .latest-result");
  await expect(latest).toHaveText(`Victory · ${heroName(heroes[2])}`);
  const you = view(page).locator(".you-card");
  await expect(you.locator(".wl-strip span")).toHaveCount(2);
  await expect(you.locator(".wl-strip span.w")).toHaveCount(0);
  await expect(you).toContainText("0W 2L · last 2 games");
});

test("a lost latest match reads Defeat", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
    history: [historyRow(1, heroes[1], 1, 1, false, now - 600)],
  });
  await page.goto("/");
  const latest = view(page).locator(".latest-match .latest-result");
  await expect(latest).toHaveText(`Defeat · ${heroName(heroes[1])}`);
  await expect(latest).toHaveClass(/bad/);
  await expect(view(page).locator(".you-card")).toContainText(
    "0W 1L · last game",
  );
});

test("Home offers My profile and Not you? Switch account for a stored account", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await page.goto("/");
  await expect(view(page).locator(".you-card")).toBeVisible();
  await page.getByRole("button", { name: "Not you? Switch account" }).click();
  await expect(view(page).getByText(prompt)).toBeVisible();
  await expect(myProfile(page)).toHaveText("Find your account");
  await expect(page.getByRole("button", { name: "Home" })).toHaveClass(
    /active/,
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();
  await expect(page.getByRole("button", { name: "My profile →" })).toHaveCount(
    0,
  );
});

test("top of the city lists six heroes linking to the Heroes tab", async ({
  page,
}) => {
  await routeApi(page);
  await page.goto("/");
  const top = view(page).locator("section.home-top");
  await expect(
    top.getByRole("heading", { name: "Top of the city" }),
  ).toBeVisible();
  await expect(top.locator(".hero-card")).toHaveCount(6);
  await expect(top.locator(".hero-card .tier-letter").first()).toBeVisible();
  await expect(top.locator(".data-note")).toHaveText(
    "Tiers by win rate over the last 30 days, all ranks.",
  );
  await top.locator(".hero-card").first().click();
  await expect(
    page.getByRole("button", { name: "Heroes", exact: true }),
  ).toHaveClass(/active/);
  await expect(view(page).locator(".hero-header h1")).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Tier list →" }).click();
  await expect(
    page.getByRole("button", { name: "Tier list", exact: true }),
  ).toHaveClass(/active/);
});

test("overview shows rank, summary, top heroes, teammates and filtered history", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  await expect(view(page).locator(".profile-header")).toContainText(
    "Seen on this PC · 2h ago",
  );
  const rank = view(page).locator(".rank-card");
  await expect(rank).toContainText("Mystic 3");
  await expect(rank.locator("img")).toHaveAttribute(
    "src",
    /\/ranks\/5\/3\/image/,
  );
  await expect(
    view(page).locator(".stat-card:not(.rank-card)", { hasText: "Ranked" }),
  ).toHaveText(/RANKED1100\.0% WR/);
  await expect(view(page).getByText("Normal & ranked games")).toBeVisible();
  // Street Brawl and bot matches stay out of the Normal & ranked summary.
  await expect(view(page).locator(".top-hero")).toHaveCount(2);
  await expect(view(page).getByText("Teammate Tess")).toBeVisible();

  await openMatches(page);
  await expect(view(page).locator(".match-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Street Brawl", exact: true }).click();
  await expect(view(page).locator(".match-row")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(view(page).locator(".match-row")).toHaveCount(4);
});

test("overview shows the three newest matches and All matches opens the Matches tab", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  await expect(
    page.getByRole("heading", { name: "Recent matches" }),
  ).toBeVisible();
  await expect(view(page).locator(".match-row")).toHaveCount(3);
  await expect(page.getByRole("group", { name: "Game mode" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
  await page.getByRole("button", { name: "All matches →" }).click();
  await expect(page.getByRole("tab", { name: "Matches" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(view(page).locator(".match-row")).toHaveCount(4);
});

test("My profile opens the stored account with its actions", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await page.goto("/");
  await expect(myProfile(page)).toContainText("Fixture Persona");
  await myProfile(page).click();
  const header = view(page).locator(".profile-header");
  await expect(header.locator("h1")).toHaveText("Fixture Persona");
  await expect(header).toContainText("Player profile");
  await expect(header).toContainText("Seen on this PC · 2h ago");
  await expect(page.getByRole("button", { name: "← Back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "This is me" })).toHaveCount(0);
  await page.getByRole("button", { name: "Not you? Switch account" }).click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();
  await expect(view(page).getByText(prompt)).toBeVisible();
  await expect(myProfile(page)).toHaveText("Find your account");
});

test("protected history degrades", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403, rank: [] });
  await openMyProfile(page);
  await expect(view(page).locator(".profile-header")).toContainText(
    "Fixture Persona",
  );
  await expect(view(page).getByText("Match history unavailable")).toBeVisible();
  await expect(view(page).locator(".rank-card")).toContainText("Unavailable");
});

test("unranked players show Unranked without a badge", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
    rank: [{ account_id: ACCOUNT, badge: 0, rank: 0, subrank: 0 }],
  });
  await openMyProfile(page);
  const rank = view(page).locator(".rank-card");
  await expect(rank).toContainText("Unranked");
  await expect(rank).not.toContainText("Obscurus");
  await expect(rank.locator("img")).toHaveCount(0);
});

test("retry reloads a failed match history", async ({ page }) => {
  await routeApi(page, { failFirstHistory: true });
  await page.goto("/");
  await page.getByLabel("Find a player").fill("76561198060265728");
  await page.getByRole("button", { name: /Use this ID/ }).click();
  await expect(view(page).getByText("Match history unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(view(page).getByText("Match history unavailable")).toHaveCount(
    0,
  );
  await openMatches(page);
  await expect(view(page).locator(".match-row")).toHaveCount(4);
  await expect(view(page).getByText("Match history unavailable")).toHaveCount(
    0,
  );
});

test("empty history says no recorded matches", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: [] });
  await openMyProfile(page);
  await expect(view(page).getByText("No recorded matches")).toBeVisible();
});

test("match detail shows both teams with items", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  await view(page).locator(".match-row").first().click();
  await expect(view(page).locator(".scoreboard .score-row")).toHaveCount(12);
  await expect(
    view(page).locator(".scoreboard .score-row.local"),
  ).toContainText("YOU");
  await expect(
    view(page).locator(".scoreboard img.item-icon").first(),
  ).toBeVisible();
  await view(page).locator(".match-row").first().click();
  await expect(view(page).locator(".scoreboard")).toHaveCount(0);
});

test("hero cross-link opens the Heroes tab", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  await view(page).locator(".top-hero").first().click();
  await expect(
    page.getByRole("button", { name: "Heroes", exact: true }),
  ).toHaveClass(/active/);
});

const heroName = (id: number) =>
  catalog.heroes.find((hero) => hero.id === id)!.name;

// A: 3 ranked games (2W 1L), B: 2 unranked wins, C: 1 ranked loss.
// C has the highest KDA (47/5) and B the lowest (9/5); A is 17/5.
const heroesHistory = [
  historyRow(2001, heroes[0], 1, 4, true, now - 3600),
  historyRow(2002, heroes[0], 1, 4, true, now - 7200),
  historyRow(2003, heroes[0], 1, 4, false, now - 10800),
  { ...historyRow(2004, heroes[1], 1, 1, true, now - 14400), player_kills: 2 },
  { ...historyRow(2005, heroes[1], 1, 1, true, now - 18000), player_kills: 2 },
  {
    ...historyRow(2006, heroes[2], 1, 4, false, now - 21600),
    player_kills: 40,
  },
];

async function openHeroes(page: Page, fixtures: Fixtures = {}) {
  await storeAccount(page);
  await routeApi(page, { history: heroesHistory, ...fixtures });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Heroes" }).click();
}

const heroRowNames = async (page: Page) =>
  (await view(page).locator(".hero-row .hero-link").allTextContents()).map(
    (text) => text.trim(),
  );

test("heroes tab lists played heroes sorted by games with real stats", async ({
  page,
}) => {
  await openHeroes(page, {
    heroStats: [
      {
        account_id: ACCOUNT,
        hero_id: heroes[0],
        matches_played: 3,
        accuracy: 0.425,
        damage_per_min: 1480.4,
      },
    ],
  });
  await expect(view(page).locator(".hero-row")).toHaveCount(3);
  expect(await heroRowNames(page)).toEqual([
    heroName(heroes[0]),
    heroName(heroes[1]),
    heroName(heroes[2]),
  ]);
  await expect(
    page.getByRole("columnheader", { name: /Games/ }),
  ).toHaveAttribute("aria-sort", "descending");
  const first = view(page).locator(".hero-row").first();
  await expect(first).toContainText("2–1");
  await expect(first).toContainText("66.7%");
  await expect(first).toContainText("10.0/5.0/7.0");
  await expect(first).toContainText("1,000");
  await expect(first).toContainText("1,480");
  await expect(first).toContainText("42.5%");
  await expect(first).toContainText("120.0");
  await expect(first).toContainText("3.0");
  await expect(first).toContainText("1h ago");
  await expect(first.locator("img.hero-portrait")).toHaveAttribute(
    "src",
    /^https?:/,
  );
});

test("heroes tab shows dashes where hero stats have no row", async ({
  page,
}) => {
  await openHeroes(page);
  const rows = view(page).locator(".hero-row");
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    const cells = row.locator("td");
    await expect(cells.nth(7)).toHaveText("—");
    await expect(cells.nth(8)).toHaveText("—");
  }
});

test("heroes tab sorts by header and filters by mode", async ({ page }) => {
  await openHeroes(page);
  const [a, b, c] = heroes.map(heroName);
  const wr = page.getByRole("button", { name: "WR", exact: true });
  await wr.click();
  expect(await heroRowNames(page)).toEqual([b, a, c]);
  await expect(page.getByRole("columnheader", { name: /WR/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await wr.click();
  expect(await heroRowNames(page)).toEqual([c, a, b]);
  await expect(page.getByRole("columnheader", { name: /WR/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );

  const hero = page.getByRole("button", { name: "Hero", exact: true });
  await hero.click();
  const alphabetical = [a, b, c].sort((x, y) => x.localeCompare(y));
  expect(await heroRowNames(page)).toEqual(alphabetical);
  await hero.click();
  expect(await heroRowNames(page)).toEqual([...alphabetical].reverse());

  const kda = page.getByRole("button", { name: "K/D/A", exact: true });
  await kda.click();
  expect(await heroRowNames(page)).toEqual([c, a, b]);
  await expect(
    page.getByRole("columnheader", { name: /K\/D\/A/ }),
  ).toHaveAttribute("aria-sort", "descending");
  await expect(
    page.getByRole("columnheader", { name: /^KDA/ }),
  ).not.toHaveAttribute("aria-sort");
  await kda.click();
  expect(await heroRowNames(page)).toEqual([b, a, c]);
  await expect(
    page.getByRole("columnheader", { name: /K\/D\/A/ }),
  ).toHaveAttribute("aria-sort", "ascending");

  await page.getByRole("button", { name: "Ranked", exact: true }).click();
  await expect(view(page).locator(".hero-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Street Brawl", exact: true }).click();
  await expect(view(page).getByText("No recorded matches")).toBeVisible();
});

test("heroes tab hero cell navigates to the Heroes page", async ({ page }) => {
  await openHeroes(page);
  await view(page).locator(".hero-row .hero-link").first().click();
  await expect(
    page.getByRole("button", { name: "Heroes", exact: true }),
  ).toHaveClass(/active/);
  await expect(view(page).locator(".hero-header h1")).toHaveText(
    heroName(heroes[0]),
  );
});

// 60 summary games, newest first; every third one is lost. Street Brawl,
// bot and private-lobby games sit between them and must stay out of the charts.
const performanceHistory = [
  ...Array.from({ length: 60 }, (_, index) =>
    historyRow(
      3000 + index,
      heroes[index % 2],
      1,
      index % 2 ? 4 : 1,
      index % 3 !== 0,
      now - 3600 * (index + 1),
    ),
  ),
  historyRow(3100, heroes[2], 4, 1, true, now - 60),
  historyRow(3101, heroes[3], 2, 3, true, now - 120),
];

const pointCount = async (page: Page, label: string) =>
  (
    (await page
      .locator(`svg[aria-label="${label}"] polyline`)
      .getAttribute("points")) ?? ""
  )
    .trim()
    .split(/\s+/).length;

test("performance tab charts, form and range switch", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    heroStats: [
      {
        account_id: ACCOUNT,
        hero_id: heroes[0],
        matches_played: 3,
        accuracy: 0.4,
        damage_per_min: 1000,
      },
      {
        account_id: ACCOUNT,
        hero_id: heroes[1],
        matches_played: 1,
        accuracy: 0.8,
        damage_per_min: 2000,
      },
    ],
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();

  await expect(
    view(page).locator('svg[aria-label="KDA per match"]'),
  ).toBeVisible();
  await expect(
    view(page).locator('svg[aria-label="Souls per minute"]'),
  ).toBeVisible();
  expect(await pointCount(page, "KDA per match")).toBe(20);
  expect(await pointCount(page, "Souls per minute")).toBe(20);

  const squares = view(page).locator(".form i");
  await expect(squares).toHaveCount(20);
  // Newest game (index 0) was lost; the next ones were won.
  await expect(squares.nth(0)).toHaveCSS(
    "background-color",
    "rgb(224, 122, 95)",
  );
  await expect(squares.nth(1)).toHaveCSS(
    "background-color",
    "rgb(127, 211, 154)",
  );

  await expect(
    view(page).locator(".stat-card", { hasText: "ACCURACY" }),
  ).toContainText("50.0%");
  await expect(
    view(page).locator(".stat-card", { hasText: "DMG/MIN" }),
  ).toContainText("1,250");
  await expect(
    view(page).locator(".stat-card", { hasText: "LAST HITS" }),
  ).toContainText("120.0");
  await expect(
    view(page).locator(".stat-card", { hasText: "DEATHS" }),
  ).toContainText("5.0");
  await expect(
    view(page).getByText(
      "Accuracy and damage cover all normal & ranked games in the period.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect.poll(() => pointCount(page, "KDA per match")).toBe(50);
  expect(await pointCount(page, "Souls per minute")).toBe(50);
  await expect(squares).toHaveCount(20);

  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect.poll(() => pointCount(page, "KDA per match")).toBe(60);
  await expect(
    view(page).getByText("Accuracy and damage cover all normal & ranked games"),
  ).toHaveCount(0);
});

test("performance tab says so with too few matches", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
    history: [historyRow(1, heroes[0], 1, 4, true, now)],
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(view(page).getByText("Not enough matches")).toHaveCount(2);
  await expect(view(page).locator(".form i")).toHaveCount(1);
});

test("performance tab degrades without match history", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403 });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(view(page).getByText("Match history unavailable")).toBeVisible();
  await expect(view(page).locator("svg[aria-label]")).toHaveCount(0);
});
