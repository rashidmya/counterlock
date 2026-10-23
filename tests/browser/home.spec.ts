import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { matchMetadata, rankCurveRows } from "../fixtures/match-report";
import { bulkMetadata } from "../fixtures/performance";

const ACCOUNT = 100000000;
const STORAGE_KEY = "counterlock.profile.account";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const heroes = catalog.heroes.slice(0, 4).map((hero) => hero.id);
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
  // Rank lookups fail while it's set.
  failRank?: boolean;
  heroStats?: unknown[];
  failTotals?: boolean;
  failCurve?: boolean;
  // Heroes whose curves fail while they're in the set.
  failCurveFor?: Set<number>;
  // One tier's curves come back thin (50 games), so they widen.
  thinTiers?: boolean;
  unstoredTotals?: number[];
  unlistedPlayer?: number[];
  // Awaited before each answer, so a test can hold requests back.
  gate?: (url: URL) => Promise<void>;
}

async function routeApi(page: Page, fixtures: Fixtures = {}) {
  let historyRequests = 0;
  await page.route("https://api.deadlock-api.com/**", async (route) => {
    const url = new URL(route.request().url());
    await fixtures.gate?.(url);
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
      return fixtures.failRank
        ? json({}, 500)
        : json(
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
    if (url.pathname === "/v1/matches/metadata")
      return fixtures.failTotals
        ? json({}, 500)
        : json(
            bulkMetadata(url, ACCOUNT)
              .filter(
                (match) => !fixtures.unstoredTotals?.includes(match.match_id),
              )
              .map((match) =>
                fixtures.unlistedPlayer?.includes(match.match_id)
                  ? {
                      ...match,
                      players: match.players.filter(
                        (p) => p.account_id !== ACCOUNT,
                      ),
                    }
                  : match,
              ),
          );
    if (url.pathname === "/v1/analytics/player-performance-curve")
      return fixtures.failCurve ||
        fixtures.failCurveFor?.has(Number(url.searchParams.get("hero_ids")))
        ? json({}, 500)
        : json(
            rankCurveRows(
              fixtures.thinTiers &&
                Number(url.searchParams.get("max_average_badge")) -
                  Number(url.searchParams.get("min_average_badge")) ===
                  5
                ? 50
                : 5000,
            ),
          );
    if (url.pathname.endsWith("/metadata")) return json(matchMetadata(ACCOUNT));
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
  await expect(
    latest.getByRole("button", { name: "Open match report →" }),
  ).toBeVisible();
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

test("a match row opens that match's report", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page);
  const metadataPaths: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/metadata")) metadataPaths.push(path);
  });
  await openMyProfile(page);
  const row = view(page).locator(".match-open").first();
  await expect(row).toContainText("Report →");
  await row.click();
  await expect(view(page).locator(".match-report .report-result")).toHaveText(
    "Victory",
  );
  await expect(view(page).locator(".report-table tbody tr")).toHaveCount(12);
  await view(page).getByRole("button", { name: "← Back to profile" }).click();
  await view(page).locator(".match-open").nth(1).click();
  await expect.poll(() => metadataPaths).toContain("/v1/matches/1002/metadata");
});

