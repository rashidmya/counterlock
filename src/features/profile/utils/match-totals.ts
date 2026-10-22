// Each player's final totals in a match, read from bulk match metadata
// (`GET /v1/matches/metadata`). It returns every stat as its snapshots over
// the match (`stats_player_damage: [...]`); the last one is the final total.

export interface PlayerTotals {
  accountId: number;
  // 0 or 1, as in match history's `player_team`.
  team: number;
  kills: number;
  assists: number;
  heroDamage: number;
  objectiveDamage: number;
  healing: number;
  creepKills: number;
}

// Matches per bulk request.
export const TOTALS_BATCH = 50;

const STATS = {
  heroDamage: "player_damage",
  objectiveDamage: "boss_damage",
  healing: "player_healing",
  creepKills: "creep_kills",
} as const;

export const totalsPath = (matchIds: number[]) =>
  `/v1/matches/metadata?match_ids=${matchIds.join(",")}` +
  `&include_player_kda=true&extra_player_columns=${Object.values(STATS)
    .map((field) => `stats.${field}`)
    .join(",")}&limit=${matchIds.length}`;

type Row = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) => (isNumber(value) ? value : 0);
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === "object")
    : [];

// Bulk metadata names the teams "Team0" and "Team1".
const parseTeam = (value: unknown) =>
  value === "Team0" || value === 0
    ? 0
    : value === "Team1" || value === 1
      ? 1
      : null;

const final = (player: Row, field: string) => {
  const series = player[`stats_${field}`];
  const last = Array.isArray(series) ? series.at(-1) : undefined;
  return isNumber(last) ? last : null;
};

function parsePlayer(player: Row): PlayerTotals | null {
  const team = parseTeam(player.team);
  if (!isNumber(player.account_id) || team === null) return null;
  const heroDamage = final(player, STATS.heroDamage);
  const objectiveDamage = final(player, STATS.objectiveDamage);
  const healing = final(player, STATS.healing);
  const creepKills = final(player, STATS.creepKills);
  // A player without snapshots has no totals to show.
  if (
    heroDamage === null ||
    objectiveDamage === null ||
    healing === null ||
    creepKills === null
  )
    return null;
  return {
    accountId: player.account_id,
    team,
    kills: count(player.kills),
    assists: count(player.assists),
    heroDamage,
    objectiveDamage,
    healing,
    creepKills,
  };
}

/**
 * Players' totals by match id. A match with a player that can't be read is
 * left out, as if not stored yet: its team totals would be wrong.
 */
export function parseMatchTotals(data: unknown): Map<number, PlayerTotals[]> {
  const matches = new Map<number, PlayerTotals[]>();
  for (const match of rows(data)) {
    if (!isNumber(match.match_id)) continue;
    const players = rows(match.players).map(parsePlayer);
    if (players.length && players.every((p): p is PlayerTotals => !!p))
      matches.set(match.match_id, players);
  }
  return matches;
}
