import { useState } from "react";
import { heroById } from "@/shared/catalog";
import { accountId, initialState } from "@/features/match/utils/game";
import { StatsClient } from "@/features/player-stats/services/StatsClient";
import type { MatchState } from "@/features/match/types";

const lookupClient = new StatsClient();
export function usePlayerLookup() {
  const [lookupId, setLookupId] = useState("");
  const [lookupHero, setLookupHero] = useState(7);
  const [lookup, setLookup] = useState<MatchState | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  async function findPlayer(event: React.FormEvent) {
    event.preventDefault();
    const id = accountId(lookupId);
    if (!id) {
      setLookupError(
        "Enter a valid SteamID64, account ID, or [U:1:account] ID.",
      );
      return;
    }
    setLookupBusy(true);
    setLookupError("");
    setLookup(null);
    try {
      const stats = await lookupClient.load([id], "normal");
      const hero = heroById.get(lookupHero)!;
      setLookup({
        ...initialState(),
        stats,
        players: [
          {
            slot: "lookup",
            name: `Account ${id}`,
            heroId: lookupHero,
            heroName: hero.name,
            team: 2,
            local: false,
            accountId: id,
            kills: 0,
            deaths: 0,
            assists: 0,
            items: [],
          },
        ],
      });
      if (stats[id].heroError || stats[id].rankError)
        setLookupError(
          [stats[id].heroError, stats[id].rankError].filter(Boolean).join(" "),
        );
    } catch {
      setLookupError(
        "Unable to retrieve player statistics. Please try again later.",
      );
    } finally {
      setLookupBusy(false);
    }
  }
  return {
    lookupId,
    setLookupId,
    lookupHero,
    setLookupHero,
    lookup,
    lookupError,
    lookupBusy,
    findPlayer,
  };
}
