import { deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchItemStats } from "@/features/heroes/services/hero-analytics";
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";
import {
  PHASES,
  mainBuild,
  phaseParams,
  type MainBuildPhase,
} from "../utils/main-build";

export async function fetchMainBuild(
  heroId: number,
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<MainBuildPhase[]> {
  const rows = await Promise.all(
    PHASES.map((phase) =>
      fetchItemStats(q, `hero_id=${heroId}&${phaseParams(phase)}`, api),
    ),
  );
  return mainBuild(rows);
}
