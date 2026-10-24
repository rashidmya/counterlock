import { expect, test, type Page, type Route } from "@playwright/test";
import { nativeWindow, updateMatch } from "./helpers";
import { overlayState as demoState } from "./overlay-fixtures";

const curveRows = (kills = 4, samples = 1000) => [
  {
    game_time: 300,
    samples,
    kills_avg: kills / 2,
    deaths_avg: 2,
    assists_avg: 2,
  },
  {
    game_time: 900,
    samples,
    kills_avg: kills * 1.5,
    deaths_avg: 4,
    assists_avg: 6,
  },
];
const headers = { "access-control-allow-origin": "*" };
async function curveApi(page: Page, handler?: (route: Route) => unknown) {
  await page.route("https://api.deadlock-api.com/**", (route) =>
    route.fulfill({ json: [], headers }),
  );
  await page.route(
    "**/v1/analytics/player-performance-curve?**",
    handler ?? ((route) => route.fulfill({ json: curveRows(), headers })),
  );
}
const panels = [
  ["hero_damage", "Hero damage", "hero-damage", 264, 400, 240],
  ["objective_damage", "Objective damage", "objective-damage", 264, 400, 240],
  ["healing", "Healing", "healing", 264, 400, 240],
  ["you_vs_average", "You vs. average", "you-vs-average", 280, 256, 240],
  ["spawn_timers", "Spawn timers", "spawn-timers", 280, 176, 136],
] as const;
for (const [name, title, id, width, height, minHeight] of panels) {
  test(`${title} uses native identity, restores its position and saves before hiding`, async ({
    page,
  }) => {
    await nativeWindow(page, name, "normal", { state: demoState() });
    await curveApi(page);
    await page.addInitScript(
      ({ name }) =>
        localStorage.setItem(
          `scout.overlay.position.${name}`,
          JSON.stringify({ x: -200, y: 90 }),
        ),
      { name },
    );
    await page.setViewportSize({ width, height });
    await page.goto("/in_game/in_game.html");
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    if (name === "you_vs_average")
      await expect(page.locator(".hud-benchmark")).toBeInViewport();
    if (["hero_damage", "objective_damage", "healing"].includes(name))
      await expect(page.locator(".hud-meter-row").last()).toBeInViewport();
    await page.screenshot({
      path: `.superpowers/sdd/2026-10-24-redesign-phase-6-overlay-panels/screenshots/${name}.png`,
    });
    expect(
      await page.evaluate(() => (window as any).nativeCalls.moves),
    ).toEqual([[name, -200, 90]]);
    await page
      .locator(".hud-handle h2")
      .dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
    await expect
      .poll(() =>
        page.evaluate(
          ({ name }) => localStorage.getItem(`scout.overlay.position.${name}`),
          { name },
        ),
      )
      .toBe('{"x":456,"y":78}');
    await page.setViewportSize({ width: 240, height: minHeight });
    await page.screenshot({
      path: `.superpowers/sdd/2026-10-24-redesign-phase-6-overlay-panels/screenshots/${name}-minimum.png`,
    });
    await expect(
      page.getByRole("button", { name: `Hide ${title.toLowerCase()} overlay` }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Hide ${title.toLowerCase()} overlay` })
      .click();
    expect(
      await page.evaluate(
        (id) => localStorage.getItem(`scout.overlay.${id}`),
        id,
      ),
    ).toBe("false");
  });
}
for (const [name, title, , width, height] of panels.slice(0, 3)) {
  test(`${title} shows every player and updates measurements at minimum size`, async ({
    page,
  }) => {
    const state = demoState();
    state.mode = "live";
    state.players[11].heroDamage = null;
    state.players[11].objectiveDamage = null;
    state.players[11].healing = null;
    await nativeWindow(page, name, "normal", { state });
    let requests = 0;
    await curveApi(page, (route) => {
      requests++;
      return route.fulfill({ json: curveRows(), headers });
    });
    await page.setViewportSize({ width, height });
    await page.goto("/in_game/in_game.html");
    await expect(page.locator(".hud-meter-row")).toHaveCount(12);
    await expect(page.locator('[data-slot="roster_0"]')).toHaveAttribute(
      "data-tone",
      "local",
    );
    await expect(page.locator('[data-slot="roster_6"]')).toHaveAttribute(
      "data-tone",
      "enemy",
    );
    await expect(
      page.locator('[data-slot="roster_11"] .hud-meter-value'),
    ).toHaveText("—");
    await page.setViewportSize({ width: 240, height: 240 });
    await page.locator('[data-slot="roster_11"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-slot="roster_11"]')).toBeInViewport();
    await expect(
      page.getByRole("button", { name: `Hide ${title.toLowerCase()} overlay` }),
    ).toBeInViewport();
    state.players[11].heroDamage = 99999;
    state.players[11].objectiveDamage = 99999;
    state.players[11].healing = 99999;
    await updateMatch(page, { players: state.players });
    await expect(page.locator(".hud-meter-row").first()).toHaveAttribute(
      "data-slot",
      "roster_11",
    );
    await expect(page.locator(".scout-hud")).toHaveCSS("opacity", "1");
    await page.evaluate(() => {
      localStorage.setItem("scout.overlay.opacity", "35");
      window.dispatchEvent(
        new StorageEvent("storage", { key: "scout.overlay.opacity" }),
      );
    });
    await expect(page.locator(".scout-hud")).toHaveCSS(
      "background-color",
      /(?:, |\/ )0\.35\)$/,
    );
    expect(requests).toBe(0);
    await updateMatch(page, { phase: "PostGame" });
    await expect(page.getByText("Match ended.", { exact: true })).toBeVisible();
  });
}
test("the comparison waits for rank, then reuses one curve across live updates", async ({
  page,
}) => {
  const state = demoState();
  state.mode = "live";
  state.clock = "10:00";
  state.stats = {};
  await nativeWindow(page, "you_vs_average", "normal", { state });
  const requests: string[] = [];
  await curveApi(page, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: curveRows(), headers });
  });
  await page.goto("/in_game/in_game.html");
  await expect(
    page.getByText("Waiting for your rank.", { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(0);
  const rank = demoState().stats[100];
  await updateMatch(page, { stats: { 100: rank } });
  await expect(page.locator('[data-stat="kills"] .hud-average')).toContainText(
    "4.0",
  );
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get("min_average_badge")).toBe("81");
  for (const clock of ["10:01", "10:02", "10:03"])
    await updateMatch(page, { clock });
  await expect(page.locator('[data-stat="kills"] .hud-average')).toContainText(
    "4.0",
  );
  expect(requests).toHaveLength(1);
  await expect(page.locator('[data-stat="deaths"]')).toContainText("▼");
  await expect(
    page.getByText("Average unavailable", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Souls / min needs verified total souls.", { exact: true }),
  ).toBeVisible();
  await updateMatch(page, { clock: "12:34" });
  await expect(page.locator('[data-stat="assists"] .hud-delta')).toContainText(
    "<0.1",
  );
});
test("an anonymous player uses all ranks and keeps live counts if averages fail; Retry preserves focus", async ({
  page,
}) => {
  await nativeWindow(page, "you_vs_average");
  let attempt = 0;
  await curveApi(page, (route) => {
    attempt++;
    return attempt === 1
      ? route.fulfill({ status: 500, body: "", headers })
      : route.fulfill({ json: curveRows(), headers });
  });
  await page.goto("/in_game/in_game.html");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-stat="kills"] .hud-live')).toHaveText("1");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You vs. average", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".hud-benchmark")).toContainText("all ranks");
  expect(attempt).toBe(2);
  await updateMatch(page, { clock: "30:00" });
  await expect(page.locator('[data-stat="kills"] .hud-average')).toHaveText(
    "—",
  );
});
test("a new hero discards the old pending curve", async ({ page }) => {
  await nativeWindow(page, "you_vs_average");
  let held: Route | undefined;
  await curveApi(page, (route) => {
    if (new URL(route.request().url()).searchParams.get("hero_ids") === "7") {
      held = route;
      return;
    }
    return route.fulfill({ json: curveRows(20), headers });
  });
  await page.goto("/in_game/in_game.html");
  await expect.poll(() => !!held).toBe(true);
  const players = demoState().players.map((p) => ({ ...p, accountId: null }));
  players[0].heroId = 13;
  await updateMatch(page, { players, clock: "10:00" });
  await expect(page.locator('[data-stat="kills"] .hud-average')).toContainText(
    "20.0",
  );
  await held!.fulfill({ json: curveRows(99), headers }).catch(() => {});
  // Let the late response reach the browser before asserting its absence.
  await page.waitForTimeout(200);
  await expect(page.locator('[data-stat="kills"] .hud-average')).toContainText(
    "20.0",
  );
});
test("a failed current rank labels all-ranks comparison; thin samples widen the band", async ({
  page,
}) => {
  const state = demoState();
  state.stats = { 100: { fetchedAt: 1, rankError: "Unavailable" } };
  await nativeWindow(page, "you_vs_average", "normal", { state });
  await curveApi(page);
  await page.goto("/in_game/in_game.html");
  await expect(
    page.getByText("Current rank unavailable; comparing with all ranks.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".hud-benchmark")).toContainText("all ranks");
  await page.unroute("**/v1/analytics/player-performance-curve?**");
  await page.route("**/v1/analytics/player-performance-curve?**", (route) =>
    route.fulfill({
      json: curveRows(
        4,
        new URL(route.request().url()).searchParams.get("min_average_badge") ===
          "81"
          ? 10
          : 1000,
      ),
      headers,
    }),
  );
  await updateMatch(page, { stats: { 100: demoState().stats[100] } });
  await expect(page.locator(".hud-benchmark")).toContainText("Widened from");
});
test("an empty curve has no invented comparisons and partial teams have no participation", async ({
  page,
}) => {
  await nativeWindow(page, "you_vs_average");
  await curveApi(page, (route) => route.fulfill({ json: [], headers }));
  await page.goto("/in_game/in_game.html");
  await expect(
    page.getByText("No rank average available.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-stat="participation"] .hud-live'),
  ).toHaveText("—");
  await expect(page.locator('[data-stat="kills"] .hud-average')).toHaveText(
    "—",
  );
});
for (const name of ["you_vs_average", "spawn_timers"]) {
  test(`${name} has no normal-mode requests or schedules in Street Brawl`, async ({
    page,
  }) => {
    await nativeWindow(page, name, "street_brawl");
    let requests = 0;
    await curveApi(page, (route) => {
      requests++;
      return route.fulfill({ json: [], headers });
    });
    await page.goto("/in_game/in_game.html");
    await expect(
      page.getByText(
        name === "you_vs_average"
          ? "Rank averages are unavailable in Street Brawl."
          : "Spawn schedules are unavailable in Street Brawl.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(requests).toBe(0);
  });
}
test("spawn countdown follows GEP through pause, resume and missing clocks", async ({
  page,
}) => {
  await nativeWindow(page, "spawn_timers", "normal", {
    state: { clock: "09:59" },
  });
  await page.clock.install();
  await page.goto("/in_game/in_game.html");
  await expect(page.locator(".hud-countdown")).toHaveText("0:01");
  await updateMatch(page, { paused: true });
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.clock.runFor(100_000);
  await expect(page.locator(".hud-countdown")).toHaveText("0:01");
  await updateMatch(page, { paused: false, clock: "10:20" });
  await expect(page.locator(".hud-countdown")).toHaveText("4:40");
  await updateMatch(page, { clock: "—" });
  await expect(
    page.getByText("Waiting for the match clock.", { exact: true }),
  ).toBeVisible();
  await updateMatch(page, { players: [] });
  await expect(
    page.getByText("Waiting for a match.", { exact: true }),
  ).toBeVisible();
});
test("an unknown native identity does not render a performance panel", async ({
  page,
}) => {
  await nativeWindow(page, "mystery");
  await page.goto("/in_game/in_game.html");
  await expect(
    page.getByText("Overlay unavailable.", { exact: true }),
  ).toBeVisible();
});
test("missing local identity stays readable; updates do not move focus", async ({
  page,
}) => {
  await nativeWindow(page, "you_vs_average", "normal", {
    state: {
      players: demoState().players.map((p) => ({ ...p, local: false })),
    },
  });
  await curveApi(page);
  await page.goto("/in_game/in_game.html");
  await expect(
    page.getByText("Waiting for your hero.", { exact: true }),
  ).toBeVisible();
  const hide = page.getByRole("button", {
    name: "Hide you vs. average overlay",
  });
  await hide.focus();
  await updateMatch(page, { clock: "12:00" });
  await expect(hide).toBeFocused();
});

test("missing portraits retain player labels", async ({ page }) => {
  const state = demoState();
  await nativeWindow(page, "hero_damage", "normal", { state });
  await page.route("**/*", (route) =>
    route.request().resourceType() === "image"
      ? route.abort()
      : route.fallback(),
  );
  await page.goto("/in_game/in_game.html");
  await expect(page.locator(".hud-portrait.placeholder")).toHaveCount(12);
  await expect(page.locator('[data-slot="roster_0"]')).toContainText("You");
});
test("a completed lookup without a rank uses all ranks and shows zero participation", async ({
  page,
}) => {
  const state = demoState();
  state.stats = { 100: { fetchedAt: 1 } };
  state.players = state.players.map((p) => ({ ...p, kills: 1, assists: 0 }));
  state.players[0].kills = 0;
  await nativeWindow(page, "you_vs_average", "normal", { state });
  await curveApi(page);
  await page.goto("/in_game/in_game.html");
  await expect(page.locator(".hud-benchmark")).toContainText("all ranks");
  await expect(
    page.locator('[data-stat="participation"] .hud-live'),
  ).toHaveText("0%");
});
