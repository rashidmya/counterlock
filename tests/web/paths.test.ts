import { describe, expect, it } from "vitest";
import { catalog } from "@/shared/catalog";
import { playerPath, routeToPath } from "../../web/app/paths";

const leech = catalog.items.find((item) => item.name === "Leech")!;

describe("web paths", () => {
  it("maps routes to URLs", () => {
    expect(routeToPath({ page: "home" })).toBe("/");
    expect(routeToPath({ page: "heroes" })).toBe("/heroes");
    expect(routeToPath({ page: "heroes", heroId: 13 })).toBe("/heroes/haze");
    expect(routeToPath({ page: "items" })).toBe("/items");
    expect(routeToPath({ page: "items", itemId: leech.id })).toBe(
      "/items/leech",
    );
  });

  it("sends app-only pages to home", () => {
    expect(routeToPath({ page: "live" })).toBe("/");
    expect(routeToPath({ page: "lookup" })).toBe("/");
  });

  it("builds player paths", () => {
    expect(playerPath(42)).toBe("/players/42");
  });
});
