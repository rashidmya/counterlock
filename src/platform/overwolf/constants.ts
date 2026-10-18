export const kGameClassIds = [24482];
export const kGamesFeatures = ["game_info", "match_info"];
export const kWindowNames = {
  background: "background",
  desktop: "desktop",
  inGame: "in_game",
  counters: "counter_overlay",
} as const;
export const kHotkeys = { toggle: "toggle_counterlock" };
export type ForegroundWindowName =
  | typeof kWindowNames.desktop
  | typeof kWindowNames.inGame
  | typeof kWindowNames.counters;
