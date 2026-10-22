import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parseMatchReport, type MatchReport } from "../utils/report";
import {
  MIN_CURVE_SAMPLES,
  MIN_STEP_SAMPLES,
  curvePath,
  parseCurve,
  rankBand,
  type RankCurve,
} from "../utils/rank-curve";

export async function fetchMatchReport(
  matchId: number,
  api: DeadlockApi = deadlockApi,
): Promise<MatchReport> {
  return parseMatchReport(
    await api.get<unknown>(`/v1/matches/${matchId}/metadata`, TTL.analytics),
    matchId,
  );
}

/** Steam names by account id; empty when the lookup fails, so the report still shows. */
export async function fetchPlayerNames(
  accountIds: number[],
  api: DeadlockApi = deadlockApi,
): Promise<Map<number, string>> {
  try {
    const profiles = await fetchSteamProfiles(
      accountIds.filter((id) => id > 0),
      api,
    );
    return new Map(profiles.map((p) => [p.accountId, p.name]));
  } catch {
    return new Map();
  }
}

/** The hero's rank-average curve for the badge's tier, one tier wider each way when thin. */
export async function fetchRankCurve(
  heroId: number,
  badge: number,
  api: DeadlockApi = deadlockApi,
): Promise<RankCurve> {
  const load = (band: ReturnType<typeof rankBand>) =>
    api.get<unknown>(curvePath(heroId, band), TTL.analytics).then(parseCurve);
  let band = rankBand(badge);
  let points = await load(band);
  let widenedFrom: string | undefined;
  if (band.min > 0 && (points[0]?.samples ?? 0) < MIN_CURVE_SAMPLES) {
    widenedFrom = band.label;
    band = rankBand(badge, 1);
    points = await load(band);
  }
  return {
    band,
    widenedFrom,
    points: points.filter((p) => p.samples >= MIN_STEP_SAMPLES),
  };
}
