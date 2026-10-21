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
