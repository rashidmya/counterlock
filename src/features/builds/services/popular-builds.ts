import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parsePopularBuilds, type PopularBuild } from "../utils/popular-builds";

export const POPULAR_BUILDS = 5;
export const BUILD_WINDOW_DAYS = 60;
const DAY_S = 86_400;

export interface PopularBuildsResult {
  builds: PopularBuild[];
  english: boolean;
  authors: Map<number, string>;
}

export function popularBuildsPath(
  heroId: number,
  english: boolean,
  now: number = Date.now(),
): string {
  const since = (Math.floor(now / 1000 / DAY_S) - BUILD_WINDOW_DAYS) * DAY_S;
  return (
    `/v1/builds?hero_id=${heroId}&only_latest=true&sort_by=favorites` +
    `&sort_direction=desc&min_unix_timestamp=${since}&limit=${POPULAR_BUILDS}` +
    (english ? "&build_language=English" : "")
  );
}

export async function fetchPopularBuilds(
  heroId: number,
  api: DeadlockApi = deadlockApi,
  now: number = Date.now(),
): Promise<PopularBuildsResult> {
  const load = async (english: boolean) =>
    parsePopularBuilds(
      await api.get<unknown>(
        popularBuildsPath(heroId, english, now),
        TTL.analytics,
      ),
      heroId,
    );
  let english = true;
  let builds = await load(true);
  if (!builds.length) {
    english = false;
    builds = await load(false);
  }
  const ids = [
    ...new Set(builds.map((build) => build.authorId).filter(Boolean)),
  ];
  const profiles = await fetchSteamProfiles(ids, api).catch(() => []);
  return {
    builds,
    english,
    authors: new Map(
      profiles.map((profile) => [profile.accountId, profile.name]),
    ),
  };
}
