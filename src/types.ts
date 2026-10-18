export type Threat =
  "healing" | "bullets" | "spirit" | "mobility" | "channel" | "control";
export interface Hero {
  id: number;
  name: string;
  image?: string;
  tags: string[];
  popularItems?: {
    timestamp?: number | null;
    early_game: PopularItem[];
    mid_game: PopularItem[];
    late_game: PopularItem[];
  } | null;
}
export interface PopularItem {
  item_id: number;
  pick_pct: number;
  winrate_pct?: number;
}
export interface Item {
  id: number;
  name: string;
  cost: number;
  category: string;
  image?: string;
  localImage?: string;
  description: string;
}
export interface Rank {
  tier: number;
  name: string;
  image?: string;
}
export interface Catalog {
  fetchedAt: string;
  heroes: Hero[];
  items: Item[];
  ranks: Rank[];
}
export interface Player {
  slot: string;
  name: string;
  heroId: number;
  heroName: string;
  team: number;
  local: boolean;
  accountId: number | null;
  kills: number;
  deaths: number;
  assists: number;
  items: number[];
}
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
export interface MatchState {
  mode: "demo" | "live";
  status: string;
  phase: string;
  matchId: string | null;
  gameMode: "normal" | "street_brawl";
  localAccountId: number | null;
  clock: string;
  players: Player[];
  stats: Record<number, StatsEntry>;
  error: string | null;
  loading: boolean;
}
export interface CounterlockStore {
  getSnapshot(): MatchState;
  subscribe(listener: () => void): () => void;
  refresh(): void;
}
declare global {
  interface Window {
    counterlockStore?: CounterlockStore;
  }
}
