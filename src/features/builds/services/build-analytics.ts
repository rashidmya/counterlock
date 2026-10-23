import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { categoryName } from "../utils/popular-builds";
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
  const groups = b.details.mod_categories.slice(0, 64).map((g: any) => ({
    name: categoryName(g.name),
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
/**
 * The hero's most played build with 20 recorded matches, through the app's
 * shared client, which caches it and keeps to the API's rate limits. When
 * `signal` aborts, the wait ends at once, and a request that hasn't gone
 * out is dropped.
 */
export async function loadBuild(
  heroId: number,
  signal: AbortSignal,
  api: DeadlockApi = deadlockApi,
): Promise<MeasuredBuild> {
  const get = (path: string) =>
    api.get<unknown>(`/v1/${path}`, TTL.analytics, signal);
  const stats = chooseBuild(
    await get(`analytics/hero-build-stats/${heroId}?min_matches=20`),
    heroId,
  );
  if (!stats) throw Error("No build has 20 recorded matches for this hero.");
  return parseBuild(
    await get(`builds/${heroId}/${stats.hero_build_id}`),
    stats,
  );
}
