import type { StatsEntry } from "@/features/player-stats/types";

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
  itemsKnown?: boolean;
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
