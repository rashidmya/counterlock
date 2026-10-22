// Synthetic match metadata and rank-average curve for the match report
// tests (unit, desktop and website). Relative imports only: Playwright
// loads this file too.
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

export const MATCH_ID = 1001;
export const DURATION_S = 1800;
export const TIMES = [180, 360, 540, 720, 900, 1200, 1500, 1800];
export const BADGE = 73; // Emissary 3
export const HEADSHOTS_ID = 7;
export const heroes = catalog.heroes.slice(0, 12);
export const bigItem = catalog.items.find((item) => item.cost >= 3200)!;
export const smallItem = catalog.items.find(
  (item) => item.cost > 0 && item.cost < 3200,
)!;

// The first player ("lead") is measured against the curve below:
// souls run 0.9–1.2× the average, ending at 1.08× (32,400 souls).
export const LEAD_SOULS_SHARE = [0.9, 0.95, 1.05, 1.1, 1.2, 1.1, 1.0, 1.08];
export const LEAD_DEATHS = [400, 1300, 1400, 1500];

const perMinute = (rate: number) => (t: number) => Math.round((rate * t) / 60);

function stats(index: number) {
  const souls =
    index === 0
      ? (t: number) =>
          Math.round(((1000 * t) / 60) * LEAD_SOULS_SHARE[TIMES.indexOf(t)])
      : perMinute(900 + 32 * index);
  const deaths = index === 0 ? LEAD_DEATHS : [600 + 60 * index];
  return TIMES.map((t) => ({
    time_stamp_s: t,
    net_worth: souls(t),
    player_damage: perMinute(index === 0 ? 600 : 400 + 20 * index)(t),
    player_damage_taken: perMinute(500 + 10 * index)(t),
    boss_damage: perMinute(index === 0 ? 100 : 50)(t),
    player_healing: perMinute(index === 0 ? 200 : 100)(t),
    creep_kills: perMinute(index === 0 ? 3 : 4)(t),
    kills: Math.floor((t / DURATION_S) * (index === 0 ? 8 : 4)),
    deaths: deaths.filter((time) => time <= t).length,
    assists: Math.floor((t / DURATION_S) * 6),
    hero_bullets_hit: perMinute(20)(t),
    shots_hit: perMinute(60)(t),
    shots_missed: perMinute(40)(t),
    damage_mitigated: perMinute(50)(t),
    creep_damage: perMinute(800)(t),
    neutral_damage: perMinute(300)(t),
    denies: Math.floor(t / 600),
    level: Math.min(31, Math.floor(t / 60)),
    tech_power: Math.floor(t / 20),
    weapon_power: Math.floor(t / 30),
    max_health: 800 + Math.floor(t),
    melee_kills: t >= 1500 ? 1 : 0,
    heal_prevented: perMinute(10)(t),
    teammate_healing: perMinute(index === 0 ? 50 : 0)(t),
    custom_user_stats: [
      { id: HEADSHOTS_ID, value: perMinute(2)(t) },
      { id: 99, value: 5 },
    ],
  }));
}

export function matchPlayer(index: number, accountId: number) {
  const last = stats(index).at(-1)!;
  const deaths = index === 0 ? LEAD_DEATHS : [600 + 60 * index];
  return {
    account_id: accountId,
    player_slot: index + 1,
    team: index < 6 ? 0 : 1,
    hero_id: heroes[index].id,
    kills: last.kills,
    deaths: deaths.length,
    assists: last.assists,
    net_worth: last.net_worth,
    last_hits: last.creep_kills + 20,
    denies: last.denies,
    level: 31,
    player_rank_data: { initial_display_rank: BADGE },
    stats: stats(index),
    death_details: deaths.map((game_time_s) => ({ game_time_s })),
    items: [
      { item_id: smallItem.id, game_time_s: 100, sold_time_s: 0 },
      { item_id: bigItem.id, game_time_s: 900, sold_time_s: 0 },
      { item_id: 1, game_time_s: 50, sold_time_s: 0 }, // an ability upgrade, not a shop item
    ],
    power_up_buffs: [
      {
        type: "hp_permanent_pickup",
        is_permanent: true,
        pickup_times_s: index === 0 ? [200, 700, 1300] : [500],
      },
      {
        type: "gun_powerup_pickup",
        is_permanent: false,
        pickup_times_s: [300],
      },
    ],
  };
}

/** Twelve players; the first has `accountId`, the others 5001–5011. */
export function matchMetadata(accountId: number, matchId = MATCH_ID) {
  return {
    match_info: {
      match_id: matchId,
      start_time: Math.floor(Date.now() / 1000) - 3600,
      duration_s: DURATION_S,
      game_mode: 1,
      match_mode: 4,
      winning_team: 0,
      custom_user_stats: [
        { name: "Enemy Hero Accuracy##Headshots", id: HEADSHOTS_ID },
      ],
      players: heroes.map((_, index) =>
        matchPlayer(index, index === 0 ? accountId : 5000 + index),
      ),
      objectives: [
        { team: 1, destroyed_time_s: 600 },
        { team: 0, destroyed_time_s: 1500 },
        { team: 0, destroyed_time_s: 0 },
      ],
      mid_boss: [{ team_claimed: 0, team_killed: 0, destroyed_time_s: 1700 }],
    },
  };
}

/** Rank-average curve: 1,000 souls/min, 500 hero damage/min, 4 creeps/min. */
export function rankCurveRows(samples = 5000) {
  return [180, 360, 540, 720, 900, 1200, 1500, 1800, 2100, 2400].map(
    (game_time) => {
      const m = game_time / 60;
      return {
        game_time,
        samples,
        net_worth_avg: 1000 * m,
        net_worth_std: 100 * m,
        player_damage_avg: 500 * m,
        player_damage_std: 50 * m,
        creep_kills_avg: 4 * m,
        creep_kills_std: 0.5 * m,
        boss_damage_avg: 80 * m,
        boss_damage_std: 10 * m,
        player_healing_avg: 150 * m,
        player_healing_std: 20 * m,
        kills_avg: m / 5,
        kills_std: 1,
        deaths_avg: m / 6,
        deaths_std: 1,
        assists_avg: m / 4,
        assists_std: 1,
        permanent_buffs_avg: m / 10,
        permanent_buffs_std: 1,
      };
    },
  );
}
