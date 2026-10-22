import { expect, test, type Page } from "@playwright/test";
import {
  MATCH_ID,
  bigItem,
  heroes,
  matchMetadata,
  rankCurveRows,
} from "../fixtures/match-report";

const ACCOUNT = 100000000;
const STORAGE_KEY = "counterlock.profile.account";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const names: Record<number, string> = {
  [ACCOUNT]: "Fixture Persona",
  5001: "somdr",
};
const [lead, second] = heroes;
const cors = { "access-control-allow-origin": "*" };

async function routeApi(page: Page, curves: URLSearchParams[] = []) {
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
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
    if (url.pathname === `/v1/matches/${MATCH_ID}/metadata`)
      return json(matchMetadata(ACCOUNT));
    if (url.pathname === "/v1/analytics/player-performance-curve") {
      curves.push(url.searchParams);
      return json(rankCurveRows());
    }
    if (url.pathname === "/v1/players/steam")
      return json(
        (url.searchParams.get("account_ids") ?? "")
          .split(",")
          .map(Number)
          .filter((id) => names[id])
          .map((id) => ({ account_id: id, personaname: names[id] })),
      );
    if (url.pathname === "/v1/players/rank")
      return json([{ account_id: ACCOUNT, badge: 73, rank: 7, subrank: 3 }]);
    if (url.pathname.endsWith("/match-history"))
      return json([
        {
          account_id: ACCOUNT,
          match_id: MATCH_ID,
          hero_id: lead.id,
          start_time: Math.floor(Date.now() / 1000) - 3600,
          game_mode: 1,
          match_mode: 4,
          player_team: 0,
          player_kills: 8,
          player_deaths: 4,
          player_assists: 6,
          denies: 3,
          last_hits: 110,
          net_worth: 32400,
          match_duration_s: 1800,
          match_result: 0,
        },
      ]);
    return json([]);
  });
}

async function storeAccount(page: Page) {
  await page.addInitScript(
    ({ key, accountId }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ accountId, seenAt: Date.now(), source: "manual" }),
      ),
    { key: STORAGE_KEY, accountId: ACCOUNT },
  );
}

const view = (page: Page) => page.locator(".page:not([hidden])");
const report = (page: Page) => view(page).locator(".match-report");
const viewingAs = (page: Page) =>
  report(page).getByRole("combobox", { name: "Viewing as" });

async function openReport(page: Page, curves: URLSearchParams[] = []) {
  await storeAccount(page);
  await routeApi(page, curves);
  await page.goto("/");
  await view(page)
    .locator(".latest-match")
    .getByRole("button", { name: "Open match report →" })
    .click();
  await expect(report(page).locator(".report-result")).toBeVisible();
}

test("Home's latest match opens its report as you, against your rank", async ({
  page,
}) => {
  const curves: URLSearchParams[] = [];
  await openReport(page, curves);
  const r = report(page);
  await expect(r.locator(".report-note")).toHaveText("This is your match.");
  await expect(viewingAs(page)).toHaveValue("1");
  await expect(viewingAs(page).locator("option:checked")).toHaveText(
    `Amber · ${lead.name} · Fixture Persona (you)`,
  );
  await expect(r.locator(".report-result")).toHaveText("Victory");
  await expect(r.locator(".report-banner .eyebrow")).toHaveText(
    /^Match 1001 · Emissary-level lobby · 1h ago$/,
  );
  await expect(r.locator(".report-banner .report-stats dd")).toHaveText([
    "You",
    lead.name,
    "8 / 4 / 6",
    "32.4K",
    "1,080",
    "110",
    "30:00",
  ]);
  await expect(r.locator(".verdict span")).toHaveText([
    `▲ 8% vs avg ${lead.name} at Emissary`,
    `▲ 20% vs avg ${lead.name} at Emissary`,
    `▼ 25% vs avg ${lead.name} at Emissary`,
  ]);
  await expect(r.locator(".report-verdicts + .data-note")).toHaveText(
    `Compared with the average ${lead.name} at Emissary at the same match length, over the last 30 days.`,
  );
  await expect(r.locator(".verdict span").first()).toHaveCSS(
    "color",
    "rgb(127, 211, 154)",
  );
  await expect(r.locator(".verdict span").nth(2)).toHaveCSS(
    "color",
    "rgb(224, 122, 95)",
  );
  // Home's latest match has no origin player, so Back goes Home.
  await expect(r.getByRole("button", { name: "← Home" })).toBeVisible();
  const curve = curves.at(-1)!;
  expect(curve.get("hero_ids")).toBe(String(lead.id));
  expect(curve.get("resolution")).toBe("0");
  expect(curve.get("min_average_badge")).toBe("71");
  expect(curve.get("max_average_badge")).toBe("76");
});

