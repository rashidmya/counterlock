import type { Hero, Item, PopularItem } from "./types";

export interface BuildStage {
  key: "early_game" | "mid_game" | "late_game";
  title: string;
  timeRange: string;
  items: {
    item: Item;
    pickRate: number;
    owned: boolean;
    sourcePhase: BuildStage["key"];
  }[];
}

export function buildPhase(clock: string): BuildStage["key"] | null {
  const match = /^(\d+):([0-5]\d)$/.exec(clock);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isSafeInteger(seconds)) return null;
  return seconds < 600
    ? "early_game"
    : seconds < 1200
      ? "mid_game"
      : "late_game";
}

export function recommendedBuild(
  hero: Hero | undefined,
  items: Item[],
  owned: number[] = [],
): BuildStage[] {
  const available = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<number>();
  const phases = [
    {
      key: "early_game",
      title: "Early game",
      timeRange: "0–10 min",
      min: 0,
      max: 1600,
    },
    {
      key: "mid_game",
      title: "Mid game",
      timeRange: "10–20 min",
      min: 1600,
      max: 3200,
    },
    {
      key: "late_game",
      title: "Late game",
      timeRange: "20+ min",
      min: 3200,
      max: Infinity,
    },
  ] as const;
  return phases.map(({ key, title, timeRange, min, max }) => {
    const eligible = (sourcePhase: BuildStage["key"]) =>
      (hero?.popularItems?.[sourcePhase] ?? [])
        .filter((row: PopularItem) => {
          const item = available.get(row.item_id);
          return (
            item &&
            item.cost > 0 &&
            item.cost >= min &&
            item.cost <= max &&
            !seen.has(item.id) &&
            Number.isFinite(row.pick_pct) &&
            row.pick_pct > 0 &&
            row.pick_pct <= 100
          );
        })
        .slice()
        .sort((a, b) => b.pick_pct - a.pick_pct || a.item_id - b.item_id)
        .map((row) => ({ ...row, sourcePhase }));
    // Fill sparse phases only with affordable picks recorded for this same hero.
    // Preserve their source phase so the UI can label these as flex options.
    const picks = [
      ...eligible(key),
      ...phases
        .filter((phase) => phase.key !== key)
        .flatMap((phase) => eligible(phase.key)),
    ];
    const selected: BuildStage["items"] = [];
    for (const row of picks) {
      if (seen.has(row.item_id)) continue;
      const item = available.get(row.item_id)!;
      seen.add(item.id);
      selected.push({
        item,
        pickRate: row.pick_pct,
        owned: owned.includes(item.id),
        sourcePhase: row.sourcePhase,
      });
      if (selected.length === 8) break;
    }
    return { key, title, timeRange, items: selected };
  });
}
