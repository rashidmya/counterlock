export interface HeroStats {
  account_id: number;
  hero_id: number;
  matches_played: number;
  wins: number;
  last_played: number;
}
export interface PlayerRank {
  account_id: number;
  badge: number;
  rank: number;
  subrank: number;
  last_match?: { start_time: number } | null;
}
export interface StatsEntry {
  heroes?: HeroStats[];
  rank?: PlayerRank;
  fetchedAt: number;
  heroError?: string;
  rankError?: string;
}