test("stretches, impact and buffs describe the selected player", async ({
  page,
}) => {
  await openReport(page);
  const r = report(page);
  await expect(r.locator(".stretch")).toHaveText([
    "StrongestAround 15:00: 20% more souls than the Emissary average.",
    "WeakestAround 3:00: 10% fewer souls than the average.",
    "Turning pointBack within the normal range from 20:00.",
    "Deaths4 deaths: 6:40, 21:40, 23:20, 25:00.",
    "Rough patch3 deaths between 21:40 and 25:00.",
  ]);
  await expect(r.getByText("Your share of the team's total")).toBeVisible();
  await expect(r.locator(".impact-row b")).toHaveText([
    "21% 18.0K",
    "29% 3.0K",
    "29% 6.0K",
  ]);
  await expect(r.locator(".impact-kp")).toHaveText(
    "Kill participation50%14 of 28 team kills",
  );
  await expect(r.locator(".report-stats.buffs dd")).toHaveText(["3", "3.0"]);
  await expect(r.locator(".report-stats.buffs dt").nth(1)).toHaveText(
    `Avg ${lead.name} at Emissary`,
  );
});

test("Viewing as another player switches every perspective-dependent part", async ({
  page,
}) => {
  const curves: URLSearchParams[] = [];
  await openReport(page, curves);
  const r = report(page);
  await viewingAs(page).selectOption("2");
  await expect(r.locator(".report-note")).toHaveText(
    "You're viewing somdr's match. Labels and verdicts are from their point of view.",
  );
  await expect(r.locator(".report-banner .report-stats dd").first()).toHaveText(
    "somdr",
  );
  await expect(r.getByText("somdr's share of the team's total")).toBeVisible();
  await expect(r.locator(".verdict span").first()).toContainText(
    `vs avg ${second.name} at Emissary`,
  );
  expect(curves.at(-1)!.get("hero_ids")).toBe(String(second.id));
  await expect(r.locator(".report-table tr.selected")).toContainText(
    second.name,
  );
});

test("the whole match has no player: team banner and no verdicts", async ({
  page,
}) => {
  await openReport(page);
  const r = report(page);
  await viewingAs(page).selectOption("all");
  await expect(r.locator(".report-note")).toHaveText(
    "Whole-match view. Nobody is highlighted.",
  );
  await expect(r.locator(".report-result")).toHaveText("Amber won");
  await expect(r.locator(".report-banner .report-stats dd")).toHaveText([
    "30:00",
    "181.8K",
    "211.0K",
    "28 – 24",
  ]);
  await expect(r.locator(".verdict")).toHaveCount(0);
  await expect(r.locator(".report-pick")).toHaveText(
    "Pick a player in “Viewing as” to see their verdicts, best and worst stretches and impact.",
  );
  await expect(r.locator(".report-table tr.selected")).toHaveCount(0);
});

test("scoreboard lists the winners first by souls; View as switches player", async ({
  page,
}) => {
  await openReport(page);
  const r = report(page);
  await expect(r.locator(".report-team-name")).toHaveText([
    "Amber · winner",
    "Sapphire",
  ]);
  const amber = r.locator(".report-team").first().locator("tbody tr");
  await expect(amber).toHaveCount(6);
  await expect(amber.first()).toContainText(lead.name);
  await expect(amber.first().locator("td")).toHaveText([
    `${lead.name}You`,
    "8 / 4 / 6",
    "32.4K",
    "18.0K",
    "15.0K",
    "3.0K",
    "6.0K",
    "110",
    "Viewing",
  ]);
  await expect(amber.first()).toHaveClass("selected");
  const sapphire = r.locator(".report-team").nth(1).locator("tbody tr");
  await expect(sapphire.first()).toContainText(heroes[11].name);
  await sapphire
    .first()
    .getByRole("button", { name: /^View as/ })
    .click();
  await expect(viewingAs(page)).toHaveValue("12");
  await expect(viewingAs(page)).toBeFocused();
  await expect(r.locator(".report-result")).toHaveText("Defeat");
});

