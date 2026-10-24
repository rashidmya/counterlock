export const kGameClassIds = [24482];
export const kGamesFeatures = ["game_info", "match_info"];
export const kWindowNames = {
  background: "background",
  desktop: "desktop",
  inGame: "in_game",
  counters: "counter_overlay",
  heroDamage: "hero_damage",
  objectiveDamage: "objective_damage",
  healing: "healing",
  youVsAverage: "you_vs_average",
  spawnTimers: "spawn_timers",
} as const;
export const kHotkeys = { toggle: "toggle_counterlock" };
export type ForegroundWindowName =
  | OverlayWindowName
  | typeof kWindowNames.desktop
  | typeof kWindowNames.inGame
  | typeof kWindowNames.counters;
import type { OverlayWindowName } from "@/features/overlay/panels";