test("match rows stay on one line at the desktop minimum width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 850, height: 900 });
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  const box = await view(page)
    .locator(".match-open .match-report-link")
    .first()
    .boundingBox();
  expect(box!.height).toBeLessThan(24);
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

// 60 summary games, newest first; every third one is lost. The newest ten
// earn 1,200 souls a minute, the rest 1,000. Street Brawl, bot and
// private-lobby games sit between them and must stay out of the cards.
const performanceHistory = [
  ...Array.from({ length: 60 }, (_, index) => ({
    ...historyRow(
      3000 + index,
      heroes[index % 2],
      1,
      index % 2 ? 4 : 1,
      index % 3 !== 0,
      now - 3600 * (index + 1),
    ),
    net_worth: index < 10 ? 36000 : 30000,
  })),
  historyRow(3100, heroes[2], 4, 1, true, now - 60),
  historyRow(3101, heroes[3], 2, 3, true, now - 120),
];

const card = (page: Page, label: string) =>
  view(page).getByRole("region", { name: label, exact: true });
const dots = (page: Page, label: string) => card(page, label).locator("circle");

test("performance tab compares each metric with the rank average", async ({
  page,
}) => {
  const bulk: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/matches/metadata")
      bulk.push(url.searchParams.get("match_ids")!);
  });
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();

  await expect(view(page).locator(".perf-card h3")).toHaveText([
    "Souls / min",
    "K/D/A ratio",
    "Hero damage / min",
    "Objective damage / min",
    "Healing / min",
    "Creep kills / min",
    "Kill participation",
    "Hero damage share",
    "Objective damage share",
    "Healing share",
  ]);
  // Last 20: ten games at 1,000 souls a minute, then ten at 1,200.
  const souls = card(page, "Souls / min");
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "1,100 20 games · rank avg 1,000",
  );
  await expect(souls.locator(".perf-trend")).toHaveText("▲ Improving");
  await expect(
    card(page, "K/D/A ratio").locator(".perf-card-numbers"),
  ).toHaveText("3.4 20 games · rank avg 2.7");
  await expect(card(page, "K/D/A ratio").locator(".perf-trend")).toHaveText(
    "– Flat",
  );
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("1,000 20 games · rank avg 500");
  await expect(
    card(page, "Kill participation").locator(".perf-card-numbers"),
  ).toHaveText("57% 20 games · no rank average");
  await expect(
    card(page, "Hero damage share").locator(".perf-card-numbers"),
  ).toHaveText("29% 20 games · no rank average");
  await expect(
    card(page, "Objective damage share").locator(".perf-card-numbers"),
  ).toHaveText("44% 20 games · no rank average");
  await expect(
    card(page, "Healing share").locator(".perf-card-numbers"),
  ).toHaveText("21% 20 games · no rank average");
  // Two heroes' games: the shares claim no trend, and say why.
  const mix =
    "Kill participation and the shares show no trend over games on more than one hero: a change of hero moves them more than form does.";
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveCount(0);
  await expect(view(page).getByText(mix)).toBeVisible();

  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
    card(page, "Souls / min").locator(".spark-average"),
  ).toHaveAttribute("d", /^M[^M]+$/);
  // Oldest on the left: index 19 is a win (19 % 3 ≠ 0), the newest a loss.
  await expect(dots(page, "Souls / min").first()).toHaveCSS(
    "fill",
    "rgb(127, 211, 154)",
  );
  await expect(dots(page, "Souls / min").last()).toHaveCSS(
    "fill",
    "rgb(224, 122, 95)",
  );
  await expect(
    view(page).getByText(
      "Games without a recorded rank use the player's current rank.",
    ),
  ).toBeVisible();
  await expect(
    view(page).getByText(
      "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals.",
    ),
  ).toBeVisible();
  expect(bulk.map((ids) => ids.split(",").length)).toEqual([20]);

  // Last 50 asks only for the 30 games it adds.
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect(dots(page, "Hero damage / min")).toHaveCount(50);
  expect(bulk.map((ids) => ids.split(",").length)).toEqual([20, 30]);
  await page.getByRole("button", { name: "Last 100", exact: true }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(60);

  // One hero: its 30 games, then the newest 20 of them (odd indices 1–39,
  // five of them at 1,200 souls a minute).
  await page
    .getByRole("combobox", { name: "Hero" })
    .selectOption({ label: `${heroName(heroes[1])} · 30 games` });
  await expect(dots(page, "Souls / min")).toHaveCount(30);
  await page.getByRole("button", { name: "Last 20", exact: true }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "1,050 20 games · rank avg 1,000",
  );
  // One hero's games: the shares have their trend.
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveText("– Flat");
  await expect(view(page).getByText(mix)).toHaveCount(0);
});

/** Match ids whose report metadata the page asks for. */
function reportRequests(page: Page) {
  const ids: number[] = [];
  page.on("request", (request) => {
    const id = new URL(request.url()).pathname.match(
      /^\/v1\/matches\/(\d+)\/metadata$/,
    )?.[1];
    if (id) ids.push(Number(id));
  });
  return ids;
}