test("Copy link copies the website URL for the current point of view", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string[] }).copied.push(text);
        },
      },
    });
    (window as unknown as { copied: string[] }).copied = [];
  });
  await openReport(page);
  const button = report(page).getByRole("button", { name: "Copy link" });
  await button.click();
  await expect(
    report(page).getByRole("button", { name: "Link copied" }),
  ).toBeVisible();
  await viewingAs(page).selectOption("all");
  await report(page).getByRole("button", { name: "Copy link" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copied: string[] }).copied,
    ),
  ).toEqual([
    `https://counterlock.example/matches/${MATCH_ID}?player=${ACCOUNT}`,
    `https://counterlock.example/matches/${MATCH_ID}`,
  ]);
});

test("switching player never compares against the previous hero's average", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await storeAccount(page);
  await routeApi(page);
  // The second hero's average is twice as high, and arrives late.
  await page.route(
    "https://api.deadlock-api.com/v1/analytics/player-performance-curve**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("hero_ids") !== String(second.id))
        return route.fallback();
      await gate;
      return route.fulfill({
        json: rankCurveRows().map((row) => ({
          ...row,
          net_worth_avg: row.net_worth_avg * 2,
        })),
        headers: cors,
      });
    },
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  const souls = report(page).locator(".verdict span").first();
  await expect(souls).toHaveText(`▲ 8% vs avg ${lead.name} at Emissary`);
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { seenVerdicts: seen });
    new MutationObserver(() =>
      document
        .querySelectorAll(".verdict span")
        .forEach((node) => seen.push(node.textContent ?? "")),
    ).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await viewingAs(page).selectOption("2");
  await expect(souls).toHaveText("Loading…");
  release();
  // 932 souls / min against 2,000, not against the first hero's 1,000.
  await expect(souls).toHaveText(`▼ 53% vs avg ${second.name} at Emissary`);
  const seen = await page.evaluate(
    () => (window as unknown as { seenVerdicts: string[] }).seenVerdicts,
  );
  expect(seen.filter((text) => text.startsWith("▼ 7%"))).toEqual([]);
});

test("a failed copy shows the link to copy by hand", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => Promise.reject(new Error("denied")) },
    });
  });
  await openReport(page);
  await report(page).getByRole("button", { name: "Copy link" }).click();
  await expect(report(page).getByRole("status")).toHaveText(
    "Couldn't copy the link. Copy it from here:",
  );
  const field = report(page).getByRole("textbox", { name: "Match link" });
  await expect(field).toHaveValue(
    `https://counterlock.example/matches/${MATCH_ID}?player=${ACCOUNT}`,
  );
  await expect(field).toBeFocused();
});

test("a player without a public account gets the whole-match link", async ({
  page,
}) => {
  const hidden = matchMetadata(ACCOUNT);
  hidden.match_info.players[1].account_id = 0;
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) => route.fulfill({ json: hidden, headers: cors }),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  await viewingAs(page).selectOption("2");
  await expect(
    report(page).getByRole("button", { name: "Copy match link" }),
  ).toBeVisible();
});

test("a match row opens the report; Back returns to the profile", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await view(page).getByRole("tab", { name: "Matches" }).click();
  await view(page).locator(".match-open").first().click();
  await expect(report(page).locator(".report-result")).toHaveText("Victory");
  await report(page).getByRole("button", { name: "← Back to profile" }).click();
  await expect(view(page).locator(".profile-header h1")).toHaveText(
    "Fixture Persona",
  );
});

async function openWith(page: Page, metadata: unknown) {
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) => route.fulfill({ json: metadata, headers: cors }),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  await expect(report(page).locator(".report-result")).toBeVisible();
}

test("a player without a recorded rank is compared at the lobby's rank, and the note says so", async ({
  page,
}) => {
  const unranked = matchMetadata(ACCOUNT);
  delete (unranked.match_info.players[0] as Record<string, unknown>)
    .player_rank_data;
  await openWith(page, unranked);
  await expect(
    report(page).locator(".report-verdicts + .data-note"),
  ).toHaveText(
    `Compared with the average ${lead.name} at Emissary at the same match length, over the last 30 days. This player's rank isn't recorded for this match, so the average uses the lobby's rank.`,
  );
});

