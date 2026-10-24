import { expect, test } from "@playwright/test";
import { nativeWindow } from "./helpers";

test("all five overlay switches persist independently without removing desktop builds", async ({
  page,
}) => {
  await nativeWindow(page, "desktop");
  await page.route("https://api.deadlock-api.com/**", (route) =>
    route.fulfill({
      json: [],
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/desktop/desktop.html");
  await page
    .getByRole("button", { name: "Overlay settings", exact: true })
    .click();
  await expect(page.locator(".settings").getByRole("checkbox")).toHaveCount(5);
  await page.getByLabel("Hero damage overlay", { exact: true }).uncheck();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("scout.overlay.hero-damage"),
    ),
  ).toBe("false");
  expect(
    await page.evaluate(() => localStorage.getItem("scout.overlay.healing")),
  ).toBe("true");
  await page.reload();
  await page
    .getByRole("button", { name: "Overlay settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Hero damage overlay", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Hero damage overlay", { exact: true }).check();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("scout.overlay.hero-damage"),
    ),
  ).toBe("true");
  await page.evaluate(() => {
    localStorage.setItem("scout.overlay.healing", "false");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "scout.overlay.healing" }),
    );
  });
  await expect(
    page.getByLabel("Healing overlay", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator(".build-panel")).toBeVisible();
});

for (const entry of ["/", "/desktop/desktop.html"]) {
  test(`production ${entry} waits for live data without demo controls`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(entry);
    await expect(page.getByText("STANDBY", { exact: true })).toHaveCount(0);
    await expect(page.locator(".live-badge")).toHaveCount(0);
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
