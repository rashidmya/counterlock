import { itemById } from "@/shared/catalog";
import {
  buildsFrom,
  shopItems,
  type ItemPerf,
  type ItemStatsRow,
} from "@/features/heroes/utils/analytics";

export type PhaseKey = "early" | "mid" | "late";
export interface Phase {
  key: PhaseKey;
  label: string;
  range: string;
  fromS: number;
  toS?: number;
}
export interface MainBuildPhase extends Phase {
  items: ItemPerf[];
}

export const PHASE_SIZE = 8;
export const MIN_SHARE_OF_TOP = 0.05;
export const PHASES: readonly Phase[] = [
  { key: "early", label: "Early", range: "0–10 min", fromS: 0, toS: 600 },
  { key: "mid", label: "Mid", range: "10–20 min", fromS: 600, toS: 1200 },
  { key: "late", label: "Late", range: "20+ min", fromS: 1200 },
];

export const phaseParams = ({ fromS, toS }: Phase) =>
  `min_bought_at_s=${fromS}${toS === undefined ? "" : `&max_bought_at_s=${toS}`}`;

// Every item that goes into building this one, through any depth of upgrades.
const partsOf = (itemId: number): number[] => {
  const item = itemById.get(itemId);
  return item
    ? buildsFrom(item).flatMap((part) => [part.id, ...partsOf(part.id)])
    : [];
};

function pickPhase(rows: ItemStatsRow[], listed: Set<number>): ItemPerf[] {
  const ranked = [...shopItems(rows).values()].sort(
    (a, b) => b.matches - a.matches || a.itemId - b.itemId,
  );
  const floor = (ranked[0]?.matches ?? 0) * MIN_SHARE_OF_TOP;
  let picked: ItemPerf[] = [];
  for (const row of ranked) {
    if (picked.length === PHASE_SIZE || row.matches < floor) break;
    if (listed.has(row.itemId)) continue;
    // Keep the upgrade, never the item next to the upgrade it builds into.
    if (picked.some((other) => partsOf(other.itemId).includes(row.itemId)))
      continue;
    const parts = partsOf(row.itemId);
    picked = [...picked.filter((other) => !parts.includes(other.itemId)), row];
  }
  return picked.sort(
    (a, b) =>
      (a.avgBuyS ?? Infinity) - (b.avgBuyS ?? Infinity) || a.itemId - b.itemId,
  );
}

export function mainBuild(rowsByPhase: ItemStatsRow[][]): MainBuildPhase[] {
  const listed = new Set<number>();
  return PHASES.map((phase, index) => {
    const items = pickPhase(rowsByPhase[index] ?? [], listed);
    items.forEach((item) =>
      [item.itemId, ...partsOf(item.itemId)].forEach((id) => listed.add(id)),
    );
    return { ...phase, items };
  });
}

export function buildPhase(clock: string): PhaseKey | null {
  const match = /^(\d+):([0-5]\d)$/.exec(clock);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isSafeInteger(seconds)) return null;
  return seconds < 600 ? "early" : seconds < 1200 ? "mid" : "late";
}
