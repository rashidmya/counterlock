import { expect, test } from "@playwright/test";
import { mockApi, cors } from "./fixtures";

test("empty Heroes search explains the result and reset restores the whole roster and focus", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes");
  await expect(page.locator("a.hero-card").first()).toBeVisible();
  const total = await page.locator("a.hero-card").count();
  await page.getByRole("button", { name: "Assassin", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search heroes" });
  await search.fill("no-such-hero-xyz");
  await expect(page.getByRole("status")).toContainText("No heroes match");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("a.hero-card")).toHaveCount(total);
  await expect(page.getByRole("button", { name: "Reset filters" })).toHaveCount(
    0,
  );
});

test("empty Items reset restores categories but keeps sort and rank", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/items");
  const rank = page.getByRole("combobox", { name: "Rank", exact: true });
  await rank.selectOption({ index: 1 });
  const chosen = await rank.inputValue();
  const sort = page.getByRole("combobox", { name: "Sort", exact: true });
  await sort.selectOption("winRate");
  await page.getByRole("button", { name: "Weapon", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search items" });
  await search.fill("no-such-item-xyz");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(sort).toHaveValue("winRate");
  await expect(rank).toHaveValue(chosen);
  await expect(page.locator(".item-tile").first()).toBeVisible();
});

for (const path of ["/heroes", "/items"]) {
  test(`stats failure on ${path} keeps catalog results instead of a misleading reset`, async ({
    page,
  }) => {
    await mockApi(page);
    await page.route("**/v1/analytics/**", (route) =>
      route.fulfill({ status: 500, headers: cors, json: {} }),
    );
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reset filters" }),
    ).toHaveCount(0);
    await expect(
      page.locator(path === "/heroes" ? "a.hero-card" : ".item-tile").first(),
    ).toBeVisible();
  });
}
