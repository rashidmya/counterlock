import { expect, test, type Page, type Locator } from "@playwright/test";
import { FARGO, mockApi } from "./fixtures";

async function noPageOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    outside: [
      ...document.querySelectorAll(
        "main input, main select, header a, .subtabs button",
      ),
    ]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        text: el.getAttribute("aria-label") ?? el.textContent?.slice(0, 30),
        right: el.getBoundingClientRect().right,
      })),
  }));
  expect(layout.overflow, JSON.stringify(layout.outside)).toBeLessThanOrEqual(
    1,
  );
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

for (const width of [375, 768, 1440]) {
  test(`skip navigation reaches visible content at ${width}px`, async ({
    page,
  }) => {
    await mockApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/heroes");
    await expect(page.locator("a.hero-card").first()).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("searchbox", { name: "Search heroes" }),
    ).toBeFocused();
    // Browser scrolling to focused content must account for the actual header,
    // including enlarged labels that make navigation occupy more than one row.
    await page.addStyleTag({
      content: ".app.web > header a {font-size: 200% !important;}",
    });
    const search = page.getByRole("searchbox", { name: "Search heroes" });
    await search.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect
      .poll(async () => {
        const top = (await search.boundingBox())!.y;
        const header = await page.locator(".app.web > header").boundingBox();
        return top - header!.height;
      })
      .toBeGreaterThanOrEqual(0);
    await noPageOverflow(page);
  });
}

const layouts: [string, string][] = [
  ["/", ".home-top a"],
  ["/tier-list", "a.tier-tile"],
  ["/heroes", "a.hero-card"],
  ["/heroes/haze", ".hero-header .hero-tier"],
  ["/items", ".item-tile"],
  ["/items/leech", ".item-head"],
  [`/players/${FARGO}`, ".profile-header h1"],
  [`/matches/1001?player=${FARGO}`, ".report-result"],
  ["/about", ".web-about"],
  ["/does-not-exist", ".web-not-found"],
];
for (const width of [320, 375, 640, 641, 768, 900, 901, 1024, 1440]) {
  test(`site layouts fit ${width}px without hiding wide data`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mockApi(page);
    await page.setViewportSize({ width, height: 900 });
    for (const [path, ready] of layouts) {
      await page.goto(path);
      await expect(page.locator(ready).first()).toBeVisible();
      await noPageOverflow(page);
      if (path.startsWith("/players/")) {
        for (const tab of ["Matches", "Heroes", "Performance", "Live"]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          if (tab === "Performance")
            await expect(page.locator(".sparkline").first()).toBeVisible();
          await noPageOverflow(page);
        }
      }
    }
    expect(errors).toEqual([]);
  });
}

test("enlarged fallback labels reflow navigation and filters without clipping", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of ["/heroes", "/items", `/players/${FARGO}`]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll<HTMLElement>(
          "header a, .section-header h2, .section-header button, .filter-buttons button, .subtabs button, .select-field, input[type=search], select",
        ),
      ];
      const sizes = nodes.map(
        (el) => parseFloat(getComputedStyle(el).fontSize) * 2,
      );
      nodes.forEach((el, i) => {
        el.style.fontSize = `${sizes[i]}px`;
        el.style.fontFamily = "sans-serif";
      });
    });
    await noPageOverflow(page);
  }
});