test("with no ranks recorded, the average covers all ranks without a lobby note", async ({
  page,
}) => {
  const unranked = matchMetadata(ACCOUNT);
  for (const player of unranked.match_info.players)
    delete (player as Record<string, unknown>).player_rank_data;
  await openWith(page, unranked);
  await expect(
    report(page).locator(".report-verdicts + .data-note"),
  ).toHaveText(
    `Compared with the average ${lead.name} at all ranks at the same match length, over the last 30 days.`,
  );
});

test("Street Brawl reports say rank averages cover normal matches only", async ({
  page,
}) => {
  const brawl = matchMetadata(ACCOUNT);
  brawl.match_info.game_mode = 4;
  await openWith(page, brawl);
  const r = report(page);
  await expect(r.locator(".report-banner .eyebrow")).toHaveText(
    /^Match 1001 · Street Brawl · 1h ago$/,
  );
  await expect(r.locator(".report-verdicts + .data-note")).toHaveText(
    "Rank averages cover normal matches only.",
  );
  await expect(r.locator(".graph-foot")).toHaveText(
    "You · rank averages cover normal matches only. Snapshots every 3 min until 15:00, then every 5 min; lines connect them.",
  );
});

test("when the average stops before the match ends, there are no verdicts and the notes say why", async ({
  page,
}) => {
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    "https://api.deadlock-api.com/v1/analytics/player-performance-curve**",
    (route) =>
      route.fulfill({
        json: rankCurveRows().filter((row) => row.game_time <= 1500),
        headers: cors,
      }),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  const r = report(page);
  // Too short at Emissary, so the band widens; still too short.
  await expect(r.locator(".report-verdicts + .data-note")).toHaveText(
    `Too few ${lead.name} games at Ritualist–Oracle ran as long as this match (30:00), so there are no verdicts; the average stops at 25:00. Too few ${lead.name} games at Emissary alone, so this covers Ritualist–Oracle.`,
  );
  await expect(r.locator(".verdict span")).toHaveText([
    "No rank average",
    "No rank average",
    "No rank average",
  ]);
  await expect(r.locator(".graph-foot")).toHaveText(
    `You vs the average ${lead.name} at Ritualist–Oracle · shaded band = normal range (±1 standard deviation) · the average stops at 25:00. Snapshots every 3 min until 15:00, then every 5 min; lines connect them.`,
  );
});

