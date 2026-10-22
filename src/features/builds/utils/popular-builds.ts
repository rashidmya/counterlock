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
  favorites: number;
  categories: BuildCategory[];
}

export function categoryName(key: unknown): string {
  const raw = String(key ?? "Items");
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

const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function parsePopularBuilds(
  rows: unknown,
  heroId: number,
): PopularBuild[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: any) => {
    const build = row?.hero_build;
    const raw = build?.details?.mod_categories;
    if (
      build?.hero_id !== heroId ||
      !positive(build.hero_build_id) ||
      !Array.isArray(raw)
    )
      return [];
    const categories: BuildCategory[] = raw.slice(0, 64).map((group: any) => ({
      name: categoryName(group?.name),
      description: text(group?.description, 1000),
      items: (Array.isArray(group?.mods) ? group.mods : [])
        .slice(0, 128)
        .flatMap((mod: any) => {
          if (!positive(mod?.ability_id)) return [];
          const note = text(mod.annotation, 300);
          return [{ itemId: mod.ability_id, ...(note ? { note } : {}) }];
        }),
    }));
    if (!categories.some((group) => group.items.length)) return [];
    return [
      {
        id: build.hero_build_id,
        name: text(build.name, 200) || `Build #${build.hero_build_id}`,
        authorId: positive(build.author_account_id)
          ? build.author_account_id
          : 0,
        updatedAt: positive(build.last_updated_timestamp)
          ? build.last_updated_timestamp
          : 0,
        favorites: positive(row.num_favorites) ? row.num_favorites : 0,
        categories,
      },
    ];
  });
}
