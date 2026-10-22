import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parseMatchReport, type MatchReport } from "../utils/report";
import {
  MIN_CURVE_SAMPLES,
  MIN_STEP_SAMPLES,
  curvePath,
  parseCurve,
  rankBand,
  type CurvePoint,
  type RankBand,
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

/**
 * The hero's rank-average curve for the badge's tier, widened one tier each
 * way when the tier is thin: too few games at the first step, or too few
 * lasting as long as the match (`durationS`).
 */
export async function fetchRankCurve(
  heroId: number,
  badge: number,
  durationS = 0,
  api: DeadlockApi = deadlockApi,
): Promise<RankCurve> {
  const load = (band: RankBand) =>
    api.get<unknown>(curvePath(heroId, band), TTL.analytics).then(parseCurve);
  const keep = (points: CurvePoint[]) =>
    points.filter((p) => p.samples >= MIN_STEP_SAMPLES);
  const band = rankBand(badge);
  const points = await load(band);
  const kept = keep(points);
  const thin =
    (points[0]?.samples ?? 0) < MIN_CURVE_SAMPLES ||
    (kept.at(-1)?.t ?? 0) < durationS;
  if (band.min === 0 || !thin) return { band, points: kept };
  const wider = rankBand(badge, 1);
  try {
    return {
      band: wider,
      widenedFrom: band.label,
      points: keep(await load(wider)),
    };
  } catch {
    // The tier's own curve is still better than none.
    return { band, points: kept };
  }
}
