import type { MatchState } from "../../src/features/match/types";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { matchPlayers } from "./helpers";

export function overlayState(): MatchState {
  const ids = [7, 11, 31, 1, 20, 50, 6, 13, 3, 2, 19, 15];
  const players = ids.map((heroId, i) => ({
    ...matchPlayers()[0],
    slot: `roster_${i}`,
    heroId,
    heroName: catalog.heroes.find((h) => h.id === heroId)!.name,
    name: i === 0 ? "You" : `Player ${i + 1}`,
    local: i === 0,
    team: i < 6 ? 2 : 3,
    accountId: 100 + i,
    kills: [3, 2, 5, 4, 1, 2, 4, 6, 2, 3, 3, 1][i],
    deaths: 2,
    assists: 5,
    heroDamage: (12 - i) * 1000,
    objectiveDamage: i * 250,
    healing: i % 3 === 0 ? i * 400 : 0,
  }));
  return {
    mode: "live",
    status: "Connected",
    phase: "GameInProgress",
    matchId: "42",
    gameMode: "normal",
    localAccountId: 100,
    clock: "12:34",
    paused: false,
    players,
    stats: Object.fromEntries(
      players.map((p) => [
        p.accountId,
        {
          fetchedAt: 1,
          rank: { account_id: p.accountId, rank: 8, subrank: 1, badge: 81 },
        },
      ]),
    ),
    error: null,
    loading: false,
  };
}
