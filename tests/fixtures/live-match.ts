// Synthetic `GET /v1/matches/active` entries, shaped like the API's (checked
// 2026-10-23), for the profile Live tab tests (unit, desktop and website).
// Relative imports only: Playwright loads this file too.
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

export const LIVE_MATCH_ID = 123009323;
export const liveHeroes = catalog.heroes.slice(0, 12);
// Every objective standing.
export const ALL_STANDING = 65535;

export interface LiveOptions {
  matchId?: number;
  // Unix seconds; 23 minutes ago unless a test says otherwise.
  startTime?: number;
  gameMode?: number;
  matchMode?: number;
  netWorth?: [number, number];
  masks?: [number, number];
  rounds?: [number, number];
  spectators?: number;
}

/**
 * One live match: `accountId` plays the first hero, on Amber (team 0), with
 * 7001… for everyone else; Street Brawl (game mode 4) has eight players.
 */
export function activeMatch(accountId: number, options: LiveOptions = {}) {
  const {
    matchId = LIVE_MATCH_ID,
    startTime = Math.floor(Date.now() / 1000) - 23 * 60,
    gameMode = 1,
    matchMode = 4,
    netWorth = [111527, 106101],
    masks = [ALL_STANDING, ALL_STANDING],
    rounds = [0, 0],
    spectators = 3,
  } = options;
  const size = gameMode === 4 ? 8 : 12;
  const team = (index: number) => (index < size / 2 ? 0 : 1);
  return {
    start_time: startTime,
    winning_team: null,
    winning_team_parsed: null,
    match_id: matchId,
    players: liveHeroes.slice(0, size).map((hero, index) => ({
      account_id: index === 0 ? accountId : 7000 + index,
      team: team(index),
      team_parsed: `Team${team(index)}`,
      abandoned: null,
      hero_id: hero.id,
    })),
    lobby_id: 102134168838182752,
    game_mode_version: 1,
    net_worth_team_0: netWorth[0],
    net_worth_team_1: netWorth[1],
    duration_s: null,
    spectators,
    open_spectator_slots: 10 - spectators,
    objectives_mask_team0: masks[0],
    objectives_mask_team1: masks[1],
    match_mode: matchMode,
    match_mode_parsed: matchMode === 4 ? "Ranked" : "Unranked",
    game_mode: gameMode,
    game_mode_parsed:
      gameMode === 4
        ? "KECitadelGameModeStreetBrawl"
        : "KECitadelGameModeNormal",
    match_score: 2200,
    region_mode: 1,
    region_mode_parsed: "europe",
    compat_version: 6819,
    low_pri_pool: false,
    team_stats: [0, 1].map((id) => ({
      team: id,
      team_parsed: `Team${id}`,
      net_worth: netWorth[id],
      objectives_mask: masks[id],
      brawl_score: rounds[id],
    })),
  };
}
