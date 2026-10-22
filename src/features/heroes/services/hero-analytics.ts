import type { Item } from "@/shared/catalog/types";
import { TTL, deadlockApi, type DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog, heroById } from "@/shared/catalog";
import { recommend } from "@/features/counters/utils/recommendations";
import {
  analyticsParams,
  summarizeHeroes,
  type AbilityOrderRow,
  type AnalyticsHeroStatsRow,
  type AnalyticsQuery,
  type CounterRow,
  type HeroSummary,
  type ItemStatsRow,
  type SynergyRow,
} from "../utils/analytics";

async function fetchRows<T>(path: string, api: DeadlockApi): Promise<T[]> {
  const data = await api.get<unknown>(path, TTL.analytics);
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function fetchHeroSummaries(
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<HeroSummary[]> {
  const rows = await fetchRows<AnalyticsHeroStatsRow>(
    `/v1/analytics/hero-stats?${analyticsParams(q)}`,
    api,
  );
  return summarizeHeroes(rows.filter((row) => heroById.has(row?.hero_id)));
}

export function fetchMatchups(
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<CounterRow[]> {
  return fetchRows(
    `/v1/analytics/hero-counter-stats?${analyticsParams(q)}&same_lane_filter=false`,
    api,
  );
}

export function fetchSynergy(
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<SynergyRow[]> {
  return fetchRows(
    `/v1/analytics/hero-synergy-stats?${analyticsParams(q)}&same_lane_filter=false`,
    api,
  );
}

export function fetchAbilityOrder(
  heroId: number,
  q: AnalyticsQuery,
  api: DeadlockApi = deadlockApi,
): Promise<AbilityOrderRow[]> {
  return fetchRows(
    `/v1/analytics/ability-order-stats?hero_id=${heroId}&${analyticsParams(q)}`,
    api,
  );
}

export function fetchItemStats(
  q: AnalyticsQuery,
  extra?: string,
  api: DeadlockApi = deadlockApi,
): Promise<ItemStatsRow[]> {
  return fetchRows(
    `/v1/analytics/item-stats?${analyticsParams(q)}${extra ? `&${extra}` : ""}`,
    api,
  );
}

export function heuristicCounterItems(heroId: number): Item[] {
  return recommend(
    [{ heroId, heroName: heroById.get(heroId)?.name ?? "" }],
    catalog.items,
    99999,
    [],
  ).map((r) => r.item);
}
