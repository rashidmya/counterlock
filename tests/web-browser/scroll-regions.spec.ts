import { expect, test, type Locator, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { FARGO, mockApi, cors } from "./fixtures";

async function scrollWithKeyboard(page: Page, region: Locator) {
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  const hint = await region.getAttribute("aria-describedby");
  expect(hint).toBeTruthy();
  await expect(page.locator(`[id="${hint}"]`)).toBeVisible();
}

test("Heroes table can scroll with the keyboard and stops advertising scrolling when it fits", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Heroes", exact: true }).click();
  const region = page.getByRole("region", { name: "Heroes played table" });
  await expect(region).toBeVisible();
  await scrollWithKeyboard(page, region);
  const wrap = page.locator(".hero-table-wrap");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(wrap).not.toHaveAttribute("tabindex", "0");
  await expect(wrap).toBeFocused();
  await expect(wrap).not.toHaveAttribute("aria-describedby");
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(region).toHaveAttribute("tabindex", "0");
});

test("scoreboards have distinct names and retain native scrolling and View as controls", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/matches/1001?player=${FARGO}`);
  const amber = page.getByRole("region", { name: "Amber scoreboard" });
  const sapphire = page.getByRole("region", { name: "Sapphire scoreboard" });
  await expect(amber).toBeVisible();
  await expect(sapphire).toBeVisible();
  await scrollWithKeyboard(page, amber);
  await scrollWithKeyboard(page, sapphire);
  expect(await amber.getAttribute("aria-describedby")).not.toBe(
    await sapphire.getAttribute("aria-describedby"),
  );
  await expect(amber.getByRole("table")).toBeVisible();
  await sapphire.locator(".view-as-link").first().click();
  await expect(
    page.getByRole("combobox", { name: "Viewing as" }),
  ).not.toHaveValue("1");
});

test("skill order gains a scrolling hint when newly loaded content becomes wider", async ({
  page,
}) => {
  await mockApi(page);
  const abilities = catalog.heroes.find((h) => h.name === "Haze")!.abilityIds!;
  await page.route("**/v1/analytics/ability-order-stats?**", (route) => {
    const ranked = new URL(route.request().url()).searchParams.get(
      "min_average_badge",
    );
    return route.fulfill({
      headers: cors,
      json: [
        {
          abilities: Array.from(
            { length: ranked && ranked !== "0" ? 32 : 4 },
            (_, i) => abilities[i % abilities.length],
          ),
          wins: 500,
          losses: 500,
          matches: 1000,
        },
      ],
    });
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/heroes/haze");
  await expect(page.locator(".skill-row")).toHaveCount(4);
  await expect(page.locator(".skill-order")).not.toHaveAttribute(
    "tabindex",
    "0",
  );
  await page
    .getByRole("combobox", { name: "Rank", exact: true })
    .selectOption({ index: 1 });
  const region = page.getByRole("region", { name: "Skill order" });
  await expect(region).toHaveAttribute("tabindex", "0");
  await scrollWithKeyboard(page, region);
  await page
    .getByRole("combobox", { name: "Rank", exact: true })
    .selectOption({ index: 0 });
  await expect(page.locator(".skill-order")).not.toHaveAttribute(
    "aria-describedby",
  );
});

test("phone Heroes table keeps the final Last played column available for sorting", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/players/${FARGO}`);
  await page.getByRole("tab", { name: "Heroes", exact: true }).click();
  const header = page.getByRole("columnheader", { name: "Last played" });
  await expect(header).toBeVisible();
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(
    page.locator(".hero-table tbody tr").first().locator("td").last(),
  ).toBeVisible();
});
