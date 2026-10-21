import { expect, test } from "@playwright/test";
import { nativeWindow } from "./helpers";

test("noir base theme applies", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(12, 11, 10)",
  );
  await expect(page.locator(":root")).toHaveCSS("font-size", "14px");
  await expect(page.locator("h1").first()).toHaveCSS(
    "font-family",
    /Playfair Display SC/,
  );
});

test("shell fits one row at the minimum window width", async ({ page }) => {
  await page.setViewportSize({ width: 850, height: 650 });
  await nativeWindow(page, "desktop");
  await page.goto("/desktop/desktop.html");
  await expect(page.locator(".live-badge")).toBeVisible();
  const header = await page.locator(".app > header").boundingBox();
  expect(header!.height).toBeLessThanOrEqual(70);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("button"),
  ).toHaveCount(5);
  const tops = await page
    .locator(".tabs button")
    .evaluateAll((buttons) =>
      buttons.map((b) => Math.round(b.getBoundingClientRect().top)),
    );
  expect(tops).toHaveLength(5);
  expect(new Set(tops).size).toBe(1);
  for (const name of ["My profile", "Overlay settings", "Hide window"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(850);
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(850);
  const overflow = await page
    .locator(".app > header")
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("active tab underline is gold", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tabs button.active")).toHaveCSS(
    "border-bottom-color",
    "rgb(217, 164, 65)",
  );
});
