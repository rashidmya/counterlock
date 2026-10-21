import { describe, expect, it } from "vitest";
import { catalog } from "@/shared/catalog";
import { playerPath, routeToPath } from "../../web/app/paths";

const leech = catalog.items.find((item) => item.name === "Leech")!;

describe("web paths", () => {
  it("maps routes to URLs", () => {
    expect(routeToPath({ page: "home" })).toBe("/");
    expect(routeToPath({ page: "tierlist" })).toBe("/tier-list");
    expect(routeToPath({ page: "heroes" })).toBe("/heroes");
    expect(routeToPath({ page: "heroes", heroId: 13 })).toBe("/heroes/haze");
    expect(routeToPath({ page: "items" })).toBe("/items");
    expect(routeToPath({ page: "items", itemId: leech.id })).toBe(
      "/items/leech",
    );
  });

  it("maps profiles to player paths and a bare profile to home", () => {
    expect(routeToPath({ page: "profile", accountId: 42 })).toBe("/players/42");
    expect(routeToPath({ page: "profile" })).toBe("/");
  });

  it("sends app-only pages to home", () => {
    expect(routeToPath({ page: "live" })).toBe("/");
    expect(routeToPath({ page: "lookup" })).toBe("/");
  });

  it("sends an unknown hero or item to its list", () => {
    expect(routeToPath({ page: "heroes", heroId: -1 })).toBe("/heroes");
    expect(routeToPath({ page: "items", itemId: -1 })).toBe("/items");
  });

  it("builds player paths", () => {
    expect(playerPath(42)).toBe("/players/42");
  });
});