test("performance tab describes the game under the pointer and a click opens its report", async ({
  page,
}) => {
  const reports = reportRequests(page);
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const souls = card(page, "Souls / min");
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  const chart = (await souls.getByRole("slider").boundingBox())!;
  const tip = souls.locator(".spark-tip");
  // The sixth game from the left (oldest first): 15h ago, a win on
  // heroes[0], 1,000 souls a minute.
  const step = (chart.width - 12) / 19;
  await page.mouse.move(chart.x + 6 + 5 * step, chart.y + 40);
  await expect(tip.locator("span")).toHaveText([
    `${heroName(heroes[0])} · Win · 15h ago`,
    "1,000 rank avg 1,000 · Report →",
  ]);
  await expect(tip).not.toHaveClass(/right/);
  // The tip touches the chart, so a pointer moving up into it stays in.
  const above = (await tip.boundingBox())!;
  expect(above.y + above.height).toBeGreaterThanOrEqual(chart.y - 0.5);
  // Leaving the chart clears it.
  await page.mouse.move(chart.x - 40, chart.y - 150);
  await expect(tip).toHaveCount(0);
  // The newest game is on the right: 1h ago, lost, 1,200 souls a minute.
  await page.mouse.move(chart.x + chart.width - 2, chart.y + 40);
  await expect(tip.locator("span")).toHaveText([
    `${heroName(heroes[0])} · Loss · 1h ago`,
    "1,200 rank avg 1,000 · Report →",
  ]);
  await expect(tip).toHaveClass(/right/);
  await expect(souls.locator("circle.picked")).toHaveCount(1);
  // The link in the tip is a 24 px target.
  const link = (await tip
    .getByRole("button", { name: "Match report" })
    .boundingBox())!;
  expect(link.height).toBeGreaterThanOrEqual(24);
  // A click with Ctrl held doesn't open the report; a plain one does.
  await page.keyboard.down("Control");
  await page.mouse.click(chart.x + chart.width - 2, chart.y + 40);
  await page.keyboard.up("Control");
  await expect(tip).toBeVisible();
  expect(reports).toEqual([]);
  await page.mouse.click(chart.x + chart.width - 2, chart.y + 40);
  await expect(view(page).locator(".match-report")).toBeVisible();
  expect(reports).toEqual([3000]);
});

test("performance tab points can be picked and opened from the keyboard", async ({
  page,
}) => {
  const reports = reportRequests(page);
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  const chart = card(page, "Souls / min").getByRole("slider");
  const tip = card(page, "Souls / min").locator(".spark-tip");
  // Focus starts on the newest game.
  await chart.focus();
  await expect(chart).toHaveAttribute("aria-valuenow", "20");
  await expect(chart).toHaveAttribute(
    "aria-valuetext",
    `${heroName(heroes[0])} · Loss · 1h ago: 1,200, rank avg 1,000`,
  );
  // Focus leaving the chart clears the pick.
  await expect(tip).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(tip).toHaveCount(0);
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(chart).toHaveAttribute("aria-valuenow", "1");
  await page.keyboard.press("ArrowUp");
  await expect(chart).toHaveAttribute("aria-valuenow", "2");
  await page.keyboard.press("ArrowDown");
  await expect(chart).toHaveAttribute("aria-valuenow", "1");
  // Keys with Ctrl held are the browser's.
  await page.keyboard.press("Control+ArrowRight");
  await expect(chart).toHaveAttribute("aria-valuenow", "1");
  await page.keyboard.press("End");
  await expect(chart).toHaveAttribute("aria-valuenow", "20");
  await page.keyboard.press("ArrowLeft");
  await expect(chart).toHaveAttribute("aria-valuenow", "19");
  await expect(chart).toHaveAttribute(
    "aria-valuetext",
    `${heroName(heroes[1])} · Win · 2h ago: 1,200, rank avg 1,000`,
  );
  // A press on the tip leaves the focus, and the tip, where they are.
  await tip.locator("span").first().click();
  await expect(chart).toBeFocused();
  await expect(chart).toHaveAttribute("aria-valuenow", "19");
  // Tab reaches the tip's link; Escape there clears the tip.
  await page.keyboard.press("Tab");
  await expect(tip.getByRole("button", { name: "Match report" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
  // Focus is back on the chart, where the arrows start again from the
  // newest game; Enter opens the picked one.
  await expect(chart).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(chart).toHaveAttribute("aria-valuenow", "20");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(view(page).locator(".match-report")).toBeVisible();
  expect(reports).toEqual([3001]);
});

test("performance tab says so with too few games", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, {
    history: [historyRow(1, heroes[0], 1, 4, true, now)],
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toContainText("1 game · rank avg 1,000");
  await expect(view(page).locator(".perf-trend")).toHaveText(
    Array(10).fill("Too few games"),
  );
  await expect(dots(page, "Souls / min")).toHaveCount(1);
  await expect(view(page).getByRole("combobox", { name: "Hero" })).toHaveCount(
    0,
  );
});

test("performance tab compares like with like when a game outlasts the rank average", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, {
    history: [
      historyRow(1, heroes[0], 1, 4, true, now - 7200),
      {
        ...historyRow(2, heroes[0], 1, 4, false, now - 3600),
        match_duration_s: 3000,
      },
    ],
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  // The fixture's average stops at 40:00, so only the 30-minute game has
  // one: 60,000 souls over 80 minutes overall, 1,000 a minute in that game.
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("750 2 games · 1 with a rank average: 1,000 vs 1,000");
});

test("performance tab shows no trend when no game has a rank average", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, {
    history: Array.from({ length: 6 }, (_, index) => ({
      ...historyRow(index + 1, heroes[0], 1, 4, true, now - index * 3600),
      match_duration_s: 3000,
    })),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  // Every game outlasts the fixture's average, which stops at 40:00.
  const souls = card(page, "Souls / min");
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "600 6 games · no rank average for these games",
  );
  await expect(souls.locator(".perf-trend")).toHaveCount(0);
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveText("– Flat");
});

test("performance tab counts games without match details yet", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    // One game not stored yet, one stored without the player.
    unstoredTotals: [3005],
    unlistedPlayer: [3006],
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByText(
      "2 of 20 games have no match details yet, so they're missing from damage, healing, creep kills and shares.",
    ),
  ).toBeVisible();
  const damage = card(page, "Hero damage / min");
  await expect(damage.locator(".perf-card-numbers")).toContainText("18 games");
  // The line breaks where the two games are missing.
  await expect(damage.locator(".spark-value")).toHaveAttribute(
    "d",
    /^M[^M]+M[^M]+$/,
  );
});

