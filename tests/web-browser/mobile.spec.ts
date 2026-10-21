import { expect, test, type Page } from "@playwright/test";
import { FARGO, mockApi } from "./fixtures";

const SCROLLERS = ".hero-table-wrap, .scoreboard-team, .skill-order";
const clipped = (page: Page, limit: number) =>
  page.evaluate(
    ([scrollers, max]) => {
      const inScroller = (node: Element) => !!node.closest(scrollers as string);
      const offenders: string[] = [];
      for (const node of document.querySelectorAll(".app *")) {
        if (inScroller(node)) continue;
        const box = node.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        const label = `${node.tagName.toLowerCase()}.${String(node.className)}`;
        if (box.right > (max as number) + 0.5 || box.left < -0.5)
          offenders.push(`${label} spans ${box.left}-${box.right}`);
        else if (
          getComputedStyle(node).overflowX !== "visible" &&
          node.scrollWidth > node.clientWidth + 1
        )
          offenders.push(
            `${label} hides ${node.scrollWidth - node.clientWidth}px`,
          );
      }
      return offenders;
    },
    [SCROLLERS, limit] as const,
  );

const overflow = (page: Page) =>
  page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

test.describe("phone width (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const loaded: [string, (page: Page) => Promise<void>][] = [
    ["/", (page) => expect(page.locator("a.hero-card").first()).toBeVisible()],
    [
      "/tier-list",
      (page) => expect(page.locator("a.tier-tile").first()).toBeVisible(),
    ],
    [
      "/heroes",
      (page) => expect(page.locator("a.hero-card").first()).toBeVisible(),
    ],
    [
      "/heroes/haze",
      async (page) => {
        await expect(page.locator(".hero-header .tier-banner")).toBeVisible();
        await expect(
          page.locator(".detail-section .item-tile").first(),
        ).toBeVisible();
        await expect(page.locator(".matchup").first()).toBeVisible();
      },
    ],
    [
      "/items",
      (page) =>
        expect(
          page.locator(".shop-column .item-tile strong").first(),
        ).toBeVisible(),
    ],
    [
      "/items/leech",
      (page) =>
        expect(page.getByRole("heading", { name: "Leech" })).toBeVisible(),
    ],
    ["/about", (page) => expect(page.locator(".web-about h1")).toBeVisible()],
  ];

  for (const [path, ready] of loaded)
    test(`${path} has no horizontal page scroll and a one-row nav`, async ({
      page,
    }) => {
      await mockApi(page);
      await page.goto(path);
      await ready(page);
      await page.waitForLoadState("networkidle");
      const { scroll, client } = await overflow(page);
      expect(client).toBe(375);
      expect(scroll).toBeLessThanOrEqual(375);
      expect(await clipped(page, 375)).toEqual([]);

      const links = page.locator("nav").getByRole("link");
      await expect(links).toHaveCount(4);
      const boxes = await links.evaluateAll((nodes) =>
        nodes.map((node) => {
          const { left, right, top, height } = node.getBoundingClientRect();
          return { left, right, top, height };
        }),
      );
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(375);
        expect(box.height).toBeGreaterThanOrEqual(40);
        expect(box.top).toBe(boxes[0].top);
      }
    });

  test("hero detail stacks: portrait above identity, one column of sections", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/heroes/haze");
    await expect(page.locator(".matchup").first()).toBeVisible();
    const frame = await page.locator(".hero-frame").boundingBox();
    const body = await page.locator(".hero-header-body").boundingBox();
    expect(body!.y).toBeGreaterThanOrEqual(frame!.y + frame!.height);
    const cards = await page
      .locator(".ability-card")
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
      );
    expect(new Set(cards).size).toBe(1);
    const sections = await page
      .locator(".detail-grid .detail-section")
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
      );
    expect(new Set(sections).size).toBe(1);
  });

  test("item shop stacks the three category columns", async ({ page }) => {
    await mockApi(page);
    await page.goto("/items");
    await expect(page.locator(".shop-column .item-tile").first()).toBeVisible();
    const lefts = await page
      .locator(".shop-column")
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
      );
    expect(lefts).toHaveLength(3);
    expect(new Set(lefts).size).toBe(1);
  });

  test("profile page has no page scroll; wide tables scroll inside their container", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto(`/players/${FARGO}`);
    await expect(page.locator(".profile-header h1")).toContainText("Persona");
    await expect(page.locator(".match-toggle").first()).toBeVisible();
    expect(await clipped(page, 375)).toEqual([]);
    await page.locator(".match-toggle").first().click();
    await expect(page.locator(".score-row").first()).toBeVisible();
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);

    await page.getByRole("tab", { name: "Heroes" }).click();
    await expect(page.locator(".hero-table tbody tr").first()).toBeVisible();
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
    const wrap = page.locator(".hero-table-wrap");
    expect(
      await wrap.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);

    await page.getByRole("tab", { name: "Performance" }).click();
    await expect(page.locator(".chart-card").first()).toBeVisible();
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    expect(await clipped(page, 375)).toEqual([]);
  });
});

test("at desktop width the hero portrait and identity sit side by side", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes/haze");
  await expect(page.locator(".hero-header .tier-banner")).toBeVisible();
  const frame = await page.locator(".hero-frame").boundingBox();
  const body = await page.locator(".hero-header-body").boundingBox();
  expect(body!.x).toBeGreaterThanOrEqual(frame!.x + frame!.width);
  expect(Math.abs(body!.y - frame!.y)).toBeLessThan(40);
  expect((await overflow(page)).scroll).toBeLessThanOrEqual(1260);
});
