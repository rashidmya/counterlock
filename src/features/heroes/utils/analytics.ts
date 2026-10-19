import type { Item, Rank } from "@/shared/catalog/types";
import { itemByClass, itemById } from "@/shared/catalog";

export type Tier = "S" | "A" | "B" | "C" | "D";
export interface AnalyticsQuery {
  minBadge: number;
}

export interface AnalyticsHeroStatsRow {
  hero_id: number;
  wins: number;
  losses: number;
  matches: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
}
export interface CounterRow {
  hero_id: number;
  enemy_hero_id: number;
  wins: number;
  matches_played: number;
}
export interface SynergyRow {
  hero_id1: number;
  hero_id2: number;
  wins: number;
  matches_played: number;
}
export interface AbilityOrderRow {
  abilities: number[];
  wins: number;
  losses: number;
  matches: number;
}
export interface ItemStatsRow {
  item_id: number;
  wins: number;
  losses: number;
  matches: number;
  avg_buy_time_s?: number;
}

export interface HeroSummary {
  heroId: number;
  matches: number;
  wins: number;
  winRate: number;
  pickRate: number;
  kda: number;
  tier: Tier;
  position: number;
}
export interface Matchup {
  heroId: number;
  winRate: number;
  matches: number;
}
export interface ItemPerf {
  itemId: number;
  winRate: number;
  matches: number;
  pickRate?: number;
  delta?: number;
  avgBuyS?: number;
}

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const MATCHES_PER_GAME = 12;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

export function analyticsParams(
  q: AnalyticsQuery,
  now: number = Date.now(),
): string {
  const since = (Math.floor(now / DAY_MS) - WINDOW_DAYS) * DAY_MS;
  const base = `game_mode=normal&match_mode=ranked,unranked&min_unix_timestamp=${since / 1000}`;
  return q.minBadge > 0 ? `${base}&min_average_badge=${q.minBadge}` : base;
}

export function rankFilterOptions(
  ranks: Rank[],
): { value: number; label: string }[] {
  return [
    { value: 0, label: "All ranks" },
    ...ranks
      .filter((rank) => rank.tier >= 1)
      .map((rank) => ({ value: rank.tier * 10 + 1, label: `${rank.name}+` })),
  ];
}

const TIER_CUTOFFS: [number, Tier][] = [
  [0.1, "S"],
  [0.3, "A"],
  [0.6, "B"],
  [0.85, "C"],
];

export function assignTiers(
  winRates: { heroId: number; winRate: number }[],
): Map<number, Tier> {
  const sorted = [...winRates].sort(
    (a, b) => b.winRate - a.winRate || a.heroId - b.heroId,
  );
  return new Map(
    sorted.map((row, index) => {
      const share = index / sorted.length;
      const tier = TIER_CUTOFFS.find(([limit]) => share < limit)?.[1] ?? "D";
      return [row.heroId, tier];
    }),
  );
}

export function summarizeHeroes(rows: AnalyticsHeroStatsRow[]): HeroSummary[] {
  const totals = new Map<
    number,
    {
      wins: number;
      matches: number;
      kills: number;
      deaths: number;
      assists: number;
    }
  >();
  for (const value of rows) {
    const row = record(value);
    if (
      !row ||
      !finite(row.hero_id) ||
      !finite(row.wins) ||
      !finite(row.matches) ||
      !finite(row.total_kills) ||
      !finite(row.total_deaths) ||
      !finite(row.total_assists) ||
      row.matches <= 0
    )
      continue;
    const total = totals.get(row.hero_id) ?? {
      wins: 0,
      matches: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
    };
    total.wins += row.wins;
    total.matches += row.matches;
    total.kills += row.total_kills;
    total.deaths += row.total_deaths;
    total.assists += row.total_assists;
    totals.set(row.hero_id, total);
  }
  const games =
    [...totals.values()].reduce((sum, row) => sum + row.matches, 0) /
    MATCHES_PER_GAME;
  const list = [...totals].map(([heroId, row]) => ({
    heroId,
    matches: row.matches,
    wins: row.wins,
    winRate: row.wins / row.matches,
    pickRate: row.matches / games,
    kda: (row.kills + row.assists) / Math.max(1, row.deaths),
  }));
  const tiers = assignTiers(list);
  return list
    .sort((a, b) => b.winRate - a.winRate || a.heroId - b.heroId)
    .map((row, index) => ({
      ...row,
      tier: tiers.get(row.heroId) ?? "D",
      position: index + 1,
    }));
}

function pairRates(
  rows: unknown[],
  heroId: number,
  partner: (row: Record<string, unknown>) => unknown,
  isMine: (row: Record<string, unknown>) => boolean,
  minMatches: number,
): Matchup[] {
  const list: Matchup[] = [];
  for (const value of rows) {
    const row = record(value);
    const other = row && isMine(row) ? partner(row) : undefined;
    if (
      !row ||
      !finite(other) ||
      !finite(row.wins) ||
      !finite(row.matches_played) ||
      row.matches_played <= 0 ||
      row.matches_played < minMatches
    )
      continue;
    list.push({
      heroId: other,
      winRate: row.wins / row.matches_played,
      matches: row.matches_played,
    });
  }
  return list.filter((row) => row.heroId !== heroId);
}

