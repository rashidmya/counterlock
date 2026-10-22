import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog } from "@/shared/catalog";
import {
  categoryName,
  parsePopularBuilds,
} from "@/features/builds/utils/popular-builds";
import {
  POPULAR_BUILDS,
  fetchPopularBuilds,
  popularBuildsPath,
} from "@/features/builds/services/popular-builds";

const [a, b, c] = catalog.items.map((item) => item.id);
const NOW = Date.UTC(2026, 9, 22, 15);
const build = (
  id: number,
  extra: object = {},
  hero = 13,
  favorites: number | null = 199,
) => ({
  hero_build: {
    hero_id: hero,
    hero_build_id: id,
    author_account_id: 42,
    last_updated_timestamp: 1_790_000_000,
    name: `Build ${id}`,
    details: {
      mod_categories: [
        {
          name: "#Citadel_HeroBuilds_EarlyGame",
          description: "lane",
          mods: [
            { ability_id: a, annotation: "buy first" },
            { ability_id: b, annotation: null },
          ],
        },
        { name: "", mods: [{ ability_id: c }, { ability_id: a }] },
        { name: "Notes", description: "read me", mods: null },
        { name: "Mystery", mods: [{ ability_id: 123 }, { ability_id: -1 }] },
      ],
    },
    ...extra,
  },
  num_favorites: favorites,
});
function fakeApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const api = {
    get: async (path: string) => {
      calls.push(path);
      if (!(path in routes)) throw new Error(`unexpected ${path}`);
      const value = routes[path];
      if (value instanceof Error) throw value;
      return value;
    },
  } as unknown as DeadlockApi;
  return { api, calls };
}

describe("parsePopularBuilds", () => {
  it("keeps every category and item in the author's order", () => {
    const [parsed] = parsePopularBuilds([build(1)], 13);
    expect(parsed).toEqual({
      id: 1,
      name: "Build 1",
      authorId: 42,
      updatedAt: 1_790_000_000,
      favorites: 199,
      categories: [
        {
          name: "Early game",
          description: "lane",
          items: [{ itemId: a, note: "buy first" }, { itemId: b }],
        },
        {
          name: "Items",
          description: "",
          items: [{ itemId: c }, { itemId: a }],
        },
        { name: "Notes", description: "read me", items: [] },
        { name: "Mystery", description: "", items: [{ itemId: 123 }] },
      ],
    });
  });
  it("keeps a duplicate item inside one category", () => {
    const [parsed] = parsePopularBuilds(
      [
        build(1, {
          details: {
            mod_categories: [
              { name: "x", mods: [{ ability_id: a }, { ability_id: a }] },
            ],
          },
        }),
      ],
      13,
    );
    expect(parsed.categories[0].items).toEqual([{ itemId: a }, { itemId: a }]);
  });
  it("keeps long descriptions up to 4000 characters", () => {
    const long = "x".repeat(5000);
    const [parsed] = parsePopularBuilds(
      [
        build(1, {
          details: {
            mod_categories: [
              { name: "x", description: long, mods: [{ ability_id: a }] },
            ],
          },
        }),
      ],
      13,
    );
    expect(parsed.categories[0].description).toHaveLength(4000);
  });
  it("reports missing favourite counts as null and keeps zero", () => {
    const parsed = parsePopularBuilds(
      [build(1, {}, 13, null), build(2, {}, 13, 0), build(3, {}, 13, -4)],
      13,
    );
    expect(parsed.map((x) => x.favorites)).toEqual([null, 0, null]);
  });
  it("drops other heroes, empty builds and malformed rows", () => {
    const empty = build(2, {
      details: { mod_categories: [{ name: "x", mods: [] }] },
    });
    expect(
      parsePopularBuilds(
        [build(1, {}, 7), empty, null, { hero_build: {} }],
        13,
      ),
    ).toEqual([]);
    expect(parsePopularBuilds({ not: "an array" }, 13)).toEqual([]);
  });
  it("names unnamed builds by id and tolerates missing author and date", () => {
    const [parsed] = parsePopularBuilds(
      [
        build(9, {
          name: "  ",
          author_account_id: null,
          last_updated_timestamp: "x",
        }),
      ],
      13,
    );
    expect([parsed.name, parsed.authorId, parsed.updatedAt]).toEqual([
      "Build #9",
      0,
      0,
    ]);
  });
  it("maps game category keys to readable names", () => {
    expect(categoryName("#Citadel_HeroBuilds_MidGame")).toBe("Mid game");
    expect(categoryName("#Citadel_HeroBuilds_SituationalPicks")).toBe(
      "Situational picks",
    );
    expect(categoryName("")).toBe("Items");
    expect(categoryName("Core")).toBe("Core");
    expect(categoryName("   ")).toBe("Items");
    expect(categoryName({ a: 1 })).toBe("Items");
    expect(categoryName(null)).toBe("Items");
  });
});

