import { metricById, type MetricId } from "./metrics";
import { averageAt, type RankCurve } from "./rank-curve";
import { finalValue, type ReportPlayer } from "./report";

export interface Verdict {
  label: string;
  value: number;
  // value ÷ rank average − 1; null when there is no average to compare with.
  change: number | null;
}

const average = (curve: RankCurve | null, id: MetricId, durationS: number) =>
  curve
    ? (averageAt(curve, metricById.get(id)!, durationS)?.avg ?? null)
    : null;

const change = (value: number, avg: number | null) =>
  avg && avg > 0 ? value / avg - 1 : null;

/** Souls / min, hero damage and creep kills at the end of the match, against the rank average then. */
export function verdicts(
  player: ReportPlayer,
  durationS: number,
  curve: RankCurve | null,
): Verdict[] {
  const minutes = durationS / 60;
  const soulsAvg = average(curve, "souls", durationS);
  const souls = minutes > 0 ? player.netWorth / minutes : 0;
  const damage = finalValue(player, "heroDamage");
  const creeps = finalValue(player, "creepKills");
  return [
    {
      label: "Souls / min",
      value: Math.round(souls),
      change: change(souls, soulsAvg === null ? null : soulsAvg / minutes),
    },
    {
      label: "Hero damage",
      value: damage,
      change: change(damage, average(curve, "heroDamage", durationS)),
    },
    {
      label: "Creep kills",
      value: creeps,
      change: change(creeps, average(curve, "creepKills", durationS)),
    },
  ];
}

/** Permanent buffs picked up, and the rank average at the same match length. */
export function buffs(
  player: ReportPlayer,
  durationS: number,
  curve: RankCurve | null,
) {
  return {
    count: player.buffCount,
    average: average(curve, "permanentBuffs", durationS),
  };
}

export interface ImpactRow {
  label: string;
  share: number;
  value: number;
}

/** The player's share of their team's totals, and their kill participation. */
export function impact(player: ReportPlayer, players: ReportPlayer[]) {
  const team = players.filter((p) => p.team === player.team);
  const share = (id: MetricId, label: string): ImpactRow => {
    const value = finalValue(player, id);
    const total = team.reduce((sum, p) => sum + finalValue(p, id), 0);
    return { label, value, share: total > 0 ? value / total : 0 };
  };
  const teamKills = team.reduce((sum, p) => sum + p.kills, 0);
  return {
    rows: [
      share("heroDamage", "Hero damage"),
      share("objectiveDamage", "Objective damage"),
      share("healing", "Healing"),
    ],
    killParticipation: {
      share:
        teamKills > 0
          ? Math.min(1, (player.kills + player.assists) / teamKills)
          : 0,
      involved: player.kills + player.assists,
      teamKills,
    },
  };
}
