export interface ProfileAccount {
  accountId: number;
  seenAt: number;
  source: "detected" | "manual";
}
export type HistoryFilter = "all" | "normal" | "ranked" | "street_brawl";
export interface HistoryMatch {
  matchId: number;
  heroId: number;
  startTime: number;
  gameMode: number;
  matchMode: number;
  team: number;
  result: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  durationS: number;
  heroLevel: number;
}
export interface Summary {
  games: number;
  wins: number;
  winRate: number | null;
  kda: number;
  soulsPerMin: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgLastHits: number;
}
export interface HeroRow {
  heroId: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  soulsPerMin: number;
  lastHits: number;
  denies: number;
  lastPlayed: number;
}
