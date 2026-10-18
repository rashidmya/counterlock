import { initialState } from "@/features/match/utils/game";
import type { CounterlockStore } from "@/features/match/types";

export const inOverwolf = typeof overwolf !== "undefined";
export const waiting = {
  ...initialState(),
  status: "Browser preview — live events need Overwolf",
};
const fallback: CounterlockStore = {
  getSnapshot: () => initial,
  subscribe: () => () => {},
  refresh: () => {},
};
const initial = initialState();
export const bridge = inOverwolf
  ? (overwolf.windows.getMainWindow().counterlockStore ?? fallback)
  : fallback;