test("performance tab keeps history values when details and averages fail", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    failTotals: true,
    failCurve: true,
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByText(
      /^Match details unavailable: Deadlock API unavailable \(500\)\./,
    ),
  ).toBeVisible();
  await expect(
    view(page).getByText(
      /^Rank averages unavailable: Deadlock API unavailable \(500\)\./,
    ),
  ).toBeVisible();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("1,100 20 games");
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("— No match details");
  await expect(card(page, "Hero damage / min").locator("svg")).toHaveCount(0);
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
});

test("performance tab keeps the rank averages that loaded, and Retry asks again for the rest", async ({
  page,
}) => {
  const failCurveFor = new Set([heroes[1]]);
  const curves: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/player-performance-curve")
      curves.push(url.searchParams.get("hero_ids")!);
  });
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory, failCurveFor });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const notice = view(page).getByText(
    "Rank averages unavailable for 10 of 20 games: Deadlock API unavailable (500).",
  );
  await expect(notice).toBeVisible();
  const souls = card(page, "Souls / min");
  await expect(souls.locator(".perf-card-numbers")).toContainText(
    "20 games · 10 with a rank average",
  );
  // No trend from the games that kept their average.
  await expect(souls.locator(".perf-trend")).toHaveCount(0);
  const asked = curves.length;
  failCurveFor.clear();
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(souls.locator(".perf-card-numbers")).toHaveText(
    "1,100 20 games · rank avg 1,000",
  );
  await expect(notice).toHaveCount(0);
  // Retry asked again only for the curve that failed.
  expect(new Set(curves.slice(asked))).toEqual(new Set([String(heroes[1])]));
});

test("performance tab keeps the last cards, dimmed, while new games load", async ({
  page,
}) => {
  let hold: Promise<void> | null = null;
  let release = () => {};
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    gate: (url) =>
      url.pathname === "/v1/matches/metadata" && hold
        ? hold
        : Promise.resolve(),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  // A card that needs match details, so the held request matters.
  const damage = card(page, "Hero damage / min").locator(".perf-card-numbers");
  const cards = view(page).locator(".perf-cards");
  const status = view(page).locator(".perf-status");
  const hero = view(page).getByRole("combobox", { name: "Hero" });
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  await expect(status).toHaveText("");
  const select = (await hero.boundingBox())!;
  hold = new Promise((resolve) => (release = resolve));
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect(status).toHaveText("Updating…");
  await expect(cards).toHaveAttribute("aria-busy", "true");
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  // The status doesn't move the controls.
  expect(await hero.boundingBox()).toEqual(select);
  release();
  await expect(cards).toHaveAttribute("aria-busy", "false");
  await expect(damage).toHaveText("1,000 50 games · rank avg 500");
  await expect(status).toHaveText("");
});

