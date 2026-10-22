export type MetricId =
  | "souls"
  | "heroDamage"
  | "damageTaken"
  | "objectiveDamage"
  | "healing"
  | "creepKills"
  | "kills"
  | "deaths"
  | "heroHits"
  | "accuracy"
  | "headshots"
  | "assists"
  | "damageMitigated"
  | "creepDamage"
  | "neutralDamage"
  | "denies"
  | "level"
  | "spiritPower"
  | "weaponPower"
  | "maxHealth"
  | "meleeKills"
  | "healingPrevented"
  | "teammateHealing"
  | "permanentBuffs";

export interface Metric {
  id: MetricId;
  label: string;
  // A stat tab; the rest go under "More stats…".
  main: boolean;
  // A level rather than a running total: no per-minute view, and team
  // views average it instead of summing.
  rate: boolean;
  lowerBetter: boolean;
  // Field name in the rank-average curve (without `_avg` / `_std`).
  curve?: string;
}

const metric = (
  id: MetricId,
  label: string,
  options: Partial<Omit<Metric, "id" | "label">> = {},
): Metric => ({
  id,
  label,
  main: false,
  rate: false,
  lowerBetter: false,
  ...options,
});

export const METRICS: Metric[] = [
  metric("souls", "Souls", { main: true, curve: "net_worth" }),
  metric("heroDamage", "Hero damage", { main: true, curve: "player_damage" }),
  metric("damageTaken", "Damage taken", { main: true }),
  metric("objectiveDamage", "Objective damage", {
    main: true,
    curve: "boss_damage",
  }),
  metric("healing", "Healing", { main: true, curve: "player_healing" }),
  metric("creepKills", "Creep kills", { main: true, curve: "creep_kills" }),
  metric("kills", "Kills", { main: true, curve: "kills" }),
  metric("deaths", "Deaths", {
    main: true,
    lowerBetter: true,
    curve: "deaths",
  }),
  metric("heroHits", "Hero hits", { main: true }),
  metric("accuracy", "Accuracy %", { rate: true }),
  metric("headshots", "Headshots"),
  metric("assists", "Assists", { curve: "assists" }),
  metric("damageMitigated", "Damage mitigated"),
  metric("creepDamage", "Creep damage", { curve: "creep_damage" }),
  metric("neutralDamage", "Jungle (neutral) damage", {
    curve: "neutral_damage",
  }),
  metric("denies", "Denies", { curve: "denies" }),
  metric("level", "Level", { rate: true }),
  metric("spiritPower", "Spirit power", { rate: true }),
  metric("weaponPower", "Weapon power", { rate: true }),
  metric("maxHealth", "Max health", { rate: true }),
  metric("meleeKills", "Melee kills"),
  metric("healingPrevented", "Healing prevented"),
  metric("teammateHealing", "Healing to teammates"),
  metric("permanentBuffs", "Permanent buffs", { curve: "permanent_buffs" }),
];

export const metricById = new Map(METRICS.map((m) => [m.id, m]));

// Snapshot fields read as they are.
const FIELDS: Partial<Record<MetricId, string>> = {
  souls: "net_worth",
  heroDamage: "player_damage",
  damageTaken: "player_damage_taken",
  objectiveDamage: "boss_damage",
  healing: "player_healing",
  creepKills: "creep_kills",
  kills: "kills",
  deaths: "deaths",
  heroHits: "hero_bullets_hit",
  assists: "assists",
  damageMitigated: "damage_mitigated",
  creepDamage: "creep_damage",
  neutralDamage: "neutral_damage",
  denies: "denies",
  level: "level",
  spiritPower: "tech_power",
  weaponPower: "weapon_power",
  maxHealth: "max_health",
  meleeKills: "melee_kills",
  healingPrevented: "heal_prevented",
  teammateHealing: "teammate_healing",
};

// Custom stat ids differ between matches; look them up by name.
export const HEADSHOTS_STAT = "Enemy Hero Accuracy##Headshots";

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** One metric's value in one `stats` snapshot. `permanentBuffs` comes from pickups, not snapshots. */
export function snapshotValue(
  id: MetricId,
  stat: Record<string, unknown>,
  headshotsId: number | undefined,
  buffTimes: number[],
): number {
  const field = FIELDS[id];
  if (field) return num(stat[field]);
  if (id === "accuracy") {
    const hit = num(stat.shots_hit);
    const shots = hit + num(stat.shots_missed);
    return shots > 0 ? (hit / shots) * 100 : 0;
  }
  if (id === "headshots") {
    const custom = Array.isArray(stat.custom_user_stats)
      ? (stat.custom_user_stats as Record<string, unknown>[])
      : [];
    return num(custom.find((c) => c?.id === headshotsId)?.value);
  }
  const t = num(stat.time_stamp_s);
  return buffTimes.filter((time) => time <= t).length;
}
