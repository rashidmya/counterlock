// Synthetic bulk match metadata (`GET /v1/matches/metadata`) for the
// Performance tab tests (unit, desktop and website). Relative imports only:
// Playwright loads this file too.

export interface OwnTotals {
  kills: number;
  assists: number;
  heroDamage: number;
  objectiveDamage: number;
  healing: number;
  creepKills: number;
}

// The account's totals unless a test says otherwise. With five teammates at
// 4 kills and 15,000 hero damage each, kill participation is 17 / 30 and the
// damage share 30,000 / 105,000.
export const OWN: OwnTotals = {
  kills: 10,
  assists: 7,
  heroDamage: 30000,
  objectiveDamage: 6000,
  healing: 4000,
  creepKills: 90,
};
const OTHER: OwnTotals = {
  kills: 4,
  assists: 6,
  heroDamage: 15000,
  objectiveDamage: 3000,
  healing: 2000,
  creepKills: 60,
};

// Snapshots run up to the final total, which is the last value.
const player = (accountId: number, slot: number, totals: OwnTotals) => ({
  account_id: accountId,
  hero_id: 1,
  player_slot: slot,
  team: slot <= 6 ? "Team0" : "Team1",
  kills: totals.kills,
  deaths: 5,
  assists: totals.assists,
  stats_player_damage: [totals.heroDamage / 2, totals.heroDamage],
  stats_boss_damage: [0, totals.objectiveDamage],
  stats_player_healing: [totals.healing / 2, totals.healing],
  stats_creep_kills: [totals.creepKills / 2, totals.creepKills],
});

/** One match: the account on Team0 (slot 1), five teammates and six enemies. */
export function bulkMatch(
  matchId: number,
  accountId: number,
  own: Partial<OwnTotals> = {},
) {
  return {
    match_id: matchId,
    duration_s: 1800,
    players: [
      player(accountId, 1, { ...OWN, ...own }),
      ...Array.from({ length: 11 }, (_, index) =>
        player(9000 + index, index + 2, OTHER),
      ),
    ],
  };
}

/** A bulk response for the `match_ids` a request URL asks for. */
export function bulkMetadata(url: URL, accountId: number) {
  return (url.searchParams.get("match_ids") ?? "")
    .split(",")
    .filter(Boolean)
    .map((id) => bulkMatch(Number(id), accountId));
}
