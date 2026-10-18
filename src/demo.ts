import catalog from "./data/catalog.json";
import { initialState } from "./game";
import type { MatchState } from "./types";

export function demoState(): MatchState {
  const ids = [7, 11, 31, 1, 20, 50, 6, 13, 3, 2, 19, 15];
  const names = [
    "You",
    "Moonlighter",
    "Third Rail",
    "Slow Burn",
    "Garden Ghost",
    "Night Porter",
    "Ironbound",
    "Velvet Knife",
    "High Society",
    "Static Hour",
    "Red Letter",
    "Brass Knuckle",
  ];
  const games = [128, 64, 207, 92, 34, 78, 184, 256, 117, 49, 156, 83];
  const wins = [73, 35, 119, 47, 20, 41, 106, 154, 68, 24, 87, 42];
  const state = initialState("demo");
  state.status = "Demo match";
  state.phase = "GameInProgress";
  state.clock = "12:48";
  state.players = ids.map((id, i) => ({
    slot: `roster_${i}`,
    heroId: id,
    heroName: catalog.heroes.find((h) => h.id === id)!.name,
    name: names[i],
    team: i < 6 ? 2 : 3,
    local: i === 0,
    accountId: i === 10 ? null : 100 + i,
    kills: [3, 2, 5, 4, 1, 2, 4, 6, 2, 3, 3, 1][i],
    deaths: [2, 3, 2, 3, 2, 4, 3, 1, 3, 4, 3, 3][i],
    assists: [5, 9, 3, 7, 11, 4, 5, 2, 6, 8, 4, 7][i],
    items: [],
  }));
  for (const [i, p] of state.players.entries())
    if (p.accountId) {
      const rank = [8, 7, 9, 8, 7, 8, 9, 10, 8, 7, 8, 8][i];
      state.stats[p.accountId] = {
        fetchedAt: Date.now(),
        heroes: [
          {
            account_id: p.accountId,
            hero_id: p.heroId,
            matches_played: games[i],
            wins: wins[i],
            last_played: 0,
          },
        ],
        rank: {
          account_id: p.accountId,
          rank,
          subrank: (i % 6) + 1,
          badge: rank * 10 + (i % 6) + 1,
        },
      };
    }
  return state;
}
