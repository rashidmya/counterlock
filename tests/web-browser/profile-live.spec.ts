import { expect, test, type Page } from "@playwright/test";
import {
  ALL_STANDING,
  activeMatch,
  liveHeroes,
  type LiveOptions,
} from "../fixtures/live-match";
import { FARGO, cors, mockApi } from "./fixtures";

// Answers the Watch list with the given matches, in turn (the last one
// again once they run out); a number answers with that status.
async function mockLive(page: Page, answers: (LiveOptions | null | number)[]) {
  const asked: string[] = [];
  await page.route(
    "https://api.deadlock-api.com/v1/matches/active**",
    (route) => {
      const url = new URL(route.request().url());
      asked.push(url.searchParams.get("account_ids") ?? "");
      const answer = answers[Math.min(asked.length, answers.length) - 1];
      if (typeof answer === "number")
        return route.fulfill({ status: answer, json: {}, headers: cors });
      return route.fulfill({
        json: answer === null ? [] : [activeMatch(FARGO, answer)],
        headers: cors,
      });
    },
  );
  return asked;
}

const openLive = async (page: Page) => {
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Live" }).click();
};

test("the Live tab shows the player's live match from the Watch list", async ({
  page,
}) => {
  await mockApi(page);
  const asked = await mockLive(page, [
    { masks: [ALL_STANDING, 0b10000001000101] },
  ]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  expect(asked).toEqual([String(FARGO)]);
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(0)).toHaveText("Match time23 minsince it started");
  await expect(stats.nth(1)).toHaveText(
    "Souls leadAmber +5,426Amber 111,527 – 106,101 Sapphire",
  );
  await expect(stats.nth(2)).toHaveText(/^ModeRankedMatch \d+$/);

  const amber = page.locator(".live-team.team-0");
  const sapphire = page.locator(".live-team.team-1");
  await expect(amber.getByRole("heading", { level: 3 })).toHaveText("Amber");
  await expect(amber.locator(".live-players li")).toHaveCount(6);
  await expect(sapphire.locator(".live-players li")).toHaveCount(6);
  // The player, by name, with no link to the profile already open.
  const current = amber.locator('li[aria-current="true"]');
  await expect(current).toContainText(liveHeroes[0].name);
  await expect(current).toContainText("A Rather Long Persona Name Fixture");
  await expect(current.getByRole("link")).toHaveCount(0);
  // Everyone else links to their profile.
  const other = sapphire.locator(".live-players li").first();
  await expect(other).toContainText(liveHeroes[6].name);
  await expect(
    other.getByRole("link", { name: "Player 7006" }),
  ).toHaveAttribute("href", "/players/7006");

  await expect(amber.locator(".live-objectives")).toHaveText(
    "Guardians3 / 3Walkers3 / 3Base Guardians3 / 3Shrines2 / 2PatronStanding",
  );
  await expect(sapphire.locator(".live-objectives")).toHaveText(
    "Guardians0 / 3Walkers0 / 3Base Guardians0 / 3Shrines0 / 2PatronWeakened",
  );
  await expect(page.getByText("From the game's Watch list")).toBeVisible();
});

test("nothing stands in for souls the API didn't give, nor a link for a player without an account", async ({
  page,
}) => {
  await mockApi(page);
  const raw = activeMatch(FARGO);
  raw.team_stats = [raw.team_stats[0]];
  delete (raw as unknown as Record<string, unknown>).net_worth_team_1;
  raw.players[7] = { ...raw.players[7], account_id: 0 };
  await page.route(
    "https://api.deadlock-api.com/v1/matches/active**",
    (route) => route.fulfill({ json: [raw], headers: cors }),
  );
  await openLive(page);
  await expect(page.locator(".live-stats .stat-card").nth(1)).toHaveText(
    "Souls lead—not given",
  );
  const rows = page.locator(".live-team.team-1 .live-players li");
  const nobody = rows.nth(1);
  await expect(nobody).toHaveText(liveHeroes[7].name);
  await expect(nobody.getByRole("link")).toHaveCount(0);
  // Its hero's name looks like everyone else's.
  const size = (row: typeof nobody) =>
    row.locator("b").evaluate((node) => getComputedStyle(node).fontSize);
  expect(await size(nobody)).toBe(await size(rows.nth(0)));
});

test("Street Brawl shows rounds won rather than souls and objectives", async ({
  page,
}) => {
  await mockApi(page);
  await mockLive(page, [{ gameMode: 4, matchMode: 1, rounds: [2, 1] }]);
  await openLive(page);
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(1)).toHaveText("Rounds won2 – 1Amber – Sapphire");
  await expect(stats.nth(2)).toContainText("Street Brawl");
  await expect(page.locator(".live-players li")).toHaveCount(8);
  await expect(page.locator(".live-objectives")).toHaveCount(0);
});

test("a player off the Watch list has no live match found, never 'Not in a game'", async ({
  page,
}) => {
  await mockApi(page);
  await mockLive(page, [null]);
  await openLive(page);
  await expect(
    page.getByRole("heading", { name: "No live match found" }),
  ).toBeVisible();
  await expect(
    page.getByText("about the top 200 matches being played"),
  ).toBeVisible();
  await expect(page.getByText("Not in a game")).toHaveCount(0);
});

