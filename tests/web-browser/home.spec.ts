import { expect, test, type Page } from "@playwright/test";
import { FARGO, PNG, cors, heroStats, historyRow } from "./fixtures";

const KEY = "counterlock.web.account";
const OTHER = 100000000;
const names: Record<number, string> = {
  [FARGO]: "Fargo Fixture",
  [OTHER]: "Other Persona",
  777: "Farquhar Fixture",
  888: "Twin Persona",
  889: "Twin Persona",
};
const profile = (id: number) => ({
  account_id: id,
  personaname: names[id],
  avatarmedium: "https://api.deadlock-api.com/v1/assets/avatar.png",
});
interface Mocks {
  search?: (term: string) => unknown | Promise<unknown>;
  searchStatus?: number;
}

async function mockApi(page: Page, mocks: Mocks = {}) {
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body, headers: cors });
    const path = url.pathname;
    if (path.startsWith("/v1/assets/"))
      return route.fulfill({
        body: PNG,
        contentType: "image/png",
        headers: cors,
      });
    if (path === "/v1/players/steam-search") {
      if (mocks.searchStatus) return json({}, mocks.searchStatus);
      const term = url.searchParams.get("search_query") ?? "";
      const body = mocks.search
        ? await mocks.search(term)
        : Object.keys(names)
            .map(Number)
            .filter((id) =>
              names[id].toLowerCase().includes(term.toLowerCase()),
            )
            .map(profile);
      return json(body);
    }
    if (path === "/v1/players/steam") {
      const ids = (url.searchParams.get("account_ids") ?? "")
        .split(",")
        .map(Number);
      return json(ids.filter((id) => names[id]).map(profile));
    }
    if (path === "/v1/players/rank")
      return json([{ account_id: FARGO, badge: 53, rank: 5, subrank: 3 }]);
    if (path.endsWith("/match-history"))
      return json([historyRow(1001, true), historyRow(1002, false)]);
    if (path === "/v1/analytics/hero-stats") return json(heroStats);
    return json([]);
  });
}

const stored = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY);
const hydrated = (page: Page) =>
  expect(page.locator(".home-top a.hero-card").first()).toBeVisible();
const search = (page: Page) => page.getByLabel("Find a player");
const prompt =
  "Search for your Steam account above, open it and press This is me.";
const remember = (page: Page, id: number) =>
  page.addInitScript(
    ([key, value]) =>
      localStorage.setItem(key, JSON.stringify({ accountId: value })),
    [KEY, id] as const,
  );

test("the landing page hydrates cleanly and links into the site", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await mockApi(page);
  await page.goto("/");
  await expect(page).toHaveTitle(
    "Counterlock — Deadlock stats, builds & counters",
  );
  await expect(
    page.getByRole("heading", { name: "Know the match." }),
  ).toBeVisible();
  await hydrated(page);
  await expect(page.locator(".home-top a.hero-card")).toHaveCount(6);
  const card = page.locator(".home-top a.hero-card").first();
  await expect(card).toHaveAttribute("href", /^\/heroes\/[a-z-]+$/);
  await expect(card).toContainText(/\d+\.\d%/);
  await expect(card.locator("img.hero-card-portrait")).toBeVisible();
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "Tier list →" })).toHaveAttribute(
    "href",
    "/tier-list",
  );
  await expect(main.getByText(prompt)).toBeVisible();
  expect(problems).toEqual([]);
});

test("pre-rendered home HTML has the pitch and search but no live numbers", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("Know the match.");
  expect(html).toContain("Find a player");
  expect(html).toContain("Top of the city");
  expect(html).not.toMatch(/\d+\.\d%/);
  expect(html).not.toContain("hero-card");
});

