import type { OverlayWindowName } from "@/features/overlay/panels";

export const kGameClassIds = [24482];
export const kGamesFeatures = ["game_info", "match_info"];
export const kWindowNames = {
  background: "background",
  desktop: "desktop",
  heroDamage: "hero_damage",
  objectiveDamage: "objective_damage",
  healing: "healing",
  youVsAverage: "you_vs_average",
  spawnTimers: "spawn_timers",
} as const;
export const kHotkeys = { toggle: "toggle_counterlock" };
export type ForegroundWindowName =
  OverlayWindowName | typeof kWindowNames.desktop;
