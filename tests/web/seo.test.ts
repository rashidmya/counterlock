import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalog } from "@/shared/catalog";
import {
  PageMeta,
  heroMetaInput,
  itemMetaInput,
  metaTags,
  robotsTxt,
  sitemapXml,
} from "../../web/app/seo";

const hero = (name: string) => catalog.heroes.find((h) => h.name === name)!;
const item = (name: string) => catalog.items.find((i) => i.name === name)!;
const tag = (
  tags: ReturnType<typeof metaTags>["tags"],
  key: string,
): string | undefined =>
  tags.find((t) => t.name === key || t.property === key)?.content;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("hero metadata", () => {
  const haze = hero("Haze");
  const meta = metaTags(heroMetaInput(haze.id));

  it("uses the hero title format and canonical URL", () => {
    expect(meta.title).toBe("Haze — build, counters & abilities | Counterlock");
    expect(meta.canonical).toBe("https://counterlock.example/heroes/haze");
    expect(tag(meta.tags, "og:url")).toBe(meta.canonical);
  });

  it("previews with the hero card art", () => {
    expect(tag(meta.tags, "og:image")).toBe(haze.cardImage);
    expect(tag(meta.tags, "twitter:image")).toBe(haze.cardImage);
    expect(tag(meta.tags, "twitter:card")).toBe("summary_large_image");
  });

  it("describes the hero within 160 characters", () => {
    const description = tag(meta.tags, "description")!;
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain("Haze");
    expect(description).toContain("Assassin");
    expect(description).toContain(haze.tagline);
  });

  it("has no trailing space for a hero without a tagline", () => {
    const bare = catalog.heroes.find((h) => !h.tagline)!;
    const description = heroMetaInput(bare.id).description;
    expect(description).toBe(description.trim());
    expect(description.endsWith("win rate.")).toBe(true);
  });

  it("never exceeds 160 characters for any hero", () => {
    for (const h of catalog.heroes)
      expect(heroMetaInput(h.id).description.length).toBeLessThanOrEqual(160);
  });

  it("rejects an unknown hero", () => {
    expect(() => heroMetaInput(-1)).toThrow();
  });
});

describe("item metadata", () => {
  const leech = item("Leech");
  const input = itemMetaInput(leech.id);

  it("uses the item title, path and shop art", () => {
    expect(input.title).toBe("Leech — stats, builds & win rate | Counterlock");
    expect(input.path).toBe("/items/leech");
    expect(input.image).toBe(leech.image);
  });

  it("describes name, category, cost and description", () => {
    expect(input.description).toContain("Leech — Vitality item, 6400 souls.");
    expect(input.description).toContain("Reduces the effect");
    expect(input.description.length).toBeLessThanOrEqual(160);
  });

  it("falls back to the first two stats without a description", () => {
    const bare = item("Monster Rounds");
    expect(bare.description).toBe("");
    expect(itemMetaInput(bare.id).description).toBe(
      `Monster Rounds — Weapon item, ${bare.cost} souls. ${bare.stats![0].label} ${bare.stats![0].value}, ${bare.stats![1].label} ${bare.stats![1].value}`,
    );
  });

  it("shortens long descriptions at a word boundary with an ellipsis", () => {
    const long = catalog.items.find(
      (i) =>
        i.description.length > 160 &&
        itemMetaInput(i.id).description.endsWith("…"),
    )!;
    const description = itemMetaInput(long.id).description;
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/\S…$/);
  });

  it("never exceeds 160 characters for any item", () => {
    for (const i of catalog.items) {
      const description = itemMetaInput(i.id).description;
      expect(description.length).toBeLessThanOrEqual(160);
      expect(description).toBe(description.trim());
    }
  });
});

describe("metaTags", () => {
  const base = { title: "T", description: "D", path: "/about" };

  it("uses the summary card and omits images without one", () => {
    const { tags } = metaTags(base);
    expect(tag(tags, "twitter:card")).toBe("summary");
    expect(tag(tags, "og:image")).toBeUndefined();
    expect(tag(tags, "twitter:image")).toBeUndefined();
    expect(tag(tags, "og:type")).toBe("website");
    expect(tag(tags, "og:site_name")).toBe("Counterlock");
  });

  it("honours an explicit og:type", () => {
    expect(tag(metaTags({ ...base, type: "article" }).tags, "og:type")).toBe(
      "article",
    );
  });

  it("strips a trailing slash from the configured site URL", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://x.io/");
    vi.resetModules();
    const seo = await import("../../web/app/seo");
    expect(seo.SITE_URL).toBe("https://x.io");
    expect(seo.metaTags(base).canonical).toBe("https://x.io/about");
    expect(seo.metaTags({ ...base, path: "/" }).canonical).toBe(
      "https://x.io/",
    );
  });
});

describe("PageMeta", () => {
  it("renders title, description, canonical and Open Graph elements", () => {
    const html = renderToStaticMarkup(
      createElement(PageMeta, {
        title: "A & B",
        description: 'Say "hi"',
        path: "/about",
        image: "https://img.example/a.webp",
      }),
    );
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://counterlock.example/about"/>',
    );
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('content="https://img.example/a.webp"');
  });
});

describe("sitemap and robots", () => {
  it("lists every path as an absolute <loc>", () => {
    const xml = sitemapXml(["/", "/heroes/mo-krill"]);
    expect(xml).toContain("<loc>https://counterlock.example/</loc>");
    expect(xml).toContain(
      "<loc>https://counterlock.example/heroes/mo-krill</loc>",
    );
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<urlset");
  });

  it("escapes XML special characters", () => {
    expect(sitemapXml(["/a?x=1&y=2"])).toContain("/a?x=1&amp;y=2</loc>");
  });

  it("allows all and points to the sitemap", () => {
    expect(robotsTxt()).toBe(
      "User-agent: *\nAllow: /\nSitemap: https://counterlock.example/sitemap.xml\n",
    );
  });
});