test("search lists matches, a result opens and remembers the profile", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await hydrated(page);
  await search(page).fill("farg");
  const result = page.getByRole("link", { name: "Fargo Fixture" });
  await expect(result).toHaveAttribute("href", `/players/${FARGO}`);
  await expect(result.locator("img")).toHaveCount(1);
  await expect(page.getByText("Farquhar Fixture")).toHaveCount(0);
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/players/${FARGO}$`));
  await expect(page.locator(".profile-header h1")).toHaveText("Fargo Fixture");
  await expect(page.locator(".profile-header")).toContainText(
    "Deadlock profile",
  );
  await expect(page).toHaveTitle("Fargo Fixture | Counterlock");
  expect(await stored(page)).toBe(`{"accountId":${FARGO}}`);
});

test("results with the same name show distinct account ids", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await hydrated(page);
  await search(page).fill("twin");
  const rows = page.locator(".player-search-results li a");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Account 888");
  await expect(rows.nth(1)).toContainText("Account 889");
});

test("search results can be chosen with the keyboard", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await hydrated(page);
  await search(page).fill("farg");
  await expect(page.getByRole("link", { name: "Fargo Fixture" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Fargo Fixture" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/players/${FARGO}$`));
});

test("home revisit with a remembered account shows You and hydrates cleanly", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await mockApi(page);
  await remember(page, FARGO);
  await page.goto("/");
  await hydrated(page);
  await expect(page.locator(".you-card .you-name")).toHaveText("Fargo Fixture");
  await expect(page.getByText(prompt)).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
  expect(problems).toEqual([]);

  await page
    .locator("main")
    .getByRole("link", { name: "My profile →", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/players/${FARGO}$`));
  await expect(page.locator(".profile-header h1")).toHaveText("Fargo Fixture");
  await page.getByRole("button", { name: "Not you? Switch account" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await stored(page)).toBeNull();
  await expect(page.getByText(prompt)).toBeVisible();
  await expect(page.locator(".you-card")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My profile" })).toHaveText(
    "Find your account",
  );
});

test("Home can switch account without leaving the page", async ({ page }) => {
  await mockApi(page);
  await remember(page, FARGO);
  await page.goto("/");
  await hydrated(page);
  await expect(page.locator(".you-card")).toBeVisible();
  await page.getByRole("button", { name: "Not you? Switch account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(prompt)).toBeVisible();
  await expect(page.locator(".you-card")).toHaveCount(0);
  expect(await stored(page)).toBeNull();
});

test("a malformed remembered value keeps the landing page", async ({
  page,
}) => {
  await mockApi(page);
  await page.addInitScript((key) => localStorage.setItem(key, "{oops"), KEY);
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/");
  await hydrated(page);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
  await expect(search(page)).toBeVisible();
  await expect(page.getByText(prompt)).toBeVisible();
  await expect(page.locator(".you-card")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("another player's profile offers 'This is me' and 'Find another player'", async ({
  page,
}) => {
  await mockApi(page);
  await page.addInitScript(
    ([key, id]) => localStorage.setItem(key, JSON.stringify({ accountId: id })),
    [KEY, FARGO] as const,
  );
  await page.goto(`/players/${OTHER}`);
  await expect(page.locator(".profile-header h1")).toHaveText("Other Persona");
  await expect(
    page.getByRole("button", { name: "Not you? Switch account" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Find another player" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(search(page)).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
  expect(await stored(page)).toBe(`{"accountId":${FARGO}}`);

  await page.goto(`/players/${OTHER}`);
  await page.getByRole("button", { name: "This is me" }).click();
  expect(await stored(page)).toBe(`{"accountId":${OTHER}}`);
  await expect(page.getByRole("button", { name: "This is me" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Not you? Switch account" }),
  ).toBeVisible();
});

test("This is me updates the header immediately", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/players/${OTHER}`);
  const mine = page.getByRole("link", { name: "My profile" });
  await expect(mine).toHaveText("Find your account");
  await page.getByRole("button", { name: "This is me" }).click();
  await expect(mine).toContainText("Other Persona");
  await expect(mine).toHaveAttribute("href", `/players/${OTHER}`);
  await page.getByRole("button", { name: "Not you? Switch account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(mine).toHaveText("Find your account");
  expect(await stored(page)).toBeNull();
});

test("the header shows Find your account with nothing remembered", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes");
  const mine = page.getByRole("link", { name: "My profile" });
  await expect(mine).toHaveText("Find your account");
  await expect(mine).toHaveAttribute("href", "/");
});

test("picking a result while browsing keeps the remembered account", async ({
  page,
}) => {
  await mockApi(page);
  await remember(page, FARGO);
  await page.goto("/");
  await hydrated(page);
  await expect(page.locator(".you-card")).toBeVisible();
  await search(page).fill("farq");
  await page.getByRole("link", { name: /Farquhar Fixture/ }).click();
  await expect(page).toHaveURL(/\/players\/777$/);
  await expect(page.locator(".profile-header h1")).toHaveText(
    "Farquhar Fixture",
  );
  expect(await stored(page)).toBe(`{"accountId":${FARGO}}`);
  await expect(page.getByRole("button", { name: "This is me" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find another player" }),
  ).toBeVisible();
});

test("an API error and an empty result each show a line", async ({ page }) => {
  await mockApi(page, { searchStatus: 500 });
  await page.goto("/");
  await hydrated(page);
  await search(page).fill("farg");
  await expect(page.getByRole("alert")).toContainText(
    "Deadlock API unavailable (500)",
  );
  await expect(page.getByText("No Deadlock players found")).toHaveCount(0);

  const empty = await page.context().newPage();
  await mockApi(empty);
  await empty.goto("/");
  await hydrated(empty);
  await search(empty).fill("zzzz");
  await expect(
    empty.getByText("No Deadlock players found with that name."),
  ).toBeVisible();
});

test("newer input wins when an older response arrives last", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let sawSlow: () => void = () => undefined;
  const slowRequested = new Promise<void>((resolve) => (sawSlow = resolve));
  await mockApi(page, {
    search: async (term) => {
      if (term === "fa") {
        sawSlow();
        await gate;
        return [profile(777)];
      }
      return [profile(FARGO)];
    },
  });
  await page.goto("/");
  await hydrated(page);
  await search(page).fill("fa");
  await slowRequested;
  await search(page).fill("farg");
  await expect(page.getByRole("link", { name: "Fargo Fixture" })).toBeVisible();
  const slowResponse = page
    .waitForResponse(
      (response) =>
        response.url().includes("steam-search") &&
        response.url().includes("search_query=fa&"),
      { timeout: 2000 },
    )
    .catch(() => undefined);
  release();
  await slowResponse;
  await page.waitForTimeout(300);
  await expect(page.getByRole("link", { name: "Fargo Fixture" })).toBeVisible();
  await expect(page.getByText("Farquhar Fixture")).toHaveCount(0);
});

test("pasting a SteamID64 offers 'Use this ID'", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await hydrated(page);
  await search(page).fill("76561198060265728");
  const use = page.getByRole("link", { name: /Use this ID/ });
  await expect(use).toHaveAttribute("href", `/players/${OTHER}`);
  await expect(page.getByText("No Deadlock players found")).toHaveCount(0);
  await use.click();
  await expect(page).toHaveURL(new RegExp(`/players/${OTHER}$`));
  expect(await stored(page)).toBe(`{"accountId":${OTHER}}`);
});

test("a Steam profile URL with a numeric id is understood", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await hydrated(page);
  await search(page).fill(
    "https://steamcommunity.com/profiles/76561198060265728/",
  );
  await expect(page.getByRole("link", { name: /Use this ID/ })).toHaveAttribute(
    "href",
    `/players/${OTHER}`,
  );
});

test("an invalid player id shows a message with a way home", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/players/abc");
  await expect(page.getByText("That isn't a valid player ID.")).toBeVisible();
  await page.locator("main").getByRole("link").click();
  await expect(page).toHaveURL(/\/$/);
});

test("reloading a player URL renders the profile", async ({ page }) => {
  await mockApi(page);
  const response = await page.goto(`/players/${FARGO}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator(".profile-header h1")).toHaveText("Fargo Fixture");
  await page.reload();
  await expect(page.locator(".profile-header h1")).toHaveText("Fargo Fixture");
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
});

test("the landing page has no horizontal scroll at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockApi(page);
  await page.goto("/");
  await hydrated(page);
  await search(page).fill("farg");
  await expect(page.getByRole("link", { name: "Fargo Fixture" })).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
