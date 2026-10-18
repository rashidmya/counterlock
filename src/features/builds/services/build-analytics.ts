export type BuildStats = {
  hero_id: number;
  hero_build_id: number;
  wins: number;
  losses: number;
  matches: number;
  bucket: number;
};
export type MeasuredBuild = {
  stats: BuildStats;
  name: string;
  groups: { name: string; description: string; ids: number[] }[];
};
const validInt = (n: unknown): n is number =>
  Number.isSafeInteger(n) && Number(n) >= 0;
export function chooseBuild(
  rows: unknown,
  heroId: number,
): BuildStats | undefined {
  if (!Array.isArray(rows)) throw Error("Invalid build statistics");
  return rows
    .filter(
      (r): r is BuildStats =>
        r &&
        r.hero_id === heroId &&
        validInt(r.hero_build_id) &&
        validInt(r.wins) &&
        validInt(r.losses) &&
        validInt(r.matches) &&
        r.matches >= 20 &&
        r.wins + r.losses === r.matches &&
        r.bucket === 0,
    )
    .sort(
      (a, b) => b.matches - a.matches || a.hero_build_id - b.hero_build_id,
    )[0];
}
export function parseBuild(raw: any, stats: BuildStats): MeasuredBuild {
  const b = raw?.hero_build;
  if (
    b?.hero_id !== stats.hero_id ||
    b?.hero_build_id !== stats.hero_build_id ||
    typeof b.name !== "string" ||
    !Array.isArray(b.details?.mod_categories)
  )
    throw Error("Build identity or contents do not match statistics");
  const names: Record<string, string> = {
    "#Citadel_HeroBuilds_EarlyGame": "Early game",
    "#Citadel_HeroBuilds_MidGame": "Mid game",
    "#Citadel_HeroBuilds_LateGame": "Late game",
  };
  const groups = b.details.mod_categories.slice(0, 64).map((g: any) => ({
    name: names[g.name] ?? String(g.name ?? "Items").slice(0, 150),
    description: String(g.description ?? "").slice(0, 1000),
    ids: Array.isArray(g.mods)
      ? g.mods
          .slice(0, 128)
          .map((m: any) => m.ability_id)
          .filter((id: unknown) => validInt(id) && id > 0)
      : [],
  }));
  if (!groups.some((g: { ids: number[] }) => g.ids.length))
    throw Error("Build contains no item groups");
  return { stats, name: b.name.slice(0, 200), groups };
}
const cache = new Map<number, { expires: number; value: MeasuredBuild }>();
export async function loadBuild(
  heroId: number,
  signal: AbortSignal,
): Promise<MeasuredBuild> {
  const cached = cache.get(heroId);
  if (cached && cached.expires > Date.now()) return cached.value;
  const get = async (path: string) => {
    const r = await fetch("https://api.deadlock-api.com/v1/" + path, {
      signal,
    });
    if (!r.ok)
      throw Error(
        r.status === 429
          ? "Build service busy; try again later."
          : "Build statistics unavailable.",
      );
    return r.json();
  };
  const stats = chooseBuild(
    await get(`analytics/hero-build-stats/${heroId}?min_matches=20`),
    heroId,
  );
  if (!stats) throw Error("No build has 20 recorded matches for this hero.");
  const value = parseBuild(
    await get(`builds/${heroId}/${stats.hero_build_id}`),
    stats,
  );
  cache.set(heroId, { expires: Date.now() + 300000, value });
  return value;
}
