import { itemById } from "@/shared/catalog";
import {
  HEADSHOTS_STAT,
  METRICS,
  snapshotValue,
  type MetricId,
} from "./metrics";

export type Team = 0 | 1;
// API team 0 is the game's team 2 ("Amber" in MatchOverview), team 1 is 3.
export const TEAM_NAMES: Record<Team, string> = { 0: "Amber", 1: "Sapphire" };
export const NORMAL_MODE = 1;
export const STREET_BRAWL_MODE = 4;

export interface ReportPlayer {
  accountId: number;
  slot: number;
  team: Team;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  // Rank badge at match start (tier × 10 + subrank); 0 when unknown.
  badge: number;
  // Snapshot times in seconds, ascending; values has one entry per time.
  times: number[];
  values: Record<MetricId, number[]>;
  deathTimes: number[];
  purchases: { timeS: number; itemId: number }[];
  // Permanent buff pickup times; empty before the game recorded them (2026-09-29).
  buffTimes: number[];
  // Permanent buffs picked up (each entry's `value`); null when the match
  // has no buff data at all.
  buffCount: number | null;
}

export interface MatchReport {
  matchId: number;
  startTime: number;
  durationS: number;
  gameMode: number;
  winningTeam: Team;
  // Amber first, then by player slot.
  players: ReportPlayer[];
  // `team` owns the objective that was destroyed.
  objectives: { timeS: number; team: Team }[];
  // `team` claimed the Mid Boss.
  midBoss: { timeS: number; team: Team }[];
  // Whether the game recorded buff pickup times; without them the graph has
  // no Permanent buffs line.
  buffsTimed: boolean;
}

type Row = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const num = (value: unknown) => (isNumber(value) ? value : 0);
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === "object")
    : [];
const isTeam = (value: unknown): value is Team => value === 0 || value === 1;

// Running totals the game's final scoreboard also records.
const FINAL_FIELDS: [MetricId, string][] = [
  ["kills", "kills"],
  ["deaths", "deaths"],
  ["assists", "assists"],
  ["souls", "net_worth"],
];

function parsePlayer(
  p: Row,
  index: number,
  headshotsId: number | undefined,
  durationS: number,
): ReportPlayer {
  const permanent = rows(p.power_up_buffs).filter(
    (buff) => buff.is_permanent === true,
  );
  const pickupTimes = (buff: Row) =>
    Array.isArray(buff.pickup_times_s)
      ? buff.pickup_times_s.filter(isNumber)
      : [];
  const buffTimes = permanent.flatMap(pickupTimes).sort((a, b) => a - b);
  const buffCount = Array.isArray(p.power_up_buffs)
    ? permanent.reduce(
        (sum, buff) =>
          sum + (isNumber(buff.value) ? buff.value : pickupTimes(buff).length),
        0,
      )
    : null;
  const stats = rows(p.stats)
    .filter((stat) => isNumber(stat.time_stamp_s) && stat.time_stamp_s > 0)
    .sort((a, b) => num(a.time_stamp_s) - num(b.time_stamp_s))
    .filter(
      (stat, i, all) =>
        i === 0 || stat.time_stamp_s !== all[i - 1].time_stamp_s,
    );
  const values = Object.fromEntries(
    METRICS.map((m) => [
      m.id,
      stats.map((stat) => snapshotValue(m.id, stat, headshotsId, buffTimes)),
    ]),
  ) as Record<MetricId, number[]>;
  // The snapshot at the match end can be one off the game's own scoreboard,
  // which the banner and scoreboard show: use the scoreboard's numbers, and
  // never let a running count above them.
  if (durationS > 0 && num(stats.at(-1)?.time_stamp_s) >= durationS)
    for (const [id, field] of FINAL_FIELDS) {
      const final = p[field];
      if (!isNumber(final)) continue;
      const series = values[id];
      series[series.length - 1] = final;
      if (id !== "souls")
        values[id] = series.map((value) => Math.min(value, final));
    }
  const rank = p.player_rank_data as Row | undefined;
  return {
    accountId: num(p.account_id),
    slot: isNumber(p.player_slot) ? p.player_slot : index + 1,
    team: p.team as Team,
    heroId: num(p.hero_id),
    kills: num(p.kills),
    deaths: num(p.deaths),
    assists: num(p.assists),
    netWorth: num(p.net_worth),
    lastHits: num(p.last_hits),
    denies: num(p.denies),
    badge: num(rank?.initial_display_rank),
    times: stats.map((stat) => num(stat.time_stamp_s)),
    values,
    deathTimes: rows(p.death_details)
      .map((death) => death.game_time_s)
      .filter(isNumber)
      .sort((a, b) => a - b),
    purchases: rows(p.items)
      .filter(
        (item) =>
          isNumber(item.item_id) &&
          isNumber(item.game_time_s) &&
          itemById.has(item.item_id),
      )
      .map((item) => ({
        timeS: num(item.game_time_s),
        itemId: num(item.item_id),
      }))
      .sort((a, b) => a.timeS - b.timeS),
    buffTimes,
    buffCount,
  };
}

/** Throws "Match details unavailable." when the metadata has no usable match. */
export function parseMatchReport(data: unknown, matchId: number): MatchReport {
  const info = (data as { match_info?: Row } | null)?.match_info;
  if (!info || !isTeam(info.winning_team))
    throw new Error("Match details unavailable.");
  const headshotsId = rows(info.custom_user_stats).find(
    (stat) => stat.name === HEADSHOTS_STAT,
  )?.id;
  const players = rows(info.players)
    .filter((p) => isTeam(p.team) && isNumber(p.hero_id))
    .map((p, index) =>
      parsePlayer(
        p,
        index,
        isNumber(headshotsId) ? headshotsId : undefined,
        num(info.duration_s),
      ),
    )
    .sort((a, b) => a.team - b.team || a.slot - b.slot);
  if (!players.length) throw new Error("Match details unavailable.");
  return {
    matchId: isNumber(info.match_id) ? info.match_id : matchId,
    startTime: num(info.start_time),
    durationS: num(info.duration_s),
    gameMode: num(info.game_mode),
    winningTeam: info.winning_team,
    players,
    buffsTimed: players.some((p) => p.buffTimes.length > 0),
    objectives: rows(info.objectives)
      .filter(
        (o) =>
          isTeam(o.team) &&
          isNumber(o.destroyed_time_s) &&
          o.destroyed_time_s > 0,
      )
      .map((o) => ({ timeS: num(o.destroyed_time_s), team: o.team as Team }))
      .sort((a, b) => a.timeS - b.timeS),
    midBoss: rows(info.mid_boss)
      .filter(
        (b) =>
          isTeam(b.team_claimed) &&
          isNumber(b.destroyed_time_s) &&
          b.destroyed_time_s > 0,
      )
      .map((b) => ({
        timeS: num(b.destroyed_time_s),
        team: b.team_claimed as Team,
      }))
      .sort((a, b) => a.timeS - b.timeS),
  };
}

/** A metric's value at the last snapshot (end of the match). */
export const finalValue = (player: ReportPlayer, id: MetricId) =>
  player.values[id].at(-1) ?? 0;

export const teamOf = (report: MatchReport, team: Team) =>
  report.players.filter((p) => p.team === team);