describe("fetchPopularBuilds", () => {
  const english = popularBuildsPath(13, true, NOW);
  const any = popularBuildsPath(13, false, NOW);
  it("asks for recent, most-favourited English builds", () => {
    expect(english).toBe(
      "/v1/builds?hero_id=13&only_latest=true&sort_by=favorites&sort_direction=desc&min_unix_timestamp=1787443200&limit=5&build_language=English",
    );
    expect(POPULAR_BUILDS).toBe(5);
    expect(any).not.toContain("build_language");
    expect(popularBuildsPath(13, true, NOW, "updated_at")).toContain(
      "sort_by=updated_at",
    );
  });
  it("names authors from one Steam lookup", async () => {
    const { api, calls } = fakeApi({
      [english]: [build(1), build(2, { author_account_id: 7 })],
      "/v1/players/steam?account_ids=42,7": [
        { account_id: 42, personaname: "Ann" },
      ],
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(result.builds.map((x) => x.id)).toEqual([1, 2]);
    expect(result.english).toBe(true);
    expect(result.authors.get(42)).toBe("Ann");
    expect(result.authors.has(7)).toBe(false);
    expect(result.ranked).toBe(true);
    expect(calls).toEqual([english, "/v1/players/steam?account_ids=42,7"]);
  });
  it("falls back to every language when there are no English builds", async () => {
    const { api, calls } = fakeApi({
      [english]: [],
      [any]: [build(3)],
      "/v1/players/steam?account_ids=42": [],
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(calls).toEqual([english, any, "/v1/players/steam?account_ids=42"]);
    expect(result.builds.map((x) => x.id)).toEqual([3]);
    expect(result.english).toBe(false);
  });
  it("still returns builds when the author lookup fails", async () => {
    const { api } = fakeApi({
      [english]: [build(1)],
      "/v1/players/steam?account_ids=42": new Error("down"),
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(result.builds).toHaveLength(1);
    expect(result.authors.size).toBe(0);
  });
  it("falls back to the most recently updated builds when no counts exist", async () => {
    const recent = popularBuildsPath(13, true, NOW, "updated_at");
    const { api, calls } = fakeApi({
      [english]: [build(1, {}, 13, null)],
      [recent]: [build(5, {}, 13, null), build(6, {}, 13, null)],
      "/v1/players/steam?account_ids=42": [],
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(result.ranked).toBe(false);
    expect(result.builds.map((x) => x.id)).toEqual([5, 6]);
    expect(calls).toEqual([
      english,
      recent,
      "/v1/players/steam?account_ids=42",
    ]);
  });
  it("keeps the first list when the recent request finds nothing", async () => {
    const recent = popularBuildsPath(13, true, NOW, "updated_at");
    const { api } = fakeApi({
      [english]: [build(1, {}, 13, null)],
      [recent]: [],
      "/v1/players/steam?account_ids=42": [],
    });
    const result = await fetchPopularBuilds(13, api, NOW);
    expect(result.ranked).toBe(false);
    expect(result.builds.map((x) => x.id)).toEqual([1]);
  });
});
