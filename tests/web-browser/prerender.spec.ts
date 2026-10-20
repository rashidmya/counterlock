import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

const client = join(process.cwd(), "web/build/client");
const read = (path: string) => readFileSync(join(client, path), "utf8");
const head = (html: string) => html.slice(0, html.indexOf("</head>"));
const body = (html: string) => html.slice(html.indexOf("<body"));
const pages = (kind: "heroes" | "items") =>
  readdirSync(join(client, kind), { withFileTypes: true }).filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(join(client, kind, entry.name, "index.html")),
  );

test("hero page is pre-rendered with head metadata and catalog facts", () => {
  const html = read("heroes/haze/index.html");
  const meta = head(html);
  expect(meta).toContain(
    "<title>Haze — build, counters &amp; abilities | Counterlock</title>",
  );
  expect(meta).toMatch(/<meta[^>]+property="og:image"/);
  expect(meta).toMatch(
    /<link[^>]+rel="canonical"[^>]+href="[^"]+\/heroes\/haze"/,
  );
  expect(body(html)).toContain("Sleep Dagger");
});

test("item page is pre-rendered with head metadata and catalog facts", () => {
  const html = read("items/leech/index.html");
  const meta = head(html);
  expect(meta).toContain(
    "<title>Leech — stats, builds &amp; win rate | Counterlock</title>",
  );
  expect(meta).toMatch(/<meta[^>]+property="og:image"/);
  expect(meta).toMatch(
    /<link[^>]+rel="canonical"[^>]+href="[^"]+\/items\/leech"/,
  );
  expect(body(html)).toContain("Bonus Health");
});

test("list pages are pre-rendered with their titles", () => {
  expect(head(read("heroes/index.html"))).toContain(
    "<title>Deadlock hero tier list | Counterlock</title>",
  );
  expect(head(read("items/index.html"))).toContain(
    "<title>Deadlock items | Counterlock</title>",
  );
});

test("the hero list is pre-rendered from the catalog without live numbers", () => {
  const html = body(read("heroes/index.html"));
  expect(html).toContain('href="/heroes/haze"');
  expect(html).toContain('href="/heroes/mo-krill"');
  expect(html).toContain("Haze");
  expect(html).not.toMatch(/\d+\.\d%/);
});

test("the build output has no Overwolf-only or data-sidecar files", () => {
  for (const name of [
    "manifest.json",
    "icon.ico",
    "icon-gray.png",
    "sitemap.xml.data",
    "robots.txt.data",
  ])
    expect(existsSync(join(client, name)), name).toBe(false);
});

test("one page per catalog hero and item, including special-character names", () => {
  expect(pages("heroes")).toHaveLength(catalog.heroes.length);
  expect(pages("items")).toHaveLength(catalog.items.length);
  expect(existsSync(join(client, "heroes/mo-krill/index.html"))).toBe(true);
  expect(existsSync(join(client, "heroes/the-doorman/index.html"))).toBe(true);
});

test("sitemap lists static, hero and item pages but no player pages", () => {
  const xml = read("sitemap.xml");
  expect(xml).toContain("<loc>https://counterlock.example/heroes/haze</loc>");
  expect(xml).toContain("<loc>https://counterlock.example/about</loc>");
  expect(xml).not.toContain("/players/");
  expect(xml.match(/<loc>/g)).toHaveLength(
    4 + catalog.heroes.length + catalog.items.length,
  );
});

test("robots.txt points at the sitemap", () => {
  expect(read("robots.txt")).toContain(
    "Sitemap: https://counterlock.example/sitemap.xml",
  );
});

test("about page is pre-rendered with its title and privacy copy", () => {
  const html = read("about/index.html");
  expect(head(html)).toContain("<title>About | Counterlock</title>");
  expect(body(html)).toContain("localStorage");
});
