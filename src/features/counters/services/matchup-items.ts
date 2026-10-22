import { deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { fetchItemStats } from "@/features/heroes/services/hero-analytics";
import type {
  AnalyticsQuery,
  ItemStatsRow,
} from "@/features/heroes/utils/analytics";
import type { VersusRows } from "../utils/matchup-items";

// The baseline path is the same one HeroDetail's "Best items" uses, so the
// shared client serves it from cache; each enemy has its own cacheable path.
export async function fetchCounterData(
  heroId: number,
  enemies: number[],
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<{ baseline: ItemStatsRow[]; versus: VersusRows[] }> {
  const [baseline, versus] = await Promise.all([
    fetchItemStats(q, `hero_id=${heroId}`, api),
    Promise.all(
      enemies.map(async (enemy) => ({
        heroId: enemy,
        rows: await fetchItemStats(
          q,
          `hero_id=${heroId}&enemy_hero_ids=${enemy}`,
          api,
        ),
      })),
    ),
  ]);
  return { baseline, versus };
}