export function matchups(
  rows: CounterRow[],
  heroId: number,
  minMatches = 200,
  n = 5,
): { strong: Matchup[]; weak: Matchup[] } {
  const list = pairRates(
    rows,
    heroId,
    (row) => row.enemy_hero_id,
    (row) => row.hero_id === heroId,
    minMatches,
  );
  const byRate = (a: Matchup, b: Matchup) =>
    b.winRate - a.winRate || a.heroId - b.heroId;
  return {
    strong: [...list].sort(byRate).slice(0, n),
    weak: [...list].sort((a, b) => byRate(b, a)).slice(0, n),
  };
}

export function bestWith(
  rows: SynergyRow[],
  heroId: number,
  minMatches = 200,
  n = 5,
): Matchup[] {
  const mine = pairRates(
    rows,
    heroId,
    (row) => row.hero_id2,
    (row) => row.hero_id1 === heroId,
    minMatches,
  );
  const theirs = pairRates(
    rows,
    heroId,
    (row) => row.hero_id1,
    (row) => row.hero_id2 === heroId,
    minMatches,
  );
  return [...mine, ...theirs]
    .sort((a, b) => b.winRate - a.winRate || a.heroId - b.heroId)
    .slice(0, n);
}

export function mostCommonOrder(
  rows: AbilityOrderRow[],
): { abilities: number[]; winRate: number; matches: number } | null {
  let best: { abilities: number[]; winRate: number; matches: number } | null =
    null;
  for (const value of rows) {
    const row = record(value);
    if (
      !row ||
      !Array.isArray(row.abilities) ||
      row.abilities.length === 0 ||
      !row.abilities.every(finite) ||
      !finite(row.wins) ||
      !finite(row.matches) ||
      row.matches <= 0
    )
      continue;
    if (!best || row.matches > best.matches)
      best = {
        abilities: row.abilities as number[],
        winRate: row.wins / row.matches,
        matches: row.matches,
      };
  }
  return best;
}

function shopItems(rows: unknown[]): Map<number, ItemPerf> {
  const totals = new Map<
    number,
    { wins: number; matches: number; buy: number; buyMatches: number }
  >();
  for (const value of rows) {
    const row = record(value);
    if (
      !row ||
      !finite(row.item_id) ||
      !itemById.has(row.item_id) ||
      !finite(row.wins) ||
      !finite(row.matches) ||
      row.matches <= 0
    )
      continue;
    const total = totals.get(row.item_id) ?? {
      wins: 0,
      matches: 0,
      buy: 0,
      buyMatches: 0,
    };
    total.wins += row.wins;
    total.matches += row.matches;
    if (finite(row.avg_buy_time_s)) {
      total.buy += row.avg_buy_time_s * row.matches;
      total.buyMatches += row.matches;
    }
    totals.set(row.item_id, total);
  }
  return new Map(
    [...totals].map(([itemId, row]) => [
      itemId,
      {
        itemId,
        winRate: row.wins / row.matches,
        matches: row.matches,
        ...(row.buyMatches > 0 ? { avgBuyS: row.buy / row.buyMatches } : {}),
      },
    ]),
  );
}

export function bestItems(
  rows: ItemStatsRow[],
  heroMatches: number,
  n = 6,
  minShare = 0.05,
): ItemPerf[] {
  if (!finite(heroMatches) || heroMatches <= 0) return [];
  return [...shopItems(rows).values()]
    .map((item) => ({ ...item, pickRate: item.matches / heroMatches }))
    .filter((item) => item.pickRate >= minShare)
    .sort((a, b) => b.winRate - a.winRate || a.itemId - b.itemId)
    .slice(0, n);
}

const overallRate = (items: Map<number, ItemPerf>) => {
  let wins = 0;
  let matches = 0;
  for (const item of items.values()) {
    wins += item.winRate * item.matches;
    matches += item.matches;
  }
  return matches > 0 ? wins / matches : 0;
};

export function counterItems(
  vsRows: ItemStatsRow[],
  baseRows: ItemStatsRow[],
  n = 6,
  minMatches = 500,
): ItemPerf[] {
  const base = shopItems(baseRows);
  const vs = shopItems(vsRows);
  const shift = overallRate(vs) - overallRate(base);
  return [...vs.values()]
    .filter((item) => item.matches >= minMatches)
    .flatMap((item) => {
      const reference = base.get(item.itemId);
      if (!reference) return [];
      const delta = item.winRate - reference.winRate - shift;
      return delta > 0 ? [{ ...item, delta }] : [];
    })
    .sort((a, b) => b.delta - a.delta || a.itemId - b.itemId)
    .slice(0, n);
}

export function itemTable(
  rows: ItemStatsRow[],
  totalPlayerMatches: number,
): Map<number, ItemPerf> {
  const valid = finite(totalPlayerMatches) && totalPlayerMatches > 0;
  return new Map(
    [...shopItems(rows)].map(([id, item]) => [
      id,
      valid ? { ...item, pickRate: item.matches / totalPlayerMatches } : item,
    ]),
  );
}

export function buildsFrom(item: Item): Item[] {
  return (item.components ?? []).flatMap((className) => {
    const part = itemByClass.get(className);
    return part ? [part] : [];
  });
}

export function buildsInto(item: Item): Item[] {
  const { className } = item;
  if (!className) return [];
  return [...itemById.values()].filter((other) =>
    other.components?.includes(className),
  );
}