test("a failed lookup says so; Retry keeps focus in place and asks again", async ({
  page,
}) => {
  await mockApi(page);
  const asked = await mockLive(page, [500, {}]);
  await openLive(page);
  const notice = page.locator(".live-tab .notice");
  await expect(notice).toContainText(
    "Live matches unavailable: Deadlock API unavailable (500).",
  );
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeFocused();
  expect(asked).toHaveLength(2);
});

test("coming back from another page finds the profile on its Live tab", async ({
  page,
}) => {
  await mockApi(page);
  await mockLive(page, [{}]);
  await openLive(page);
  await page
    .locator(".live-team.team-1")
    .getByRole("link", { name: "Player 7006" })
    .click();
  await expect(page).toHaveURL("/players/7006");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Live" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
});

test("the Live tab checks again every minute while it's open", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  const startTime = Math.floor(Date.now() / 1000) - 23 * 60;
  const asked = await mockLive(page, [
    { startTime },
    { startTime, netWorth: [120000, 125000] },
  ]);
  await openLive(page);
  const stats = page.locator(".live-stats .stat-card");
  await expect(stats.nth(1)).toContainText("Amber +5,426");
  await page.clock.runFor(30_000);
  // Time for a request the page made to reach the route.
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(1);
  await page.clock.runFor(30_000);
  await expect(stats.nth(1)).toContainText("Sapphire +5,000");
  await expect(stats.nth(0)).toContainText("24 min");
  expect(asked).toHaveLength(2);
  // A check that goes well isn't announced.
  await expect(page.locator(".live-status")).toHaveText("");
});

test("a check that falls due while the page is hidden waits until it's back", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  const asked = await mockLive(page, [{}]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  const visibility = (value: string) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", {
        value,
        configurable: true,
      });
    }, value);
  await visibility("hidden");
  await page.clock.runFor(180_000);
  // Time for a request the page made to reach the route.
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(1);
  await visibility("visible");
  await page.clock.runFor(5_000);
  await expect.poll(() => asked.length).toBe(2);
});

test("a check that fails keeps the match shown and says so; Retry asks again", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  await mockLive(page, [{}, 500, { netWorth: [120000, 125000] }]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await page.clock.runFor(60_000);
  const notice = page.locator(".live-tab .notice");
  await expect(notice).toContainText(
    "Couldn't check again: Deadlock API unavailable (500).",
  );
  await expect(page.locator(".live-stats .stat-card").nth(1)).toContainText(
    "Amber +5,426",
  );
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".live-stats .stat-card").nth(1)).toContainText(
    "Sapphire +5,000",
  );
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeFocused();
});

test("the minute's checks leave the notice, and focus on its Retry, in place", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  const asked = await mockLive(page, [{}, 500, 500, {}]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await page.clock.runFor(60_000);
  const notice = page.locator(".live-tab .notice");
  const retry = notice.getByRole("button", { name: "Retry" });
  await retry.focus();
  // Failing again: the same notice, still focused, and nothing announced.
  await page.clock.runFor(60_000);
  await expect.poll(() => asked.length).toBe(3);
  // Time for the answer to reach the page.
  await page.waitForTimeout(300);
  await expect(retry).toBeFocused();
  await expect(page.locator(".live-status")).toHaveText("");
  // Going well: the notice goes, and focus moves to the status.
  await page.clock.runFor(60_000);
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeFocused();
});

test("a check that goes well leaves alone focus that has left the notice", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  await mockLive(page, [{}, 500, {}]);
  await openLive(page);
  await expect(page.getByRole("heading", { name: "Live match" })).toBeVisible();
  await page.clock.runFor(60_000);
  const notice = page.locator(".live-tab .notice");
  await notice.getByRole("button", { name: "Retry" }).focus();
  // A click on nothing in particular leaves focus on the page.
  await page.locator(".live-stats").click();
  const onPage = () =>
    page.evaluate(() => document.activeElement === document.body);
  expect(await onPage()).toBe(true);
  await page.clock.runFor(60_000);
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".live-status")).not.toBeFocused();
  expect(await onPage()).toBe(true);
});

test("a check that finds the match over leaves focus in the tab", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  await mockLive(page, [{}, null]);
  await openLive(page);
  await page
    .locator(".live-team.team-1")
    .getByRole("link", { name: "Player 7006" })
    .focus();
  await page.clock.runFor(60_000);
  await expect(
    page.getByRole("heading", { name: "No live match found" }),
  ).toBeVisible();
  await expect(page.locator(".live-status")).toBeFocused();
});

test("a new match in place of the last leaves focus in the tab", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  // The next match has the player where the focused link was.
  const next = activeMatch(FARGO, { matchId: 999 });
  next.players[0].account_id = 7006;
  next.players[6].account_id = FARGO;
  let asked = 0;
  await page.route(
    "https://api.deadlock-api.com/v1/matches/active**",
    (route) =>
      route.fulfill({
        json: [asked++ ? next : activeMatch(FARGO)],
        headers: cors,
      }),
  );
  await openLive(page);
  await page
    .locator(".live-team.team-1")
    .getByRole("link", { name: "Player 7006" })
    .focus();
  await page.clock.runFor(60_000);
  await expect(page.locator(".live-stats")).toContainText("Match 999");
  await expect(page.locator(".live-status")).toBeFocused();
});
