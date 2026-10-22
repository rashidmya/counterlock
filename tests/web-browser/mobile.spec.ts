import { expect, test, type Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
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
    [
      "/",
      (page) =>
        expect(page.locator(".home-top a.hero-card").first()).toBeVisible(),
    ],
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
        await expect(page.locator(".hero-header .hero-tier")).toBeVisible();
        await expect(
          page.locator(".detail-section .item-tile").first(),
        ).toBeVisible();
        await expect(page.locator(".matchup").first()).toBeVisible();
        await expect(
          page.locator(".build-phase .build-item").first(),
        ).toBeVisible();
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
    [
      `/players/${FARGO}`,
      (page) => expect(page.locator(".profile-header h1")).toBeVisible(),
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

      if (path === "/heroes/haze") {
        const tip = page.locator(".ability-tip").nth(3);
        await page.locator(".ability-icon").nth(3).click();
        await expect(tip).toBeVisible();
        const box = (await tip.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
        expect(await clipped(page, 375)).toEqual([]);
        await page.keyboard.press("Escape");
        await expect(tip).toBeHidden();

        const fits = async () => {
          expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
          expect(await clipped(page, 375)).toEqual([]);
        };
        await page.getByRole("tab", { name: /^Popular builds/ }).click();
        await expect(page.locator("article.popular-build")).toBeVisible();
        await fits();

        await page.getByRole("tab", { name: "Build", exact: true }).click();
        await page.getByRole("button", { name: "Add enemy hero" }).click();
        const chooser = page.getByRole("group", {
          name: "Choose enemy heroes",
        });
        for (const enemy of catalog.heroes
          .filter((hero) => hero.name !== "Haze")
          .slice(0, 2))
          await chooser
            .getByRole("button", { name: enemy.name, exact: true })
            .click();
        await expect(page.locator(".enemy-slot.filled")).toHaveCount(2);
        await expect(page.locator(".counter-cards .item-card")).toHaveCount(1);
        await fits();
        const choices = (await chooser.boundingBox())!;
        expect(choices.x + choices.width).toBeLessThanOrEqual(375);

        // Eight early tiles wrap to at most four per line.
        const tops = await page
          .locator('.build-phase[data-phase="early"] .build-item')
          .evaluateAll((nodes) =>
            nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
          );
        expect(tops).toHaveLength(8);
        expect(new Set(tops).size).toBeGreaterThanOrEqual(2);
        for (const top of new Set(tops))
          expect(
            tops.filter((other) => other === top).length,
          ).toBeLessThanOrEqual(4);
      }

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

  test("Home with a remembered account fits at phone width", async ({
    page,
  }) => {
    await mockApi(page);
    await page.addInitScript(
      (id) =>
        localStorage.setItem(
          "counterlock.web.account",
          JSON.stringify({ accountId: id }),
        ),
      FARGO,
    );
    await page.goto("/");
    await expect(page.locator(".home-top a.hero-card").first()).toBeVisible();
    await expect(page.locator(".you-card .you-name")).toContainText("Persona");
    await expect(page.locator(".latest-match")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect((await overflow(page)).scroll).toBeLessThanOrEqual(375);
    // The header name is deliberately ellipsised at this width.
    expect(
      (await clipped(page, 375)).filter((line) => !line.includes("my-name")),
    ).toEqual([]);
  });

  test("hero detail stacks: identity above the art, one column of sections", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/heroes/haze");
    await expect(page.locator(".matchup").first()).toBeVisible();
    const art = await page.locator(".hero-art").boundingBox();
    const body = await page.locator(".hero-header-body").boundingBox();
    expect(art!.y).toBeGreaterThanOrEqual(body!.y + body!.height);
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

test("main build tiles never squeeze below their art on the website", async ({
  page,
}) => {
  await mockApi(page);
  for (const width of [640, 680, 720, 760, 800, 840]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/heroes/haze");
    const tiles = page.locator('.build-phase[data-phase="early"] .build-item');
    await expect(tiles).toHaveCount(8);
    const squeezed = await tiles.evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const tile = node.getBoundingClientRect().width;
        const art = node
          .querySelector(".build-art")!
          .getBoundingClientRect().width;
        return tile + 0.5 < art ? [`${tile}px tile, ${art}px art`] : [];
      }),
    );
    expect(squeezed, `at ${width}px`).toEqual([]);
    const { scroll, client } = await overflow(page);
    expect(scroll, `at ${width}px`).toBeLessThanOrEqual(client);
  }
});

test("at desktop width the hero art sits to the right of the identity column", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/heroes/haze");
  await expect(page.locator(".hero-header .hero-tier")).toBeVisible();
  const portrait = await page
    .locator('.hero-art img[src*="haze_card.webp"]')
    .boundingBox();
  const body = await page.locator(".hero-header-body").boundingBox();
  expect(portrait!.x).toBeGreaterThanOrEqual(body!.x + body!.width);
  expect((await overflow(page)).scroll).toBeLessThanOrEqual(1260);
});