test("performance tab drops the rank averages of a range it has left", async ({
  page,
}) => {
  // Last 50 adds 20 older games on eight more heroes: eight more curves,
  // four of which load at a time.
  const more = catalog.heroes.slice(4, 12).map((hero) => hero.id);
  const older = Array.from({ length: 20 }, (_, i) =>
    historyRow(4000 + i, more[i % 8], 1, 4, true, now - 3600 * (30 + i)),
  );
  const asked: string[] = [];
  let hold: Promise<void> | null = null;
  let release = () => {};
  await storeAccount(page);
  await routeApi(page, {
    history: [...performanceHistory.slice(0, 20), ...older],
    gate: async (url) => {
      if (url.pathname !== "/v1/analytics/player-performance-curve") return;
      asked.push(url.searchParams.get("hero_ids")!);
      await hold;
    },
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const souls = card(page, "Souls / min").locator(".perf-card-numbers");
  await expect(souls).toHaveText("1,100 20 games · rank avg 1,000");
  asked.length = 0;
  hold = new Promise((resolve) => (release = resolve));
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect.poll(() => asked.length).toBe(4);
  // Back to Last 20 before they answer: the four other curves are never
  // asked for.
  await page.getByRole("button", { name: "Last 20", exact: true }).click();
  await expect(view(page).locator(".perf-cards")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  release();
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(4);
  await expect(souls).toHaveText("1,100 20 games · rank avg 1,000");
});

test("performance tab says what is still loading", async ({ page }) => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory,
    gate: (url) =>
      url.pathname === "/v1/matches/metadata" ||
      url.pathname === "/v1/analytics/player-performance-curve"
        ? hold
        : Promise.resolve(),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("1,100 20 games · loading rank average…");
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("— Loading match details…");
  await expect(view(page).locator(".perf-trend")).toHaveCount(0);
  release();
  await expect(
    card(page, "Hero damage / min").locator(".perf-card-numbers"),
  ).toHaveText("1,000 20 games · rank avg 500");
});

test("performance tab asks for match details again on Retry", async ({
  page,
}) => {
  let hold: Promise<void> | null = null;
  let release = () => {};
  const fixtures = {
    history: performanceHistory,
    failTotals: true,
    gate: (url: URL) =>
      url.pathname === "/v1/matches/metadata" && hold
        ? hold
        : Promise.resolve(),
  };
  await storeAccount(page);
  await routeApi(page, fixtures);
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const notice = view(page).getByText(
    "Match details unavailable: Deadlock API unavailable (500).",
  );
  const damage = card(page, "Hero damage / min").locator(".perf-card-numbers");
  await expect(notice).toBeVisible();
  fixtures.failTotals = false;
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  await expect(notice).toHaveCount(0);
  // The cards kept while Last 50 loads are the ones from after the Retry.
  hold = new Promise((resolve) => (release = resolve));
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  await expect(view(page).locator(".perf-cards")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(damage).toHaveText("1,000 20 games · rank avg 500");
  release();
  await expect(damage).toHaveText("1,000 50 games · rank avg 500");
});

test("performance tab compares ranked games at their own rank", async ({
  page,
}) => {
  const bands: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/player-performance-curve")
      bands.push(url.searchParams.get("min_average_badge")!);
  });
  await storeAccount(page);
  await routeApi(page, {
    history: performanceHistory.map((row) => ({
      ...row,
      ranked_display_badge: 116,
    })),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    card(page, "Souls / min").locator(".perf-card-numbers"),
  ).toHaveText("1,100 20 games · rank avg 1,000");
  // Eternus, not the player's current Mystic.
  expect(new Set(bands)).toEqual(new Set(["111"]));
  await expect(
    view(page).getByText(/^Games without a recorded rank/),
  ).toHaveCount(0);
});

test("performance tab notes games compared with all ranks", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory, rank: [] });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByText(
      "Games without a recorded rank, and no current rank to use, are compared with all ranks.",
    ),
  ).toBeVisible();
});

