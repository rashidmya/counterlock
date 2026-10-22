const PREFIX = "#Citadel_HeroBuilds_";
const NAMES: Record<string, string> = {
  "#Citadel_HeroBuilds_EarlyGame": "Early game",
  "#Citadel_HeroBuilds_MidGame": "Mid game",
  "#Citadel_HeroBuilds_LateGame": "Late game",
};

export interface BuildEntry {
  itemId: number;
  note?: string;
}
export interface BuildCategory {
  name: string;
  description: string;
  items: BuildEntry[];
}
export interface PopularBuild {
  id: number;
  name: string;
  authorId: number; // 0 when missing
  updatedAt: number; // unix seconds, 0 when missing
  favorites: number | null; // null when the API has no count
  categories: BuildCategory[];
}

export function categoryName(key: unknown): string {
  const raw = typeof key === "string" ? key.trim() : "Items";
  const mapped = NAMES[raw];
  if (mapped) return mapped;
  const readable = raw.startsWith(PREFIX)
    ? raw
        .slice(PREFIX.length)
        .replace(/_+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .trim()
        .toLowerCase()
    : raw;
  const text = readable.charAt(0).toUpperCase() + readable.slice(1);
  return (text || "Items").slice(0, 150);
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  value && typeof value === "object" ? (value as Obj) : {};
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function parsePopularBuilds(
  rows: unknown,
  heroId: number,
): PopularBuild[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: unknown) => {
    const { hero_build, num_favorites } = obj(row);
    const build = obj(hero_build);
    const raw = obj(build.details).mod_categories;
    const id = build.hero_build_id;
    if (build.hero_id !== heroId || !positive(id) || !Array.isArray(raw))
      return [];
    const categories: BuildCategory[] = raw.slice(0, 64).map((entry) => {
      const group = obj(entry);
      return {
        name: categoryName(group.name),
        description: text(group.description, 4000),
        items: (Array.isArray(group.mods) ? group.mods : [])
          .slice(0, 128)
          .flatMap((entry: unknown) => {
            const mod = obj(entry);
            if (!positive(mod.ability_id)) return [];
            const note = text(mod.annotation, 300);
            return [{ itemId: mod.ability_id, ...(note ? { note } : {}) }];
          }),
      };
    });
    if (!categories.some((group) => group.items.length)) return [];
    return [
      {
        id,
        name: text(build.name, 200) || `Build #${id}`,
        authorId: positive(build.author_account_id)
          ? build.author_account_id
          : 0,
        updatedAt: positive(build.last_updated_timestamp)
          ? build.last_updated_timestamp
          : 0,
        favorites: count(num_favorites),
        categories,
      },
    ];
  });
}
