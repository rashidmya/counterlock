import { describe, expect, it } from "vitest";
import { catalog } from "@/shared/catalog";
import { routeToPath } from "../../web/app/paths";
import { sitePaths } from "../../web/app/sitePaths";

describe("site paths", () => {
  const paths = sitePaths();

  it("lists the static pages first", () => {
    expect(paths.slice(0, 5)).toEqual([
      "/",
      "/tier-list",
      "/heroes",
      "/items",
      "/about",
    ]);
  });

  it("matches routeToPath for every hero and item", () => {
    const expected = [
      ...catalog.heroes.map((hero) =>
        routeToPath({ page: "heroes", heroId: hero.id }),
      ),
      ...catalog.items.map((item) =>
        routeToPath({ page: "items", itemId: item.id }),
      ),
    ];
    expect(paths.slice(5)).toEqual(expected);
  });

  it("has no duplicates and no player paths", () => {
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.some((path) => path.startsWith("/players/"))).toBe(false);
  });
});