test("performance tab says when the current rank didn't load, and Retry asks again", async ({
  page,
}) => {
  const fixtures = { history: performanceHistory, failRank: true };
  await storeAccount(page);
  await routeApi(page, fixtures);
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const notice = view(page).getByText(
    "Current rank unavailable: Deadlock API unavailable (500).",
  );
  await expect(notice).toBeVisible();
  // Meanwhile, all ranks.
  await expect(
    view(page).getByText(
      "Games without a recorded rank, and no current rank to use, are compared with all ranks.",
    ),
  ).toBeVisible();
  fixtures.failRank = false;
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(
    view(page).getByText(
      "Games without a recorded rank use the player's current rank.",
    ),
  ).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("performance tab widens a thin rank's average and says so", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory, thinTiers: true });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByText(
      "Where a hero has too few games at one rank, its average covers the ranks either side.",
    ),
  ).toBeVisible();
});

test("performance cards sit in four columns, two on a narrower window", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(dots(page, "Souls / min")).toHaveCount(20);
  const columns = () =>
    view(page)
      .locator(".perf-card")
      .evaluateAll(
        (cards) =>
          new Set(cards.map((card) => card.getBoundingClientRect().left)).size,
      );
  expect(await columns()).toBe(4);
  await page.setViewportSize({ width: 850, height: 800 });
  await expect.poll(columns).toBe(2);
});

// The newest 20 games alternate heroes: heroes[0] on even indices.
const recent = (hero: 0 | 1) =>
  Array.from({ length: 10 }, (_, i) => 3000 + 2 * i + hero);

test("performance tab keeps the trends a failed curve doesn't touch", async ({
  page,
}) => {
  await storeAccount(page);
  // heroes[1]'s curve fails, and its games have no match details either.
  await routeApi(page, {
    history: performanceHistory,
    failCurveFor: new Set([heroes[1]]),
    unstoredTotals: recent(1),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const damage = card(page, "Hero damage / min");
  await expect(damage.locator(".perf-card-numbers")).toHaveText(
    "1,000 10 games · rank avg 500",
  );
  await expect(damage.locator(".perf-trend")).toHaveText("– Flat");
  // Souls has heroes[1]'s games, so it claims no trend.
  await expect(card(page, "Souls / min").locator(".perf-trend")).toHaveCount(0);
  // The shares, which have no rank average, keep theirs: their games with
  // match details are all heroes[0]'s.
  await expect(
    card(page, "Kill participation").locator(".perf-trend"),
  ).toHaveText("– Flat");
});

test("performance tab doesn't call failed averages missing", async ({
  page,
}) => {
  await storeAccount(page);
  // heroes[1]'s curve fails, and heroes[0]'s games have no match details.
  await routeApi(page, {
    history: performanceHistory,
    failCurveFor: new Set([heroes[1]]),
    unstoredTotals: recent(0),
  });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  const damage = card(page, "Hero damage / min");
  await expect(damage.locator(".perf-card-numbers")).toHaveText(
    "1,000 10 games",
  );
  await expect(damage.locator(".perf-trend")).toHaveCount(0);
});

test("performance range and hero survive a profile tab switch", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page, { history: performanceHistory });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await page.getByRole("button", { name: "Last 50", exact: true }).click();
  const hero = view(page).getByRole("combobox", { name: "Hero" });
  await hero.selectOption({ label: `${heroName(heroes[1])} · 30 games` });
  await expect(dots(page, "Souls / min")).toHaveCount(30);
  await openMatches(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(
    view(page).getByRole("button", { name: "Last 50", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveValue(String(heroes[1]));
  await expect(dots(page, "Souls / min")).toHaveCount(30);
});

test("each profile keeps its own tab and filter for the session", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await openMyProfile(page);
  await openMatches(page);
  await view(page).getByRole("button", { name: "Ranked", exact: true }).click();
  // Another account opens on its own view.
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByLabel("Find a player").fill("76561198060265729");
  await page.getByRole("button", { name: /Use this ID/ }).click();
  await expect(
    view(page).getByRole("tab", { name: "Overview" }),
  ).toHaveAttribute("aria-selected", "true");
  // Back on the first, its tab and filter are as they were.
  await myProfile(page).click();
  await expect(
    view(page).getByRole("tab", { name: "Matches" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    view(page).getByRole("button", { name: "Ranked", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("performance tab degrades without match history", async ({ page }) => {
  await storeAccount(page);
  await routeApi(page, { history: 403 });
  await openMyProfile(page);
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(view(page).getByText("Match history unavailable")).toBeVisible();
  await expect(view(page).locator(".perf-card")).toHaveCount(0);
});
