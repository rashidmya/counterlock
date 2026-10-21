import { expect, test } from "@playwright/test";

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
