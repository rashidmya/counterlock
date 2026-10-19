import { expect, test } from "@playwright/test";

for (const entry of ["/", "/desktop/desktop.html"]) {
  test(`production ${entry} waits for live data without demo controls`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(entry);
    await expect(page.getByText("STANDBY", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Home" })).toHaveClass(
      /active/,
    );
    await page.getByRole("button", { name: "Live" }).click();
    await expect(page.getByText("Deadlock isn't running")).toBeVisible();
    await expect(page.locator(".app")).toHaveClass(/compact/);
    await page
      .getByRole("button", { name: "Overlay settings", exact: true })
      .click();
    await expect(page.getByText("Demo match", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Compact rows", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Recommended build in overlay")).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Overlay opacity")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("player lookup renders API data and reports partial failure", async ({
  page,
}) => {
  await page.route(
    "https://api.deadlock-api.com/v1/players/hero-stats?**",
    (route) =>
      route.fulfill({
        json: [
          {
            account_id: 100000000,
            hero_id: 7,
            wins: 6,
            matches_played: 10,
            last_played: 0,
          },
        ],
      }),
  );
  await page.route("https://api.deadlock-api.com/v1/players/rank?**", (route) =>
    route.fulfill({ status: 403, body: "Protected" }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Player lookup", exact: true })
    .click();
  await page
    .locator(".lookup")
    .getByLabel("Steam ID", { exact: true })
    .fill("76561198060265728");
  await page
    .getByRole("button", { name: "Look up player", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("protected");
  await expect(page.locator("tbody")).toContainText("60.0%");
  await expect(page.locator("tbody")).toContainText("Unavailable");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