test("a failed match load says so and Retry recovers", async ({ page }) => {
  let fail = true;
  await storeAccount(page);
  await routeApi(page);
  await page.route(
    `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
    (route) =>
      fail
        ? route.fulfill({ status: 500, headers: cors, body: "" })
        : route.fallback(),
  );
  await page.goto("/");
  await view(page).getByRole("button", { name: "Open match report →" }).click();
  await expect(report(page)).toContainText("Match details unavailable");
  fail = false;
  await report(page).getByRole("button", { name: "Retry" }).click();
  await expect(report(page).locator(".report-result")).toHaveText("Victory");
});

test.describe("the graph", () => {
  const graph = (page: Page) => report(page).locator(".report-graph");
  const title = (page: Page) => graph(page).locator(".graph-ranking h3");

  test("starts on souls, player vs the rank average, with markers", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await expect(g.getByRole("button", { name: "Souls" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      g.getByRole("button", { name: "Player vs avg" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(title(page)).toHaveText("Most souls");
    const rows = g.locator(".graph-ranking li");
    await expect(rows).toHaveCount(12);
    await expect(rows.first()).toContainText(heroes[11].name);
    await expect(rows.first()).toContainText("37.6K");
    await expect(rows.nth(6)).toContainText(`You · ${lead.name}`);
    await expect(g.locator(".graph-line")).toHaveCount(1);
    await expect(g.locator(".graph-avg")).toHaveCount(1);
    await expect(g.locator(".graph-band")).toHaveCount(1);
    await expect(g.locator(".mark-death")).toHaveCount(4);
    await expect(g.locator(".mark-item")).toHaveCount(1);
    await expect(g.locator(".mark-item title")).toHaveText(
      `${bigItem.name} at 15:00`,
    );
    await expect(g.locator(".mark-objective")).toHaveCount(2);
    await expect(g.locator(".mark-boss title")).toHaveText(
      "Mid Boss taken by Amber at 28:20",
    );
    await expect(g.locator(".graph-foot")).toHaveText(
      `You vs the average ${lead.name} at Emissary · shaded band = normal range (±1 standard deviation). Snapshots every 3 min until 15:00, then every 5 min; lines connect them.`,
    );
  });

  test("stat tabs, More stats, values and time change the ranking", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await g.getByRole("button", { name: "Deaths" }).click();
    await expect(title(page)).toHaveText("Fewest deaths");
    await g.getByRole("button", { name: "Per minute" }).click();
    await expect(title(page)).toHaveText("Fewest deaths / min");
    await g.getByRole("button", { name: "0–10" }).click();
    await expect(title(page)).toHaveText("Fewest deaths / min · at 10:00");
    await expect(g.locator(".mark-death")).toHaveCount(1);
    await g.getByRole("combobox", { name: "More stats" }).selectOption({
      label: "Accuracy %",
    });
    await expect(title(page)).toHaveText("Highest accuracy % · at 10:00");
    await expect(g.getByRole("button", { name: "Per minute" })).toBeDisabled();
    await g.getByRole("button", { name: "Damage taken" }).click();
    await expect(g.locator(".graph-foot")).toHaveText(
      "You · no rank average for this stat. Snapshots every 3 min until 15:00, then every 5 min; lines connect them.",
    );
    await expect(g.locator(".graph-avg")).toHaveCount(0);
  });

  test("team totals, team lead and everyone with a legend", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await g.getByRole("button", { name: "Team totals" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(2);
    await expect(g.locator(".graph-foot")).toContainText(
      "Each team's combined total · Amber in blue, Sapphire in red.",
    );
    await g.getByRole("button", { name: "Team lead" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(1);
    await expect(
      g.locator(".graph-axis").getByText("0", { exact: true }),
    ).toHaveCount(1);
    await expect(g.locator(".graph-lead-label")).toHaveText([
      "AMBER AHEAD",
      "SAPPHIRE AHEAD",
    ]);
    await expect(g.locator(".mark-death")).toHaveCount(0);
    await g.getByRole("button", { name: "Everyone" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(12);
    await expect(g.locator(".graph-line.focus")).toHaveCount(1);
    const legend = g.getByRole("group", { name: "Lines" });
    await legend.getByRole("button", { name: second.name }).click();
    await expect(g.locator(".graph-line")).toHaveCount(11);
    await legend.getByRole("button", { name: "Sapphire only" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(6);
    await legend.getByRole("button", { name: "Show all" }).click();
    await expect(g.locator(".graph-line")).toHaveCount(12);
  });

  test("hover shows every visible line and the average at that time", async ({
    page,
  }) => {
    await openReport(page);
    const hit = graph(page).locator(".graph-hit");
    const box = (await hit.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tip = graph(page).locator(".graph-tip");
    await expect(tip).toBeVisible();
    await expect(tip.locator("b")).toContainText("· Souls");
    await expect(tip.locator("div")).toHaveCount(2);
    await expect(tip).toContainText(`Avg ${lead.name} at Emissary`);
    await page.mouse.move(box.x - 40, box.y - 40);
    await expect(tip).toBeHidden();
  });

  test("keeps a modest height and redraws at the new width", async ({
    page,
  }) => {
    await openReport(page);
    const svg = graph(page).locator(".graph-svg");
    const height = Number(await svg.getAttribute("height"));
    expect(height).toBeGreaterThanOrEqual(190 + 66);
    expect(height).toBeLessThanOrEqual(260 + 66);
    const before = Number(await svg.getAttribute("width"));
    await page.setViewportSize({ width: 900, height: 900 });
    await expect
      .poll(async () => Number(await svg.getAttribute("width")))
      .toBeLessThan(before);
  });

  test("with no player selected, Everyone is shown and Player vs avg is off", async ({
    page,
  }) => {
    await openReport(page);
    await viewingAs(page).selectOption("all");
    const g = graph(page);
    await expect(
      g.getByRole("button", { name: "Player vs avg" }),
    ).toBeDisabled();
    await expect(g.getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(g.locator(".graph-line")).toHaveCount(12);
    await expect(g.locator(".graph-line.focus")).toHaveCount(0);
    await expect(g.locator(".mark-death")).toHaveCount(0);
  });

  test("a match without buff pickup times has no Permanent buffs line", async ({
    page,
  }) => {
    const old = matchMetadata(ACCOUNT);
    for (const player of old.match_info.players)
      player.power_up_buffs = [
        {
          type: "hp_permanent_pickup",
          is_permanent: true,
          value: 2,
          pickup_times_s: [],
        },
      ];
    await storeAccount(page);
    await routeApi(page);
    await page.route(
      `https://api.deadlock-api.com/v1/matches/${MATCH_ID}/metadata`,
      (route) => route.fulfill({ json: old, headers: cors }),
    );
    await page.goto("/");
    await view(page)
      .getByRole("button", { name: "Open match report →" })
      .click();
    await expect(
      graph(page)
        .getByRole("combobox", { name: "More stats" })
        .locator("option", { hasText: "Permanent buffs" }),
    ).toHaveCount(0);
    await expect(
      report(page).locator(".report-stats.buffs dd").first(),
    ).toHaveText("2");
  });

  test("follows Viewing as: line, average, markers and footnote", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await viewingAs(page).selectOption("2");
    await expect(g.locator(".graph-foot")).toHaveText(
      `somdr (${second.name}) vs the average ${second.name} at Emissary · shaded band = normal range (±1 standard deviation). Snapshots every 3 min until 15:00, then every 5 min; lines connect them.`,
    );
    await expect(g.locator(".mark-death")).toHaveCount(1);
    await viewingAs(page).selectOption("all");
    await expect(g.getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await viewingAs(page).selectOption("1");
    await expect(
      g.getByRole("button", { name: "Player vs avg" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("says why there is no average line while it fails", async ({ page }) => {
    await storeAccount(page);
    await routeApi(page);
    await page.route(
      "https://api.deadlock-api.com/v1/analytics/player-performance-curve**",
      (route) => route.fulfill({ status: 500, headers: cors, body: "" }),
    );
    await page.goto("/");
    await view(page)
      .getByRole("button", { name: "Open match report →" })
      .click();
    await expect(graph(page).locator(".graph-foot")).toHaveText(
      "You · rank average unavailable. Snapshots every 3 min until 15:00, then every 5 min; lines connect them.",
    );
  });

  test("keeps lines and the band inside the plot when zoomed", async ({
    page,
  }) => {
    await openReport(page);
    const g = graph(page);
    await g.getByRole("button", { name: "0–10" }).click();
    const ys = await g.locator(".graph-line, .graph-avg").evaluateAll((nodes) =>
      nodes.flatMap((node) =>
        (node.getAttribute("points") ?? "")
          .trim()
          .split(" ")
          .map((pair) => Number(pair.split(",")[1])),
      ),
    );
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });

  test("ranking rows read out their values", async ({ page }) => {
    await openReport(page);
    await expect(
      graph(page).getByRole("button", {
        name: `View as Sapphire · ${heroes[11].name}: 37.6K`,
      }),
    ).toBeVisible();
    await expect(
      graph(page).locator('.graph-ranking [aria-current="true"]'),
    ).toContainText(lead.name);
  });

  test("clicking a ranking row switches Viewing as", async ({ page }) => {
    await openReport(page);
    await graph(page)
      .locator(".graph-ranking li")
      .first()
      .getByRole("button")
      .click();
    await expect(viewingAs(page)).toHaveValue("12");
    await expect(title(page)).toHaveText("Most souls");
  });
});

test.describe("the graph on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a tap shows the tooltip and a tap outside the chart hides it", async ({
    page,
  }) => {
    await openReport(page);
    const chart = report(page).locator(".report-graph");
    const hit = (await chart.locator(".graph-hit").boundingBox())!;
    await page.touchscreen.tap(hit.x + hit.width / 2, hit.y + hit.height / 2);
    const tip = chart.locator(".graph-tip");
    await expect(tip).toBeVisible();
    const title = (await report(page).locator(".report-result").boundingBox())!;
    await page.touchscreen.tap(title.x + 5, title.y + 5);
    await expect(tip).toBeHidden();
  });
});
