import { useEffect, useMemo, useState } from "react";
import { catalog } from "@/shared/catalog";
import { splitTeams } from "@/features/match/utils/game";
import type { MatchState } from "@/features/match/types";
import type { Threat } from "../types";
import { recommend, heroThreats } from "../utils/recommendations";

export function useCounters(state: MatchState) {
  const [selected, setSelected] = useState<string | null>(null);
  const [budget, setBudget] = useState(6400);
  const [manual, setManual] = useState<Threat[]>([]);
  const teams = splitTeams(state.players);
  const selectedPlayer = teams.enemies.find((p) => p.slot === selected);
  const targets = selectedPlayer ? [selectedPlayer] : teams.enemies;
  const owned = state.players.find((p) => p.local)?.items ?? [];
  const recommendations = useMemo(
    () => recommend(targets, catalog.items, budget, owned, manual),
    [targets, budget, owned, manual],
  );
  const unknownProfiles = targets.filter((p) => !heroThreats[p.heroId]);
  useEffect(() => {
    setSelected(null);
    setManual([]);
  }, [state.matchId]);
  useEffect(() => {
    setManual([]);
  }, [selectedPlayer?.slot]);
  return {
    teams,
    selected,
    setSelected,
    selectedPlayer,
    targets,
    budget,
    setBudget,
    manual,
    setManual,
    recommendations,
    unknownProfiles,
  };
}
