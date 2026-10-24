import type { MatchState } from "@/features/match/types";
import { clockSeconds } from "./meters";
export const SPAWN_RULES = [
  {
    id: "soul-urn",
    label: "Soul Urn",
    firstS: 600,
    intervalS: 300,
    source:
      "https://store.steampowered.com/news/app/1422450/view/688635449342692003",
    checkedOn: "2026-10-24",
  },
] as const;
export function scheduledSpawns(
  state: MatchState,
): { id: string; label: string; atS: number; remainingS: number }[] {
  const t = clockSeconds(state.clock);
  if (
    t === null ||
    state.gameMode !== "normal" ||
    state.phase !== "GameInProgress"
  )
    return [];
  return SPAWN_RULES.map((rule) => {
    const atS =
      rule.firstS +
      Math.max(0, Math.ceil((t - rule.firstS) / rule.intervalS)) *
        rule.intervalS;
    return { id: rule.id, label: rule.label, atS, remainingS: atS - t };
  });
}
