import { DeadlockApi, TTL, deadlockApi } from "@/shared/api/DeadlockApi";
import { parseLiveMatch, type LiveMatch } from "../utils/live-match";

/**
 * The account's live match from the game's Watch list (about the top 200
 * matches being played), or null when it isn't on it. Fresh: the browser
 * would keep the API's answer for up to four minutes (max-age=120 and
 * stale-while-revalidate=120), while the API's own copy can be two
 * minutes old.
 */
export async function fetchLiveMatch(
  accountId: number,
  api: DeadlockApi = deadlockApi,
  signal?: AbortSignal,
): Promise<LiveMatch | null> {
  return parseLiveMatch(
    await api.get<unknown>(
      `/v1/matches/active?account_ids=${accountId}`,
      TTL.live,
      signal,
      { fresh: true },
    ),
    accountId,
  );
}
