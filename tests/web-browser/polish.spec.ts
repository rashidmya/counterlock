import { expect, test, type Page, type Locator } from "@playwright/test";
import { FARGO, mockApi } from "./fixtures";

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function comfortable(controls: Locator) {
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(
      box!.height,
      (await control.getAttribute("aria-label")) ?? (await control.innerText()),
    ).toBeGreaterThanOrEqual(44);
    if (await control.evaluate((el) => el.matches("input,select"))) {
      expect(
        await control.evaluate((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
    }
  }
}

test("Recent matches action fits a narrow profile, including enlarged fallback text", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/players/${FARGO}`);
  const action = page.getByRole("button", { name: "All matches" });
  await expect(action).toBeVisible();
  await noPageOverflow(page);
  await page.addStyleTag({
    content:
      ".section-header h2, .section-header button {font-family: sans-serif !important; font-size: 200% !important}",
  });
  await noPageOverflow(page);
  const rect = await action.boundingBox();
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  await action.click();
  await expect(
    page.getByRole("tab", { name: "Matches", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

for (const width of [375, 768, 900]) {
  test(`controls stay comfortable at ${width}px`, async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/heroes");
    await expect(page.locator("a.hero-card").first()).toBeVisible();
    await comfortable(
      page.locator(".heroes-toolbar input,.heroes-toolbar button"),
    );
    await page.goto("/items");
    await comfortable(
      page.locator(
        ".items-toolbar input,.items-toolbar button,.items-toolbar select",
      ),
    );
    await page.goto(`/players/${FARGO}`);
    await page.getByRole("tab", { name: "Performance" }).click();
    await comfortable(
      page.locator(".profile-action,.perf-range button,.perf-range select"),
    );
    await page.goto(`/matches/1001?player=${FARGO}`);
    await expect(page.locator(".report-result")).toBeVisible();
    await comfortable(
      page.locator(
        ".report-bar button,.report-bar select,.graph-tabs button,.segmented button,.graph-check",
      ),
    );
    await noPageOverflow(page);
  });
}

test("fine-pointer desktop keeps compact filter controls", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/heroes");
  expect(
    (await page
      .getByRole("button", { name: "All", exact: true })
      .boundingBox())!.height,
  ).toBeLessThan(44);
});

test.describe("larger touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 900 } });
  test("filters remain comfortable beyond the phone breakpoint", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/items");
    await comfortable(
      page.locator(
        ".items-toolbar input,.items-toolbar button,.items-toolbar select",
      ),
    );
  });
});
