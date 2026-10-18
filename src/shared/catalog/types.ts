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
