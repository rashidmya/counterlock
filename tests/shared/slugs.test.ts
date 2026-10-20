import { describe, expect, it } from "vitest";
import { catalog } from "@/shared/catalog";
import {
  duplicateSlugs,
  heroIdBySlug,
  heroSlug,
  itemIdBySlug,
  itemSlug,
  slugify,
} from "@/shared/catalog/slugs";

describe("slugify", () => {
  it("lowercases and collapses non-alphanumerics", () => {
    expect(slugify("Mo & Krill")).toBe("mo-krill");
    expect(slugify("The Doorman")).toBe("the-doorman");
    expect(slugify("Leech")).toBe("leech");
    expect(slugify("  Hunter's Aura ")).toBe("hunter-s-aura");
  });
});

describe("duplicateSlugs", () => {
  it("finds slugs that appear more than once", () => {
    expect(duplicateSlugs(["A b", "a-b"])).toEqual(["a-b"]);
    expect(duplicateSlugs(["A", "B"])).toEqual([]);
  });

  it("finds none in the catalog", () => {
    expect(duplicateSlugs(catalog.heroes.map((h) => h.name))).toEqual([]);
    expect(duplicateSlugs(catalog.items.map((i) => i.name))).toEqual([]);
  });
});

describe("slug lookups", () => {
  it("round-trips every hero and item", () => {
    for (const hero of catalog.heroes)
      expect(heroIdBySlug(heroSlug(hero.id)!)).toBe(hero.id);
    for (const item of catalog.items)
      expect(itemIdBySlug(itemSlug(item.id)!)).toBe(item.id);
  });

  it("returns undefined for unknown input", () => {
    expect(heroIdBySlug("nope")).toBeUndefined();
    expect(itemIdBySlug("nope")).toBeUndefined();
    expect(heroSlug(-1)).toBeUndefined();
    expect(itemSlug(-1)).toBeUndefined();
  });
});
