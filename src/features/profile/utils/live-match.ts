import type { Team } from "@/features/match-report/utils/report";

export interface LivePlayer {
  accountId: number;
  heroId: number;
  team: Team;
}
// Each null where the API gave none.
export interface LiveTeam {
  netWorth: number | null;
  // The team's objectives mask.
  objectives: number | null;
  // Street Brawl rounds won.
  rounds: number | null;
}
export interface LiveMatch {
  matchId: number;
  // Unix seconds.
  startTime: number;
  // The API's own; it has always been null so far.
  durationS: number | null;
  gameMode: number;
  matchMode: number;
  players: LivePlayer[];
  teams: Record<Team, LiveTeam>;
}
export interface Standing {
  guardians: number;
  walkers: number;
  baseGuardians: number;
  shrines: number;
  patron: "standing" | "weakened" | "destroyed";
}

type Row = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isTeam = (value: unknown): value is Team => value === 0 || value === 1;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === "object")
    : [];

/**
 * The live match `accountId` plays in, from `GET /v1/matches/active`, or
 * null when the list has none.
 */
export function parseLiveMatch(
  data: unknown,
  accountId: number,
): LiveMatch | null {
  for (const match of rows(data)) {
    const players = rows(match.players).flatMap((p) =>
      isNumber(p.account_id) && isNumber(p.hero_id) && isTeam(p.team)
        ? [{ accountId: p.account_id, heroId: p.hero_id, team: p.team }]
        : [],
    );
    if (
      !isNumber(match.match_id) ||
      !isNumber(match.start_time) ||
      !players.some((p) => p.accountId === accountId)
    )
      continue;
    // The team's stats, or else the match's own fields for them.
    const team = (id: Team): LiveTeam => {
      const stats = rows(match.team_stats).find((t) => t.team === id);
      const first = (...values: unknown[]) => values.find(isNumber) ?? null;
      return {
        netWorth: first(stats?.net_worth, match[`net_worth_team_${id}`]),
        objectives: first(
          stats?.objectives_mask,
          match[`objectives_mask_team${id}`],
        ),
        rounds: first(stats?.brawl_score),
      };
    };
    return {
      matchId: match.match_id,
      startTime: match.start_time,
      durationS: isNumber(match.duration_s) ? match.duration_s : null,
      gameMode: isNumber(match.game_mode) ? match.game_mode : 0,
      matchMode: isNumber(match.match_mode) ? match.match_mode : 0,
      players,
      teams: { 0: team(0), 1: team(1) },
    };
  }
  return null;
}

// A team's objectives mask has a bit per objective, set while it stands, as
// numbered in the game's ECitadelObjective: 0 the Patron's last phase
// ("Core"), 1–4 the Guardians and 5–8 the Walkers of lanes 1–4, 9 the
// Patron ("Titan"), 10–11 the Shrines and 12–15 the Base Guardians of lanes
// 1–4. The map has lanes 1, 3 and 4: lane 2's bits never clear.
const LANES = [1, 3, 4];

/** What still stands of a team's objectives. */
export function standing(mask: number): Standing {
  const up = (bit: number) => ((mask >> bit) & 1) === 1;
  const lanes = (first: number) =>
    LANES.filter((lane) => up(first + lane - 1)).length;
  return {
    guardians: lanes(1),
    walkers: lanes(5),
    baseGuardians: lanes(12),
    shrines: [10, 11].filter(up).length,
    patron: !up(0) ? "destroyed" : up(9) ? "standing" : "weakened",
  };
}

/** Seconds played: the API's duration, or else since the match started. */
export const elapsedS = (match: LiveMatch, nowMs: number) =>
  match.durationS ?? Math.max(0, Math.floor(nowMs / 1000) - match.startTime);

/** The team ahead on souls and by how many; null when even. */
export function soulLead(amber: number, sapphire: number) {
  const lead = amber - sapphire;
  if (!lead) return null;
  return { team: (lead > 0 ? 0 : 1) as Team, souls: Math.abs(lead) };
}
