import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { parseMatchReport, type MatchReport } from "../utils/report";

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
