import type { MatchState, Player } from "@/features/match/types";
import type { RankCurve } from "@/features/match-report/utils/rank-curve";
import { averageAt } from "@/features/match-report/utils/rank-curve";
import { metricById } from "@/features/match-report/utils/metrics";
export type MeterMetric = "heroDamage" | "objectiveDamage" | "healing";
export interface MeterRow {
  player: Player;
  value: number | null;
  fraction: number;
  tone: "local" | "ally" | "enemy" | "unknown";
}
export interface CountComparison {
  value: number | null;
  average: number | null;
  delta: number | null;
  favorable: boolean | null;
}
export interface LiveComparison {
  soulsPerMinute: null;
  level: number | null;
  killParticipation: number | null;
  kda: Record<"kills" | "deaths" | "assists", CountComparison>;
}
export function clockSeconds(clock: string): number | null {
  const match = /^(\d{1,4}):([0-5]\d)$/.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
export function uniqueLocalPlayer(players: Player[]): Player | undefined {
  const locals = players.filter((p) => p.local);
  return locals.length === 1 ? locals[0] : undefined;
}
export function meterRows(players: Player[], metric: MeterMetric): MeterRow[] {
  const local = uniqueLocalPlayer(players);
  const knownTeam =
    local && (local.team === 2 || local.team === 3) ? local.team : null;
  const max = Math.max(0, ...players.map((p) => p[metric] ?? 0));
  return players
    .map((player): MeterRow => ({
      player,
      value: player[metric],
      fraction: max > 0 ? (player[metric] ?? 0) / max : 0,
      tone: player.local
        ? "local"
        : knownTeam !== null && (player.team === 2 || player.team === 3)
          ? player.team === knownTeam
            ? "ally"
            : "enemy"
          : "unknown",
    }))
    .sort(
      (a, b) =>
        (b.value ?? -1) - (a.value ?? -1) ||
        a.player.slot.localeCompare(b.player.slot, undefined, {
          numeric: true,
        }),
    );
}
export function localComparison(
  state: MatchState,
  curve: RankCurve | null,
): LiveComparison | null {
  const local = uniqueLocalPlayer(state.players);
  if (!local) return null;
  const t = clockSeconds(state.clock);
  const count = (id: "kills" | "deaths" | "assists"): CountComparison => {
    const value = local[id];
    const average =
      curve && t !== null
        ? (averageAt(curve, metricById.get(id)!, t)?.avg ?? null)
        : null;
    const delta = value !== null && average !== null ? value - average : null;
    return {
      value,
      average,
      delta,
      favorable:
        delta === null || delta === 0
          ? null
          : id === "deaths"
            ? delta < 0
            : delta > 0,
    };
  };
  const team = state.players.filter((p) => p.team === local.team);
  const full =
    (local.team === 2 || local.team === 3) &&
    team.length === (state.gameMode === "street_brawl" ? 4 : 6) &&
    team.every((p) => p.kills !== null);
  const teamKills = team.reduce((sum, p) => sum + (p.kills ?? 0), 0);
  const participation =
    full && teamKills > 0 && local.kills !== null && local.assists !== null
      ? Math.min(1, (local.kills + local.assists) / teamKills)
      : null;
  return {
    soulsPerMinute: null,
    level: local.level,
    killParticipation: participation,
    kda: {
      kills: count("kills"),
      deaths: count("deaths"),
      assists: count("assists"),
    },
  };
}
